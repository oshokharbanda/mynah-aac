import type { CategoryId, Tile } from "@/app/data/tiles";
import type { VoiceId } from "@/app/lib/audio-voices";

export type PersonalPictureKind = "photo" | "emoji" | "text";

export type StoredPersonalTile = {
  id: string;
  is_core: false;
  pinned_index: null;
  category: "my_words";
  secondary_category: Exclude<CategoryId, "my_words"> | null;
  part_of_speech: Tile["part_of_speech"];
  label_en: string;
  speech_en: string;
  picture_kind: PersonalPictureKind;
  emoji: string | null;
  hidden: boolean;
  origin: "personal";
  approved: true;
  voice_pending: boolean;
  created_at: number;
  updated_at: number;
};

export type PersonalTileAsset = {
  id: string;
  photo: Blob | null;
  audio: Partial<Record<VoiceId, Blob>>;
};

export type PersonalTile = Tile & {
  secondary_category: StoredPersonalTile["secondary_category"];
  picture_kind: PersonalPictureKind;
  voice_pending: boolean;
  hidden: boolean;
  created_at: number;
  photoBlob: Blob | null;
  audio: Partial<Record<VoiceId, Blob>>;
};

export function personalTileToBoardTile(
  tile: StoredPersonalTile,
  asset: PersonalTileAsset | undefined,
  photoUrl: string | undefined,
): PersonalTile {
  return {
    id: tile.id,
    is_core: false,
    pinned_index: null,
    category: "my_words",
    secondary_category: tile.secondary_category,
    part_of_speech: tile.part_of_speech,
    label_en: tile.label_en,
    speech_en: tile.speech_en,
    picture_kind: tile.picture_kind,
    voice_pending: tile.voice_pending,
    hidden: tile.hidden,
    created_at: tile.created_at,
    photoBlob: asset?.photo ?? null,
    audio: asset?.audio ?? {},
    symbol: {
      provider: tile.picture_kind === "emoji" ? "mulberry" : "text",
      localPath: photoUrl,
      emoji: tile.emoji ?? undefined,
      attribution: "Personal vocabulary, stored on this device",
      license: "CC-BY-SA",
    },
    origin: "personal",
    approved: true,
    usage: { count: 0, last_used_at: null },
  };
}

export function normalizeWord(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function compressPersonalPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(640, Math.max(128, Math.min(bitmap.width, bitmap.height)));
  const sourceSide = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - sourceSide) / 2;
  const sourceY = (bitmap.height - sourceSide) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo processing is unavailable.");
  context.drawImage(bitmap, sourceX, sourceY, sourceSide, sourceSide, 0, 0, side, side);
  bitmap.close();

  for (const quality of [0.84, 0.74, 0.64, 0.54, 0.44]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 200 * 1024) return blob;
  }
  throw new Error("That photo could not be compressed below 200 KB.");
}
