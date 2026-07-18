import { openDB, type DBSchema } from "idb";
import { DEFAULT_VOICE, isVoiceId, type VoiceId } from "@/app/lib/audio-voices";

export type StoredTileUsage = {
  id: string;
  count: number;
  last_used_at: number | null;
};

export type StoredPrediction = {
  id: string;
  created_at: number;
  strip_ids: string[];
  strip_hash: string;
  items: Array<{ tile_id: string; rank: number; reason: string }>;
  source: "model" | "cache" | "fallback";
  tapped_suggestion_id: string | null;
};

interface MynahDatabase extends DBSchema {
  tileUsage: {
    key: string;
    value: StoredTileUsage;
  };
  predictions: {
    key: string;
    value: StoredPrediction;
  };
  settings: {
    key: string;
    value: { id: string; value: string };
  };
}

let database: ReturnType<typeof openDB<MynahDatabase>> | null = null;
const pendingPredictionWrites = new Map<string, Promise<void>>();

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser.");
  }

  database ??= openDB<MynahDatabase>("mynah", 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("tileUsage")) {
        db.createObjectStore("tileUsage", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("predictions")) {
        db.createObjectStore("predictions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    },
  });

  return database;
}

export async function recordTileUse(tileId: string, usedAt = Date.now()) {
  const db = await getDatabase();
  const current = await db.get("tileUsage", tileId);
  const next: StoredTileUsage = {
    id: tileId,
    count: (current?.count ?? 0) + 1,
    last_used_at: usedAt,
  };

  await db.put("tileUsage", next);
  return next;
}

export async function getTileUsage(tileIds: readonly string[]) {
  const db = await getDatabase();
  const records = await Promise.all(tileIds.map((id) => db.get("tileUsage", id)));

  return Object.fromEntries(
    tileIds.map((id, index) => [
      id,
      records[index] ?? { id, count: 0, last_used_at: null },
    ]),
  ) as Record<string, StoredTileUsage>;
}

export function createPredictionId() {
  return crypto.randomUUID();
}

export function recordPrediction(
  prediction: Omit<StoredPrediction, "created_at" | "tapped_suggestion_id">,
) {
  const stored: StoredPrediction = {
    ...prediction,
    created_at: Date.now(),
    tapped_suggestion_id: null,
  };
  const write = (async () => {
    const db = await getDatabase();
    await db.put("predictions", stored);
  })();

  pendingPredictionWrites.set(stored.id, write);
  return write.finally(() => pendingPredictionWrites.delete(stored.id));
}

export async function markSuggestedTileTapped(predictionId: string, tileId: string) {
  await pendingPredictionWrites.get(predictionId);
  const db = await getDatabase();
  const prediction = await db.get("predictions", predictionId);
  if (!prediction || prediction.tapped_suggestion_id) return;

  await db.put("predictions", { ...prediction, tapped_suggestion_id: tileId });
}

export async function getVoicePreference() {
  const db = await getDatabase();
  const setting = await db.get("settings", "voice");
  return isVoiceId(setting?.value) ? setting.value : DEFAULT_VOICE;
}

export async function setVoicePreference(voice: VoiceId) {
  const db = await getDatabase();
  await db.put("settings", { id: "voice", value: voice });
}
