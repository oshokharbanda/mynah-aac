"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { CommunicationTools } from "@/app/components/communication-tools";
import { CaregiverCredits } from "@/app/components/caregiver-credits";
import { allTiles, categories, coreTiles, fringeTiles, type CategoryId, type Tile } from "@/app/data/tiles";
import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
import { DEFAULT_VOICE, type VoiceId } from "@/app/lib/audio-voices";
import { playCachedSentence, playPreGeneratedPhrase, playSentenceWithFallback, playTileClip } from "@/app/lib/audio-playback";
import { phraseById } from "@/app/lib/quick-phrases";
import {
  buildCandidates,
  predictionCacheKey,
  rankFallback,
  stripHash,
  tilesForPrediction,
  type BoardPredictionResponse,
  type PredictionItem,
} from "@/app/lib/predictions";
import { prepareSpeechVoices, speakText } from "@/app/lib/speech";
import {
  clearSessionUtterances,
  getTileUsage,
  getSessionUtterances,
  markSuggestedTileTapped,
  getVoicePreference,
  createPredictionId,
  recordPrediction,
  recordSessionUtterance,
  recordTileUse,
  setVoicePreference,
  type StoredUtterance,
  type StoredTileUsage,
} from "@/app/lib/tile-usage";

const DEFAULT_SCENE = "home" as const;

type CachedPrediction = {
  items: PredictionItem[];
  source: "model" | "cache" | "fallback";
};

