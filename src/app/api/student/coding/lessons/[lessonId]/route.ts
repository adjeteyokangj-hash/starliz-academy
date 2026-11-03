import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/api_guard";
import { codingAssistanceEnabled } from "@/lib/coding/settings";
import { CODING_STAGES } from "@/lib/coding/types";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { requestCodingHumanSupport } from "@/lib/coding/human-support";
import {
  askCodingTutor,
  loadCodingWorkspace,
  openCodingStage,
  restoreCodingStarter,
  runCodingStage,
  saveCodingProgram,
  submitCodingPrompt,
  undoCodingProgram,
} from "@/lib/coding/workspace-store";

const bodySchema = z.object({
  action: z.enum(["save", "run", "undo", "restore", "hint", "discover", "predict", "review", "support", "open"]),
  stage: z.enum(CODING_STAGES).optional(),
  program: z.unknown().optional(),
  runSource: z.enum(["example", "learner"]).optional(),
  choiceId: z.string().trim().optional().nullable(),
  explanation: z.string().trim().max(2000).optional().nullable(),
  bookingId: z.string().trim().optional().nullable(),
  daytimePeriodId: z.string().trim().optional().nullable(),
});

type Context = { params: Promise<{ lessonId: string }> };

export async function GET(request: Request, context: Context) {
  const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") });
  if (!child) return response;
  const { lessonId } = await context.params;
  const workspace = await loadCodingWorkspace(child.id, lessonId, child.yearGroup);
  if (!workspace) return NextResponse.json({ error: "This coding lesson is not published yet." }, { status: 404 });
  return NextResponse.json({ workspace, humanAssistanceEnabled: await codingAssistanceEnabled() });
}

export async function POST(request: Request, context: Context) {
  const { lessonId } = await context.params;
  try {
    const body = bodySchema.parse(await request.json());
    const { child, response } = await requireCodingLearner({ bookingId: body.bookingId });
    if (!child) return response;
    if (body.action === "hint") {
      const limit = checkRateLimit({ key: `coding-teacher:${child.id}`, limit: 15, windowMs: 60_000 });
      if (!limit.allowed) return NextResponse.json({ error: "Your tutor needs a short pause. Try your blocks, then ask again." }, { status: 429 });
    }
    const stage = body.stage ?? "discover";
    if (body.action === "open") {
      const result = await openCodingStage({ childId: child.id, lessonId, stage });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "save") {
      const result = await saveCodingProgram({
        childId: child.id,
        lessonId,
        yearGroup: child.yearGroup,
        stage,
        program: body.program,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "undo") {
      const result = await undoCodingProgram({ childId: child.id, lessonId, stage });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "restore") {
      const result = await restoreCodingStarter({ childId: child.id, lessonId, stage });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "run") {
      const result = await runCodingStage({
        childId: child.id,
        lessonId,
        yearGroup: child.yearGroup,
        stage,
        program: body.program,
        runSource: body.runSource,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "hint") {
      const result = await askCodingTutor({
        childId: child.id,
        lessonId,
        yearGroup: child.yearGroup,
        stage,
        program: body.program ?? { blocks: [] },
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    if (body.action === "discover" || body.action === "predict" || body.action === "review") {
      const result = await submitCodingPrompt({
        childId: child.id,
        lessonId,
        yearGroup: child.yearGroup,
        stage: body.action === "review" ? "review" : body.action,
        choiceId: body.choiceId,
        explanation: body.explanation,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }
    const support = await requestCodingHumanSupport({
      childId: child.id,
      lessonId,
      bookingId: body.bookingId,
      daytimePeriodId: body.daytimePeriodId,
    });
    if (!support.ok) return NextResponse.json({ error: support.error }, { status: support.status });
    return NextResponse.json(support);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "This workspace changed in another session. Keep your blocks and reload the saved version before retrying.", code: "WORKSPACE_CONFLICT" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Coding lesson could not be updated.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
