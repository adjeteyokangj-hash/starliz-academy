import type {
  AnswerSubmittedPayload,
  QuestionRecord,
  TutorEventPayload,
  TutorRuntimeContext,
  TransitionFailure,
  TransitionResult,
  TransitionSuccess,
} from "@/lib/tutor-runtime/types";

function nextTimestamp(previousUpdatedAt: number): number {
  return Math.max(Date.now(), previousUpdatedAt + 1);
}

function cloneContext(context: TutorRuntimeContext): TutorRuntimeContext {
  return {
    ...context,
    questionRecords: new Map(context.questionRecords.entries()),
    reviewQueue: [...context.reviewQueue],
  };
}

function success(context: TutorRuntimeContext): TransitionSuccess {
  return { ok: true, nextContext: context };
}

function failure(reason: string, context: TutorRuntimeContext): TransitionFailure {
  return { ok: false, nextContext: context, reason };
}

function updateQuestionRecord(
  context: TutorRuntimeContext,
  questionIndex: number,
  updater: (record: QuestionRecord | undefined, updatedAt: number) => QuestionRecord,
): TutorRuntimeContext {
  const nextContext = cloneContext(context);
  const updatedAt = nextTimestamp(context.updatedAt);
  const currentRecord = nextContext.questionRecords.get(questionIndex);
  nextContext.questionRecords.set(questionIndex, updater(currentRecord, updatedAt));
  nextContext.updatedAt = updatedAt;
  return nextContext;
}

function isQuestionIndexInBounds(context: TutorRuntimeContext, questionIndex: number): boolean {
  return Number.isInteger(questionIndex) && questionIndex >= 0 && questionIndex < context.itemCount;
}

function getQuestionRecord(context: TutorRuntimeContext, questionIndex: number): QuestionRecord | undefined {
  return context.questionRecords.get(questionIndex);
}

function assertQuestionState(
  context: TutorRuntimeContext,
  questionIndex: number,
  expectedState: QuestionRecord["state"],
): TransitionFailure | null {
  const record = getQuestionRecord(context, questionIndex);
  if (!record || record.state !== expectedState) {
    return failure(`Question ${questionIndex} is not in ${expectedState}.`, context);
  }

  return null;
}

function createSubmittedRecord(
  event: AnswerSubmittedPayload,
  existingRecord: QuestionRecord | undefined,
  updatedAt: number,
): QuestionRecord {
  return {
    questionIndex: event.data.questionIndex,
    state: "awaiting_evaluation",
    attemptCount: Math.max(existingRecord?.attemptCount ?? 0, event.data.attemptNumber),
    lastAnswer: event.data.answer,
    score: existingRecord?.score,
    firstTryCorrect: existingRecord?.firstTryCorrect,
    updatedAt,
  };
}

export function createInitialContext(assignmentId: string, itemCount: number): TutorRuntimeContext {
  const updatedAt = Date.now();
  return {
    assignmentId,
    itemCount,
    sessionState: "idle",
    currentQuestionIndex: 0,
    questionRecords: new Map(),
    reviewTriggered: false,
    reviewInProgress: false,
    reviewQueue: [],
    totalAttempts: 0,
    finalScore: null,
    masteryReady: false,
    updatedAt,
  };
}

