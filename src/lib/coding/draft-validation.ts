import { REFERENCE_PROGRAMS, STAGE_GOALS } from "@/lib/coding/answers";
import { UNDERSTANDING_LOOPS, type CodingLessonBrief } from "@/lib/coding/catalog";
import { runCodingProgram } from "@/lib/coding/runner";
import { CODING_STAGES, type CodingStage } from "@/lib/coding/types";

export type CodingDraftIssue = { code: string; message: string };

function hasPhrase(criteria: string[], pattern: RegExp): boolean {
  return criteria.some((line) => pattern.test(line));
}

/** Executable checks a coding draft must pass before it can be published. */
export function validateCodingLessonDraft(lesson: CodingLessonBrief): { ok: boolean; issues: CodingDraftIssue[] } {
  const issues: CodingDraftIssue[] = [];
  if (!lesson.pathwayId || !lesson.courseTitle || !lesson.moduleTitle || !lesson.title) {
    issues.push({ code: "structure", message: "Pathway, course, module and lesson titles are required." });
  }
  if (!lesson.yearBand || lesson.yearMin < 1 || lesson.yearMax > 11 || lesson.yearMin > lesson.yearMax) {
    issues.push({ code: "year-band", message: "Year band must sit inside Years 1–11." });
  }
  if (!lesson.prerequisites.length) {
    issues.push({ code: "prerequisites", message: "List at least one prerequisite." });
  }
  if (!lesson.learningObjective.trim()) {
    issues.push({ code: "objective", message: "A learning objective is required." });
  }
  if (!lesson.difficultyLabel || lesson.difficulty < 1) {
    issues.push({ code: "difficulty", message: "Difficulty is required." });
  }
  const criteria = lesson.masteryCriteria.join(" ").toLowerCase();
  if (!hasPhrase(lesson.masteryCriteria, /predict/i)) issues.push({ code: "mastery-predict", message: "Mastery must include a prediction." });
  if (!/build|practical|task/.test(criteria)) issues.push({ code: "mastery-practical", message: "Mastery must include a practical task." });
  if (!/debug|mistake|repair/.test(criteria)) issues.push({ code: "mastery-debug", message: "Mastery must include debugging." });
  if (!/explain/.test(criteria)) issues.push({ code: "mastery-explain", message: "Mastery must include an explanation." });
  if (!/independent|little help|less help/.test(criteria)) {
    issues.push({ code: "mastery-independent", message: "Mastery must include an independent challenge." });
  }

  const stages = new Set(lesson.stages.map((stage) => stage.stage));
  for (const stage of CODING_STAGES) {
    if (!stages.has(stage)) issues.push({ code: "stage-missing", message: `Missing stage ${stage}.` });
  }

  if (lesson.id === UNDERSTANDING_LOOPS.id) {
    for (const key of ["build", "practise", "debug", "create"] as const) {
      const run = runCodingProgram(REFERENCE_PROGRAMS[key], STAGE_GOALS[key]);
      if (!run.ok || !run.reachedGoal || !run.usedLoop || run.limitHit) {
        issues.push({ code: "reference-failed", message: `Reference solution for ${key} did not pass the executable check.` });
      }
    }
    const debugStarter = lesson.stages.find((stage) => stage.stage === "debug")?.starter;
    if (debugStarter) {
      const buggy = runCodingProgram(debugStarter, STAGE_GOALS.debug);
      if (buggy.reachedGoal) {
        issues.push({ code: "debug-too-easy", message: "The debug starter already reaches the goal." });
      }
    }
    const discover = lesson.stages.find((stage) => stage.stage === "discover");
    if (discover?.example) {
      const sample = runCodingProgram(discover.example, discover.goal);
      if (!sample.ok || sample.limitHit) {
        issues.push({ code: "example-failed", message: "The discover example did not run inside the step limit." });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function publishedLessonValidation(): { ok: boolean; issues: CodingDraftIssue[] } {
  return validateCodingLessonDraft(UNDERSTANDING_LOOPS);
}

export function stageOrder(): CodingStage[] {
  return [...CODING_STAGES];
}
