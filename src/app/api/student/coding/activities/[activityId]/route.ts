import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api_guard";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { codingAssistanceEnabled } from "@/lib/coding/settings";
import { activityActionSchema } from "@/lib/coding/learning/types";
import { LearningError } from "@/lib/coding/learning/state-machine";
import { ExecutionUnavailable } from "@/lib/coding/learning/source-execution";
import { loadActivityWorkspace, actOnActivityWorkspace, runLessonExample } from "@/lib/coding/learning/workspace-store";
import { readActivityBody } from "@/lib/coding/learning/request";

export const runtime = "nodejs";
type Context = { params: Promise<{ activityId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof LearningError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ExecutionUnavailable) return NextResponse.json({ error: error.message }, { status: 503, headers });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the activity action and workspace fields." }, { status: 400, headers });
  console.error("Coding activity request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "This activity could not be saved. Keep your editor open and try again." }, { status: 500, headers });
}
export async function GET(request: Request, context: Context) {
  try {
    const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") });
    if (!child) return response;
    const { activityId } = await context.params;
    return NextResponse.json({ workspace: await loadActivityWorkspace(child.id, activityId, child.yearGroup), humanAssistanceEnabled: await codingAssistanceEnabled() }, { headers: { ...headers, "X-Coding-Learner": child.id } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    if (new URL(request.url).searchParams.get("lessonExample") === "1") {
      const query = z.object({ bookingId: z.string().max(100).optional() }).strict().parse(await readActivityBody(request));
      const { child, response } = await requireCodingLearner({ bookingId: query.bookingId }); if (!child) return response;
      if (request.headers.get("X-Coding-Learner") && request.headers.get("X-Coding-Learner") !== child.id) return NextResponse.json({ error: "Your active learner changed. Reopen this activity for the selected learner.", code: "LEARNER_CHANGED" }, { status: 409, headers });
      const { activityId } = await context.params;

      if (!checkRateLimit({ key: `coding-activity:execute:${child.id}`, limit: 20, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly before replaying the example." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
      return NextResponse.json({ lessonExample: await runLessonExample(child.id, activityId, child.yearGroup) }, { headers });
    }
    const body = activityActionSchema.parse(await readActivityBody(request));
    const { child, response, billing } = await requireCodingLearner({ bookingId: body.bookingId });
    if (!child) return response;
    if (request.headers.get("X-Coding-Learner") && request.headers.get("X-Coding-Learner") !== child.id) return NextResponse.json({ error: "Your active learner changed. Keep your work and reopen this activity for the selected learner.", code: "LEARNER_CHANGED" }, { status: 409, headers });
    const { activityId } = await context.params;
    const expensive = ["run", "check", "reflect", "teach", "hint", "support"].includes(body.action);
    const limit = checkRateLimit({ key: `coding-activity:${expensive ? "execute" : "save"}:${child.id}`, limit: expensive ? 20 : 100, windowMs: 60000 });
    if (!limit.allowed) return NextResponse.json({ error: "Pause briefly, inspect your work, and try again." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    return NextResponse.json({ workspace: await actOnActivityWorkspace(child.id, activityId, child.yearGroup, body, billing, child.age) }, { headers });
  } catch (error) { return failure(error); }
}
