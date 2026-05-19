import { useCallback, useState } from "react";

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

export function createTutorEngineStore(initialContext: TutorRuntimeContext): TutorEngineStore {
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