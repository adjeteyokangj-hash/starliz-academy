import test from "node:test";
import assert from "node:assert/strict";

import { resolveHomeworkSurfaceAccess } from "../src/lib/homework-phase1b/contracts";
import { createGeneratedBatchState, saveDraftAnswer, submitHomework, applyAdminHomeworkAction } from "../src/lib/homework-phase1a/stateTransitions";
import { evaluateHomeworkSessionGate } from "../src/lib/homework-phase1a/gate";

test("feature flag off = no behaviour change", () => {
  const result = resolveHomeworkSurfaceAccess({
    featureEnabled: false,
    surface: "new_learning_session",
    gate: null,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.code, "FEATURE_DISABLED");
});

test("pending homework blocks next new session", () => {
  const state = {
    ...createGeneratedBatchState(["q1"]),
    status: "IN_PROGRESS" as const,
    frozenAtIso: new Date().toISOString(),
  };

  const gate = evaluateHomeworkSessionGate(state);
  const result = resolveHomeworkSurfaceAccess({
    featureEnabled: true,
    surface: "new_learning_session",
    gate,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "HOMEWORK_GATE_BLOCKED");
});

test("completed/excused/overridden homework unlocks session", () => {
  for (const status of ["COMPLETED", "EXCUSED", "OVERRIDDEN"] as const) {
    const gate = evaluateHomeworkSessionGate({
      ...createGeneratedBatchState(["q1"]),
      status,
    });

    const result = resolveHomeworkSurfaceAccess({
      featureEnabled: true,
      surface: "new_learning_session",
      gate,
    });

    assert.equal(result.allowed, true);
    assert.equal(result.statusCode, 200);
  }
});

test("draft save does not mark homework", () => {
  const draft = saveDraftAnswer(createGeneratedBatchState(["q1", "q2"]), "q1", new Date());

  assert.equal(draft.marked, false);
  assert.equal(draft.state.scorePercent, null);
  assert.equal(draft.state.status, "IN_PROGRESS");
});

test("submit requires all required answers", () => {
  const draft = saveDraftAnswer(createGeneratedBatchState(["q1", "q2"]), "q1", new Date());
  const result = submitHomework(draft.state, new Date());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /required/i);
  }
});

test("override requires reason", () => {
  const result = applyAdminHomeworkAction(createGeneratedBatchState(["q1"]), new Date(), "override", "");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /reason/i);
  }
});

test("support surfaces remain allowed", () => {
  const pendingGate = evaluateHomeworkSessionGate({
    ...createGeneratedBatchState(["q1"]),
    status: "SUBMITTED",
    submittedAtIso: new Date().toISOString(),
  });

  for (const surface of pendingGate.allowedSurfaces) {
    const result = resolveHomeworkSurfaceAccess({
      featureEnabled: true,
      surface,
      gate: pendingGate,
    });

    assert.equal(result.allowed, true, `${surface} should remain allowed`);
    assert.equal(result.statusCode, 200);
  }
});

test("new learning session gate behaves differently from support surfaces", () => {
  const pendingGate = evaluateHomeworkSessionGate({
    ...createGeneratedBatchState(["q1"]),
    status: "GENERATED",
  });

  const blockedJourney = resolveHomeworkSurfaceAccess({
    featureEnabled: true,
    surface: "new_learning_session",
    gate: pendingGate,
  });
  const allowedHomework = resolveHomeworkSurfaceAccess({
    featureEnabled: true,
    surface: "homework",
    gate: pendingGate,
  });

  assert.equal(blockedJourney.allowed, false);
  assert.equal(blockedJourney.statusCode, 409);
  assert.equal(allowedHomework.allowed, true);
  assert.equal(allowedHomework.statusCode, 200);
});