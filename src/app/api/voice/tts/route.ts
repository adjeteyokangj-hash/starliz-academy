import { NextResponse } from "next/server";
import { readSessionFromCookie } from "@/lib/auth";
import { getVoiceApiKey } from "@/lib/api-key-config";

// Max text length to prevent abuse
const MAX_TEXT_LENGTH = 500;

export async function POST(request: Request) {
  // Must be authenticated (child or parent session)
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = await getVoiceApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  }

  let text: string;
  let voice: string;
  let instructions: string | undefined;
  try {
    const body = (await request.json()) as { text?: unknown; voice?: unknown; instructions?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_TEXT_LENGTH);
    // Sanitize: only allow safe voices
    const ALLOWED_VOICES = ["nova", "shimmer", "alloy", "echo", "fable", "onyx"] as const;
    type AllowedVoice = (typeof ALLOWED_VOICES)[number];
    const requestedVoice = typeof body.voice === "string" ? body.voice : "nova";
    voice = (ALLOWED_VOICES as readonly string[]).includes(requestedVoice)
      ? (requestedVoice as AllowedVoice)
      : "nova";
    if (typeof body.instructions === "string" && body.instructions.trim()) {
      instructions = body.instructions.trim().slice(0, 220);
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: text,
        voice,
        response_format: "mp3",
        instructions:
          "You are a warm, encouraging teacher speaking to a child aged 5-10. " +
          "Speak clearly, gently, and with enthusiasm. " +
          "Slightly slower pace than normal. Use a friendly, uplifting tone. " +
          `${instructions ?? "Use a neutral clear English accent."}`,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("[TTS] OpenAI error:", openaiResponse.status, errText);
      return NextResponse.json({ error: "TTS service error" }, { status: 502 });
    }

    const audioBuffer = await openaiResponse.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[TTS] Fetch error:", err);
    return NextResponse.json({ error: "TTS unavailable" }, { status: 503 });
  }
}
