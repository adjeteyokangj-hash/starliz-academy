import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, requireAdminPermission } from "@/lib/api_guard";
import { generateOpenAiTtsAudio, OPENAI_TTS_VOICES, OpenAiTtsError } from "@/lib/voice/openai-tts";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  voice: z.enum(OPENAI_TTS_VOICES).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("settings:api_keys:test");
  if (!session) return response;

  const rateCheck = checkRateLimit({ key: `admin:voice:test:${session.userId}`, limit: 20, windowMs: 60_000 });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many voice test requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSeconds) } },
    );
  }

  try {
    const body = requestSchema.parse(await request.json());
    const tts = await generateOpenAiTtsAudio({ text: body.text, voice: body.voice });

    return new NextResponse(tts.audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(tts.audioBuffer.byteLength),
        "X-TTS-Provider": "openai",
        "X-TTS-Voice": tts.voice,
        "X-TTS-Key-Source": tts.keySource,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload for voice test." }, { status: 400 });
    }

    if (error instanceof OpenAiTtsError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Voice test failed.", code: "voice_test_failed" },
      { status: 500 },
    );
  }
}
