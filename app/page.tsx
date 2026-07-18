"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { CaregiverCredits } from "@/app/components/caregiver-credits";
import { categories, fringeTiles, type CategoryId, type Tile } from "@/app/data/tiles";
import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
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
  getTileUsage,
  markSuggestedTileTapped,
  createPredictionId,
  recordPrediction,
  recordTileUse,
  type StoredTileUsage,
} from "@/app/lib/tile-usage";

const DEFAULT_SPEECH_LANGUAGE = "en-US" as const;
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
  const caregiverTapCount = useRef(0);
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
    const nextTiles = [...selectedTiles, tile];
    invalidatePrediction(nextTiles);
    stripTapStartedAt.current = interactionNow();
    setSelectedTiles(nextTiles);
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
    const nextTiles = selectedTiles.slice(0, -1);
    invalidatePrediction(nextTiles);
    setSelectedTiles(nextTiles);
  }

  function clearSentence() {
    invalidatePrediction([]);
    setSelectedTiles([]);
    window.speechSynthesis?.cancel();
  }

  function speakSentence() {
    speakText(spokenText, DEFAULT_SPEECH_LANGUAGE, interactionNow());
  }

  function openCaregiverMode() {
    caregiverTapCount.current += 1;
    if (caregiverTapCount.current === 3) {
      caregiverTapCount.current = 0;
      setCaregiverMode(true);
    }
  }

  if (caregiverMode) {
    return <CaregiverCredits onClose={() => setCaregiverMode(false)} />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button
          className="caregiver-entry"
          type="button"
          onClick={openCaregiverMode}
          aria-label="Caregiver tools"
        >
          MYNAH
        </button>
        <h1>Say it your way</h1>
      </header>

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
          ) : (
            <span className="sentence-placeholder">Tap pictures to build a sentence</span>
          )}
          <span className="speak-hint">Tap here to speak</span>
        </button>

        <div className="sentence-actions" aria-label="Sentence actions">
          <button
            className="action-button"
            type="button"
            onClick={removeLastTile}
            disabled={selectedTiles.length === 0}
          >
            Undo
          </button>
          <button
            className="action-button action-button-clear"
            type="button"
            onClick={clearSentence}
            disabled={selectedTiles.length === 0}
          >
            Clear
          </button>
        </div>
      </section>

      <SuggestionRow
        suggestions={tilesForPrediction(suggestionItems)}
        onSuggestionTap={addSuggestedTile}
      />

      <section className="board-section" aria-labelledby="core-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Always here</p>
            <h2 id="core-heading">Core words</h2>
          </div>
        </div>
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
        Symbols by ARASAAC · CC BY-NC-SA 4.0
      </footer>
    </main>
  );
}
