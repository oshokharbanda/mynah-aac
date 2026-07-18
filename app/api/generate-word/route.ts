import { NextRequest, NextResponse } from "next/server";
import { isVoiceId, providerVoiceId } from "@/app/lib/audio-voices";
import { mayGenerateWordAudio } from "@/app/lib/api-guards";

export const runtime = "nodejs";

const MAX_WORD_LENGTH = 200;
const TIMEOUT_MS = 4_000;

function normalizeText(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null) as { text_en?: unknown; voice_id?: unknown } | null;
  const text = typeof raw?.text_en === "string" ? normalizeText(raw.text_en) : "";
  if (!text || text.length > MAX_WORD_LENGTH || !isVoiceId(raw?.voice_id)) {
    return NextResponse.json({ error: "Enter one English word or phrase of 200 characters or fewer." }, { status: 400 });
  }
  const permission = mayGenerateWordAudio(request);
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 429 });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Voice generation is not configured." }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${providerVoiceId(raw.voice_id)}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          language_code: "en",
          voice_settings: { stability: 0.72, similarity_boost: 0.7, style: 0, speed: 0.9 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return NextResponse.json({ error: "Voice generation failed." }, { status: 503 });
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "server-timing": `elevenlabs;dur=${Math.round(performance.now() - startedAt)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Voice generation timed out." }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
