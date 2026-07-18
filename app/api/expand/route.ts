import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { allTiles } from "@/app/data/tiles";
import { mayUseModel } from "@/app/lib/api-guards";
import { expansionIntents, type ExpansionIntent, type ExpansionUtterance } from "@/app/lib/expansions";

export const runtime = "nodejs";

const MODEL = "gpt-5.6";
const REQUEST_TIMEOUT_MS = 1_500;
const distressTileIds = new Set(["hurt", "sad", "angry", "scared", "tired"]);
const vocabularyById = new Map(allTiles.map((tile) => [tile.id, tile]));

const systemPrompt = `You help a non-speaking child aged 2-5 expand a single tapped word into
short complete utterances on their AAC board.

You are given the word the child tapped, the board vocabulary with ids,
the current scene, and the time of day.

Rules:
- Produce up to 3 utterances. Each MUST include the seed word's tile.
- Use ONLY tile ids from the provided vocabulary. Never invent words.
- 3 to 5 tiles per utterance. Age 2-5 grammar. No politeness padding.
- The utterances must express DIFFERENT intents. The child may be
  refusing, commenting, or asking — not only requesting. Never assume
  the child wants the thing. If the seed is "water", a refusal
  ("not want water") is as likely as a request.
- Weight by scene and time: "bed" at night suggests both "I want to
  sleep" and "I not want sleep".
- Never produce utterances about pain, illness, or distress unless the
  seed word is already in that domain.
- If you cannot form 3 genuinely different utterances from the
  vocabulary, return fewer. Do not pad.`;

type Scene = "home" | "meal" | "school" | "park" | "bedtime";

type RecentUtterance = {
  text: string;
  tile_ids: string[];
};

type ExpandRequest = {
  seed_tile_id: string;
  scene: Scene;
  local_time: string;
  recent_utterances: RecentUtterance[];
  personal_tile_ids: string[];
  personal_tiles: Array<{ id: string; label_en: string; part_of_speech: "noun" | "verb" | "adjective" | "social" | "pronoun" | "question" | "negation" | "preposition" | "determiner" }>;
};

function isString(value: unknown, maxLength = 160): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isScene(value: unknown): value is Scene {
  return value === "home" || value === "meal" || value === "school" || value === "park" || value === "bedtime";
}

function parseRecentUtterance(value: unknown, vocabulary: Map<string, { id: string }>): RecentUtterance | null {
  if (!value || typeof value !== "object") return null;
  const utterance = value as Partial<RecentUtterance>;
  if (
    !isString(utterance.text, 300) ||
    !Array.isArray(utterance.tile_ids) ||
    utterance.tile_ids.length > 5 ||
    !utterance.tile_ids.every((id) => isString(id, 80) && vocabulary.has(id))
  ) return null;
  return { text: utterance.text, tile_ids: utterance.tile_ids };
}

function parseRequest(value: unknown): ExpandRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<ExpandRequest>;
  if (
    !isString(body.seed_tile_id, 80) ||
    !isScene(body.scene) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.local_time ?? "") ||
    !Array.isArray(body.recent_utterances) ||
    body.recent_utterances.length > 5 ||
    !Array.isArray(body.personal_tile_ids) ||
    body.personal_tile_ids.length > 60 ||
    !body.personal_tile_ids.every((id) => isString(id, 80)) ||
    !Array.isArray(body.personal_tiles) ||
    body.personal_tiles.length > 60
  ) return null;

  const personalTiles = body.personal_tiles.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const tile = item as { id?: unknown; label_en?: unknown; part_of_speech?: unknown };
    if (!isString(tile.id, 80) || !isString(tile.label_en, 200) ||
      !["noun", "verb", "adjective", "social", "pronoun", "question", "negation", "preposition", "determiner"].includes(String(tile.part_of_speech)) ||
      vocabularyById.has(tile.id)) return [];
    return [{ id: tile.id, label_en: tile.label_en, part_of_speech: tile.part_of_speech as ExpandRequest["personal_tiles"][number]["part_of_speech"] }];
  });
  if (personalTiles.length !== body.personal_tiles.length) return null;
  const vocabulary = new Map<string, { id: string }>([
    ...vocabularyById,
    ...personalTiles.map((tile) => [tile.id, tile] as const),
  ]);
  if (!vocabulary.has(body.seed_tile_id) ||
    !body.personal_tile_ids.every((id) => personalTiles.some((tile) => tile.id === id)) ||
    new Set(personalTiles.map((tile) => tile.id)).size !== personalTiles.length) return null;

  const recent = body.recent_utterances.map((utterance) => parseRecentUtterance(utterance, vocabulary));
  if (recent.some((utterance) => !utterance)) return null;
  if (new Set(body.personal_tile_ids).size !== body.personal_tile_ids.length) return null;

  return {
    seed_tile_id: body.seed_tile_id as string,
    scene: body.scene as Scene,
    local_time: body.local_time as string,
    recent_utterances: recent as RecentUtterance[],
    personal_tile_ids: body.personal_tile_ids as string[],
    personal_tiles: personalTiles,
  };
}

