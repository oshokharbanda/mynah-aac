"use client";

import { useMemo, useState } from "react";
import { CategoryTabs, CoreGrid, FringeGrid, SuggestionRow } from "@/app/components/board";
import { categories, type CategoryId, type Tile } from "@/app/data/tiles";

const DEFAULT_SPEECH_LANGUAGE = "local" as const;

export default function Home() {
  const [selectedTiles, setSelectedTiles] = useState<Tile[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>("food");

  const spokenText = useMemo(
    () =>
      selectedTiles
        .map((tile) =>
          DEFAULT_SPEECH_LANGUAGE === "local"
            ? tile.speech_local
            : tile.speech_en,
        )
        .join(" "),
    [selectedTiles],
  );

  function addTile(tile: Tile) {
    setSelectedTiles((current) => [...current, tile]);
  }

  function removeLastTile() {
    setSelectedTiles((current) => current.slice(0, -1));
  }

  function clearSentence() {
    setSelectedTiles([]);
    window.speechSynthesis?.cancel();
  }

  function speakSentence() {
    const speech = window.speechSynthesis;
    if (!spokenText || !speech || typeof SpeechSynthesisUtterance === "undefined") return;

    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = DEFAULT_SPEECH_LANGUAGE === "local" ? "hi-IN" : "en-IN";
    utterance.rate = 0.85;
    speech.speak(utterance);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">MYNAH</p>
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
          <span className="tile-count">24</span>
        </div>
        <CoreGrid onAdd={addTile} />
      </section>

      <section className="board-section fringe-section" aria-labelledby="fringe-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Choose a group</p>
            <h2 id="fringe-heading">More words</h2>
          </div>
          <span className="tile-count">36</span>
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
