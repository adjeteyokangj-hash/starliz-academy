export type StomachEvidenceType =
  | "lesson_completed"
  | "question_answered"
  | "homework_submitted"
  | "quick_level_finder_completed"
  | "spelling_activity"
  | "reading_activity"
  | "coach_support_used"
  | "assessment_completed"
  | "exam_completed"
  | "competition_completed";

export type StomachEvidenceEnvelope = {
  type: StomachEvidenceType;
  studentId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
};

export const STOMACH_EVIDENCE_TYPES: ReadonlyArray<StomachEvidenceType> = [
  "lesson_completed",
  "question_answered",
  "homework_submitted",
  "quick_level_finder_completed",
  "spelling_activity",
  "reading_activity",
  "coach_support_used",
  "assessment_completed",
  "exam_completed",
  "competition_completed",
];

export function isStomachEvidenceType(value: string): value is StomachEvidenceType {
  return STOMACH_EVIDENCE_TYPES.includes(value as StomachEvidenceType);
}
