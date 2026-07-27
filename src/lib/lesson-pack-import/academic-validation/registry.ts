import type { Subject } from "@/lib/curriculum";
import type { LessonValidationContext, SubjectAcademicValidator } from "./types";
import { ACADEMIC_VALIDATION_VERSION, readinessFromIssues, type AcademicValidationResult } from "./types";
import { validateGlobalLesson } from "./global-validator";
import { computingValidator, creativeValidator, englishValidator, generalValidator, geographyValidator, historyValidator, languagesValidator, mathsValidator, peValidator, scienceValidator, socialValidator } from "./subject-validators";

export const SUBJECT_ACADEMIC_VALIDATORS: SubjectAcademicValidator[] = [
  englishValidator, mathsValidator, scienceValidator, historyValidator, geographyValidator,
  computingValidator, languagesValidator, socialValidator, creativeValidator, peValidator,
];

export function academicValidatorFor(subject: Subject | null): SubjectAcademicValidator {
  if (!subject) return generalValidator;
  return SUBJECT_ACADEMIC_VALIDATORS.find((candidate) => candidate.supports(subject)) ?? generalValidator;
}

export function validateImportedLesson(context: LessonValidationContext): AcademicValidationResult {
  const validator = academicValidatorFor(context.subject);
  const activities = [...context.model.starterQuestions, ...context.model.worksheetTasks, ...context.model.exitQuestions];
  const globalIssues = validateGlobalLesson(context);
  const lessonIssues = validator.validateLesson(context);
  const activityResults = activities.map((activity) => validator.validateActivity(activity, context));
  const issues = [...globalIssues, ...lessonIssues, ...activityResults.flatMap((result) => result.issues)];
  return {
    version: ACADEMIC_VALIDATION_VERSION,
    validatedAt: new Date().toISOString(),
    subject: context.subject,
    validator: validator.subject,
    readiness: readinessFromIssues(issues),
    globalPassed: globalIssues.every((issue) => issue.severity === "warning"),
    subjectPassed: [...lessonIssues, ...activityResults.flatMap((result) => result.issues)].every((issue) => issue.severity === "warning"),
    activityResults,
    dependencies: activityResults.flatMap((result) => result.dependencies),
    issues,
  };
}

export function validationUpdateAvailable(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.academicValidationVersion !== ACADEMIC_VALIDATION_VERSION;
}
