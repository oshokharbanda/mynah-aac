import { openDB, type DBSchema } from "idb";
import { DEFAULT_VOICE, isVoiceId, type VoiceId } from "@/app/lib/audio-voices";
import type { ExpansionUtterance } from "@/app/lib/expansions";

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

export type StoredUtterance = {
  id: string;
  text: string;
  tile_ids: string[];
  phrase_id: string | null;
  spoken_at: number;
};

export type StoredExpansion = {
  id: string;
  seed_tile_id: string;
  utterances: ExpansionUtterance[];
  chosen_index: number | null;
  dismissed: boolean;
  created_at: number;
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
  sessionUtterances: {
    key: string;
    value: StoredUtterance;
  };
  expansions: {
    key: string;
    value: StoredExpansion;
  };
}

let database: ReturnType<typeof openDB<MynahDatabase>> | null = null;
const pendingPredictionWrites = new Map<string, Promise<void>>();
const pendingExpansionWrites = new Map<string, Promise<void>>();

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser.");
  }

  database ??= openDB<MynahDatabase>("mynah", 5, {
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
      if (!db.objectStoreNames.contains("sessionUtterances")) {
        db.createObjectStore("sessionUtterances", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("expansions")) {
        db.createObjectStore("expansions", { keyPath: "id" });
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

export async function getSessionUtterances() {
  const db = await getDatabase();
  const utterances = await db.getAll("sessionUtterances");
  return utterances.sort((left, right) => right.spoken_at - left.spoken_at).slice(0, 5);
}

export async function recordSessionUtterance(
  utterance: Omit<StoredUtterance, "id" | "spoken_at">,
) {
  const db = await getDatabase();
  const stored: StoredUtterance = {
    ...utterance,
    id: crypto.randomUUID(),
    spoken_at: Date.now(),
  };
  const tx = db.transaction("sessionUtterances", "readwrite");
  await tx.store.put(stored);
  const all = await tx.store.getAll();
  const older = all.sort((left, right) => right.spoken_at - left.spoken_at).slice(5);
  await Promise.all(older.map((item) => tx.store.delete(item.id)));
  await tx.done;
  return getSessionUtterances();
}

export async function clearSessionUtterances() {
  const db = await getDatabase();
  await db.clear("sessionUtterances");
}

export function createExpansionId() {
  return crypto.randomUUID();
}

export function recordExpansion(
  expansion: Omit<StoredExpansion, "created_at" | "chosen_index" | "dismissed">,
) {
  const stored: StoredExpansion = {
    ...expansion,
    created_at: Date.now(),
    chosen_index: null,
    dismissed: false,
  };
  const write = (async () => {
    const db = await getDatabase();
    await db.put("expansions", stored);
  })();

  pendingExpansionWrites.set(stored.id, write);
  return write.finally(() => pendingExpansionWrites.delete(stored.id));
}

export async function markExpansionChosen(expansionId: string, chosenIndex: number) {
  await pendingExpansionWrites.get(expansionId);
  const db = await getDatabase();
  const expansion = await db.get("expansions", expansionId);
  if (!expansion || expansion.dismissed || expansion.chosen_index !== null) return;
  await db.put("expansions", { ...expansion, chosen_index: chosenIndex });
}

export async function markExpansionDismissed(expansionId: string) {
  await pendingExpansionWrites.get(expansionId);
  const db = await getDatabase();
  const expansion = await db.get("expansions", expansionId);
  if (!expansion || expansion.dismissed || expansion.chosen_index !== null) return;
  await db.put("expansions", { ...expansion, dismissed: true });
}

export async function getSentenceSuggestionsPreference() {
  const db = await getDatabase();
  const setting = await db.get("settings", "sentence_suggestions");
  return setting?.value !== "off";
}

export async function setSentenceSuggestionsPreference(enabled: boolean) {
  const db = await getDatabase();
  await db.put("settings", { id: "sentence_suggestions", value: enabled ? "on" : "off" });
}
