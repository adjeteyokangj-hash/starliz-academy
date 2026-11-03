import { CODING_STAGES, stageUnlocked } from "@/lib/coding/types";
import { currentVariant, stageArtifact, stageCases, artifactHash, recordedPlanHash, variantFingerprint } from "./state-machine";
import type { ActivityContent, ActivityState, Json, Predicate } from "./types";
import { stageProjectFiles } from "./stage-files";

function mapTarget(predicates: Predicate[]) {
  const coordinate = (path: string) => { const check = predicates.find((item) => item.path === path && "equals" in item); return check && "equals" in check && typeof check.equals === "number" ? check.equals : null; };
  const x = coordinate("x"), y = coordinate("y");
  return { goal: x !== null && y !== null ? { x, y } : null,
    stops: predicates.filter((check) => check.path === "visits" && "includes" in check).map((check) => "includes" in check ? check.includes : null) };
}
export function publicActivityView(activity: ActivityContent, state: ActivityState, scope: "learner" | "author" = "learner") {
  const variant = currentVariant(activity, state), cases = stageCases(activity, state, state.stage), first = cases[0]!;
  const suppliedInput = state.stage === "predict" ? activity.prediction.input : first.input;
  const bindings = state.evidenceBindings?.[state.stage === "review" ? "create" : state.stage] ?? [];
  const input = activity.evidenceSlots && scope === "learner" && suppliedInput && typeof suppliedInput === "object" && !Array.isArray(suppliedInput) ? { ...suppliedInput, savedEvidence: bindings } : suppliedInput;
  const showRun = state.lastRunArtifactHash === artifactHash(stageArtifact(activity, state, state.stage))
    && (state.lastRunStage === state.stage || state.stage === "review" && state.lastRunStage === "create");
  return {
    activity: { id: activity.id, inventoryId: activity.inventoryId, kind: activity.kind, version: activity.version, title: activity.title,
      year: activity.year, pathwayId: activity.pathwayId, courseId: activity.courseId, moduleId: activity.moduleId, projectId: activity.projectId,
      engine: activity.engine, workbench: activity.workbench, objective: activity.objective, concepts: activity.concepts, instruction: activity.instruction,
      projectOutcome: activity.projectOutcome, essentialChecks: activity.essentialChecks, workflow: activity.workflow ?? null,
      prediction: { prompt: activity.prediction.prompt, choices: activity.prediction.choices }, evidenceSlots: activity.evidenceSlots ?? null,
    },
    stage: state.stage, completedStages: state.completed, unlockedStages: CODING_STAGES.filter((stage) => stageUnlocked(stage, state.completed)),
    lessonExample: { artifact: activity.example, input: activity.cases[0]!.input, map: mapTarget(activity.cases[0]!.assertions) },
    executionProgram: showRun ? ["discover", "predict"].includes(state.lastRunStage ?? "") ? "lesson" as const : "learner" as const : null,
    artifact: stageArtifact(activity, state, state.stage), input: input as Json, savedEvidence: bindings, evidenceScope: scope,
    personalInput: state.personalInputs?.[state.stage]?.artifactHash === artifactHash(stageArtifact(activity, state, state.stage)) ? state.personalInputs[state.stage]! : null,
    executionInput: showRun ? state.lastExecutionInput ?? suppliedInput : suppliedInput, executionKind: showRun ? state.lastRunKind ?? "example" : null,
    map: state.stage === "predict" ? { goal: null, stops: [] } : mapTarget(first.assertions),
    independentTask: state.stage === "create" || state.stage === "review" ? variant.task : null,
    planRecorded: Boolean(recordedPlanHash(stageArtifact(activity, state, state.stage)) && state.workflow?.[state.stage]?.planHash === recordedPlanHash(stageArtifact(activity, state, state.stage))),
    explanation: state.explanation, explanationReview: state.explanationReview ?? null, files: stageProjectFiles(state, state.stage), retainedFiles: state.retainedFiles ?? {},
    demonstration: state.demonstrations?.[state.stage === "review" ? "create" : state.stage] ?? null,
    independentFingerprint: variantFingerprint(activity, state),
    demonstrationMatchesArtifact: state.demonstrations?.[state.stage === "review" ? "create" : state.stage]?.metadata.artifactHash === artifactHash(stageArtifact(activity, state, state.stage)) && state.demonstrations?.[state.stage === "review" ? "create" : state.stage]?.metadata.taskHash === variantFingerprint(activity, state),
    prediction: state.prediction ? { choiceId: state.prediction.choiceId, correct: state.prediction.correct } : null,
    lastExecution: showRun ? state.lastExecution : null, checks: showRun ? state.lastChecks : [], attempts: state.attempts, checksPassed: state.checksPassed,
    tutorMessages: state.tutorMessages, hints: state.hints, mastered: state.mastered,
  };
}

/** Only public/example execution data reaches a learner. Other assessor runs
 * contribute booleans and criterion descriptions, never source or hidden inputs. */
export function jsonLeafEvidence(value: Json, prefix = "", depth = 0): Array<{ path: string; value: string }> {
  if (depth > 6) return [];
  if (value === null || typeof value !== "object") return [{ path: prefix || "$", value: String(value) }];
  return Object.entries(value).slice(0, 12).flatMap(([key, child]) => jsonLeafEvidence(child, prefix ? `${prefix}.${key}` : key, depth + 1)).slice(0, 24);
}