export function transition(context: TutorRuntimeContext, event: TutorEventPayload): TransitionResult {
  switch (event.name) {
    case "ASSIGNMENT_LOADED": {
      if (context.sessionState !== "idle") {
        return failure("ASSIGNMENT_LOADED is only valid in idle.", context);
      }

      const nextContext = cloneContext(context);
      nextContext.assignmentId = event.data.assignmentId;
      nextContext.itemCount = event.data.itemCount;
      nextContext.sessionState = "lesson_active";
      nextContext.currentQuestionIndex = 0;
      nextContext.reviewTriggered = false;
      nextContext.reviewInProgress = false;
      nextContext.reviewQueue = [];
      nextContext.finalScore = null;
      nextContext.masteryReady = false;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "LESSON_STARTED": {
      if (context.sessionState !== "lesson_active") {
        return failure("LESSON_STARTED is only valid in lesson_active.", context);
      }

      const startIndex = event.data.startIndex ?? 0;
      if (!isQuestionIndexInBounds(context, startIndex)) {
        return failure(`Question index ${startIndex} is out of bounds.`, context);
      }

      const nextContext = cloneContext(context);
      nextContext.sessionState = "question_active";
      nextContext.currentQuestionIndex = startIndex;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "ANSWER_SUBMITTED": {
      if (context.sessionState !== "question_active" && context.sessionState !== "review_active") {
        return failure("ANSWER_SUBMITTED is only valid in question_active or review_active.", context);
      }

      if (!isQuestionIndexInBounds(context, event.data.questionIndex)) {
        return failure(`Question index ${event.data.questionIndex} is out of bounds.`, context);
      }

      const nextContext = updateQuestionRecord(context, event.data.questionIndex, (record, updatedAt) =>
        createSubmittedRecord(event, record, updatedAt),
      );
      nextContext.totalAttempts = context.totalAttempts + 1;
      return success(nextContext);
    }

    case "ANSWER_CORRECT": {
      const stateFailure = assertQuestionState(context, event.data.questionIndex, "awaiting_evaluation");
      if (stateFailure) {
        return stateFailure;
      }

      const nextContext = updateQuestionRecord(context, event.data.questionIndex, (record, updatedAt) => ({
        ...(record as QuestionRecord),
        state: "correct",
        score: event.data.score,
        firstTryCorrect: event.data.firstTry,
        updatedAt,
      }));
      return success(nextContext);
    }

    case "ANSWER_WRONG_RETRY": {
      const stateFailure = assertQuestionState(context, event.data.questionIndex, "awaiting_evaluation");
      if (stateFailure) {
        return stateFailure;
      }

      const nextContext = updateQuestionRecord(context, event.data.questionIndex, (record, updatedAt) => ({
        ...(record as QuestionRecord),
        state: "wrong_retry",
        updatedAt,
      }));
      return success(nextContext);
    }

    case "ANSWER_FINAL_WRONG": {
      const stateFailure = assertQuestionState(context, event.data.questionIndex, "awaiting_evaluation");
      if (stateFailure) {
        return stateFailure;
      }

      const nextContext = updateQuestionRecord(context, event.data.questionIndex, (record, updatedAt) => ({
        ...(record as QuestionRecord),
        state: "wrong_skipped",
        updatedAt,
      }));
      return success(nextContext);
    }

    case "CONTINUED": {
      const record = getQuestionRecord(context, event.data.questionIndex);
      if (!record || (record.state !== "correct" && record.state !== "wrong_skipped")) {
        return failure(`Question ${event.data.questionIndex} cannot continue from its current state.`, context);
      }

      const nextContext = cloneContext(context);
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "RETRY_CLEARED": {
      const stateFailure = assertQuestionState(context, event.data.questionIndex, "wrong_retry");
      if (stateFailure) {
        return stateFailure;
      }

      const nextContext = updateQuestionRecord(context, event.data.questionIndex, (record, updatedAt) => ({
        ...(record as QuestionRecord),
        state: "unseen",
        updatedAt,
      }));
      return success(nextContext);
    }

    case "NEXT_ITEM": {
      if (context.sessionState !== "question_active" && context.sessionState !== "review_active") {
        return failure("NEXT_ITEM is only valid in question_active or review_active.", context);
      }

      if (!isQuestionIndexInBounds(context, event.data.nextIndex)) {
        return failure(`Question index ${event.data.nextIndex} is out of bounds.`, context);
      }

      const nextContext = cloneContext(context);
      nextContext.currentQuestionIndex = event.data.nextIndex;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "REVIEW_TRIGGERED": {
      if (context.sessionState !== "question_active") {
        return failure("REVIEW_TRIGGERED is only valid in question_active.", context);
      }

      if (event.data.reviewQueue.length === 0) {
        return failure("REVIEW_TRIGGERED requires a non-empty review queue.", context);
      }

      if (!event.data.reviewQueue.every((index) => isQuestionIndexInBounds(context, index))) {
        return failure("Review queue contains an out of bounds index.", context);
      }

      const nextContext = cloneContext(context);
      nextContext.sessionState = "review_active";
      nextContext.reviewTriggered = true;
      nextContext.reviewInProgress = false;
      nextContext.reviewQueue = [...event.data.reviewQueue];
      nextContext.currentQuestionIndex = event.data.reviewQueue[0] ?? context.currentQuestionIndex;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "REVIEW_BEGAN": {
      if (context.sessionState !== "review_active") {
        return failure("REVIEW_BEGAN is only valid in review_active.", context);
      }

      const nextContext = cloneContext(context);
      nextContext.reviewInProgress = true;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "REVIEW_COMPLETE": {
      if (context.sessionState !== "review_active") {
        return failure("REVIEW_COMPLETE is only valid in review_active.", context);
      }

      const nextContext = cloneContext(context);
      nextContext.sessionState = "question_active";
      nextContext.reviewTriggered = false;
      nextContext.reviewInProgress = false;
      nextContext.reviewQueue = [];
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    case "LESSON_COMPLETED": {
      const nextContext = cloneContext(context);
      nextContext.sessionState = "completed";
      nextContext.finalScore = event.data.finalScore;
      nextContext.masteryReady = event.data.masteryReady;
      nextContext.updatedAt = nextTimestamp(context.updatedAt);
      return success(nextContext);
    }

    default: {
      const exhaustiveEvent: never = event;
      return failure(`Unhandled event: ${String(exhaustiveEvent)}`, context);
    }
  }
}
