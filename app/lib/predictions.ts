import { allTiles, type Tile } from "@/app/data/tiles";
import type { StoredTileUsage } from "@/app/lib/tile-usage";

export type PredictionItem = {
  tile_id: string;
  reason: string;
};

export type PredictionResponse = {
  items: PredictionItem[];
  source: "model" | "fallback";
};

export type PredictionCandidate = Pick<
  Tile,
  "id" | "part_of_speech" | "label_en" | "speech_en" | "origin" | "approved"
> & {
  usage: StoredTileUsage;
};

const guardedTileIds = new Set(["hurt", "sad", "angry", "scared", "tired"]);

export function stripHash(tileIds: readonly string[]) {
  return tileIds.join("\u001f");
}

export function isDistressContext(stripIds: readonly string[]) {
  return stripIds.some((id) => guardedTileIds.has(id));
}

export function buildCandidates(
  usage: Record<string, StoredTileUsage>,
  stripIds: readonly string[],
): PredictionCandidate[] {
  const hasDistressTopic = isDistressContext(stripIds);
  const selected = new Set(stripIds);

  return allTiles
    .filter(
      (tile) =>
        tile.approved &&
        !selected.has(tile.id) &&
        (hasDistressTopic || !guardedTileIds.has(tile.id)),
    )
    .map((tile) => ({
      id: tile.id,
      part_of_speech: tile.part_of_speech,
      label_en: tile.label_en,
      speech_en: tile.speech_en,
      origin: tile.origin,
      approved: tile.approved,
      usage: usage[tile.id] ?? { id: tile.id, count: 0, last_used_at: null },
    }));
}

function fallbackReason(
  lastTile: Pick<PredictionCandidate, "id" | "part_of_speech"> | undefined,
  tile: PredictionCandidate,
) {
  if (!lastTile) return "Often used opener";
  if (lastTile.part_of_speech === "verb" && tile.part_of_speech === "noun") {
    return "Noun after a verb";
  }
  if (lastTile.id === "i" && tile.part_of_speech === "verb") {
    return "Verb after I";
  }
  if (lastTile.part_of_speech === "adjective" && tile.part_of_speech === "noun") {
    return "Noun after a describing word";
  }
  return "Used often on this board";
}

export function rankFallback(
  candidates: readonly PredictionCandidate[],
  stripIds: readonly string[],
): PredictionItem[] {
  const lastId = stripIds.at(-1);
  const lastTile = allTiles.find((tile) => tile.id === lastId);
  const scored = candidates.map((tile) => {
    let score = Math.min(tile.usage.count, 100) * 10;

    if (!lastTile) score += 20;
    if (lastTile?.id === "i" && tile.part_of_speech === "verb") score += 1_000;
    if (lastTile?.part_of_speech === "verb" && tile.part_of_speech === "noun") score += 900;
    if (lastTile?.part_of_speech === "adjective" && tile.part_of_speech === "noun") score += 800;
    if (tile.origin === "personal") score += 75;

    return { tile, score };
  });

  return scored
    .sort((left, right) => right.score - left.score || left.tile.id.localeCompare(right.tile.id))
    .slice(0, 4)
    .map(({ tile }) => ({ tile_id: tile.id, reason: fallbackReason(lastTile, tile) }));
}

export function tilesForPrediction(items: readonly PredictionItem[]) {
  const tilesById = new Map(allTiles.map((tile) => [tile.id, tile]));
  return items
    .map((item) => tilesById.get(item.tile_id))
    .filter((tile): tile is Tile => Boolean(tile));
}
