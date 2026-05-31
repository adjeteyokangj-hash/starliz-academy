import { prisma } from "@/lib/db";
import { evaluateHomeworkSessionGate } from "@/lib/homework-phase1a/gate";
import {
  applyAdminHomeworkAction,
  saveDraftAnswer,
  submitHomework,
  type AdminHomeworkAction,
} from "@/lib/homework-phase1a/stateTransitions";
import type { HomeworkBatchState, HomeworkLifecycleStatus } from "@/lib/homework-phase1a/types";
import { buildOpenHomeworkGate, resolveHomeworkSurfaceAccess, type HomeworkSurface } from "@/lib/homework-phase1b/contracts";
import { isWeeklyHomeworkPhase1BEnabled } from "@/lib/homework-phase1b/config";

type HomeworkQuestionRecord = {
  id: string;
  batchId: string;
  order: number;
  subject: string;
  topic: string | null;
  skill: string | null;
  questionType: string;
  promptJson: string;
  optionsJson: string | null;
  expectedAnswerJson: string | null;
  markingType: string;
  required: boolean;
  estimatedMinutes: number;
  difficulty: number;
  frozenAt: Date | null;
};

type HomeworkAnswerRecord = {
  id: string;
  batchId: string;
  questionId: string;
  studentId: string;
  draftAnswerJson: string | null;
  submittedAnswerJson: string | null;
  isAnswered: boolean;
  answeredAt: Date | null;
  submittedAt: Date | null;
  markingStatus: string;
  isCorrect: boolean | null;
  score: number | null;
  reviewNeeded: boolean;
};

type HomeworkBatchRecordResolved = {
  id: string;
  studentId: string;
  weekStart: Date;
  weekEnd: Date;
  timezone: string;
  status: string;
  dueBeforeNextSession: boolean;
  generatedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  markedAt: Date | null;
  completedAt: Date | null;
  frozenAt: Date | null;
  sourceCompletedSessionCount: number;
  sourceStartedSessionCount: number;
  workloadCapMinutes: number;
  plannedMinutes: number;
  scorePercent: number | null;
  recapOnly: boolean;
  overrideReason: string | null;
  excusedReason: string | null;
  extendedDueAt: Date | null;
  cancelledReason: string | null;
  questions: HomeworkQuestionRecord[];
  answers: HomeworkAnswerRecord[];
};

type HomeworkAuditLogCreateManyInput = {
  batchId: string;
  actorUserId: string | null;
  action: string;
  reason: string | null;
  metadataJson: string | null;
};

type HomeworkPhase1BPrisma = {
  homeworkBatch: {
    findFirst(args: unknown): Promise<HomeworkBatchRecordResolved | null>;
    update(args: unknown): Promise<unknown>;
  };
  homeworkAnswer: {
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  homeworkAuditLog: {
    createMany(args: { data: HomeworkAuditLogCreateManyInput[] }): Promise<unknown>;
  };
};

type HomeworkPhase1BTransaction = HomeworkPhase1BPrisma;

const homeworkPrisma = prisma as unknown as typeof prisma & HomeworkPhase1BPrisma;

class HomeworkPhase1BError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "HomeworkPhase1BError";
    this.statusCode = statusCode;
  }
}

type HomeworkBatchRecord = HomeworkBatchRecordResolved | null;

type HomeworkAnswerView = {
  id: string | null;
  questionId: string;
  draftAnswer: unknown;
  submittedAnswer: unknown;
  isAnswered: boolean;
  answeredAt: string | null;
  submittedAt: string | null;
  markingStatus: string;
  isCorrect: boolean | null;
  score: number | null;
  reviewNeeded: boolean;
};

export type HomeworkQuestionView = {
  id: string;
  order: number;
  subject: string;
  topic: string | null;
  skill: string | null;
  questionType: string;
  prompt: unknown;
  options: unknown;
  expectedAnswer: unknown;
  markingType: string;
  required: boolean;
  estimatedMinutes: number;
  difficulty: number;
  frozenAt: string | null;
  answer: HomeworkAnswerView;
};

