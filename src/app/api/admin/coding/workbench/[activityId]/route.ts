import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, checkRateLimit } from "@/lib/api_guard";
import { activityActionSchema } from "@/lib/coding/learning/types";
import { startAuthorPreview, actOnAuthorPreview } from "@/lib/coding/learning/author-preview";
import { readActivityBody } from "@/lib/coding/learning/request";
import { LearningError } from "@/lib/coding/learning/state-machine";
import { ExecutionUnavailable } from "@/lib/coding/learning/source-execution";
import { activityDefinition } from "@/lib/coding/learning/catalogue";
import { executePractical } from "@/lib/coding/learning/runtime";

export const runtime = "nodejs";
type Context = { params: Promise<{ activityId: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const status = error instanceof LearningError ? error.status : error instanceof ExecutionUnavailable ? 503 : error instanceof z.ZodError ? 400 : 500;
  return NextResponse.json({ error: error instanceof LearningError || error instanceof ExecutionUnavailable ? error.message : "The author preview could not complete this request." }, { status, headers });
}
export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  try { return NextResponse.json({ workspace: startAuthorPreview(session.userId, (await context.params).activityId), humanAssistanceEnabled: false }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  const limit = checkRateLimit({ key: `coding-author-workbench:${session.userId}`, limit: 90, windowMs: 60000 });
  if (!limit.allowed) return NextResponse.json({ error: "Pause briefly before continuing the author preview." }, { status: 429, headers });
  try {
    if (new URL(request.url).searchParams.get("lessonExample") === "1") {
      z.object({ bookingId: z.string().max(100).optional() }).strict().parse(await readActivityBody(request));
      const activity = activityDefinition((await context.params).activityId);
      if (!activity) throw new LearningError("Choose an authored activity.", 404);
      return NextResponse.json({ lessonExample: { artifact: activity.example, input: activity.cases[0]!.input,
        execution: await executePractical(activity.workbench, activity.example, activity.cases[0]!.input) } }, { headers });
    }
    const action = activityActionSchema.parse(await readActivityBody(request));
    return NextResponse.json({ workspace: await actOnAuthorPreview(session.userId, (await context.params).activityId, action) }, { headers });
  } catch (error) { return failure(error); }
}
