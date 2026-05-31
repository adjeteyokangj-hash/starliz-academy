import type { HomeworkBatchView, HomeworkQuestionView } from "@/lib/homework-phase1b/service";

export const WEEKLY_HOMEWORK_PENDING_MESSAGE = "Complete your weekly homework so StarLiz can prepare your next lesson.";

export const WEEKLY_HOMEWORK_SUPPORT_MESSAGE = "You can still use Smart Catch-Up and your support tools below while you finish it.";

/**
 * Returns a human-readable label for a homework lifecycle status code.
 */
export function homeworkStatusLabel(status: string): string {
  switch (status) {
    case "NOT_ELIGIBLE": return "Not eligible";
    case "ELIGIBLE": return "Available";
    case "GENERATED": return "Ready to start";
    case "STARTED":
    case "IN_PROGRESS": return "In progress";
    case "SUBMITTED": return "Awaiting marking";
    case "MARKED": return "Marked";
    case "REVIEW_NEEDED": return "Under review";
    case "COMPLETED": return "Completed";
    case "EXCUSED": return "Excused this week";
    case "OVERRIDDEN": return "Admin overridden";
    case "OVERDUE": return "Overdue — please complete";
    case "CANCELLED": return "Cancelled";
    default: return status.toLowerCase().replace(/_/g, " ");
  }
}

/**
 * Returns true if the batch is in a state where draft answers may be saved.
 */
export function canSaveDraft(status: string): boolean {
  return (
    status === "GENERATED" ||
    status === "STARTED" ||
    status === "IN_PROGRESS" ||
    status === "OVERDUE"
  );
}

/**
 * Counts questions that have a non-empty draft or have been marked as answered.
 * Accepts questions with locally-overridden draft values merged in before calling.
 */
export function computeAnsweredCount(questions: HomeworkQuestionView[]): number {
  return questions.filter((q) => {
    if (q.answer.isAnswered) return true;
    const draft = q.answer.draftAnswer;
    return typeof draft === "string" && draft.trim() !== "";
  }).length;
}

/**
 * Returns true when the batch has all required questions answered (locally or
 * from saved draft) and is in a submittable lifecycle state.
 *
 * @param batch         - Current homework batch view (or null).
 * @param localAnswers  - Map of questionId → current textarea value.
 */
export function isSubmittable(
  batch: HomeworkBatchView | null,
  localAnswers: Record<string, string>,
): boolean {
  if (!batch) return false;
  if (!canSaveDraft(batch.status)) return false;
  const requiredQuestions = batch.questions.filter((q) => q.required);
  for (const q of requiredQuestions) {
    const local = (localAnswers[q.id] ?? "").trim();
    const draft =
      typeof q.answer.draftAnswer === "string" ? q.answer.draftAnswer.trim() : "";
    if (!q.answer.isAnswered && local === "" && draft === "") return false;
  }
  return true;
}

/**
 * Returns true when the compact dashboard homework card should be shown.
 */
export function shouldShowHomeworkDashboardCard(input: {
  featureEnabled: boolean | null;
  blockNewLearningSession: boolean;
  hasHomework: boolean;
}): boolean {
  if (input.featureEnabled !== true) return false;
  return input.blockNewLearningSession || input.hasHomework;
}

/**
 * Uses the child-facing copy for pending homework gates.
 */
export function resolveHomeworkGateMessage(input: {
  blockNewLearningSession: boolean;
  reason?: string | null;
}): string {
  if (input.blockNewLearningSession) {
    return WEEKLY_HOMEWORK_PENDING_MESSAGE;
  }
  return input.reason?.trim() || "Weekly homework is ready when you are.";
}

/**
 * Extracts a displayable text string from a question prompt field.
 * Handles both plain-string prompts and `{ text: string }` objects.
 */
export function extractPromptText(prompt: unknown, fallback: string): string {
  if (typeof prompt === "string") return prompt;
  if (
    typeof prompt === "object" &&
    prompt !== null &&
    "text" in prompt &&
    typeof (prompt as { text: unknown }).text === "string"
  ) {
    return (prompt as { text: string }).text;
  }
  return fallback;
}
