import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api_guard";
import { firstInstructionsPackage } from "@/lib/coding/curriculum/first-instructions";
import { routeEngineFor, routeEvaluationSchema } from "@/lib/coding/curriculum/route-engine";
import { parseCodingProgram, runCodingProgram } from "@/lib/coding/runner";
import { CODING_STAGES } from "@/lib/coding/types";
import { assessRoutePrediction } from "@/lib/coding/curriculum/prediction";

type Context = { params: Promise<{ lessonId: string }> };

export async function GET(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  const lesson = firstInstructionsPackage((await context.params).lessonId);
  if (!lesson) return NextResponse.json({ error: "Executable lesson draft not found." }, { status: 404 });
  const specification = routeEvaluationSchema.parse(lesson.evaluationSpec);
  return NextResponse.json({ lesson: {
    id: lesson.id, title: lesson.title, objective: lesson.objective, version: lesson.version,
    projectId: lesson.projectId, status: "executable-draft",
    independentChallenges: lesson.independentVariants.map((variant) => ({ id: variant.id, task: variant.task,
      scene: specification.independent[variant.id]![variant.heldOutCaseIds[0]!] })),
    stages: lesson.stages.map((stage) => ({ id: stage.id, instruction: stage.instruction, starter: stage.starter,
      scene: stage.id === "review" ? specification.stages.create : { ...specification.stages[stage.id], ...(stage.id === "predict" ? { goal: null } : {}) } })),
  } });
}

export async function POST(request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("MANAGE_CONTENT");
  if (!session) return response;
  const lesson = firstInstructionsPackage((await context.params).lessonId);
  if (!lesson) return NextResponse.json({ error: "Executable lesson draft not found." }, { status: 404 });
  const parsed = z.object({ stage: z.enum(CODING_STAGES), program: z.unknown(), variantId: z.string().max(80).optional(), prediction: z.object({ x: z.number().int().min(0).max(5), y: z.number().int().min(0).max(5) }).strict().optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.stage === "review") return NextResponse.json({ error: "Choose an executable stage and valid program." }, { status: 400 });
  const program = parseCodingProgram(parsed.data.program);
  if (!program.ok) return NextResponse.json({ error: program.error }, { status: 400 });
  const evaluation = routeEvaluationSchema.parse(lesson.evaluationSpec);
  const variant = parsed.data.variantId ? lesson.independentVariants.find((item) => item.id === parsed.data.variantId) : null;
  if (parsed.data.variantId && (!variant || parsed.data.stage !== "create")) return NextResponse.json({ error: "Choose a valid independent challenge in Create." }, { status: 400 });
  const specification = variant ? evaluation.independent[variant.id]![variant.heldOutCaseIds[0]!]! : evaluation.stages[parsed.data.stage]!;
  const engine = routeEngineFor(lesson);
  const independentChecks = variant ? await Promise.all(variant.heldOutCaseIds.map((id) => engine.evaluateIndependent(program.program, variant.id, id))) : null;
  const assessment = independentChecks ? { passed: independentChecks.every((check) => check.passed),
    ...(!independentChecks.every((check) => check.passed) ? { failureCode: "independent-check-failed" } : {}) }
    : parsed.data.stage === "predict"
    ? assessRoutePrediction(lesson, program.program, parsed.data.prediction)
    : await engine.evaluate(program.program, parsed.data.stage);
  if (parsed.data.stage === "predict" && assessment.failureCode === "prediction-required") {
    return NextResponse.json({ error: "Choose a destination before running the prediction program." }, { status: 400 });
  }
  return NextResponse.json({ assessment, run: runCodingProgram(program.program, specification.goal, specification.start),
    notice: "Author preview only. No learner progress, rewards or completion records were changed." });
}
