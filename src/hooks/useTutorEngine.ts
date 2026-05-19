import { useCallback, useState } from "react";

import { emitTelemetryEvent } from "@/lib/engines/telemetry-engine";
import { createInitialContext, transition } from "@/lib/tutor-runtime/state-machine";
import type {
  TutorEventPayload,
  TutorRuntimeContext,
  TransitionResult,
} from "@/lib/tutor-runtime/types";

type LessonRuntimeAssignmentInput = {
  assignmentId: string;
  itemCount: number;
  startIndex?: number;
};

type TutorEngineStore = {
  context: TutorRuntimeContext;
  lastEvent: TutorEventPayload | null;
  dispatch: (event: TutorEventPayload) => TransitionResult;
  canTransition: (event: TutorEventPayload) => boolean;
};

type TutorEngineDependencies = {
  emitTelemetry?: typeof emitTelemetryEvent;
};

function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === "development";
}

function logTransition(
  previousContext: TutorRuntimeContext,
  event: TutorEventPayload,
  nextContext: TutorRuntimeContext,
): void {
  if (!isDevelopmentMode()) {
    return;
  }

  console.debug("[TutorEngine] transition", {
    previousState: previousContext.sessionState,
    event,
    nextState: nextContext.sessionState,
  });
}

function logTelemetryFailure(event: TutorEventPayload, error: unknown): void {
  if (!isDevelopmentMode()) {
    return;
  }

  console.debug("[TutorEngine] telemetry emit failed", {
    eventName: event.name,
    error,
  });
}

function createTelemetrySessionId(context: TutorRuntimeContext): string {
  return `tutor:${context.assignmentId}`;
}

function getCurrentQuestionState(context: TutorRuntimeContext): string | null {
  const questionRecord = context.questionRecords.get(context.currentQuestionIndex);
  return questionRecord?.state ?? null;
}

export function createInitialTutorRuntimeContext(
  assignmentId: string,
  itemCount: number,
): TutorRuntimeContext {
  return createInitialContext(assignmentId, itemCount);
}

export function createLessonRuntimeContextFromAssignment(
  input: LessonRuntimeAssignmentInput,
): TutorRuntimeContext {
  const baseContext = createInitialTutorRuntimeContext(input.assignmentId, input.itemCount);
  const loadedResult = transition(baseContext, {
    name: "ASSIGNMENT_LOADED",
    data: {
      assignmentId: input.assignmentId,
      itemCount: input.itemCount,
    },
  });

  if (!loadedResult.ok) {
    return loadedResult.nextContext;
  }

  if (typeof input.startIndex !== "number") {
    return loadedResult.nextContext;
  }

  const startedResult = transition(loadedResult.nextContext, {
    name: "LESSON_STARTED",
    data: {
      startIndex: input.startIndex,
    },
  });

  return startedResult.nextContext;
}

export function createTutorEngineStore(
  initialContext: TutorRuntimeContext,
  dependencies: TutorEngineDependencies = {},
): TutorEngineStore {
  const emitTelemetry = dependencies.emitTelemetry ?? emitTelemetryEvent;
  let context = initialContext;
  let lastEvent: TutorEventPayload | null = null;

  return {
    get context() {
      return context;
    },
    get lastEvent() {
      return lastEvent;
    },
    dispatch(event: TutorEventPayload) {
      const previousContext = context;
      const result = transition(previousContext, event);
      const timestamp = Date.now();

      try {
        emitTelemetry({
          category: "lifecycle",
          name: "SESSION_STARTED",
          sessionId: createTelemetrySessionId(previousContext),
          assignmentId: previousContext.assignmentId,
          source: "tutor-runtime",
          timestamp,
          payload: {
            eventName: event.name,
            previousSessionState: previousContext.sessionState,
            previousQuestionState: getCurrentQuestionState(previousContext),
            nextSessionState: result.nextContext.sessionState,
            nextQuestionState: getCurrentQuestionState(result.nextContext),
            transitionAccepted: result.ok,
            transitionRejected: !result.ok,
          },
        });
      } catch (error) {
        logTelemetryFailure(event, error);
      }

      context = result.nextContext;
      lastEvent = event;
      logTransition(previousContext, event, result.nextContext);
      return result;
    },
    canTransition(event: TutorEventPayload) {
      return transition(context, event).ok;
    },
  };
}

export function useTutorEngine(initialContext: TutorRuntimeContext) {
  const [store] = useState(() => createTutorEngineStore(initialContext));
  const [context, setContext] = useState<TutorRuntimeContext>(store.context);
  const [lastEvent, setLastEvent] = useState<TutorEventPayload | null>(store.lastEvent);

  const dispatch = useCallback((event: TutorEventPayload) => {
    const result = store.dispatch(event);
    setContext(store.context);
    setLastEvent(store.lastEvent);
    return result;
  }, [store]);

  const canTransition = useCallback((event: TutorEventPayload) => {
    return store.canTransition(event);
  }, [store]);

  return {
    context,
    dispatch,
    canTransition,
    lastEvent,
  };
}