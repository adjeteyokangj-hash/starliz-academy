/** Shared model transport for academic coaching and practical Coding teaching. */
export async function requestCoachJson(apiKey: string, systemPrompt: string, userPrompt: string): Promise<Record<string, unknown> | null> {
  // Explicit no-egress acceptance mode. It never supplies a fake model result
  // and cannot change production behaviour or award pending learner mastery.
  if (process.env.NODE_ENV === "development" && process.env.CODING_QA_DISABLE_LIVE_MODEL === "true") return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.3, max_tokens: 600, store: false,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }> };
  const choice = data.choices?.[0];
  if (choice?.finish_reason !== "stop" || choice.message?.refusal || !choice?.message?.content) return null;
  try {
    const parsed: unknown = JSON.parse(choice.message.content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
