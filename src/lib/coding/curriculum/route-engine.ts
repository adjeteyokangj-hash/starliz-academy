import { z } from "zod";
import { parseCodingProgram, runCodingProgram } from "@/lib/coding/runner";
import type { CheckResult, ExecutableLessonPackage, VerifiedEngine } from "@/lib/coding/curriculum/contracts";

const point = z.object({ x: z.number().int().min(0).max(5), y: z.number().int().min(0).max(5) }).strict();
export const routeCaseSchema = z.object({
  start: point, goal: point, checkpoints: z.array(point), maxSteps: z.number().int().min(1).max(40),
}).strict();
export type RouteCase = z.infer<typeof routeCaseSchema>;
export const routeEvaluationSchema = z.object({
  stages: z.record(z.string(), routeCaseSchema),
  independent: z.record(z.string(), z.record(z.string(), routeCaseSchema)),
}).strict();

export function evaluateRoute(artifact: unknown, specification: RouteCase): CheckResult {
  const parsed = parseCodingProgram(artifact);
  if (!parsed.ok) return { passed: false, failureCode: "invalid-program" };
  const run = runCodingProgram(parsed.program, specification.goal, specification.start);
  if (!run.ok) return { passed: false, failureCode: "execution-error" };
  if (!run.reachedGoal) return { passed: false, failureCode: "wrong-destination" };
  if (run.steps > specification.maxSteps) return { passed: false, failureCode: "step-budget" };
  let frameIndex = 0;
  for (const checkpoint of specification.checkpoints) {
    const relativeIndex = run.frames.slice(frameIndex).findIndex((frame) => frame.x === checkpoint.x && frame.y === checkpoint.y);
    if (relativeIndex < 0) return { passed: false, failureCode: "missing-stop" };
    frameIndex += relativeIndex + 1;
  }
  return { passed: true };
}

export function routeEngineFor(lesson: ExecutableLessonPackage): VerifiedEngine {
  const specification = routeEvaluationSchema.parse(lesson.evaluationSpec);
  return {
    id: "route", version: "route-2.0.0",
    async evaluate(artifact, checkId) {
      const check = specification.stages[checkId];
      return check ? evaluateRoute(artifact, check) : { passed: false, failureCode: "unknown-check" };
    },
    async evaluateIndependent(artifact, variantId, caseId) {
      const check = specification.independent[variantId]?.[caseId];
      return check ? evaluateRoute(artifact, check) : { passed: false, failureCode: "unknown-check" };
    },
  };
}
