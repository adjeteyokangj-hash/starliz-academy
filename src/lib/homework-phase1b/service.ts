import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { evaluateHomeworkSessionGate } from "@/lib/homework-phase1a/gate";
import {
  applyAdminHomeworkAction,
  markHomework,
  saveDraftAnswer,
  submitHomework,
  type AdminHomeworkAction,
} from "@/lib/homework-phase1a/stateTransitions";
import type { HomeworkBatchState, HomeworkLifecycleStatus } from "@/lib/homework-phase1a/types";
import { buildOpenHomeworkGate, resolveHomeworkSurfaceAccess, type HomeworkSurface } from "@/lib/homework-phase1b/contracts";
import { isWeeklyHomeworkPhase1BEnabled } from "@/lib/homework-phase1b/config";
import {
  markHomeworkSubmission,
  unavailableHomeworkOpenAnswerAiBoundary,
  type HomeworkMarkingSummary,
} from "@/lib/homework-phase1d/marking";
import { isWeeklyHomeworkPhase1GEnabled } from "@/lib/homework-phase1g/config";
import {
  buildHomeworkMasteryPlan,
  buildHomeworkVisibilitySummary,
  toHeartbeatSignalRecords,
} from "@/lib/homework-phase1g/intelligence";

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
  feedbackJson: string | null;
  aiConfidence: number | null;
  reviewNeeded: boolean;
  metadataJson: string | null;
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
  metadataJson: string | null;
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
    findMany(args: unknown): Promise<Array<{ id: string; studentId: string }>>;
    update(args: unknown): Promise<unknown>;
  };
  homeworkAnswer: {
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  homeworkQuestion: {
    updateMany(args: unknown): Promise<unknown>;
  };
  homeworkAuditLog: {
    createMany(args: { data: HomeworkAuditLogCreateManyInput[] }): Promise<unknown>;
  };
  weakArea: {
    upsert(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
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
  feedback?: string | null;
  weakArea?: string | null;
  aiConfidence?: number | null;
  reviewNeeded: boolean;
};

export type HomeworkMarkingSummaryView = HomeworkMarkingSummary;

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
  markingSummary?: HomeworkMarkingSummaryView | null;
  questions: HomeworkQuestionView[];
};

export type HomeworkStatusCategory = "pending" | "in_progress" | "submitted" | "completed" | "excused" | "overdue";

export type HomeworkStatusSummaryView = {
  studentId: string;
  batchId: string;
  status: HomeworkLifecycleStatus;
  statusCategory: HomeworkStatusCategory;
  scorePercent: number | null;
  outcome: string;
  weakAreas: string[];
  parentActionNeeded: boolean;
  homeworkHelpedLearningProgress: boolean | null;
  repeatedLowScoreOrMissedPattern: boolean;
  actionNeededReasons: string[];
  dueAtIso: string;
  weekStartIso: string;
  weekEndIso: string;
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

function parseBatchMetadata(metadataJson: string | null | undefined): Record<string, unknown> {
  const parsed = parseJsonValue(metadataJson);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function parseFeedbackText(value: string | null | undefined): string | null {
  const parsed = parseJsonValue(value);
  if (typeof parsed === "string") return parsed;
  if (typeof parsed === "object" && parsed !== null && "text" in parsed && typeof (parsed as { text?: unknown }).text === "string") {
    return (parsed as { text: string }).text;
  }
  return null;
}

function parseWeakArea(value: string | null | undefined): string | null {
  const parsed = parseJsonValue(value);
  if (typeof parsed === "object" && parsed !== null && "weakArea" in parsed) {
    const weakArea = (parsed as { weakArea?: unknown }).weakArea;
    return typeof weakArea === "string" && weakArea.trim() ? weakArea.trim() : null;
  }
  return null;
}

function normalizeWeakArea(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function toMasteryTargets(input: {
  questions: HomeworkQuestionRecord[];
  answers: Array<{ questionId: string; weakArea: string | null }>;
}): Array<{ subject: string; skillFocus: string }> {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const targets: Array<{ subject: string; skillFocus: string }> = [];

  for (const answer of input.answers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;
    const skillFocus = normalizeWeakArea(answer.weakArea)
      || normalizeWeakArea(question.skill)
      || normalizeWeakArea(question.topic);
    if (!skillFocus) continue;
    const key = `${question.subject.toLowerCase()}::${skillFocus.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      subject: question.subject,
      skillFocus,
    });
  }

  return targets;
}

async function emitHomeworkHeartbeatSignals(input: {
  studentId: string;
  actorUserId?: string;
  now: Date;
  featureEnabled: boolean;
  status: string;
  scorePercent: number | null;
  reviewNeededCount: number;
  requiresRecap: boolean;
  context: { subject: string | null; topic: string | null; skill: string | null; yearGroup?: string | null };
  includeParentAdminOverride?: boolean;
  includeExcused?: boolean;
}): Promise<void> {
  const records = toHeartbeatSignalRecords({
    featureEnabled: input.featureEnabled,
    studentId: input.studentId,
    now: input.now,
    status: input.status,
    scorePercent: input.scorePercent,
    reviewNeededCount: input.reviewNeededCount,
    requiresRecap: input.requiresRecap,
    context: input.context,
    includeParentAdminOverride: input.includeParentAdminOverride,
    includeExcused: input.includeExcused,
  });

  if (!records.length) return;

  await Promise.all(records.map((record) => writeAuditLog({
    actorUserId: input.actorUserId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    metadata: record.metadata,
  })));
}

function toStatusCategory(status: HomeworkLifecycleStatus): HomeworkStatusCategory {
  if (status === "EXCUSED") return "excused";
  if (status === "OVERDUE") return "overdue";
  if (status === "SUBMITTED" || status === "MARKED" || status === "REVIEW_NEEDED") return "submitted";
  if (status === "COMPLETED" || status === "OVERRIDDEN") return "completed";
  if (status === "STARTED" || status === "IN_PROGRESS") return "in_progress";
  return "pending";
}

export function summarizeHomeworkBatchForParentAdmin(batch: HomeworkBatchView): HomeworkStatusSummaryView {
  const weakAreas = Array.from(
    new Set(
      batch.questions
        .map((question) => question.answer.weakArea)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const outcome = batch.markingSummary?.outcomeBand
    ?? (batch.status === "COMPLETED" ? "completed" : batch.status === "EXCUSED" ? "excused" : batch.status.toLowerCase());

  const parentActionNeeded =
    batch.status === "OVERDUE"
    || batch.status === "REVIEW_NEEDED"
    || (typeof batch.scorePercent === "number" && batch.scorePercent < 50);

  const visibility = buildHomeworkVisibilitySummary({
    status: batch.status,
    scorePercent: batch.scorePercent,
    reviewNeededCount: batch.markingSummary?.reviewNeededCount ?? 0,
    recapOnly: batch.recapOnly,
    sourceCompletedSessionCount: batch.sourceCompletedSessionCount,
    sourceStartedSessionCount: batch.sourceStartedSessionCount,
  });

  return {
    studentId: batch.studentId,
    batchId: batch.id,
    status: batch.status,
    statusCategory: toStatusCategory(batch.status),
    scorePercent: batch.scorePercent,
    outcome,
    weakAreas,
    parentActionNeeded,
    homeworkHelpedLearningProgress: visibility.homeworkHelpedLearningProgress,
    repeatedLowScoreOrMissedPattern: visibility.repeatedLowScoreOrMissedPattern,
    actionNeededReasons: visibility.actionNeededReasons,
    dueAtIso: batch.extendedDueAt ?? batch.weekEnd,
    weekStartIso: batch.weekStart,
    weekEndIso: batch.weekEnd,
  };
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
  const metadata = parseBatchMetadata(batch.metadataJson);
  const markingSummary = typeof metadata.markingSummary === "object" && metadata.markingSummary !== null
    ? metadata.markingSummary as HomeworkMarkingSummaryView
    : null;

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
    markingSummary,
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
          feedback: parseFeedbackText(answer?.feedbackJson),
          weakArea: parseWeakArea(answer?.metadataJson),
          aiConfidence: answer?.aiConfidence ?? null,
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
  const phase1gEnabled = isWeeklyHomeworkPhase1GEnabled();

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

  if (phase1gEnabled) {
    const startedQuestion = updated.questions.find((question: HomeworkQuestionRecord) => question.id === input.questionId) ?? null;
    await emitHomeworkHeartbeatSignals({
      studentId: input.studentId,
      actorUserId: input.actorUserId,
      now,
      featureEnabled: true,
      status: updated.status,
      scorePercent: updated.scorePercent,
      reviewNeededCount: updated.answers.filter((answer: HomeworkAnswerRecord) => answer.reviewNeeded).length,
      requiresRecap: updated.recapOnly,
      context: {
        subject: startedQuestion?.subject ?? null,
        topic: startedQuestion?.topic ?? null,
        skill: startedQuestion?.skill ?? null,
      },
    });

    await invalidateAcademicIntelligenceSnapshot({
      studentId: input.studentId,
      reason: "manual_refresh",
    });
  }

  return toBatchView(updated);
}

export async function submitStudentHomework(input: {
  studentId: string;
  batchId: string;
  actorUserId?: string;
}): Promise<HomeworkBatchView> {
  assertWeeklyHomeworkPhase1BEnabled();
  const phase1gEnabled = isWeeklyHomeworkPhase1GEnabled();

  const batch = await fetchHomeworkBatchRecord(input.studentId, input.batchId);
  if (!batch) throw new HomeworkPhase1BError("Homework batch not found.", 404);

  const now = new Date();
  const transition = submitHomework(toBatchState(batch), now);
  if (!transition.ok) {
    throw new HomeworkPhase1BError(transition.error, 400);
  }

  const marking = await markHomeworkSubmission({
    questions: batch.questions.map((question: HomeworkQuestionRecord) => {
      const existingAnswer = batch.answers.find((answer: HomeworkAnswerRecord) => answer.questionId === question.id) ?? null;
      return {
        id: question.id,
        subject: question.subject,
        topic: question.topic,
        skill: question.skill,
        questionType: question.questionType,
        prompt: parseJsonValue(question.promptJson),
        expectedAnswer: parseJsonValue(question.expectedAnswerJson),
        submittedAnswer: parseJsonValue(existingAnswer?.submittedAnswerJson ?? existingAnswer?.draftAnswerJson),
      };
    }),
    aiBoundary: unavailableHomeworkOpenAnswerAiBoundary,
  });
  const markTransition = markHomework(
    transition.state,
    now,
    marking.summary.scorePercent,
    marking.summary.reviewNeededCount > 0,
  );
  const batchMetadata = parseBatchMetadata(batch.metadataJson);
  const masteryPlan = buildHomeworkMasteryPlan({
    featureEnabled: phase1gEnabled,
    status: markTransition.state.status,
    scorePercent: marking.summary.scorePercent,
    reviewNeededCount: marking.summary.reviewNeededCount,
    requiresRecap: marking.summary.requiresRecap,
    targets: toMasteryTargets({
      questions: batch.questions,
      answers: marking.answers.map((answer) => ({
        questionId: answer.questionId,
        weakArea: answer.weakArea,
      })),
    }),
  });

  await prisma.$transaction(async (tx) => {
    const homeworkTx = tx as unknown as HomeworkPhase1BTransaction;
    await homeworkTx.homeworkBatch.update({
      where: { id: batch.id },
      data: {
        status: markTransition.state.status,
        submittedAt: transition.state.submittedAtIso ? new Date(transition.state.submittedAtIso) : now,
        markedAt: markTransition.state.markedAtIso ? new Date(markTransition.state.markedAtIso) : null,
        completedAt: markTransition.state.status === "COMPLETED" ? now : null,
        scorePercent: markTransition.state.scorePercent,
        recapOnly: markTransition.state.recapOnly,
        metadataJson: serializeJsonValue({
          ...batchMetadata,
          markingSummary: marking.summary,
        }),
      },
    });

    await Promise.all(
      batch.answers.map((answer: HomeworkAnswerRecord) => {
        const result = marking.answers.find((item) => item.questionId === answer.questionId) ?? null;
        return homeworkTx.homeworkAnswer.update({
          where: { id: answer.id },
          data: {
            submittedAnswerJson: answer.submittedAnswerJson ?? answer.draftAnswerJson,
            submittedAt: answer.submittedAt ?? now,
            markingStatus: result?.markingStatus ?? answer.markingStatus,
            isCorrect: result?.isCorrect ?? null,
            score: result?.score ?? null,
            feedbackJson: result ? serializeJsonValue({ text: result.feedback }) : answer.feedbackJson,
            aiConfidence: result?.aiConfidence ?? null,
            reviewNeeded: result?.reviewNeeded ?? false,
            metadataJson: result ? serializeJsonValue({ weakArea: result.weakArea }) : answer.metadataJson,
          },
        });
      }),
    );

    await appendAuditLogs(homeworkTx, {
      batchId: batch.id,
      actorUserId: input.actorUserId,
      events: [...transition.audit, ...markTransition.audit.map((event) => ({
        ...event,
        metadata: {
          ...(event.metadata ?? {}),
          outcomeBand: marking.summary.outcomeBand,
          correctCount: marking.summary.correctCount,
          incorrectCount: marking.summary.incorrectCount,
          reviewNeededCount: marking.summary.reviewNeededCount,
        },
      }))],
    });

    if (phase1gEnabled) {
      await Promise.all(masteryPlan.resolveTargets.map((target) => homeworkTx.weakArea.updateMany({
        where: {
          studentId: input.studentId,
          subject: target.subject,
          skillFocus: target.skillFocus,
          status: "active",
        },
        data: {
          status: "resolved",
          weaknessType: "homework_resolved",
          accuracy: Math.max(75, marking.summary.scorePercent ?? 75),
          attemptsCount: {
            increment: 1,
          },
          metadataJson: serializeJsonValue({
            source: "weekly_homework_phase1g",
            resolution: "strong_homework_result",
            scorePercent: marking.summary.scorePercent,
            reviewedAtIso: now.toISOString(),
          }),
          lastDetectedAt: now,
        },
      })));

      await Promise.all(masteryPlan.activateTargets.map((target) => homeworkTx.weakArea.upsert({
        where: {
          studentId_subject_skillFocus: {
            studentId: input.studentId,
            subject: target.subject,
            skillFocus: target.skillFocus,
          },
        },
        create: {
          studentId: input.studentId,
          subject: target.subject,
          keyStage: null,
          yearGroup: null,
          skillFocus: target.skillFocus,
          weaknessType: target.reason,
          accuracy: target.accuracy,
          attemptsCount: 1,
          status: "active",
          metadataJson: serializeJsonValue({
            source: "weekly_homework_phase1g",
            reason: target.reason,
            scorePercent: marking.summary.scorePercent,
            reviewNeededCount: marking.summary.reviewNeededCount,
            recapOnlyPath: masteryPlan.recapOnlyPath,
            detectedAtIso: now.toISOString(),
          }),
          lastDetectedAt: now,
        },
        update: {
          status: "active",
          weaknessType: target.reason,
          accuracy: target.accuracy,
          attemptsCount: {
            increment: 1,
          },
          metadataJson: serializeJsonValue({
            source: "weekly_homework_phase1g",
            reason: target.reason,
            scorePercent: marking.summary.scorePercent,
            reviewNeededCount: marking.summary.reviewNeededCount,
            recapOnlyPath: masteryPlan.recapOnlyPath,
            detectedAtIso: now.toISOString(),
          }),
          lastDetectedAt: now,
        },
      })));
    }
  });

  const updated = await fetchHomeworkBatchRecord(input.studentId, batch.id);
  if (!updated) throw new HomeworkPhase1BError("Homework batch not found after submit.", 404);

  if (phase1gEnabled) {
    const leadWeakArea = marking.summary.weakAreas[0] ?? null;
    const leadQuestion = batch.questions.find((question: HomeworkQuestionRecord) => {
      if (!leadWeakArea) return true;
      return normalizeWeakArea(question.skill) === normalizeWeakArea(leadWeakArea)
        || normalizeWeakArea(question.topic) === normalizeWeakArea(leadWeakArea);
    }) ?? null;

    await emitHomeworkHeartbeatSignals({
      studentId: input.studentId,
      actorUserId: input.actorUserId,
      now,
      featureEnabled: true,
      status: markTransition.state.status,
      scorePercent: marking.summary.scorePercent,
      reviewNeededCount: marking.summary.reviewNeededCount,
      requiresRecap: masteryPlan.recapOnlyPath,
      context: {
        subject: leadQuestion?.subject ?? null,
        topic: leadQuestion?.topic ?? leadWeakArea,
        skill: leadQuestion?.skill ?? leadWeakArea,
      },
    });

    await invalidateAcademicIntelligenceSnapshot({
      studentId: input.studentId,
      reason: "manual_refresh",
    });
  }

  return toBatchView(updated);
}

export async function applyHomeworkOverrideAction(input: {
  studentId: string;
  batchId: string;
  action: Extract<AdminHomeworkAction, "override" | "excuse" | "unlock" | "extend" | "reduce" | "regenerate">;
  reason?: string;
  reduceBy?: number;
  extendToIso?: string;
  actorUserId?: string;
}): Promise<HomeworkBatchView> {
  assertWeeklyHomeworkPhase1BEnabled();
  const phase1gEnabled = isWeeklyHomeworkPhase1GEnabled();

  const batch = await fetchHomeworkBatchRecord(input.studentId, input.batchId);
  if (!batch) throw new HomeworkPhase1BError("Homework batch not found.", 404);

  const now = new Date();
  const transition = applyAdminHomeworkAction(toBatchState(batch), now, input.action, input.reason, {
    reduceBy: input.reduceBy,
  });
  if (!transition.ok) {
    throw new HomeworkPhase1BError(transition.error, 400);
  }

  const nextExtendedDueAt = input.action === "extend"
    ? (input.extendToIso ? new Date(input.extendToIso) : new Date(batch.weekEnd.getTime() + 24 * 60 * 60 * 1000))
    : batch.extendedDueAt;

  const requiredQuestionIds = new Set(transition.state.requiredQuestionIds);
  const previousRequiredIds = new Set(
    batch.questions
      .filter((question: HomeworkQuestionRecord) => question.required)
      .map((question: HomeworkQuestionRecord) => question.id),
  );
  const requiredIdsChanged = previousRequiredIds.size !== requiredQuestionIds.size
    || Array.from(requiredQuestionIds).some((id) => !previousRequiredIds.has(id));

  await prisma.$transaction(async (tx) => {
    const homeworkTx = tx as unknown as HomeworkPhase1BTransaction;
    await homeworkTx.homeworkBatch.update({
      where: { id: batch.id },
      data: {
        status: transition.state.status,
        completedAt: ["override", "unlock", "excuse"].includes(input.action) ? now : batch.completedAt,
        overrideReason: (input.action === "override" || input.action === "unlock") ? (input.reason ?? null) : batch.overrideReason,
        excusedReason: input.action === "excuse" ? (input.reason ?? null) : batch.excusedReason,
        extendedDueAt: input.action === "extend" ? nextExtendedDueAt : batch.extendedDueAt,
        recapOnly: false,
      },
    });

    if (requiredIdsChanged) {
      await Promise.all(
        batch.questions.map((question: HomeworkQuestionRecord) => homeworkTx.homeworkQuestion.updateMany({
          where: { id: question.id },
          data: { required: requiredQuestionIds.has(question.id) },
        })),
      );
    }

    if (input.action === "regenerate") {
      await homeworkTx.homeworkAnswer.updateMany({
        where: { batchId: batch.id, studentId: input.studentId },
        data: {
          draftAnswerJson: null,
          submittedAnswerJson: null,
          isAnswered: false,
          answeredAt: null,
          submittedAt: null,
          markingStatus: "not_marked",
          isCorrect: null,
          score: null,
          feedbackJson: null,
          aiConfidence: null,
          reviewNeeded: false,
          metadataJson: null,
        },
      });
    }

    await appendAuditLogs(homeworkTx, {
      batchId: batch.id,
      actorUserId: input.actorUserId,
      events: transition.audit,
    });
  });

  const updated = await fetchHomeworkBatchRecord(input.studentId, batch.id);
  if (!updated) throw new HomeworkPhase1BError("Homework batch not found after override.", 404);

  if (phase1gEnabled) {
    await emitHomeworkHeartbeatSignals({
      studentId: input.studentId,
      actorUserId: input.actorUserId,
      now,
      featureEnabled: true,
      status: updated.status,
      scorePercent: updated.scorePercent,
      reviewNeededCount: updated.answers.filter((answer: HomeworkAnswerRecord) => answer.reviewNeeded).length,
      requiresRecap: updated.recapOnly,
      includeParentAdminOverride: input.action === "override" || input.action === "unlock",
      includeExcused: input.action === "excuse",
      context: {
        subject: updated.questions[0]?.subject ?? null,
        topic: updated.questions[0]?.topic ?? null,
        skill: updated.questions[0]?.skill ?? null,
      },
    });

    await invalidateAcademicIntelligenceSnapshot({
      studentId: input.studentId,
      reason: "manual_refresh",
    });
  }

  return toBatchView(updated);
}

export function toHomeworkPhase1BResponseError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof HomeworkPhase1BError) {
    return { statusCode: error.statusCode, message: error.message };
  }
  return { statusCode: 500, message: error instanceof Error ? error.message : "Unexpected weekly homework error." };
}

export async function getHomeworkStatusSummaryForStudent(studentId: string): Promise<HomeworkStatusSummaryView | null> {
  assertWeeklyHomeworkPhase1BEnabled();
  const batch = await getCurrentHomeworkBatchView(studentId);
  return batch ? summarizeHomeworkBatchForParentAdmin(batch) : null;
}
