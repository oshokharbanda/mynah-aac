import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "gpt-5.6";
const REQUEST_TIMEOUT_MS = 900;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_DAILY_CEILING = 500;

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
  part_of_speech: string;
  label_en: string;
  speech_en: string;
  origin: "core" | "personal" | "ai_candidate";
  approved: boolean;
  usage: { count: number; last_used_at: number | null };
};

type BoardRequest = {
  strip_ids: string[];
  strip_hash: string;
  candidates: Candidate[];
  scene: string | null;
  hour_local: number;
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let dailyCount = 0;
let dailyDate = "";
const guardedCandidateIds = new Set(["hurt", "sad", "angry", "scared", "tired"]);

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
    isString(candidate.part_of_speech, 32) &&
    isString(candidate.label_en, 80) &&
    isString(candidate.speech_en, 120) &&
    (candidate.origin === "core" || candidate.origin === "personal" || candidate.origin === "ai_candidate") &&
    candidate.approved === true &&
    Boolean(candidate.usage) &&
    typeof candidate.usage?.count === "number" &&
    Number.isFinite(candidate.usage.count) &&
    (candidate.usage.last_used_at === null || typeof candidate.usage.last_used_at === "number")
  );
}

function parseRequest(value: unknown): BoardRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Partial<BoardRequest>;
  if (
    !Array.isArray(body.strip_ids) ||
    !body.strip_ids.every((id) => isString(id, 80)) ||
    typeof body.strip_hash !== "string" ||
    body.strip_hash.length > 4_000 ||
    !Array.isArray(body.candidates) ||
    body.candidates.length > 120 ||
    !body.candidates.every(isCandidate) ||
    !(body.scene === null || isString(body.scene, 40)) ||
    typeof body.hour_local !== "number" ||
    !Number.isInteger(body.hour_local) ||
    body.hour_local < 0 ||
    body.hour_local > 23
  ) {
    return null;
  }

  const stripIds = body.strip_ids;
  const uniqueCandidateIds = new Set(body.candidates.map((candidate) => candidate.id));
  if (
    uniqueCandidateIds.size !== body.candidates.length ||
    stripIds.join("\u001f") !== body.strip_hash
  ) {
    return null;
  }

  const hasDistressContext = stripIds.some((id) => guardedCandidateIds.has(id));
  return {
    ...(body as BoardRequest),
    candidates: body.candidates.filter(
      (candidate) => hasDistressContext || !guardedCandidateIds.has(candidate.id),
    ),
  };
}

function fallback(reason: string) {
  console.warn(`[mynah/board] ${reason}; client fallback remains active.`);
  return NextResponse.json({ items: [], source: "fallback" as const });
}

function validateModelItems(value: unknown, request: BoardRequest) {
  const result = value as { items?: unknown };
  if (!Array.isArray(result?.items)) return [];

  const allowedIds = new Set(request.candidates.map((candidate) => candidate.id));
  const selectedIds = new Set(request.strip_ids);
  const uniqueIds = new Set<string>();

  return result.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { tile_id, reason } = item as { tile_id?: unknown; reason?: unknown };
    if (
      !isString(tile_id, 80) ||
      !isString(reason, 80) ||
      !allowedIds.has(tile_id) ||
      selectedIds.has(tile_id) ||
      uniqueIds.has(tile_id)
    ) {
      return [];
    }

    uniqueIds.add(tile_id);
    return [{ tile_id, reason }];
  }).slice(0, 4);
}

export async function POST(request: NextRequest) {
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) return fallback("invalid request");

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
        CURRENT_STRIP: body.strip_ids,
        SCENE: body.scene,
        HOUR_LOCAL: body.hour_local,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "board_prediction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                maxItems: 4,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["tile_id", "reason"],
                  properties: {
                    tile_id: { type: "string" },
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
    return NextResponse.json({ items: validateModelItems(parsed, body), source: "model" as const });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "model timeout" : "model request failed";
    return fallback(reason);
  } finally {
    clearTimeout(timeout);
  }
}
