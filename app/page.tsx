/* eslint-disable @next/next/no-img-element -- local ARASAAC images must remain direct, cacheable URLs offline. */
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { CommunicationTools } from "@/app/components/communication-tools";
import { CaregiverCredits } from "@/app/components/caregiver-credits";
import { SayMore } from "@/app/components/say-more";
import { allTiles, categories, coreTiles, fringeTiles, type CategoryId, type Tile } from "@/app/data/tiles";
import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
import { DEFAULT_VOICE, type VoiceId } from "@/app/lib/audio-voices";
import { playPersonalTileClip, playPreGeneratedPhrase, playSentenceClips, playSentenceWithFallback, playTileClip } from "@/app/lib/audio-playback";
import { personalTileToBoardTile, type PersonalTile, type StoredPersonalTile } from "@/app/lib/personal-tiles";
import type { PersonalTileDraft } from "@/app/components/caregiver-credits";
import { phraseById } from "@/app/lib/quick-phrases";
import { canExpandTile, type ExpansionResponse, type ExpansionUtterance } from "@/app/lib/expansions";
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
  createExpansionId,
  getTileUsage,
  getSessionUtterances,
  markSuggestedTileTapped,
  getVoicePreference,
  getSentenceSuggestionsPreference,
  markExpansionChosen,
  markExpansionDismissed,
  createPredictionId,
  recordPrediction,
  recordExpansion,
  recordSessionUtterance,
  recordTileUse,
  setVoicePreference,
  setSentenceSuggestionsPreference,
  getPersonalTiles,
  hidePersonalTile,
  savePersonalTile,
  savePersonalTileAudio,
  setPersonalTileVoicePending,
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
  const [sentenceSuggestionsEnabled, setSentenceSuggestionsEnabled] = useState(true);
  const [expansionItems, setExpansionItems] = useState<ExpansionUtterance[]>([]);
  const [personalTiles, setPersonalTiles] = useState<PersonalTile[]>([]);
  const clearConfirmTimer = useRef<number | null>(null);
  const stripTapStartedAt = useRef<number | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const predictionSequence = useRef(0);
  const currentStripHash = useRef("");
  const predictionLogId = useRef<string | null>(null);
  const predictionCache = useRef(new Map<string, CachedPrediction>());
  const expansionAbort = useRef<AbortController | null>(null);
  const expansionSequence = useRef(0);
  const expansionLogId = useRef<string | null>(null);
  const dismissedExpansionHash = useRef<string | null>(null);
  const personalPhotoUrls = useRef<string[]>([]);

  const selectedIds = useMemo(() => selectedTiles.map((tile) => tile.id), [selectedTiles]);
  const visiblePersonalTiles = useMemo(() => personalTiles.filter((tile) => !tile.hidden), [personalTiles]);
  const vocabulary = useMemo(() => [...allTiles, ...visiblePersonalTiles], [visiblePersonalTiles]);
  const personalAudio = useMemo(
    () => new Map(visiblePersonalTiles.flatMap((tile) => tile.audio[voice] ? [[tile.id, tile.audio[voice]] as const] : [])),
    [visiblePersonalTiles, voice],
  );
  const currentHash = useMemo(() => stripHash(selectedIds), [selectedIds]);
  const candidates = useMemo(
    () => buildCandidates(usageByTile, selectedIds, visiblePersonalTiles),
    [selectedIds, usageByTile, visiblePersonalTiles],
  );
  const cacheKey = useMemo(
    () => predictionCacheKey(selectedIds, DEFAULT_SCENE, candidates),
    [candidates, selectedIds],
  );
  const visibleExpansions = useMemo(
    () => expansionItems.flatMap((utterance) => {
      const tiles = utterance.tile_ids
        .map((tileId) => vocabulary.find((tile) => tile.id === tileId))
        .filter((tile): tile is Tile => Boolean(tile));
      return tiles.length === utterance.tile_ids.length ? [{ ...utterance, tiles }] : [];
    }),
    [expansionItems, vocabulary],
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
    void getSentenceSuggestionsPreference().then(setSentenceSuggestionsEnabled).catch(() => {
      // Sentence suggestions stay enabled by default when private storage is unavailable.
    });
  }, []);

  useEffect(() => {
    void getTileUsage([...fringeTiles, ...visiblePersonalTiles].map((tile) => tile.id))
      .then(setUsageByTile)
      .catch(() => {
        // The deterministic zero-use fallback remains available without private storage.
      });
  }, [visiblePersonalTiles]);

  function refreshPersonalTiles() {
    return getPersonalTiles().then((records) => {
      personalPhotoUrls.current.forEach((url) => URL.revokeObjectURL(url));
      personalPhotoUrls.current = [];
      const next = records.map(({ tile, asset }) => {
        const photoUrl = asset?.photo ? URL.createObjectURL(asset.photo) : undefined;
        if (photoUrl) personalPhotoUrls.current.push(photoUrl);
        return personalTileToBoardTile(tile, asset, photoUrl);
      });
      setPersonalTiles(next);
      return next;
    });
  }

  useEffect(() => {
    void refreshPersonalTiles().catch(() => {
      // Personal words are optional; the stock board stays usable without private storage.
    });
    return () => personalPhotoUrls.current.forEach((url) => URL.revokeObjectURL(url));
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
    showPrediction(rankFallback(candidates, selectedIds, vocabulary), "fallback");

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
  }, [cacheKey, candidates, currentHash, selectedIds, selectedTiles, vocabulary]);

  useEffect(() => {
    const sequence = expansionSequence.current + 1;
    expansionSequence.current = sequence;
    expansionAbort.current?.abort();
    expansionAbort.current = null;
    setExpansionItems([]);

    if (dismissedExpansionHash.current && dismissedExpansionHash.current !== currentHash) {
      dismissedExpansionHash.current = null;
    }

    const seed = selectedTiles.length === 1 ? selectedTiles[0] : undefined;
    if (!seed || !sentenceSuggestionsEnabled || !canExpandTile(seed) || dismissedExpansionHash.current === currentHash || typeof navigator === "undefined" || !navigator.onLine) return;

    const seedTile: Tile = seed;
    const controller = new AbortController();
    expansionAbort.current = controller;
    const pause = window.setTimeout(() => {
      const timeout = window.setTimeout(() => controller.abort(), 1_500);
      void fetch("/api/expand", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mynah-request-sequence": String(sequence),
          "x-mynah-strip-hash": currentHash,
        },
        body: JSON.stringify({
          seed_tile_id: seedTile.id,
          scene: DEFAULT_SCENE,
          local_time: new Date().toTimeString().slice(0, 5),
          recent_utterances: recentUtterances.slice(0, 5).map(({ text, tile_ids }) => ({ text, tile_ids })),
          personal_tile_ids: visiblePersonalTiles.map((tile) => tile.id),
          personal_tiles: visiblePersonalTiles.map((tile) => ({
            id: tile.id,
            label_en: tile.label_en,
            part_of_speech: tile.part_of_speech,
          })),
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = (await response.json()) as ExpansionResponse;
          if (
            response.headers.get("x-mynah-source") !== "model" ||
            !Array.isArray(result.utterances) ||
            controller.signal.aborted ||
            expansionSequence.current !== sequence ||
            currentStripHash.current !== currentHash
          ) return;

          const utterances = result.utterances.slice(0, 3);
          if (!utterances.length) return;
          setExpansionItems(utterances);
          const expansionId = createExpansionId();
          expansionLogId.current = expansionId;
          void recordExpansion({ id: expansionId, seed_tile_id: seedTile.id, utterances }).catch(() => {
            // A caregiver metric must never create a child-facing failure.
          });
        })
        .catch(() => {
          // Timeout, offline, and server failures intentionally show nothing.
        })
        .finally(() => window.clearTimeout(timeout));
    }, 500);

    return () => {
      window.clearTimeout(pause);
      controller.abort();
    };
  }, [currentHash, recentUtterances, selectedTiles, sentenceSuggestionsEnabled, visiblePersonalTiles]);

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
    expansionSequence.current += 1;
    expansionAbort.current?.abort();
    expansionAbort.current = null;
    expansionLogId.current = null;
    setExpansionItems([]);
    const nextIds = nextTiles.map((tile) => tile.id);
    setSuggestionItems(rankFallback(buildCandidates(usageByTile, nextIds, visiblePersonalTiles), nextIds, vocabulary));
  }

  function addTile(tile: Tile) {
    disarmClear();
    const nextTiles = [...selectedTiles, tile];
    invalidatePrediction(nextTiles);
    stripTapStartedAt.current = interactionNow();
    setSelectedTiles(nextTiles);
    if (tile.origin === "personal") {
      playPersonalTileClip(tile, personalAudio.get(tile.id), interactionNow());
    } else {
      playTileClip(tile, voice, interactionNow());
    }
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
    void playSentenceWithFallback(spokenText, selectedTiles, voice, interactionNow(), personalAudio);
    rememberUtterance({ text: spokenText, tile_ids: selectedIds, phrase_id: null });
  }

  function dismissSayMore() {
    dismissedExpansionHash.current = currentStripHash.current;
    setExpansionItems([]);
    const expansionId = expansionLogId.current;
    expansionLogId.current = null;
    if (expansionId) {
      void markExpansionDismissed(expansionId).catch(() => {
        // Logging must never change the child-facing dismissal.
      });
    }
  }

  function chooseExpansion(utterance: ExpansionUtterance & { tiles: Tile[] }, index: number) {
    const nextTiles = utterance.tiles;
    const expansionId = expansionLogId.current;
    invalidatePrediction(nextTiles);
    setSelectedTiles(nextTiles);
    setExpansionItems([]);
    if (expansionId) {
      void markExpansionChosen(expansionId, index).catch(() => {
        // Logging must never change the selected sentence.
      });
    }
    requestAnimationFrame(() => {
      void playSentenceClips(nextTiles, voice, personalAudio).then((played) => {
        if (!played) speakText(nextTiles.map((tile) => tile.speech_en).join(" "), "en-US", interactionNow());
      });
    });
    rememberUtterance({
      text: nextTiles.map((tile) => tile.speech_en).join(" "),
      tile_ids: nextTiles.map((tile) => tile.id),
      phrase_id: null,
    });
  }

  function rememberUtterance(utterance: Omit<StoredUtterance, "id" | "spoken_at">) {
    void recordSessionUtterance(utterance)
      .then(setRecentUtterances)
      .catch(() => {
        // The child can still communicate if private storage is unavailable.
      });
  }

  function speakQuickPhrase(phraseId: string) {
    const raisedVolume = phraseId === "attention" || phraseId === "wait-still-saying" || phraseId === "not-that";
    playPreGeneratedPhrase(phraseId, voice, raisedVolume);
    const phrase = phraseById(phraseId);
    if (phrase) rememberUtterance({ text: phrase.speech, tile_ids: [], phrase_id: phrase.id });
  }

  function replayUtterance(utterance: StoredUtterance) {
    if (utterance.phrase_id) {
      playPreGeneratedPhrase(
        utterance.phrase_id,
        voice,
        utterance.phrase_id === "attention" || utterance.phrase_id === "wait-still-saying" || utterance.phrase_id === "not-that",
      );
      return;
    }
    const tiles = utterance.tile_ids
      .map((tileId) => vocabulary.find((tile) => tile.id === tileId))
      .filter((tile): tile is Tile => Boolean(tile));
    void playSentenceClips(tiles, voice, personalAudio).then((played) => {
      if (!played) speakText(utterance.text, "en-US", interactionNow());
    });
  }

  async function generatePersonalVoice(tileId: string, text: string) {
    try {
      const response = await fetch("/api/generate-word", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text_en: text, voice_id: voice }),
      });
      if (!response.ok) throw new Error("Voice generation is unavailable.");
      await savePersonalTileAudio(tileId, voice, await response.blob());
    } catch {
      await setPersonalTileVoicePending(tileId, true);
    } finally {
      await refreshPersonalTiles();
    }
  }

  async function saveNewPersonalTile(draft: PersonalTileDraft) {
    const existing = draft.id ? personalTiles.find((tile) => tile.id === draft.id) : undefined;
    const isNewPhoto = draft.pictureKind === "photo" && draft.photo && !existing?.photoBlob;
    const photoCount = personalTiles.filter((tile) => tile.photoBlob).length;
    if (isNewPhoto && photoCount >= 50) throw new Error("The 50-photo limit has been reached.");
    const now = Date.now();
    const stored: StoredPersonalTile = {
      id: draft.id ?? `personal-${crypto.randomUUID()}`,
      is_core: false,
      pinned_index: null,
      category: "my_words",
      secondary_category: draft.secondaryCategory,
      part_of_speech: draft.partOfSpeech,
      label_en: draft.word,
      speech_en: draft.word,
      picture_kind: draft.pictureKind,
      emoji: draft.pictureKind === "emoji" ? draft.emoji || "⭐" : null,
      hidden: false,
      origin: "personal",
      approved: true,
      voice_pending: true,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    await savePersonalTile(stored, draft.pictureKind === "photo" ? draft.photo : null);
    await refreshPersonalTiles();
    void generatePersonalVoice(stored.id, stored.speech_en);
  }

  function hideWord(tileId: string) {
    void hidePersonalTile(tileId).then(refreshPersonalTiles).catch(() => {
      // A failed hide must not affect the stock board.
    });
  }

  function retryPersonalVoice(tileId: string) {
    const tile = personalTiles.find((item) => item.id === tileId);
    if (tile) void generatePersonalVoice(tile.id, tile.speech_en);
  }

  function changeVoice(nextVoice: VoiceId) {
    setVoice(nextVoice);
    void setVoicePreference(nextVoice).catch(() => {
      // Changing a voice must not create a child-facing error.
    });
  }

  function changeSentenceSuggestions(enabled: boolean) {
    setSentenceSuggestionsEnabled(enabled);
    if (!enabled) dismissSayMore();
    void setSentenceSuggestionsPreference(enabled).catch(() => {
      // The visible choice remains correct even if private storage is unavailable.
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
    setCaregiverMode(true);
  }

  if (caregiverMode) {
    return (
      <CaregiverCredits
        onClose={() => setCaregiverMode(false)}
        selectedVoice={voice}
        onChangeVoice={changeVoice}
        onPreviewVoice={previewVoice}
        onEndSession={endSession}
        sentenceSuggestionsEnabled={sentenceSuggestionsEnabled}
        onChangeSentenceSuggestions={changeSentenceSuggestions}
        personalTiles={personalTiles.filter((tile) => !tile.hidden)}
        photoCount={personalTiles.filter((tile) => tile.photoBlob).length}
        onSavePersonalTile={saveNewPersonalTile}
        onHidePersonalTile={hideWord}
        onRetryVoice={retryPersonalVoice}
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
                <span
                  className={`sentence-word${index === selectedTiles.length - 1 ? " sentence-word-pulse" : ""}`}
                  key={`${tile.id}-${index}`}
                >
                  {tile.symbol.localPath ? (
                    <img src={tile.symbol.localPath} alt="" />
                  ) : tile.symbol.emoji ? (
                    <span className="tile-emoji" aria-hidden="true">{tile.symbol.emoji}</span>
                  ) : (
                    <span className="tile-text-symbol" aria-hidden="true">{tile.label_en}</span>
                  )}
                  <span className="sentence-word-label">{tile.label_en}</span>
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

      <SayMore
        utterances={visibleExpansions}
        onChoose={chooseExpansion}
        onDismiss={dismissSayMore}
      />

      <SuggestionRow
        suggestions={tilesForPrediction(suggestionItems, visiblePersonalTiles)}
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
        <FringeGrid category={activeCategory} personalTiles={visiblePersonalTiles} onAdd={addTile} />
      </section>

      <footer className="app-footer">
        <button className="caregiver-footer-entry" type="button" onClick={openCaregiverMode}>
          Caregiver mode
        </button>
        <p>Symbols by ARASAAC · CC BY-NC-SA 4.0</p>
      </footer>
    </main>
  );
}
