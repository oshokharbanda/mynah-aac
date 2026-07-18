import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { coreTiles, type Tile } from "@/app/data/tiles";

export const runtime = "nodejs";

const MODEL = "gpt-5.6";
const REQUEST_TIMEOUT_MS = 900;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_DAILY_CEILING = 500;
const MAX_CACHE_ENTRIES = 500;

const systemPrompt = `You rank vocabulary tiles for a child using an AAC communication board.
The child is 2-10 years old, non-speaking, and building a sentence by tapping.

Your only job: from the CANDIDATES provided, choose the 4 tiles most likely
to be what this child wants to say next.

Rules:
- Return ONLY ids present in CANDIDATES. Never invent a word or an id.
- You are not completing the sentence. You are reducing how far the child
  has to search. The child chooses; you shorten the path.
- Prefer tiles that grammatically follow the last tap. After a verb like
  "want", prefer nouns. After "I", prefer verbs. After an adjective,
  prefer nouns.
- Prefer the child's personal tiles (origin: "personal") over generic ones
  when both fit — those are their real world.
- Weight by scene and time of day, but never let context override the
  last tap. "Want" at bedtime still most likely precedes a noun.
- If the strip is empty, suggest openers this child uses most, by usage count.
- Never suggest a tile already in the current strip.
- Never suggest tiles about pain, illness, body parts, or distress unless
  the child has already tapped toward that topic. Do not put those words
  in front of a child unprompted.
- If nothing fits well, return fewer than 4. Do not pad.

Return only the specified JSON.`;

type Candidate = {
  id: string;
  label_en: string;
  part_of_speech: Tile["part_of_speech"];
  origin: "core" | "personal" | "ai_candidate";
  usage_count: number;
};

type BoardRequest = {
  strip: Tile[];
  candidates: Candidate[];
  scene: "home" | "meal" | "school" | "park" | "bedtime";
  local_time: string;
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const predictionCache = new Map<string, Array<{ tile_id: string; rank: number; reason: string }>>();
let dailyCount = 0;
let dailyDate = "";
const guardedCandidateIds = new Set(["hurt", "sad", "angry", "scared", "tired"]);
const coreTileIds = new Set(coreTiles.map((tile) => tile.id));
const partOfSpeech = new Set<Tile["part_of_speech"]>([
  "pronoun", "verb", "noun", "adjective", "social", "question", "negation", "preposition", "determiner",
]);

function configuredPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

function mayUseModel(request: NextRequest) {
  const now = Date.now();
  const ip = clientIp(request);
  const rateLimit = configuredPositiveInt(process.env.MYNAH_BOARD_RATE_LIMIT, DEFAULT_RATE_LIMIT);
  const bucket = requestBuckets.get(ip);
  const current = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : bucket;

  if (current.count >= rateLimit) return { allowed: false, reason: "rate_limit" } as const;
  current.count += 1;
  requestBuckets.set(ip, current);

  const today = new Date().toISOString().slice(0, 10);
  if (dailyDate !== today) {
    dailyDate = today;
    dailyCount = 0;
  }

  const ceiling = configuredPositiveInt(process.env.MYNAH_BOARD_DAILY_CEILING, DEFAULT_DAILY_CEILING);
  if (dailyCount >= ceiling) return { allowed: false, reason: "daily_ceiling" } as const;

  dailyCount += 1;
  return { allowed: true } as const;
}

function isString(value: unknown, maxLength = 100): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Candidate>;
  return (
    isString(candidate.id, 80) &&
    typeof candidate.part_of_speech === "string" && partOfSpeech.has(candidate.part_of_speech as Tile["part_of_speech"]) &&
    isString(candidate.label_en, 80) &&
    (candidate.origin === "core" || candidate.origin === "personal" || candidate.origin === "ai_candidate") &&
    typeof candidate.usage_count === "number" &&
    Number.isFinite(candidate.usage_count) &&
    candidate.usage_count >= 0
  );
}

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== "object") return false;
  const tile = value as Partial<Tile>;
  return (
    isString(tile.id, 80) &&
    isString(tile.label_en, 80) &&
    typeof tile.part_of_speech === "string" &&
    partOfSpeech.has(tile.part_of_speech as Tile["part_of_speech"])
  );
}

