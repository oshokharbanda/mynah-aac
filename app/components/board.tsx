/* eslint-disable @next/next/no-img-element -- local ARASAAC images must remain direct, cacheable URLs offline. */
import type { CSSProperties } from "react";
import {
  coreTiles,
  fringeTiles,
  type Category,
  type CategoryId,
  type Tile,
} from "@/app/data/tiles";

const FITZGERALD_COLORS: Record<
  Tile["part_of_speech"],
  { background: string; border: string }
> = {
  pronoun: { background: "#fff3a3", border: "#cfb32e" },
  verb: { background: "#cceac7", border: "#5e9b58" },
  noun: { background: "#ffd7a8", border: "#d18b3b" },
  adjective: { background: "#cfe6ff", border: "#6395c4" },
  social: { background: "#ffd3e2", border: "#cf7b9d" },
  negation: { background: "#ffc4bf", border: "#cb625a" },
  question: { background: "#ffd3e2", border: "#cf7b9d" },
  preposition: { background: "#cceac7", border: "#5e9b58" },
  determiner: { background: "#fff3a3", border: "#cfb32e" },
};

type AddTile = (tile: Tile) => void;

export function TileButton({ tile, onAdd }: { tile: Tile; onAdd: AddTile }) {
  const color = FITZGERALD_COLORS[tile.part_of_speech];

  return (
    <button
      className="tile"
      type="button"
      onClick={() => onAdd(tile)}
      aria-label={`Add ${tile.label_en}`}
      style={
        {
          "--tile-background": color.background,
          "--tile-border": color.border,
        } as CSSProperties
      }
    >
      <img src={tile.symbol.localPath} alt={tile.label_en} />
      <span className="tile-label">{tile.label_en}</span>
    </button>
  );
}

export function CoreGrid({ onAdd }: { onAdd: AddTile }) {
  return (
    <div className="core-grid" aria-label="Core words">
      {coreTiles.map((tile) => (
        <TileButton key={tile.id} tile={tile} onAdd={onAdd} />
      ))}
    </div>
  );
}

export function CategoryTabs({
  categories,
  activeCategory,
  onChange,
}: {
  categories: readonly Category[];
  activeCategory: CategoryId;
  onChange: (category: CategoryId) => void;
}) {
  return (
    <div className="category-tabs" role="tablist" aria-label="More word groups">
      {categories.map((category) => (
        <button
          className="category-tab"
          type="button"
          role="tab"
          key={category.id}
          aria-selected={activeCategory === category.id}
          onClick={() => onChange(category.id)}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}

export function FringeGrid({ category, onAdd }: { category: CategoryId; onAdd: AddTile }) {
  return (
    <div className="fringe-grid" aria-label={`${category} words`}>
      {fringeTiles
        .filter((tile) => tile.category === category)
        .map((tile) => (
          <TileButton key={tile.id} tile={tile} onAdd={onAdd} />
        ))}
    </div>
  );
}

export function SuggestionRow({
  suggestions,
  onSuggestionTap,
}: {
  suggestions: readonly Tile[];
  onSuggestionTap: (tile: Tile) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <aside className="suggestion-row" aria-labelledby="suggestion-heading">
      <h2 id="suggestion-heading">You might want</h2>
      <div className="suggestion-tiles">
        {suggestions.slice(0, 4).map((tile) => (
          <TileButton key={tile.id} tile={tile} onAdd={onSuggestionTap} />
        ))}
      </div>
    </aside>
  );
}
