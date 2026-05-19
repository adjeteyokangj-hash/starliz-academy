export type SessionState =
  | "idle"
  | "lesson_active"
  | "question_active"
  | "review_active"
  | "completed";

export type QuestionState =
  | "unseen"
  | "awaiting_evaluation"
  | "correct"
  | "wrong_retry"
  | "wrong_skipped";

export type TutorEventName =
  | "ASSIGNMENT_LOADED"
  | "LESSON_STARTED"
  | "ANSWER_SUBMITTED"
  | "ANSWER_CORRECT"
  | "ANSWER_WRONG_RETRY"
  | "ANSWER_FINAL_WRONG"
  | "CONTINUED"
  | "RETRY_CLEARED"
  | "NEXT_ITEM"
  | "REVIEW_TRIGGERED"
  | "REVIEW_BEGAN"
  | "REVIEW_COMPLETE"
  | "LESSON_COMPLETED";

export type TutorAnswerValue = string | number | boolean | null;

export type QuestionRecord = {
  questionIndex: number;
  state: QuestionState;
  attemptCount: number;
  lastAnswer?: TutorAnswerValue;
  score?: number;
  firstTryCorrect?: boolean;
  updatedAt: number;
};

export type TutorRuntimeContext = {
  assignmentId: string;
  itemCount: number;
  sessionState: SessionState;
  currentQuestionIndex: number;
  questionRecords: Map<number, QuestionRecord>;
  reviewTriggered: boolean;
  reviewInProgress: boolean;
  reviewQueue: number[];
  totalAttempts: number;
  finalScore: number | null;
  masteryReady: boolean;
  updatedAt: number;
};

export type AssignmentLoadedPayload = {
  name: "ASSIGNMENT_LOADED";
  data: {
    assignmentId: string;
    itemCount: number;
  };
};

export type LessonStartedPayload = {
  name: "LESSON_STARTED";
  data: {
    gentleStart?: boolean;
    startIndex?: number;
  };
};

export type AnswerSubmittedPayload = {
  name: "ANSWER_SUBMITTED";
  data: {
    questionIndex: number;
    answer: TutorAnswerValue;
    attemptNumber: number;
  };
};

export type AnswerCorrectPayload = {
  name: "ANSWER_CORRECT";
  data: {
    questionIndex: number;
    firstTry: boolean;
    score: number;
  };
};

export type AnswerWrongRetryPayload = {
  name: "ANSWER_WRONG_RETRY";
  data: {
    questionIndex: number;
    attemptNumber: number;
  };
};

export type AnswerFinalWrongPayload = {
  name: "ANSWER_FINAL_WRONG";
  data: {
    questionIndex: number;
    attemptNumber: number;
  };
};

export type ContinuedPayload = {
  name: "CONTINUED";
  data: {
    questionIndex: number;
  };
};

export type RetryClearedPayload = {
  name: "RETRY_CLEARED";
  data: {
    questionIndex: number;
  };
};

export type NextItemPayload = {
  name: "NEXT_ITEM";
  data: {
    currentIndex: number;
    nextIndex: number;
  };
};

export type ReviewTriggeredPayload = {
  name: "REVIEW_TRIGGERED";
  data: {
    reviewQueue: number[];
  };
};

export type ReviewBeganPayload = {
  name: "REVIEW_BEGAN";
  data: {
    itemCount: number;
  };
};

export type ReviewCompletePayload = {
  name: "REVIEW_COMPLETE";
  data: {
    improved: boolean;
  };
};

export type LessonCompletedPayload = {
  name: "LESSON_COMPLETED";
  data: {
    finalScore: number;
    masteryReady: boolean;
  };
};

export type TutorEventPayload =
  | AssignmentLoadedPayload
  | LessonStartedPayload
  | AnswerSubmittedPayload
  | AnswerCorrectPayload
  | AnswerWrongRetryPayload
  | AnswerFinalWrongPayload
  | ContinuedPayload
  | RetryClearedPayload
  | NextItemPayload
  | ReviewTriggeredPayload
  | ReviewBeganPayload
  | ReviewCompletePayload
  | LessonCompletedPayload;

export type TransitionSuccess = {
  ok: true;
  nextContext: TutorRuntimeContext;
};

export type TransitionFailure = {
  ok: false;
  nextContext: TutorRuntimeContext;
  reason: string;
};

export type TransitionResult = TransitionSuccess | TransitionFailure;