function fallback(reason: string) {
  console.warn(`[mynah/expand] ${reason}; no Say More panel rendered.`);
  return NextResponse.json({ utterances: [] }, { headers: { "x-mynah-source": "fallback" } });
}

function isIntent(value: unknown): value is ExpansionIntent {
  return typeof value === "string" && expansionIntents.includes(value as ExpansionIntent);
}

function validateUtterances(value: unknown, body: ExpandRequest): ExpansionUtterance[] {
  const parsed = value as { utterances?: unknown };
  if (!Array.isArray(parsed?.utterances)) return [];

  const seenUtterances = new Set<string>();
  const seenIntents = new Set<ExpansionIntent>();
  const seedIsDistress = distressTileIds.has(body.seed_tile_id);
  const vocabulary = new Map<string, { id: string }>([
    ...vocabularyById,
    ...body.personal_tiles.map((tile) => [tile.id, tile] as const),
  ]);

  return parsed.utterances.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { tile_ids, intent } = entry as { tile_ids?: unknown; intent?: unknown };
    if (
      !Array.isArray(tile_ids) ||
      tile_ids.length < 3 ||
      tile_ids.length > 5 ||
      !tile_ids.every((id) => isString(id, 80) && vocabulary.has(id)) ||
      !tile_ids.includes(body.seed_tile_id) ||
      new Set(tile_ids).size !== tile_ids.length ||
      !isIntent(intent)
    ) return [];

    const signature = tile_ids.join("\u001f");
    if (seenUtterances.has(signature) || seenIntents.has(intent)) return [];
    if (!seedIsDistress && tile_ids.some((id) => distressTileIds.has(id))) return [];

    seenUtterances.add(signature);
    seenIntents.add(intent);
    return [{ tile_ids, intent }];
  }).slice(0, 3);
}

export async function POST(request: NextRequest) {
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) return fallback("invalid request");

  const vocabulary = [...allTiles, ...body.personal_tiles];
  const seed = vocabulary.find((tile) => tile.id === body.seed_tile_id);
  if (!seed || (seed.part_of_speech !== "noun" && seed.part_of_speech !== "verb")) {
    return fallback("ineligible seed tile");
  }

  const permission = mayUseModel(request);
  if (!permission.allowed) return fallback(permission.reason);
  if (!process.env.OPENAI_API_KEY) return fallback("OPENAI_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: MODEL,
      store: false,
      instructions: systemPrompt,
      input: JSON.stringify({
        SEED_WORD: { id: seed.id, label_en: seed.label_en, part_of_speech: seed.part_of_speech },
        VOCABULARY: vocabulary.map((tile) => ({
          id: tile.id,
          label_en: tile.label_en,
          part_of_speech: tile.part_of_speech,
          origin: body.personal_tile_ids.includes(tile.id) ? "personal" : ("origin" in tile ? tile.origin : "personal"),
        })),
        SCENE: body.scene,
        LOCAL_TIME: body.local_time,
        RECENT_UTTERANCES: body.recent_utterances,
        PERSONAL_TILE_IDS: body.personal_tile_ids,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "say_more",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["utterances"],
            properties: {
              utterances: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["tile_ids", "intent"],
                  properties: {
                    tile_ids: { type: "array", maxItems: 5, items: { type: "string" } },
                    intent: { type: "string", enum: ["request", "comment", "refusal", "feeling", "question"] },
                  },
                },
              },
            },
          },
        },
      },
    }, { signal: controller.signal });

    const utterances = validateUtterances(JSON.parse(response.output_text), body);
    return NextResponse.json({ utterances }, { headers: { "x-mynah-source": "model" } });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "model timeout" : "model request failed";
    return fallback(reason);
  } finally {
    clearTimeout(timeout);
  }
}
