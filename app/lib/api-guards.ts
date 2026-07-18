import type { NextRequest } from "next/server";

const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_DAILY_CEILING = 500;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let dailyCount = 0;
let dailyDate = "";
const wordAudioBuckets = new Map<string, { count: number; resetAt: number }>();
let wordAudioDailyCount = 0;
let wordAudioDailyDate = "";

function configuredPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

// The prediction and expansion endpoints deliberately share one public budget.
export function mayUseModel(request: NextRequest) {
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

export function mayGenerateWordAudio(request: NextRequest) {
  const now = Date.now();
  const ip = clientIp(request);
  const rateLimit = configuredPositiveInt(process.env.MYNAH_WORD_AUDIO_RATE_LIMIT, 20);
  const bucket = wordAudioBuckets.get(ip);
  const current = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : bucket;
  if (current.count >= rateLimit) return { allowed: false, reason: "rate_limit" } as const;
  current.count += 1;
  wordAudioBuckets.set(ip, current);

  const today = new Date().toISOString().slice(0, 10);
  if (wordAudioDailyDate !== today) {
    wordAudioDailyDate = today;
    wordAudioDailyCount = 0;
  }
  const ceiling = configuredPositiveInt(process.env.MYNAH_WORD_AUDIO_DAILY_CEILING, 20);
  if (wordAudioDailyCount >= ceiling) return { allowed: false, reason: "daily_ceiling" } as const;
  wordAudioDailyCount += 1;
  return { allowed: true } as const;
}
