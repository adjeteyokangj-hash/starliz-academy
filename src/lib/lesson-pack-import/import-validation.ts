/**
 * Global import validation with subject-specific extensions.
 * Applies to School Day, Short Learning 90/120, and General Content Library imports.
 */
import type { LinkedQaItem, LessonPackStructuredModel } from "@/lib/lesson-pack-import/types";
import { evaluateLessonActivities, validatePlayableActivity } from "@/lib/lesson-pack-import/playable-validation";

function isGarbledText(text: string): boolean {
  if (!text?.trim()) return true;
  const sample = text.slice(0, 400);
  const bad = (sample.match(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u2010-\u2027\u2030-\u205E]/g) ?? []).length;
  return bad / Math.max(sample.length, 1) > 0.12;
}

export type SubjectValidationProfile =
  | "maths"
  | "english"
  | "science"
  | "geography"
  | "history"
  | "languages"
  | "general";

export function resolveSubjectValidationProfile(subject: string | null | undefined): SubjectValidationProfile {
  const s = (subject ?? "").toLowerCase();
  if (/maths|mathematics|numeracy/.test(s)) return "maths";
  if (/english|literacy|reading|writing/.test(s)) return "english";
  if (/science|biology|chemistry|physics/.test(s)) return "science";
  if (/geography/.test(s)) return "geography";
  if (/history/.test(s)) return "history";
  if (/french|spanish|german|language|mfl/.test(s)) return "languages";
  return "general";
}

export type GlobalImportChecks = {
  cleanTitle: boolean;
  cleanObjective: boolean;
  noGarbledText: boolean;
  noAnswerSheetAsQuestion: boolean;
  questionsPaired: boolean;
  activitiesPlayable: boolean;
  requiredSourceMaterialPresent: boolean;
  issues: string[];
};

/** Global checks for every content pack imported through the Generator. */
export function runGlobalImportChecks(model: LessonPackStructuredModel): GlobalImportChecks {
  const issues: string[] = [];
  const activities = [...model.starterQuestions, ...model.worksheetTasks, ...model.exitQuestions];
  const cleanTitle = Boolean(model.title?.trim()) && !/LESS-/i.test(model.title) && !isGarbledText(model.title);
  const cleanObjective = !model.learningObjective || (!isGarbledText(model.learningObjective) && model.learningObjective.length > 8);
  const noGarbledText = activities.every((a) => !isGarbledText(a.prompt));
  const noAnswerSheetAsQuestion = activities.every((a) => !/^(answer|mark scheme|worksheet answers?)\b/i.test(a.prompt));
  const questionsPaired = activities.every((a) =>
    (a.markingMode === "guided_review" && Boolean(a.explanation?.trim() || a.supportingContext?.trim()))
    || (a.markingMode ?? "auto") !== "auto"
    || Boolean(a.answer?.trim()),
  );
  const playable = evaluateLessonActivities(activities);
  const activitiesPlayable = playable.report.playableActivities === activities.length && activities.length > 0;
  const requiredSourceMaterialPresent = playable.report.missingVisuals === 0;

  if (!cleanTitle) issues.push("Title is missing, garbled, or contains internal codes");
  if (!cleanObjective) issues.push("Objective is garbled or incomplete");
  if (!noGarbledText) issues.push("Student text contains garbled characters");
  if (!noAnswerSheetAsQuestion) issues.push("Answer-sheet content used as a student question");
  if (!questionsPaired) issues.push("One or more questions lack answers or marking guidance");
  if (!activitiesPlayable) issues.push("One or more activities are not playable");
  if (!requiredSourceMaterialPresent) issues.push("Required images, diagrams, passages or source material are missing");

  return {
    cleanTitle,
    cleanObjective,
    noGarbledText,
    noAnswerSheetAsQuestion,
    questionsPaired,
    activitiesPlayable,
    requiredSourceMaterialPresent,
    issues,
  };
}

/** Subject-specific extra checks layered on the global validator. */
export function runSubjectSpecificChecks(
  profile: SubjectValidationProfile,
  activities: LinkedQaItem[],
): string[] {
  const issues: string[] = [];
  if (profile === "maths") {
    for (const a of activities) {
      const result = validatePlayableActivity(a);
      if (!result.playable) issues.push(`Maths activity ${a.id}: ${result.reasons.join(", ")}`);
    }
  }
  if (profile === "english") {
    for (const a of activities) {
      if (/\bread the (?:passage|extract|text)\b/i.test(a.prompt) && !a.supportingContext?.trim()) {
        issues.push(`English activity ${a.id}: required reading passage/extract is missing`);
      }
    }
  }
  if (profile === "science") {
    for (const a of activities) {
      if (/\bdiagram|experiment|apparatus\b/i.test(a.prompt) && a.requiresVisual && !a.visualModel) {
        issues.push(`Science activity ${a.id}: required diagram or experiment context is missing`);
      }
    }
  }
  if (profile === "geography" || profile === "history") {
    for (const a of activities) {
      if (/\bmap|timeline|source\b/i.test(a.prompt) && a.requiresVisual && !a.visualModel) {
        issues.push(`${profile} activity ${a.id}: required map/timeline/source material is missing`);
      }
    }
  }
  if (profile === "languages") {
    for (const a of activities) {
      if (/\blisten|audio|recording\b/i.test(a.prompt) && !a.supportingContext?.trim()) {
        issues.push(`Languages activity ${a.id}: audio dependency is unresolved`);
      }
    }
  }
  return issues;
}
