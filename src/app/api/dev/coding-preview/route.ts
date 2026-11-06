import { z } from "zod";
import { beginnerTracks } from "@/lib/coding/learning/beginner-playground";
import { practicalArtifactSchema } from "@/lib/coding/learning/types";
import { executePractical } from "@/lib/coding/learning/runtime";
import { assessPlaygroundTask } from "@/lib/coding/learning/playground-assessment";
import { readActivityBody } from "@/lib/coding/learning/request";
import { checkRateLimit, getRequestIp } from "@/lib/api_guard";
import { sameCodingUploadOrigin } from "@/lib/coding/learning/upload-origin";
import { ExecutionUnavailable } from "@/lib/coding/learning/source-execution";
import { LearningError } from "@/lib/coding/learning/state-machine";
const requestSchema = z.object({ id: z.string(), artifact: practicalArtifactSchema, events: z.array(z.object({ target: z.string().max(80), type: z.enum(["click", "input", "change"]), value: z.string().max(1000).optional() }).strict()).max(30).default([]) }).strict();
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  if (!sameCodingUploadOrigin(request)) return new Response(null, { status: 403 });
  const limit = checkRateLimit({ key: `coding-playground:${getRequestIp(request)}`, limit: 20, windowMs: 60000 });
  if (!limit.allowed) return Response.json({ error: "Pause briefly, then try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const data = requestSchema.parse(await readActivityBody(request));
    const track = beginnerTracks.find(item => item.steps.some(step => step.id === data.id));
    if (!track) return new Response(null, { status: 400 });
    const engine = track.id.startsWith("python") ? "python" : "web";
    const execution = await executePractical(engine, data.artifact, { events: data.events });
    const assessment = await assessPlaygroundTask(data.id, data.artifact, execution, data.events);
    return Response.json({ execution, assessment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The preview could not run." }, { status: error instanceof ExecutionUnavailable ? 503 : error instanceof LearningError ? error.status : 400 });
  }
}
