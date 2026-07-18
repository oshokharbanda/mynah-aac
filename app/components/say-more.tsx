/* eslint-disable @next/next/no-img-element -- local ARASAAC images must remain direct, cacheable URLs offline. */
import type { Tile } from "@/app/data/tiles";
import type { ExpansionUtterance } from "@/app/lib/expansions";

type VisibleExpansion = ExpansionUtterance & { tiles: Tile[] };

export function SayMore({
  utterances,
  onChoose,
  onDismiss,
}: {
  utterances: readonly VisibleExpansion[];
  onChoose: (utterance: VisibleExpansion, index: number) => void;
  onDismiss: () => void;
}) {
  if (!utterances.length) return null;

  return (
    <aside className="say-more-panel" aria-label="Say more choices">
      <div className="say-more-heading">
        <span>Say more</span>
        <button className="say-more-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss sentence suggestions">
          ×
        </button>
      </div>
      <div className="say-more-options">
        {utterances.map((utterance, index) => (
          <button
            className="say-more-option"
            key={`${utterance.intent}-${utterance.tile_ids.join("-")}`}
            type="button"
            onClick={() => onChoose(utterance, index)}
            aria-label={`Choose sentence: ${utterance.tiles.map((tile) => tile.label_en).join(" ")}`}
          >
            {utterance.tiles.map((tile) => (
              <span className="say-more-symbol" key={tile.id}>
                {tile.symbol.localPath ? (
                  <img src={tile.symbol.localPath} alt={tile.label_en} />
                ) : tile.symbol.emoji ? (
                  <span className="tile-emoji" role="img" aria-label={tile.label_en}>{tile.symbol.emoji}</span>
                ) : (
                  <span className="tile-text-symbol" aria-hidden="true">{tile.label_en}</span>
                )}
              </span>
            ))}
          </button>
        ))}
      </div>
    </aside>
  );
}
