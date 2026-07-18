import { NextRequest } from "next/server";
import { isVoiceId, providerVoiceId } from "@/app/lib/audio-voices";

export const runtime = "nodejs";

const TIMEOUT_MS = 900;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { text?: unknown; voice?: unknown } | null;
  if (!body || typeof body.text !== "string" || !body.text.trim() || body.text.length > 4096 || !isVoiceId(body.voice)) {
    return new Response(null, { status: 204 });
  }
  if (!process.env.ELEVENLABS_API_KEY) return new Response(null, { status: 204 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${providerVoiceId(body.voice)}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text: body.text.trim(),
          model_id: "eleven_flash_v2_5",
          language_code: "en",
          voice_settings: { stability: 0.72, similarity_boost: 0.7, style: 0, speed: 0.9 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return new Response(null, { status: 204 });
    return new Response(await response.arrayBuffer(), {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 204 });
  } finally {
    clearTimeout(timeout);
  }
}
