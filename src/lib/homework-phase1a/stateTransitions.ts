import type { HomeworkAuditEvent, HomeworkBatchState } from "@/lib/homework-phase1a/types";

export type AdminHomeworkAction = "excuse" | "override" | "extend" | "cancel";

function iso(now: Date): string {
  return now.toISOString();
}

function createEvent(
  action: HomeworkAuditEvent["action"],
  now: Date,
  reason?: string,
  metadata?: Record<string, unknown>,
): HomeworkAuditEvent {
  return {
    action,
    atIso: iso(now),
    reason,
    metadata,
  };
}

export function createGeneratedBatchState(questionIds: string[]): HomeworkBatchState {
  return {
    status: "GENERATED",
    requiredQuestionIds: [...questionIds],
    answeredQuestionIds: [],
    frozenAtIso: null,
    submittedAtIso: null,
    markedAtIso: null,
    scorePercent: null,
    reviewNeeded: false,
    recapOnly: false,
  };
}

export function isQuestionSetFrozen(state: HomeworkBatchState): boolean {
  return state.frozenAtIso !== null;
}

export function startHomework(state: HomeworkBatchState, now: Date): { state: HomeworkBatchState; audit: HomeworkAuditEvent[] } {
  if (state.status !== "GENERATED") {
    return { state, audit: [] };
  }
  const next: HomeworkBatchState = {
    ...state,
    status: "STARTED",
    frozenAtIso: iso(now),
  };
  return { state: next, audit: [createEvent("start", now)] };
}

export function saveDraftAnswer(
  state: HomeworkBatchState,
  questionId: string,
  now: Date,
): { state: HomeworkBatchState; audit: HomeworkAuditEvent[]; marked: false } {
  let nextState = state;
  const audit: HomeworkAuditEvent[] = [];

  if (state.status === "GENERATED") {
    const started = startHomework(state, now);
    nextState = started.state;
    audit.push(...started.audit);
  }

  if (["SUBMITTED", "MARKED", "REVIEW_NEEDED", "COMPLETED", "EXCUSED", "OVERRIDDEN", "CANCELLED"].includes(nextState.status)) {
    return { state: nextState, audit, marked: false };
  }

  if (!nextState.answeredQuestionIds.includes(questionId)) {
    nextState = {
      ...nextState,
      status: "IN_PROGRESS",
      answeredQuestionIds: [...nextState.answeredQuestionIds, questionId],
    };
  } else if (nextState.status === "STARTED") {
    nextState = { ...nextState, status: "IN_PROGRESS" };
  }

  audit.push(createEvent("draft_save", now, undefined, { questionId }));
  return { state: nextState, audit, marked: false };
}

export function canSubmitHomework(state: HomeworkBatchState): boolean {
  if (!["STARTED", "IN_PROGRESS"].includes(state.status)) return false;
  return state.requiredQuestionIds.every((requiredId) => state.answeredQuestionIds.includes(requiredId));
}

export function submitHomework(
  state: HomeworkBatchState,
  now: Date,
): { ok: true; state: HomeworkBatchState; audit: HomeworkAuditEvent[] } | { ok: false; error: string; state: HomeworkBatchState } {
  if (!canSubmitHomework(state)) {
    return {
      ok: false,
      error: "All required homework questions must be answered before submit.",
      state,
    };
  }

  const next: HomeworkBatchState = {
    ...state,
    status: "SUBMITTED",
    submittedAtIso: iso(now),
  };

  return {
    ok: true,
    state: next,
    audit: [createEvent("submit", now)],
  };
}

export function markHomework(
  state: HomeworkBatchState,
  now: Date,
  scorePercent: number | null,
  reviewNeeded = false,
): { state: HomeworkBatchState; audit: HomeworkAuditEvent[] } {
  if (state.status !== "SUBMITTED") {
    return { state, audit: [] };
  }

  const normalizedScore = typeof scorePercent === "number"
    ? Math.max(0, Math.min(100, Math.round(scorePercent)))
    : null;
  const recapOnly = normalizedScore !== null && normalizedScore < 50;
  const postMarkStatus = reviewNeeded ? "REVIEW_NEEDED" : "COMPLETED";

  const next: HomeworkBatchState = {
    ...state,
    status: postMarkStatus,
    scorePercent: normalizedScore,
    recapOnly,
    reviewNeeded,
    markedAtIso: iso(now),
  };

  return {
    state: next,
    audit: [createEvent("mark", now, undefined, { scorePercent: normalizedScore, recapOnly, reviewNeeded })],
  };
}

export function applyAdminHomeworkAction(
  state: HomeworkBatchState,
  now: Date,
  action: AdminHomeworkAction,
  reason?: string,
): { ok: true; state: HomeworkBatchState; audit: HomeworkAuditEvent[] } | { ok: false; error: string; state: HomeworkBatchState } {
  if ((action === "override" || action === "excuse" || action === "extend" || action === "cancel") && !reason?.trim()) {
    return {
      ok: false,
      error: "Reason is required for parent/admin homework actions.",
      state,
    };
  }

  if (action === "override") {
    return {
      ok: true,
      state: { ...state, status: "OVERRIDDEN", recapOnly: false },
      audit: [createEvent("override", now, reason)],
    };
  }

  if (action === "excuse") {
    return {
      ok: true,
      state: { ...state, status: "EXCUSED", recapOnly: false },
      audit: [createEvent("excuse", now, reason)],
    };
  }

  if (action === "cancel") {
    return {
      ok: true,
      state: { ...state, status: "CANCELLED", recapOnly: false },
      audit: [createEvent("cancel", now, reason)],
    };
  }

  return {
    ok: true,
    state,
    audit: [createEvent("extend", now, reason)],
  };
}