export type HomeworkBatchView = {
  id: string;
  studentId: string;
  weekStart: string;
  weekEnd: string;
  timezone: string;
  status: HomeworkLifecycleStatus;
  dueBeforeNextSession: boolean;
  generatedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  markedAt: string | null;
  completedAt: string | null;
  frozenAt: string | null;
  sourceCompletedSessionCount: number;
  sourceStartedSessionCount: number;
  workloadCapMinutes: number;
  plannedMinutes: number;
  scorePercent: number | null;
  recapOnly: boolean;
  overrideReason: string | null;
  excusedReason: string | null;
  extendedDueAt: string | null;
  cancelledReason: string | null;
  questions: HomeworkQuestionView[];
};

function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function serializeJsonValue(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value ?? null);
}

function normalizeStatus(value: string): HomeworkLifecycleStatus {
  const upper = value.trim().toUpperCase();
  switch (upper) {
    case "NOT_ELIGIBLE":
    case "ELIGIBLE":
    case "GENERATED":
    case "STARTED":
    case "IN_PROGRESS":
    case "SUBMITTED":
    case "MARKED":
    case "REVIEW_NEEDED":
    case "COMPLETED":
    case "EXCUSED":
    case "OVERRIDDEN":
    case "OVERDUE":
    case "CANCELLED":
      return upper;
    default:
      return "GENERATED";
  }
}

async function fetchHomeworkBatchRecord(studentId: string, batchId?: string) {
  return homeworkPrisma.homeworkBatch.findFirst({
    where: {
      studentId,
      ...(batchId ? { id: batchId } : {}),
    },
    include: {
      questions: {
        orderBy: { order: "asc" },
      },
      answers: {
        where: { studentId },
      },
    },
    orderBy: [{ weekStart: "desc" }, { createdAt: "desc" }],
  });
}

function toBatchState(batch: NonNullable<HomeworkBatchRecord>): HomeworkBatchState {
  const answeredQuestionIds = batch.answers
    .filter((answer: HomeworkAnswerRecord) => answer.isAnswered)
    .map((answer: HomeworkAnswerRecord) => answer.questionId);
  return {
    status: normalizeStatus(batch.status),
    requiredQuestionIds: batch.questions
      .filter((question: HomeworkQuestionRecord) => question.required)
      .map((question: HomeworkQuestionRecord) => question.id),
    answeredQuestionIds,
    frozenAtIso: batch.frozenAt?.toISOString() ?? null,
    submittedAtIso: batch.submittedAt?.toISOString() ?? null,
    markedAtIso: batch.markedAt?.toISOString() ?? null,
    scorePercent: batch.scorePercent,
    reviewNeeded: batch.answers.some((answer: HomeworkAnswerRecord) => answer.reviewNeeded) || normalizeStatus(batch.status) === "REVIEW_NEEDED",
    recapOnly: batch.recapOnly,
  };
}

function toBatchView(batch: NonNullable<HomeworkBatchRecord>): HomeworkBatchView {
  const answersByQuestionId = new Map<string, HomeworkAnswerRecord>(
    batch.answers.map((answer: HomeworkAnswerRecord) => [answer.questionId, answer]),
  );
  return {
    id: batch.id,
    studentId: batch.studentId,
    weekStart: batch.weekStart.toISOString(),
    weekEnd: batch.weekEnd.toISOString(),
    timezone: batch.timezone,
    status: normalizeStatus(batch.status),
    dueBeforeNextSession: batch.dueBeforeNextSession,
    generatedAt: batch.generatedAt.toISOString(),
    startedAt: batch.startedAt?.toISOString() ?? null,
    submittedAt: batch.submittedAt?.toISOString() ?? null,
    markedAt: batch.markedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
    frozenAt: batch.frozenAt?.toISOString() ?? null,
    sourceCompletedSessionCount: batch.sourceCompletedSessionCount,
    sourceStartedSessionCount: batch.sourceStartedSessionCount,
    workloadCapMinutes: batch.workloadCapMinutes,
    plannedMinutes: batch.plannedMinutes,
    scorePercent: batch.scorePercent,
    recapOnly: batch.recapOnly,
    overrideReason: batch.overrideReason,
    excusedReason: batch.excusedReason,
    extendedDueAt: batch.extendedDueAt?.toISOString() ?? null,
    cancelledReason: batch.cancelledReason,
    questions: batch.questions.map((question: HomeworkQuestionRecord) => {
      const answer = answersByQuestionId.get(question.id);
      return {
        id: question.id,
        order: question.order,
        subject: question.subject,
        topic: question.topic,
        skill: question.skill,
        questionType: question.questionType,
        prompt: parseJsonValue(question.promptJson),
        options: parseJsonValue(question.optionsJson),
        expectedAnswer: parseJsonValue(question.expectedAnswerJson),
        markingType: question.markingType,
        required: question.required,
        estimatedMinutes: question.estimatedMinutes,
        difficulty: question.difficulty,
        frozenAt: question.frozenAt?.toISOString() ?? null,
        answer: {
          id: answer?.id ?? null,
          questionId: question.id,
          draftAnswer: parseJsonValue(answer?.draftAnswerJson),
          submittedAnswer: parseJsonValue(answer?.submittedAnswerJson),
          isAnswered: answer?.isAnswered ?? false,
          answeredAt: answer?.answeredAt?.toISOString() ?? null,
          submittedAt: answer?.submittedAt?.toISOString() ?? null,
          markingStatus: answer?.markingStatus ?? "not_marked",
          isCorrect: answer?.isCorrect ?? null,
          score: answer?.score ?? null,
          reviewNeeded: answer?.reviewNeeded ?? false,
        },
      };
    }),
  };
}