export default function Home() {
  const [selectedTiles, setSelectedTiles] = useState<Tile[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("food");
  const [caregiverMode, setCaregiverMode] = useState(false);
  const [suggestionItems, setSuggestionItems] = useState<PredictionItem[]>([]);
  const [usageByTile, setUsageByTile] = useState<Record<string, StoredTileUsage>>({});
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [recentUtterances, setRecentUtterances] = useState<StoredUtterance[]>([]);
  const [clearArmed, setClearArmed] = useState(false);
  const caregiverTapCount = useRef(0);
  const clearConfirmTimer = useRef<number | null>(null);
  const stripTapStartedAt = useRef<number | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const predictionSequence = useRef(0);
  const currentStripHash = useRef("");
  const predictionLogId = useRef<string | null>(null);
  const predictionCache = useRef(new Map<string, CachedPrediction>());

  const selectedIds = useMemo(() => selectedTiles.map((tile) => tile.id), [selectedTiles]);
  const currentHash = useMemo(() => stripHash(selectedIds), [selectedIds]);
  const candidates = useMemo(
    () => buildCandidates(usageByTile, selectedIds),
    [selectedIds, usageByTile],
  );
  const cacheKey = useMemo(
    () => predictionCacheKey(selectedIds, DEFAULT_SCENE, candidates),
    [candidates, selectedIds],
  );

  useLayoutEffect(() => {
    currentStripHash.current = currentHash;
  }, [currentHash]);

  useEffect(() => {
    void prepareSpeechVoices();
  }, []);

  useEffect(() => () => {
    if (clearConfirmTimer.current !== null) window.clearTimeout(clearConfirmTimer.current);
  }, []);

  useEffect(() => {
    void getSessionUtterances().then(setRecentUtterances).catch(() => {
      // Repeat history is helpful, never a child-facing failure.
    });
  }, []);

  useEffect(() => {
    void getVoicePreference().then(setVoice).catch(() => {
      // The bundled default remains available if private storage is unavailable.
    });
  }, []);

  useEffect(() => {
    void getTileUsage(fringeTiles.map((tile) => tile.id))
      .then(setUsageByTile)
      .catch(() => {
        // The deterministic zero-use fallback remains available without private storage.
      });
  }, []);

  useLayoutEffect(() => {
    const startedAt = stripTapStartedAt.current;
    if (startedAt === null) return;

    stripTapStartedAt.current = null;
    recordInteractionMetric("tap_to_strip", startedAt);
  }, [selectedTiles]);

  useEffect(() => {
    const sequence = predictionSequence.current;
    const controller = new AbortController();
    requestAbort.current = controller;

    const showPrediction = (items: PredictionItem[], source: CachedPrediction["source"]) => {
      if (
        controller.signal.aborted ||
        predictionSequence.current !== sequence ||
        currentStripHash.current !== currentHash
      ) return;

      const orderedItems = [...items].sort((left, right) => left.rank - right.rank).slice(0, 4);
      if (!orderedItems.length) return;
      setSuggestionItems(orderedItems);
      const predictionId = createPredictionId();
      predictionLogId.current = predictionId;
      void recordPrediction({
        id: predictionId,
        strip_ids: [...selectedIds],
        strip_hash: currentHash,
        items: orderedItems,
        source,
      })
        .catch(() => {
          // Prediction records are a caregiver asset, never a child-facing failure.
        });
    };

    // The usage-count fallback is always first and never leaves a child-facing empty state.
    showPrediction(rankFallback(candidates, selectedIds), "fallback");

    const cached = predictionCache.current.get(cacheKey);
    if (cached) {
      showPrediction(cached.items, "cache");
      return () => controller.abort();
    }

    async function predict() {
      try {
        const response = await fetch("/api/board", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-mynah-request-sequence": String(sequence),
            "x-mynah-strip-hash": currentHash,
          },
          body: JSON.stringify({
            strip: selectedTiles,
            candidates,
            scene: DEFAULT_SCENE,
            local_time: new Date().toTimeString().slice(0, 5),
          }),
          signal: controller.signal,
        });
        const prediction = (await response.json()) as BoardPredictionResponse;
        const source = response.headers.get("x-mynah-source");

        if (
          (source === "model" || source === "cache" || source === "fallback") &&
          Array.isArray(prediction.suggestions) &&
          !controller.signal.aborted &&
          predictionSequence.current === sequence &&
          currentStripHash.current === currentHash
        ) {
          const responseSource = source as CachedPrediction["source"];
          predictionCache.current.set(cacheKey, { items: prediction.suggestions.slice(0, 4), source: responseSource });
          if (responseSource !== "fallback") showPrediction(prediction.suggestions, responseSource);
        }
      } catch {
        // Offline, timed-out, and rate-limited requests retain the local fallback silently.
      }
    }

    void predict();
    return () => controller.abort();
  }, [cacheKey, candidates, currentHash, selectedIds, selectedTiles]);

  const spokenText = useMemo(
    () =>
      selectedTiles
        .map((tile) => tile.speech_en)
        .join(" "),
    [selectedTiles],
  );

  function invalidatePrediction(nextTiles: Tile[]) {
    predictionSequence.current += 1;
    requestAbort.current?.abort();
    requestAbort.current = null;
    predictionLogId.current = null;
    const nextIds = nextTiles.map((tile) => tile.id);
    setSuggestionItems(rankFallback(buildCandidates(usageByTile, nextIds), nextIds));
  }

  function addTile(tile: Tile) {
    disarmClear();
    const nextTiles = [...selectedTiles, tile];
    invalidatePrediction(nextTiles);
    stripTapStartedAt.current = interactionNow();
    setSelectedTiles(nextTiles);
    playTileClip(tile, voice, interactionNow());
    setUsageByTile((current) => ({
      ...current,
      [tile.id]: {
        id: tile.id,
        count: (current[tile.id]?.count ?? 0) + 1,
        last_used_at: Date.now(),
      },
    }));
    void recordTileUse(tile.id)
      .then((usage) => setUsageByTile((current) => ({ ...current, [tile.id]: usage })))
      .catch(() => {
        // Usage history is helpful later, but must never block a child's tap.
      });
  }

  function addSuggestedTile(tile: Tile) {
    const logId = predictionLogId.current;
    if (logId) {
      void markSuggestedTileTapped(logId, tile.id).catch(() => {
        // A failed caregiver log must never change a child's tap.
      });
    }
    addTile(tile);
  }

  function removeLastTile() {
    disarmClear();
    const nextTiles = selectedTiles.slice(0, -1);
    invalidatePrediction(nextTiles);
    setSelectedTiles(nextTiles);
  }

  function clearSentence() {
    disarmClear();
    invalidatePrediction([]);
    setSelectedTiles([]);
    window.speechSynthesis?.cancel();
  }

  function disarmClear() {
    if (clearConfirmTimer.current !== null) {
      window.clearTimeout(clearConfirmTimer.current);
      clearConfirmTimer.current = null;
    }
    setClearArmed(false);
  }

  function requestClear() {
    if (!selectedTiles.length) return;
    if (clearArmed) {
      clearSentence();
      return;
    }
    setClearArmed(true);
    if (clearConfirmTimer.current !== null) window.clearTimeout(clearConfirmTimer.current);
    clearConfirmTimer.current = window.setTimeout(() => {
      clearConfirmTimer.current = null;
      setClearArmed(false);
    }, 4000);
  }

  function speakSentence() {
    void playSentenceWithFallback(spokenText, selectedTiles, voice, interactionNow());
    rememberUtterance({ text: spokenText, tile_ids: selectedIds, phrase_id: null });
  }

  function rememberUtterance(utterance: Omit<StoredUtterance, "id" | "spoken_at">) {
    void recordSessionUtterance(utterance)
      .then(setRecentUtterances)
      .catch(() => {
        // The child can still communicate if private storage is unavailable.
      });
  }

  function speakQuickPhrase(phraseId: string) {
    const raisedVolume = phraseId === "attention" || phraseId === "not-that";
    playPreGeneratedPhrase(phraseId, voice, raisedVolume);
    const phrase = phraseById(phraseId);
    if (phrase) rememberUtterance({ text: phrase.speech, tile_ids: [], phrase_id: phrase.id });
  }

  function replayUtterance(utterance: StoredUtterance) {
    if (utterance.phrase_id) {
      playPreGeneratedPhrase(utterance.phrase_id, voice, utterance.phrase_id === "attention" || utterance.phrase_id === "not-that");
      return;
    }
    const tiles = utterance.tile_ids
      .map((tileId) => allTiles.find((tile) => tile.id === tileId))
      .filter((tile): tile is Tile => Boolean(tile));
    void playCachedSentence(tiles, voice).then((played) => {
      if (!played) speakText(utterance.text, "en-US", interactionNow());
    });
  }

  function changeVoice(nextVoice: VoiceId) {
    setVoice(nextVoice);
    void setVoicePreference(nextVoice).catch(() => {
      // Changing a voice must not create a child-facing error.
    });
  }

  function previewVoice(previewVoice: VoiceId) {
    const previewTile = coreTiles.find((tile) => tile.id === "i");
    if (previewTile) playTileClip(previewTile, previewVoice, interactionNow());
  }

  function endSession() {
    void clearSessionUtterances()
      .then(() => setRecentUtterances([]))
      .catch(() => {
        // Ending the local replay list must never block access to the board.
      });
  }

  function openCaregiverMode() {
    caregiverTapCount.current += 1;
    if (caregiverTapCount.current === 3) {
      caregiverTapCount.current = 0;
      setCaregiverMode(true);
    }
  }

  if (caregiverMode) {
    return (
      <CaregiverCredits
        onClose={() => setCaregiverMode(false)}
        selectedVoice={voice}
        onChangeVoice={changeVoice}
        onPreviewVoice={previewVoice}
        onEndSession={endSession}
      />
    );
  }

  return (
    <main className="app-shell">
      <CommunicationTools
        recentUtterances={recentUtterances}
        onSpeakPhrase={speakQuickPhrase}
        onReplay={replayUtterance}
      />

      <section className="sentence-area" aria-label="Your sentence">
        <button
          className="sentence-strip"
          type="button"
          onClick={speakSentence}
          disabled={selectedTiles.length === 0}
          aria-label={
            selectedTiles.length
              ? `Speak: ${selectedTiles.map((tile) => tile.label_en).join(" ")}`
              : "Your sentence is empty"
          }
        >
          {selectedTiles.length ? (
            <span className="sentence-tiles">
              {selectedTiles.map((tile, index) => (
                <span className="sentence-word" key={`${tile.id}-${index}`}>
                  {tile.label_en}
                </span>
              ))}
            </span>
          ) : null}
          <span className="speak-icon" aria-hidden="true">🔊</span>
        </button>

        <div className="sentence-actions" aria-label="Sentence actions">
          <button
            className="action-button"
            type="button"
            onClick={removeLastTile}
            disabled={selectedTiles.length === 0}
            aria-label="Undo last word"
            title="Undo last word"
          >
            ↶
          </button>
          <button
            className="action-button action-button-clear"
            type="button"
            onClick={requestClear}
            disabled={selectedTiles.length === 0}
            aria-label={clearArmed ? "Clear sentence now" : "Clear sentence. Tap again to confirm."}
            aria-pressed={clearArmed}
            title={clearArmed ? "Tap again to clear" : "Clear sentence"}
          >
            ×
          </button>
        </div>
      </section>

      <SuggestionRow
        suggestions={tilesForPrediction(suggestionItems)}
        onSuggestionTap={addSuggestedTile}
      />

      <section className="board-section core-section" aria-label="Core words">
        <CoreGrid onAdd={addTile} />
      </section>

      <section className="board-section fringe-section" aria-labelledby="fringe-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Choose a group</p>
            <h2 id="fringe-heading">More words</h2>
          </div>
        </div>
        <CategoryTabs
          categories={categories}
          activeCategory={activeCategory}
          onChange={setActiveCategory}
        />
        <FringeGrid category={activeCategory} onAdd={addTile} />
      </section>

      <footer className="app-footer">
        <button className="caregiver-footer-entry" type="button" onClick={openCaregiverMode} aria-label="Caregiver tools">
          Symbols by ARASAAC · CC BY-NC-SA 4.0
        </button>
      </footer>
    </main>
  );
}
