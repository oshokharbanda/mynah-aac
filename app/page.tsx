"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { CaregiverCredits } from "@/app/components/caregiver-credits";
import { categories, type CategoryId, type Tile } from "@/app/data/tiles";
import { interactionNow, recordInteractionMetric } from "@/app/lib/interaction-metrics";
import { prepareSpeechVoices, speakText } from "@/app/lib/speech";
import { recordTileUse } from "@/app/lib/tile-usage";

const DEFAULT_SPEECH_LANGUAGE = "en-US" as const;

export default function Home() {
  const [selectedTiles, setSelectedTiles] = useState<Tile[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("food");
  const [caregiverMode, setCaregiverMode] = useState(false);
  const caregiverTapCount = useRef(0);
  const stripTapStartedAt = useRef<number | null>(null);

  useEffect(() => {
    void prepareSpeechVoices();
  }, []);

  useLayoutEffect(() => {
    const startedAt = stripTapStartedAt.current;
    if (startedAt === null) return;

    stripTapStartedAt.current = null;
    recordInteractionMetric("tap_to_strip", startedAt);
  }, [selectedTiles]);

  const spokenText = useMemo(
    () =>
      selectedTiles
        .map((tile) => tile.speech_en)
        .join(" "),
    [selectedTiles],
  );

  function addTile(tile: Tile) {
    stripTapStartedAt.current = interactionNow();
    setSelectedTiles((current) => [...current, tile]);
    void recordTileUse(tile.id).catch(() => {
      // Usage history is helpful later, but must never block a child's tap.
    });
  }

  function removeLastTile() {
    setSelectedTiles((current) => current.slice(0, -1));
  }

  function clearSentence() {
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

      <SuggestionRow suggestions={[]} onAdd={addTile} />

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
