import "server-only";

import { getOpenAiApiKeyWithSource, type OpenAiKeySource } from "@/lib/api-key-config";

export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_TTS_VOICES = ["alloy", "aria", "sage", "verse"] as const;

export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

export class OpenAiTtsError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OpenAiTtsError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeOpenAiTtsVoice(value: string | null | undefined): OpenAiTtsVoice {
  if (!value) return "alloy";
  const normalized = value.trim().toLowerCase();
  if ((OPENAI_TTS_VOICES as readonly string[]).includes(normalized)) {
    return normalized as OpenAiTtsVoice;
  }
  return "alloy";
}

export async function generateOpenAiTtsAudio(input: {
  text: string;
  voice?: string;
}): Promise<{ audioBuffer: ArrayBuffer; keySource: OpenAiKeySource; voice: OpenAiTtsVoice }> {
  const text = String(input.text ?? "").trim();
  if (!text) {
    throw new OpenAiTtsError("Text is required.", 400, "invalid_text");
  }

  const voice = normalizeOpenAiTtsVoice(input.voice);
  const { apiKey, keySource } = await getOpenAiApiKeyWithSource();

  if (!apiKey) {
    throw new OpenAiTtsError("OpenAI API key is missing.", 503, "missing_openai_key");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new OpenAiTtsError(
      details ? `OpenAI TTS failed: ${details}` : "OpenAI TTS request failed.",
      502,
      "tts_provider_failed",
    );
  }

  const audioBuffer = await response.arrayBuffer();
  return { audioBuffer, keySource, voice };
}
