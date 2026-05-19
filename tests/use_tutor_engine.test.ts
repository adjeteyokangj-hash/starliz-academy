import test from "node:test";
import assert from "node:assert/strict";

import {
  __getTelemetryQueueSnapshotForTests,
  __resetTelemetryQueueForTests,
} from "@/lib/engines/telemetry-engine";
import {
  createInitialTutorRuntimeContext,
  createLessonRuntimeContextFromAssignment,
  createTutorEngineStore,
} from "@/hooks/useTutorEngine";

function resetTelemetryQueue(): void {
  __resetTelemetryQueueForTests();
}

test("hook initialization: store exposes initial runtime context and no last event", () => {
  const initialContext = createInitialTutorRuntimeContext("assign-1", 3);
  const store = createTutorEngineStore(initialContext);

  assert.equal(store.context.sessionState, "idle");
  assert.equal(store.context.assignmentId, "assign-1");
  assert.equal(store.context.itemCount, 3);
  assert.equal(store.lastEvent, null);
});

test("valid dispatch transition: ASSIGNMENT_LOADED updates state and tracks last event", () => {
  resetTelemetryQueue();
  const store = createTutorEngineStore(createInitialTutorRuntimeContext("assign-1", 3));

  const result = store.dispatch({
    name: "ASSIGNMENT_LOADED",
    data: {
      assignmentId: "assign-1",
      itemCount: 3,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(store.context.sessionState, "lesson_active");
  assert.equal(store.lastEvent?.name, "ASSIGNMENT_LOADED");

  const queuedEvents = __getTelemetryQueueSnapshotForTests();
  assert.equal(queuedEvents.length, 1);
  assert.equal(queuedEvents[0]?.payload?.eventName, "ASSIGNMENT_LOADED");
  assert.equal(queuedEvents[0]?.payload?.transitionAccepted, true);
  assert.equal(queuedEvents[0]?.payload?.previousSessionState, "idle");
  assert.equal(queuedEvents[0]?.payload?.nextSessionState, "lesson_active");
  assert.equal(typeof queuedEvents[0]?.timestamp, "number");
});

test("rejected transition: LESSON_STARTED from idle is rejected", () => {
  resetTelemetryQueue();
  const store = createTutorEngineStore(createInitialTutorRuntimeContext("assign-1", 3));

  const result = store.dispatch({
    name: "LESSON_STARTED",
    data: {
      startIndex: 0,
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /only valid in lesson_active/);
  assert.equal(store.context.sessionState, "idle");

  const queuedEvents = __getTelemetryQueueSnapshotForTests();
  assert.equal(queuedEvents.length, 1);
  assert.equal(queuedEvents[0]?.payload?.eventName, "LESSON_STARTED");
  assert.equal(queuedEvents[0]?.payload?.transitionAccepted, false);
  assert.equal(queuedEvents[0]?.payload?.transitionRejected, true);
  assert.equal(queuedEvents[0]?.payload?.previousSessionState, "idle");
  assert.equal(queuedEvents[0]?.payload?.nextSessionState, "idle");
});

test("state preservation on invalid transition: context reference stays stable", () => {
  const store = createTutorEngineStore(createInitialTutorRuntimeContext("assign-1", 3));
  const before = store.context;

  const result = store.dispatch({
    name: "ANSWER_SUBMITTED",
    data: {
      questionIndex: 0,
      answer: "A",
      attemptNumber: 1,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(store.context, before);
});

test("createLessonRuntimeContextFromAssignment loads assignment and optionally starts lesson", () => {
  const loadedOnly = createLessonRuntimeContextFromAssignment({
    assignmentId: "assign-10",
    itemCount: 2,
  });
  assert.equal(loadedOnly.sessionState, "lesson_active");

  const started = createLessonRuntimeContextFromAssignment({
    assignmentId: "assign-11",
    itemCount: 2,
    startIndex: 1,
  });
  assert.equal(started.sessionState, "question_active");
  assert.equal(started.currentQuestionIndex, 1);
});

test("dispatch still succeeds when telemetry emit throws", () => {
  const store = createTutorEngineStore(
    createInitialTutorRuntimeContext("assign-telemetry-fail", 2),
    {
      emitTelemetry() {
        throw new Error("telemetry unavailable");
      },
    },
  );

  const result = store.dispatch({
    name: "ASSIGNMENT_LOADED",
    data: {
      assignmentId: "assign-telemetry-fail",
      itemCount: 2,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(store.context.sessionState, "lesson_active");
  assert.equal(store.lastEvent?.name, "ASSIGNMENT_LOADED");
});