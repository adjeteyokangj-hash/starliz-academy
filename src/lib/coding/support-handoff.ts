import type { CodingLessonBrief } from "@/lib/coding/catalog";
import type { CodingProgram, CodingSkillStatus, CodingStage } from "@/lib/coding/types";

export type CodingSupportHandoff = {
  subject: "coding";
  lessonId: string;
  lessonTitle: string;
  pathwayTitle: string;
  moduleTitle: string;
  stage: CodingStage;
  learningObjective: string;
  task: string;
  program: CodingProgram;
  error: string | null;
  feedback: string | null;
  hintsAttempted: string[];
  hintCount: number;
  skillStatus: CodingSkillStatus;
  privateProject: true;
};

export function buildCodingSupportHandoff(input: {
  lesson: CodingLessonBrief;
  stage: CodingStage;
  program: CodingProgram;
  error: string | null;
  feedback: string | null;
  hintsAttempted: string[];
  skillStatus: CodingSkillStatus;
}): CodingSupportHandoff {
  const brief = input.lesson.stages.find((stage) => stage.stage === input.stage);
  return {
    subject: "coding",
    lessonId: input.lesson.id,
    lessonTitle: input.lesson.title,
    pathwayTitle: input.lesson.pathwayTitle,
    moduleTitle: input.lesson.moduleTitle,
    stage: input.stage,
    learningObjective: input.lesson.learningObjective,
    task: brief?.prompt ?? input.lesson.learningObjective,
    program: input.program,
    error: input.error,
    feedback: input.feedback,
    hintsAttempted: input.hintsAttempted.slice(-6),
    hintCount: input.hintsAttempted.length,
    skillStatus: input.skillStatus,
    privateProject: true,
  };
}

export function codingSupportSummary(handoff: CodingSupportHandoff): string {
  const error = handoff.error ? ` Error: ${handoff.error}` : "";
  return `${handoff.pathwayTitle} · ${handoff.lessonTitle} · ${handoff.stage}. ${handoff.task}${error}`;
}
