"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { CaregiverCredits } from "@/app/components/caregiver-credits";
import { categories, type CategoryId, type Tile } from "@/app/data/tiles";
import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
import {
  buildCandidates,
  rankFallback,
  stripHash,
  tilesForPrediction,
  type PredictionItem,
  type PredictionResponse,
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

export default function Home() {
  const [selectedTiles, setSelectedTiles] = useState<Tile[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("food");
  const [caregiverMode, setCaregiverMode] = useState(false);
  const [suggestionItems, setSuggestionItems] = useState<PredictionItem[]>([]);
  const caregiverTapCount = useRef(0);
  const stripTapStartedAt = useRef<number | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const predictionSequence = useRef(0);
  const currentStripHash = useRef("");
  const predictionLogId = useRef<string | null>(null);

  const selectedIds = useMemo(() => selectedTiles.map((tile) => tile.id), [selectedTiles]);
  const currentHash = useMemo(() => stripHash(selectedIds), [selectedIds]);

  useLayoutEffect(() => {
    currentStripHash.current = currentHash;
  }, [currentHash]);

  useEffect(() => {
    void prepareSpeechVoices();
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
    const fallbackCandidates = buildCandidates({}, selectedIds);

    const showPrediction = (items: PredictionItem[], source: "model" | "fallback") => {
      if (predictionSequence.current !== sequence || currentStripHash.current !== currentHash) return;

      setSuggestionItems(items);
      const predictionId = createPredictionId();
      predictionLogId.current = predictionId;
      void recordPrediction({
        id: predictionId,
        strip_ids: [...selectedIds],
        strip_hash: currentHash,
        items,
        source,
      })
        .catch(() => {
          // Prediction records are a caregiver asset, never a child-facing failure.
        });
    };

    // Show a deterministic board-local answer before IndexedDB or the network respond.
    showPrediction(rankFallback(fallbackCandidates, selectedIds), "fallback");

    async function predict() {
      let usage: Record<string, StoredTileUsage> = {};
      try {
        usage = await getTileUsage(fallbackCandidates.map((candidate) => candidate.id));
      } catch {
        // Private storage may be unavailable; the in-memory fallback above is enough.
      }

      if (predictionSequence.current !== sequence || currentStripHash.current !== currentHash) return;

      const candidates = buildCandidates(usage, selectedIds);
      const usageFallback = rankFallback(candidates, selectedIds);
      showPrediction(usageFallback, "fallback");

      try {
        const response = await fetch("/api/board", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            strip_ids: selectedIds,
            strip_hash: currentHash,
            candidates,
            scene: null,
            hour_local: new Date().getHours(),
          }),
          signal: controller.signal,
        });
        const prediction = (await response.json()) as PredictionResponse;

        if (
          prediction.source === "model" &&
          Array.isArray(prediction.items) &&
          predictionSequence.current === sequence &&
          currentStripHash.current === currentHash
        ) {
          showPrediction(prediction.items.slice(0, 4), "model");
        }
      } catch {
        // Offline, timed-out, and rate-limited requests retain the local fallback silently.
      }
    }

    void predict();
    return () => controller.abort();
  }, [currentHash, selectedIds]);

  const spokenText = useMemo(
    () =>
      selectedTiles
        .map((tile) => tile.speech_en)
        .join(" "),
    [selectedTiles],
  );

  function invalidatePrediction() {
    predictionSequence.current += 1;
    requestAbort.current?.abort();
    requestAbort.current = null;
    predictionLogId.current = null;
    setSuggestionItems([]);
  }

  function addTile(tile: Tile) {
    invalidatePrediction();
    stripTapStartedAt.current = interactionNow();
    setSelectedTiles((current) => [...current, tile]);
    void recordTileUse(tile.id).catch(() => {
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
    invalidatePrediction();
    setSelectedTiles((current) => current.slice(0, -1));
  }

  function clearSentence() {
    invalidatePrediction();
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