function isScene(value: unknown): value is BoardRequest["scene"] {
  return value === "home" || value === "meal" || value === "school" || value === "park" || value === "bedtime";
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

function cacheKey(request: BoardRequest) {
  const lastTwo = request.strip.slice(-2).map((tile) => tile.id).join("\u001f");
  const personalVocabulary = request.candidates
    .filter((candidate) => candidate.origin === "personal")
    .map((candidate) => candidate.id)
    .sort()
    .join("\u001f");
  return stableHash(`${lastTwo}|${request.scene}|${personalVocabulary}`);
}

function parseRequest(value: unknown): BoardRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<BoardRequest>;
  if (
    !Array.isArray(body.strip) ||
    body.strip.length > 32 ||
    !body.strip.every(isTile) ||
    !Array.isArray(body.candidates) ||
    body.candidates.length > 120 ||
    !body.candidates.every(isCandidate) ||
    !isScene(body.scene) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.local_time ?? "")
  ) {
    return null;
  }

  const uniqueCandidateIds = new Set(body.candidates.map((candidate) => candidate.id));
  if (uniqueCandidateIds.size !== body.candidates.length || body.candidates.some((candidate) => coreTileIds.has(candidate.id))) {
    return null;
  }

  const hasDistressContext = body.strip.some((tile) => guardedCandidateIds.has(tile.id));
  return {
    ...(body as BoardRequest),
    candidates: body.candidates.filter(
      (candidate) => hasDistressContext || !guardedCandidateIds.has(candidate.id),
    ),
  };
}

function fallback(reason: string) {
  console.warn(`[mynah/board] ${reason}; client fallback remains active.`);
  return NextResponse.json({ suggestions: [] }, { headers: { "x-mynah-source": "fallback" } });
}

function validateModelItems(value: unknown, request: BoardRequest) {
  const result = value as { suggestions?: unknown };
  if (!Array.isArray(result?.suggestions)) return [];

  const allowedIds = new Set(request.candidates.map((candidate) => candidate.id));
  const selectedIds = new Set(request.strip.map((tile) => tile.id));
  const uniqueIds = new Set<string>();

  return result.suggestions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { tile_id, rank, reason } = item as { tile_id?: unknown; rank?: unknown; reason?: unknown };
    if (
      !isString(tile_id, 80) ||
      typeof rank !== "number" ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > 4 ||
      !isString(reason, 80) ||
      !allowedIds.has(tile_id) ||
      selectedIds.has(tile_id) ||
      uniqueIds.has(tile_id)
    ) {
      return [];
    }

    uniqueIds.add(tile_id);
    return [{ tile_id, rank, reason }];
  }).sort((left, right) => left.rank - right.rank).slice(0, 4);
}

function cachePrediction(key: string, suggestions: Array<{ tile_id: string; rank: number; reason: string }>) {
  if (predictionCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = predictionCache.keys().next().value;
    if (oldestKey) predictionCache.delete(oldestKey);
  }
  predictionCache.set(key, suggestions);
}

export async function POST(request: NextRequest) {
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) return fallback("invalid request");

  const cached = predictionCache.get(cacheKey(body));
  if (cached) {
    return NextResponse.json({ suggestions: cached }, { headers: { "x-mynah-source": "cache" } });
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
        CANDIDATES: body.candidates,
        CURRENT_STRIP: body.strip.map((tile) => ({
          id: tile.id,
          label_en: tile.label_en,
          part_of_speech: tile.part_of_speech,
        })),
        SCENE: body.scene,
        LOCAL_TIME: body.local_time,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "board_prediction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["suggestions"],
            properties: {
              suggestions: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["tile_id", "rank", "reason"],
                  properties: {
                    tile_id: { type: "string" },
                    rank: { type: "integer", minimum: 1, maximum: 4 },
                    reason: { type: "string", maxLength: 80 },
                  },
                },
              },
            },
          },
        },
      },
    }, { signal: controller.signal });

    const parsed = JSON.parse(response.output_text);
    const suggestions = validateModelItems(parsed, body);
    cachePrediction(cacheKey(body), suggestions);
    return NextResponse.json({ suggestions }, { headers: { "x-mynah-source": "model" } });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "model timeout" : "model request failed";
    return fallback(reason);
  } finally {
    clearTimeout(timeout);
  }
}
