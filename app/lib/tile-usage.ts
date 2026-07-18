import { openDB, type DBSchema } from "idb";

export type StoredTileUsage = {
  id: string;
  count: number;
  last_used_at: number | null;
};

interface MynahDatabase extends DBSchema {
  tileUsage: {
    key: string;
    value: StoredTileUsage;
  };
}

let database: ReturnType<typeof openDB<MynahDatabase>> | null = null;

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser.");
  }

  database ??= openDB<MynahDatabase>("mynah", 1, {
    upgrade(db) {
      db.createObjectStore("tileUsage", { keyPath: "id" });
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
