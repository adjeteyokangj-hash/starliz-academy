import type { HomeworkBatchState, SessionGateResult } from "@/lib/homework-phase1a/types";

const ALLOWED_SUPPORT_SURFACES: SessionGateResult["allowedSurfaces"] = [
  "homework",
  "coach_homework_help",
  "previous_lesson_review",
  "dictionary_glossary",
  "reports",
  "parent_admin_messages",
];

export function evaluateHomeworkSessionGate(state: HomeworkBatchState): SessionGateResult {
  if (state.recapOnly || (state.scorePercent !== null && state.scorePercent < 50)) {
    return {
      blockNewLearningSession: true,
      allowRecapCatchUpOnly: true,
      allowedSurfaces: ALLOWED_SUPPORT_SURFACES,
      reason: "Homework score below 50%. Recap/catch-up session required before new learning session.",
    };
  }

  if (["COMPLETED", "EXCUSED", "OVERRIDDEN"].includes(state.status)) {
    return {
      blockNewLearningSession: false,
      allowRecapCatchUpOnly: false,
      allowedSurfaces: ALLOWED_SUPPORT_SURFACES,
      reason: "Homework requirement satisfied.",
    };
  }

  if (["GENERATED", "STARTED", "IN_PROGRESS", "SUBMITTED", "MARKED", "REVIEW_NEEDED", "OVERDUE"].includes(state.status)) {
    return {
      blockNewLearningSession: true,
      allowRecapCatchUpOnly: false,
      allowedSurfaces: ALLOWED_SUPPORT_SURFACES,
      reason: "Weekly homework is pending. Submit homework before starting the next new learning session.",
    };
  }

  return {
    blockNewLearningSession: false,
    allowRecapCatchUpOnly: false,
    allowedSurfaces: ALLOWED_SUPPORT_SURFACES,
    reason: "No active homework gate.",
  };
}