async function appendAuditLogs(client: HomeworkPhase1BPrisma, input: {
  batchId: string;
  actorUserId?: string;
  events: Array<{ action: string; reason?: string; metadata?: Record<string, unknown> }>;
}) {
  if (!input.events.length) return;
  await client.homeworkAuditLog.createMany({
    data: input.events.map((event) => ({
      batchId: input.batchId,
      actorUserId: input.actorUserId ?? null,
      action: event.action,
      reason: event.reason ?? null,
      metadataJson: serializeJsonValue({ ...(event.metadata ?? {}), atIso: new Date().toISOString() }),
    })),
  });
}

export function assertWeeklyHomeworkPhase1BEnabled(): void {
  if (!isWeeklyHomeworkPhase1BEnabled()) {
    throw new HomeworkPhase1BError("Weekly homework Phase 1B is disabled.", 404);
  }
}

export async function getCurrentHomeworkBatchView(studentId: string): Promise<HomeworkBatchView | null> {
  const batch = await fetchHomeworkBatchRecord(studentId);
  return batch ? toBatchView(batch) : null;
}

export async function getStudentHomeworkGateSnapshot(studentId: string, surface: HomeworkSurface = "new_learning_session") {
  const featureEnabled = isWeeklyHomeworkPhase1BEnabled();
  const batch = featureEnabled ? await fetchHomeworkBatchRecord(studentId) : null;
  const gate = batch ? evaluateHomeworkSessionGate(toBatchState(batch)) : buildOpenHomeworkGate();
  const access = resolveHomeworkSurfaceAccess({
    featureEnabled,
    surface,
    gate,
  });

  return {
    featureEnabled,
    batch: batch ? toBatchView(batch) : null,
    access,
  };
}

export async function saveStudentHomeworkDraft(input: {
  studentId: string;
  batchId: string;
  questionId: string;
  answer: unknown;
  actorUserId?: string;
}): Promise<HomeworkBatchView> {
  assertWeeklyHomeworkPhase1BEnabled();

  const batch = await fetchHomeworkBatchRecord(input.studentId, input.batchId);
  if (!batch) throw new HomeworkPhase1BError("Homework batch not found.", 404);
  if (!batch.questions.some((question: HomeworkQuestionRecord) => question.id === input.questionId)) {
    throw new HomeworkPhase1BError("Homework question not found.", 404);
  }

  const now = new Date();
  const transition = saveDraftAnswer(toBatchState(batch), input.questionId, now);

  await prisma.$transaction(async (tx) => {
    const homeworkTx = tx as unknown as HomeworkPhase1BTransaction;
    await homeworkTx.homeworkBatch.update({
      where: { id: batch.id },
      data: {
        status: transition.state.status,
        startedAt: batch.startedAt ?? (transition.state.status === "STARTED" || transition.state.status === "IN_PROGRESS" ? now : undefined),
        frozenAt: transition.state.frozenAtIso ? new Date(transition.state.frozenAtIso) : batch.frozenAt,
      },
    });

    const existingAnswer = batch.answers.find((answer: HomeworkAnswerRecord) => answer.questionId === input.questionId) ?? null;
    await homeworkTx.homeworkAnswer.upsert({
      where: {
        batchId_questionId_studentId: {
          batchId: batch.id,
          questionId: input.questionId,
          studentId: input.studentId,
        },
      },
      update: {
        draftAnswerJson: serializeJsonValue(input.answer),
        isAnswered: true,
        answeredAt: now,
      },
      create: {
        batchId: batch.id,
        questionId: input.questionId,
        studentId: input.studentId,
        draftAnswerJson: serializeJsonValue(input.answer),
        submittedAnswerJson: existingAnswer?.submittedAnswerJson ?? null,
        isAnswered: true,
        answeredAt: now,
      },
    });

    await appendAuditLogs(homeworkTx, {
      batchId: batch.id,
      actorUserId: input.actorUserId,
      events: transition.audit,
    });
  });

  const updated = await fetchHomeworkBatchRecord(input.studentId, batch.id);
  if (!updated) throw new HomeworkPhase1BError("Homework batch not found after update.", 404);
  return toBatchView(updated);
}

