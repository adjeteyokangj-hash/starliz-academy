import { getOpenAiApiKey } from "@/lib/api-key-config";
import { requestCoachJson } from "@/lib/coach/model-json";
import { safeTeachingMessage } from "../learning/tutor-safety";
import { resolveTeachingKey } from "../learning/teacher";
import { missions, locations } from "./model";

/** Only developer-authored task material reaches the shared model transport.
 * No child ID, name, age, program, free text or run history is sent. */
export async function worldCompanionHint(missionId: string, fallback: string, deps = { getKey: getOpenAiApiKey, request: requestCoachJson }) {
  const mission = missions.find(m => m.id === missionId);
  if (!mission) return { message: fallback, source: "fallback" as const };
  try {
    const key = await resolveTeachingKey(deps.getKey);
    if (!key) return { message: fallback, source: "fallback" as const };
    const response = await deps.request(key,
      "You are a friendly StarLiz Academy coding companion. Give one short, age-appropriate hint in British English using only the supplied educational task. Stay under 60 words. Ask one guiding question. Do not provide a complete solution or claim to have inspected a learner's code. Never request personal information, contact, websites, purchases, microphone or voice. Do not claim completion, mastery or rewards. Return JSON with a message field.",
      JSON.stringify({ location: locations.find(l => l.id === mission.location)!.title, objective: mission.objective, guidance: fallback }));
    if (typeof response?.message === "string" && response.message.length <= 600 && safeTeachingMessage(response.message)) return { message: response.message.trim(), source: "model" as const };
  } catch { /* The bounded local guidance remains available when AI is unavailable. */ }
  return { message: fallback, source: "fallback" as const };
}
