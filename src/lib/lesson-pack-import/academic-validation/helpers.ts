import type { LinkedQaItem } from "@/lib/lesson-pack-import/types";
import type { AcademicValidationIssue, ActivityDependency, DependencyType } from "./types";

export const activityText = (activity: LinkedQaItem): string =>
  `${activity.prompt ?? ""}\n${activity.instructions ?? ""}\n${activity.supportingContext ?? ""}`;

export function dependency(
  activity: LinkedQaItem,
  type: DependencyType,
  required: boolean,
  present: boolean,
  sourceReference?: string,
): ActivityDependency {
  return {
    type,
    required,
    present,
    sourceReference,
    reconstructionStatus: present ? "complete" : "needs_admin_reconstruction",
  };
}

export function missingDependencyIssue(
  activity: LinkedQaItem,
  dep: ActivityDependency,
  message: string,
): AcademicValidationIssue | null {
  if (!dep.required || dep.present) return null;
  return { code: `missing_${dep.type}`, message, scope: "activity", severity: "blocked", activityId: activity.id, dependency: dep.type };
}

export function hasContext(activity: LinkedQaItem): boolean {
  return Boolean(activity.supportingContext?.trim() || activity.visualModel || activity.visualSourceFile?.trim());
}

export function guidedReviewIssue(activity: LinkedQaItem): AcademicValidationIssue | null {
  if (activity.markingMode !== "guided_review") return null;
  if (activity.successCriteria?.trim() || activity.explanation?.trim() || activity.supportingContext?.trim()) return null;
  return { code: "missing_success_criteria", message: "Guided-review activity requires success criteria.", scope: "activity", severity: "blocked", activityId: activity.id };
}

export function autoAnswerIssue(activity: LinkedQaItem): AcademicValidationIssue | null {
  if ((activity.markingMode ?? "auto") !== "auto" || activity.answer?.trim() || activity.acceptedAnswers?.length) return null;
  return { code: "missing_answer", message: "Auto-marked activity requires an answer.", scope: "activity", severity: "blocked", activityId: activity.id };
}