export async function submitStudentHomework(input: {
  studentId: string;
  batchId: string;
  actorUserId?: string;
}): Promise<HomeworkBatchView> {
  assertWeeklyHomeworkPhase1BEnabled();

  const batch = await fetchHomeworkBatchRecord(input.studentId, input.batchId);
  if (!batch) throw new HomeworkPhase1BError("Homework batch not found.", 404);

  const now = new Date();
  const transition = submitHomework(toBatchState(batch), now);
  if (!transition.ok) {
    throw new HomeworkPhase1BError(transition.error, 400);
  }

  await prisma.$transaction(async (tx) => {
    const homeworkTx = tx as unknown as HomeworkPhase1BTransaction;
    await homeworkTx.homeworkBatch.update({
      where: { id: batch.id },
      data: {
        status: transition.state.status,
        submittedAt: transition.state.submittedAtIso ? new Date(transition.state.submittedAtIso) : now,
      },
    });

    await Promise.all(
      batch.answers.map((answer: HomeworkAnswerRecord) => homeworkTx.homeworkAnswer.update({
        where: { id: answer.id },
        data: {
          submittedAnswerJson: answer.submittedAnswerJson ?? answer.draftAnswerJson,
          submittedAt: answer.submittedAt ?? now,
        },
      })),
    );

    await appendAuditLogs(homeworkTx, {
      batchId: batch.id,
      actorUserId: input.actorUserId,
      events: transition.audit,
    });
  });

  const updated = await fetchHomeworkBatchRecord(input.studentId, batch.id);
  if (!updated) throw new HomeworkPhase1BError("Homework batch not found after submit.", 404);
  return toBatchView(updated);
}

export async function applyHomeworkOverrideAction(input: {
  studentId: string;
  batchId: string;
  action: Extract<AdminHomeworkAction, "override" | "excuse">;
  reason: string;
  actorUserId?: string;
}): Promise<HomeworkBatchView> {
  assertWeeklyHomeworkPhase1BEnabled();

  const batch = await fetchHomeworkBatchRecord(input.studentId, input.batchId);
  if (!batch) throw new HomeworkPhase1BError("Homework batch not found.", 404);

  const now = new Date();
  const transition = applyAdminHomeworkAction(toBatchState(batch), now, input.action, input.reason);
  if (!transition.ok) {
    throw new HomeworkPhase1BError(transition.error, 400);
  }

  await prisma.$transaction(async (tx) => {
    const homeworkTx = tx as unknown as HomeworkPhase1BTransaction;
    await homeworkTx.homeworkBatch.update({
      where: { id: batch.id },
      data: {
        status: transition.state.status,
        completedAt: now,
        overrideReason: input.action === "override" ? input.reason : batch.overrideReason,
        excusedReason: input.action === "excuse" ? input.reason : batch.excusedReason,
        recapOnly: false,
      },
    });

    await appendAuditLogs(homeworkTx, {
      batchId: batch.id,
      actorUserId: input.actorUserId,
      events: transition.audit,
    });
  });

  const updated = await fetchHomeworkBatchRecord(input.studentId, batch.id);
  if (!updated) throw new HomeworkPhase1BError("Homework batch not found after override.", 404);
  return toBatchView(updated);
}

export function toHomeworkPhase1BResponseError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof HomeworkPhase1BError) {
    return { statusCode: error.statusCode, message: error.message };
  }
  return { statusCode: 500, message: error instanceof Error ? error.message : "Unexpected weekly homework error." };
}
