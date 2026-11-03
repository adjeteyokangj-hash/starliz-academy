import type { ExecutableLessonPackage, CheckResult } from "@/lib/coding/curriculum/contracts";
import { parseCodingProgram, runCodingProgram } from "@/lib/coding/runner";
import { routeEvaluationSchema } from "@/lib/coding/curriculum/route-engine";

/** A working reference program alone is not evidence that the learner predicted it. */
export function assessRoutePrediction(lesson: ExecutableLessonPackage, artifact: unknown, prediction: unknown): CheckResult {
  const spec = routeEvaluationSchema.parse(lesson.evaluationSpec).stages.predict;
  const reference = lesson.referenceArtifacts.find((item) => item.stage === "predict");
  const actual = parseCodingProgram(artifact);
  const expected = parseCodingProgram(reference?.artifact);
  if (!spec || !actual.ok || !expected.ok) return { passed: false, failureCode: "invalid-program" };
  const run = runCodingProgram(actual.program, spec.goal, spec.start);
  const demonstration = runCodingProgram(expected.program, spec.goal, spec.start);
  if (!run.ok || JSON.stringify(run.frames) !== JSON.stringify(demonstration.frames)) return { passed: false, failureCode: "prediction-program-changed" };
  if (!prediction || typeof prediction !== "object" || !("x" in prediction) || !("y" in prediction)
    || !Number.isInteger(prediction.x) || !Number.isInteger(prediction.y)) return { passed: false, failureCode: "prediction-required" };
  return prediction.x === spec.goal.x && prediction.y === spec.goal.y
    ? { passed: true } : { passed: false, failureCode: "prediction-mismatch" };
}
