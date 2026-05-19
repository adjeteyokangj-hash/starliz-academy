import test from "node:test";
import assert from "node:assert/strict";

import {
  __clearTelemetryListenersForTests,
  __getTelemetryQueueSnapshotForTests,
  __resetTelemetryQueueForTests,
  createTelemetryEvent,
  emitTelemetryBatch,
  emitTelemetryEvent,
  flushTelemetryQueue,
  subscribeTelemetry,
} from "@/lib/engines/telemetry-engine";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    category: "question" as const,
    name: "QUESTION_PRESENTED" as const,
    sessionId: "session-1",
    assignmentId: "assign-1",
    source: "tutor-runtime" as const,
    payload: { prompt: "7 + 2" },
    ...overrides,
  };
}

test.beforeEach(() => {
  __resetTelemetryQueueForTests();
  __clearTelemetryListenersForTests();
});

test("event creation returns a normalized typed telemetry event", () => {
  const event = createTelemetryEvent(baseInput({ timestamp: "2026-05-19T10:00:00.000Z" }));

  assert.ok(event);
  assert.equal(event.category, "question");
  assert.equal(event.name, "QUESTION_PRESENTED");
  assert.equal(event.sessionId, "session-1");
  assert.equal(event.timestamp, Date.parse("2026-05-19T10:00:00.000Z"));
  assert.match(event.id, /^telemetry:/);
});

test("duplicate prevention rejects a repeated event fingerprint", () => {
  const input = baseInput({ timestamp: 1000, dedupeKey: "question-0-presented" });

  const first = emitTelemetryEvent(input);
  const second = emitTelemetryEvent(input);

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.match(second.reason, /duplicate/i);
  assert.equal(__getTelemetryQueueSnapshotForTests().length, 1);
});

test("queue overflow handling keeps the newest events within max queue size", () => {
  for (let index = 0; index < 505; index += 1) {
    const result = emitTelemetryEvent(
      baseInput({
        dedupeKey: `question-${index}`,
        timestamp: index + 1,
        questionIndex: index,
      }),
    );
    assert.equal(result.ok, true);
  }

  const queue = __getTelemetryQueueSnapshotForTests();
  assert.equal(queue.length, 500);
  assert.equal(queue[0]?.questionIndex, 5);
  assert.equal(queue.at(-1)?.questionIndex, 504);
});

test("malformed payload rejection refuses invalid telemetry input", () => {
  const invalidPayload = emitTelemetryEvent(
    baseInput({
      payload: ["not", "a", "record"],
    }),
  );
  assert.equal(invalidPayload.ok, false);
  assert.match(invalidPayload.reason, /payload/i);

  const invalidCategory = emitTelemetryEvent(
    baseInput({
      category: "voice",
    }),
  );
  assert.equal(invalidCategory.ok, false);
  assert.match(invalidCategory.reason, /category/i);
  assert.equal(__getTelemetryQueueSnapshotForTests().length, 0);
});

test("batch flush returns queued events and clears them from memory", () => {
  const batch = emitTelemetryBatch([
    baseInput({ dedupeKey: "q-1", timestamp: 1 }),
    baseInput({ dedupeKey: "q-2", timestamp: 2, questionIndex: 1 }),
    baseInput({ dedupeKey: "q-3", timestamp: 3, questionIndex: 2 }),
  ]);

  assert.equal(batch.accepted.length, 3);
  assert.equal(batch.rejected, 0);
  assert.equal(__getTelemetryQueueSnapshotForTests().length, 3);

  const flushed = flushTelemetryQueue();
  assert.equal(flushed.length, 3);
  assert.equal(flushed[0]?.timestamp, 1);
  assert.equal(__getTelemetryQueueSnapshotForTests().length, 0);
});

test("timestamp normalization falls back to now when input is malformed", () => {
  const before = Date.now();
  const event = createTelemetryEvent(baseInput({ timestamp: "not-a-date" }));
  const after = Date.now();

  assert.ok(event);
  assert.equal(event.timestamp >= before, true);
  assert.equal(event.timestamp <= after, true);
});

test("subscription listener is called when an event is emitted", () => {
  const received: string[] = [];
  subscribeTelemetry((event) => {
    received.push(event.name);
  });

  emitTelemetryEvent(baseInput({ dedupeKey: "sub-1", timestamp: 1 }));
  emitTelemetryEvent(baseInput({ dedupeKey: "sub-2", timestamp: 2, questionIndex: 1 }));

  assert.deepEqual(received, ["QUESTION_PRESENTED", "QUESTION_PRESENTED"]);
});

test("unsubscribe stops the listener from receiving further events", () => {
  const received: string[] = [];
  const unsubscribe = subscribeTelemetry((event) => {
    received.push(event.name);
  });

  emitTelemetryEvent(baseInput({ dedupeKey: "unsub-1", timestamp: 1 }));
  unsubscribe();
  emitTelemetryEvent(baseInput({ dedupeKey: "unsub-2", timestamp: 2, questionIndex: 1 }));

  assert.equal(received.length, 1);
  assert.equal(received[0], "QUESTION_PRESENTED");
});

test("throwing listener does not prevent other listeners or crash emit", () => {
  const good: string[] = [];
  subscribeTelemetry(() => {
    throw new Error("boom");
  });
  subscribeTelemetry((event) => {
    good.push(event.name);
  });

  emitTelemetryEvent(baseInput({ dedupeKey: "throw-1", timestamp: 1 }));

  assert.equal(good.length, 1);
  assert.equal(__getTelemetryQueueSnapshotForTests().length, 1);
});
