import { allTiles, fringeTiles, type Tile } from "@/app/data/tiles";
import type { StoredTileUsage } from "@/app/lib/tile-usage";

export type PredictionItem = {
  tile_id: string;
  rank: number;
  reason: string;
};

export type BoardPredictionResponse = {
  suggestions: PredictionItem[];
};

export type PredictionCandidate = {
  id: string;
  label_en: string;
  part_of_speech: Tile["part_of_speech"];
  origin: Tile["origin"];
  usage_count: number;
};

const guardedTileIds = new Set(["hurt", "sad", "angry", "scared", "tired"]);

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

export function stripHash(tileIds: readonly string[]) {
  return stableHash(tileIds.join("\u001f"));
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

  return fringeTiles
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
      origin: tile.origin,
      usage_count: usage[tile.id]?.count ?? 0,
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
    let score = Math.min(tile.usage_count, 100) * 10;

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
    .map(({ tile }, index) => ({
      tile_id: tile.id,
      rank: index + 1,
      reason: fallbackReason(lastTile, tile),
    }));
}

export function tilesForPrediction(items: readonly PredictionItem[]) {
  const tilesById = new Map(fringeTiles.map((tile) => [tile.id, tile]));
  return items
    .map((item) => tilesById.get(item.tile_id))
    .filter((tile): tile is Tile => Boolean(tile));
}

export function predictionCacheKey(
  stripIds: readonly string[],
  scene: string,
  candidates: readonly PredictionCandidate[],
) {
  const lastTwo = stripIds.slice(-2).join("\u001f");
  const personalVocabulary = candidates
    .filter((candidate) => candidate.origin === "personal")
    .map((candidate) => candidate.id)
    .sort()
    .join("\u001f");

  return stableHash(`${lastTwo}|${scene}|${personalVocabulary}`);
}
