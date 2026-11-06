import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/api_guard";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { codingAssistanceEnabled } from "@/lib/coding/settings";
import { authorisedReadinessPlan, readinessBenchmark } from "@/lib/coding/learning/readiness";
import { loadActivityWorkspace, actOnActivityWorkspace, runLessonExample } from "@/lib/coding/learning/workspace-store";
import { activityActionSchema } from "@/lib/coding/learning/types";
import { readActivityBody } from "@/lib/coding/learning/request";
import { LearningError } from "@/lib/coding/learning/state-machine";
import { ExecutionUnavailable } from "@/lib/coding/learning/source-execution";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ planId: string; activityId: string }> };
function failure(error: unknown) {
  if (error instanceof LearningError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ExecutionUnavailable) return NextResponse.json({ error: error.message }, { status: 503, headers });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Check this bridge's own practical action." }, { status: 400, headers });
  console.error("Coding readiness request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "The bridge could not be saved. Your earlier work is retained." }, { status: 500, headers });
}
export async function GET(request: Request, context: Context) {
  try {
    const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") }); if (!child) return response;
    const { planId, activityId } = await context.params, plan = await authorisedReadinessPlan(child.id, planId);
    const activity = readinessBenchmark(plan, activityId); if (!activity) throw new LearningError("Choose this bridge's own approved benchmark.", 404);
    return NextResponse.json({ workspace: await loadActivityWorkspace(child.id, activity.id, child.yearGroup, plan, child.age), humanAssistanceEnabled: await codingAssistanceEnabled(), placement: { title: plan.title, entryYear: plan.entryYear } }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    if (new URL(request.url).searchParams.get("lessonExample") === "1") {
      const query = z.object({ bookingId: z.string().max(100).optional() }).strict().parse(await readActivityBody(request));
      const { child, response } = await requireCodingLearner({ bookingId: query.bookingId }); if (!child) return response;
      const { planId, activityId } = await context.params;
      const plan = await authorisedReadinessPlan(child.id, planId); const activity = readinessBenchmark(plan, activityId); if (!activity) throw new LearningError("Choose this bridge’s own approved benchmark.", 404);
      if (!checkRateLimit({ key: `coding-activity:execute:${child.id}`, limit: 20, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly before replaying the example." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
      return NextResponse.json({ lessonExample: await runLessonExample(child.id, activity.id, child.yearGroup, plan) }, { headers });
    }
    const action = activityActionSchema.parse(await readActivityBody(request));
    const { child, response, billing } = await requireCodingLearner({ bookingId: action.bookingId }); if (!child) return response;
    const { planId, activityId } = await context.params, plan = await authorisedReadinessPlan(child.id, planId);
    const activity = readinessBenchmark(plan, activityId); if (!activity) throw new LearningError("Choose this bridge's own approved benchmark.", 404);
    const expensive = ["run", "check", "reflect", "teach", "hint", "support"].includes(action.action);
    // The same per-child buckets cover ordinary learning and bridge work.
    if (!checkRateLimit({ key: `coding-activity:${expensive ? "execute" : "save"}:${child.id}`, limit: expensive ? 20 : 100, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause briefly, inspect your work, and retry." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    return NextResponse.json({ workspace: await actOnActivityWorkspace(child.id, activity.id, child.yearGroup, action, billing, child.age, plan) }, { headers });
  } catch (error) { return failure(error); }
}
