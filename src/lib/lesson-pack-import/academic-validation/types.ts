import type { Subject } from "@/lib/curriculum";
import type { LinkedQaItem, LessonPackSessionType, LessonPackStructuredModel } from "@/lib/lesson-pack-import/types";

export const ACADEMIC_VALIDATION_VERSION = "1.0.0";

export type AcademicReadiness = "ready" | "warning" | "needs_input" | "blocked";
export type DependencyType = "passage" | "image" | "diagram" | "map" | "graph" | "table" | "timeline"
  | "source_extract" | "audio" | "video" | "code" | "equipment" | "practical_setup";

export type ActivityDependency = {
  type: DependencyType;
  required: boolean;
  present: boolean;
  sourceReference?: string;
  reconstructionStatus: "complete" | "excluded_third_party" | "needs_admin_reconstruction";
};

export type AcademicValidationIssue = {
  code: string;
  message: string;
  scope: "global" | "subject" | "activity" | "duration" | "licence" | "duplicate";
  severity: "warning" | "needs_input" | "blocked";
  activityId?: string;
  dependency?: DependencyType;
};

export type ActivityValidationResult = {
  activityId: string;
  activityType: string;
  readiness: AcademicReadiness;
  dependencies: ActivityDependency[];
  issues: AcademicValidationIssue[];
  markingMode: "auto" | "guided_review";
};

export type LessonValidationContext = {
  model: LessonPackStructuredModel;
  subject: Subject | null;
  sessionType: LessonPackSessionType;
  difficulty: number;
  estimatedDurationMinutes: number;
  duplicatePassed: boolean;
  licencePassed: boolean;
  thirdPartyPassed: boolean;
};

export type AcademicValidationResult = {
  version: typeof ACADEMIC_VALIDATION_VERSION;
  validatedAt: string;
  subject: Subject | null;
  validator: string;
  readiness: AcademicReadiness;
  globalPassed: boolean;
  subjectPassed: boolean;
  activityResults: ActivityValidationResult[];
  dependencies: ActivityDependency[];
  issues: AcademicValidationIssue[];
};

export type SubjectAcademicValidator = {
  subject: string;
  supports(subject: Subject): boolean;
  validateLesson(context: LessonValidationContext): AcademicValidationIssue[];
  validateActivity(activity: LinkedQaItem, context: LessonValidationContext): ActivityValidationResult;
};

export function readinessFromIssues(issues: AcademicValidationIssue[]): AcademicReadiness {
  if (issues.some((issue) => issue.severity === "blocked")) return "blocked";
  if (issues.some((issue) => issue.severity === "needs_input")) return "needs_input";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "ready";
}
