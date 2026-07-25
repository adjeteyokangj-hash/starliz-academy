import { getOpenAiApiKeyWithSource } from "@/lib/api-key-config";
import { parseJsonWithRepair } from "@/lib/safe-json";

const OPENAI_MODEL = (process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini").trim() || "gpt-4o-mini";

export type OpenAiJsonResult = {
  parsed: unknown;
  rawContent: string;
  model: string;
  keySource: "database" | "environment" | "none";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
};

/** Shared OpenAI JSON chat helper used by daytime (and reusable elsewhere). */
export async function requestOpenAiJson(input: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAiJsonResult> {
  const keyInfo = await getOpenAiApiKeyWithSource();
  if (!keyInfo.apiKey) {
    const error = new Error("Missing OPENAI_API_KEY for daytime lesson generation.") as Error & {
      code?: string;
    };
    error.code = "OPENAI_KEY_MISSING";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyInfo.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        temperature: input.temperature ?? 0.4,
        max_tokens: input.maxTokens ?? 3500,
        response_format: { type: "json_object" },
      }),
    });

    const rawProviderBody = await openAIResponse.text();
    const providerPayload = parseJsonWithRepair<Record<string, unknown>>(rawProviderBody);
    if (!openAIResponse.ok) {
      const providerError = providerPayload.success && providerPayload.data.error && typeof providerPayload.data.error === "object"
        ? (providerPayload.data.error as Record<string, unknown>)
        : null;
      const requestError = new Error(
        `OpenAI request failed with status ${openAIResponse.status}${typeof providerError?.code === "string" ? ` (${providerError.code})` : ""}`,
      ) as Error & Record<string, unknown>;
      requestError.providerStatus = openAIResponse.status;
      requestError.providerCode = typeof providerError?.code === "string" ? providerError.code : null;
      throw requestError;
    }
    if (!providerPayload.success) {
      throw new Error("OpenAI returned a non-JSON payload.");
    }

    const choices = providerPayload.data.choices as Array<{ message?: { content?: string } }> | undefined;
    const rawContent = choices?.[0]?.message?.content ?? "";
    if (!String(rawContent).trim()) {
      throw new Error("OpenAI returned an empty content payload.");
    }

    const repaired = parseJsonWithRepair(rawContent);
    if (!repaired.success) {
      throw new Error(`Malformed AI JSON. Stages: ${repaired.diagnostics.stagesTried.join(" -> ")}`);
    }

    const usage = providerPayload.data.usage && typeof providerPayload.data.usage === "object"
      ? providerPayload.data.usage as Record<string, unknown>
      : null;

    return {
      parsed: repaired.data,
      rawContent,
      model: typeof providerPayload.data.model === "string" ? providerPayload.data.model : OPENAI_MODEL,
      keySource: keyInfo.keySource,
      usage: usage
        ? {
            promptTokens: Number(usage.prompt_tokens ?? 0),
            completionTokens: Number(usage.completion_tokens ?? 0),
            totalTokens: Number(usage.total_tokens ?? 0),
          }
        : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function getDaytimeOpenAiModel(): string {
  return OPENAI_MODEL;
}
