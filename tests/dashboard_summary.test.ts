import test from "node:test";
import assert from "node:assert/strict";
import { buildAssignedWorkSummary, buildSmartCoachSummary } from "../src/lib/student-dashboard-summary";

test("dashboard summary chooses active assigned work as the next first-render activity", () => {
  const summary = buildAssignedWorkSummary([
    { id: "done", status: "completed", subject: "maths", title: "Completed maths", href: "/games/math?assignmentId=done" },
    { id: "next", status: "assigned", subject: "reading", title: "Reading inference", href: "/games/reading?assignmentId=next" },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.active, 1);
  assert.equal(summary.completed, 1);
  assert.equal(summary.nextTitle, "Reading inference");
  assert.equal(summary.nextActivity?.assignmentId, "next");
});

test("dashboard summary falls back cleanly when no assigned work exists", () => {
  const summary = buildAssignedWorkSummary([]);

  assert.equal(summary.total, 0);
  assert.equal(summary.nextTitle, null);
  assert.equal(summary.nextActivity, null);
});

test("smart coach dashboard summary stays compact for the first render", () => {
  const pending = buildSmartCoachSummary({
    skills: [{ status: "weak" }],
    hasLearningTwinData: false,
  });
  const ready = buildSmartCoachSummary({
    skills: [{ status: "mastered" }],
    hasLearningTwinData: true,
    bestExplanationStyle: "visual_examples",
  });

  assert.equal(pending.status, "pending");
  assert.match(pending.headline, /still learning/);
  assert.equal(ready.status, "ready");
  assert.equal(ready.masteredCount, 1);
});
