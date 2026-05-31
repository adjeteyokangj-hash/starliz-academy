import test from "node:test";
import assert from "node:assert/strict";

import { applyAnswerRouteCompletionPipeline } from "../src/app/api/student/quick-level-finder/answer/route";
import type {
  QlfPostCompletionDeps,
  QlfPostCompletionInput,
} from "../src/lib/quick-level-finder-post-completion";

function baseInput(overrides: Partial<QlfPostCompletionInput> = {}): QlfPostCompletionInput {
  return {
    studentId: "student-pipeline-1",
    levels: {
      maths: { accuracy: 42, level: "below" },
      "english:reading": { accuracy: 76, level: "secure" },
    },
    yearGroup: "Year 6",
    keyStage: "KS2",
    ...overrides,
  };
}

test("answer-route completion pipeline seeds first lessons then refreshes academic intelligence", async () => {
  const callOrder: string[] = [];
  const invalidateCalls: Array<{ studentId: string; reason: "level_finder_completed" }> = [];
  const refreshCalls: Array<{ studentId: string; reason: "level_finder_completed" }> = [];
  const seedCalls: QlfPostCompletionInput[] = [];

  const deps: QlfPostCompletionDeps = {
    invalidateSnapshot: async (input) => {
      callOrder.push("invalidate");
      invalidateCalls.push(input);
    },
    refreshSnapshot: async (input) => {
      callOrder.push("refresh");
      refreshCalls.push(input);
      return null;
    },
    seedAssignments: async (input) => {
      callOrder.push("seed");
      seedCalls.push(input);
      return 3;
    },
  };

  const seededAssignmentsCount = await applyAnswerRouteCompletionPipeline(baseInput(), deps);

  assert.equal(seededAssignmentsCount, 3);
  assert.deepEqual(callOrder, ["seed", "invalidate", "refresh"]);
  assert.equal(invalidateCalls.length, 1);
  assert.equal(invalidateCalls[0]?.studentId, "student-pipeline-1");
  assert.equal(invalidateCalls[0]?.reason, "level_finder_completed");
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0]?.studentId, "student-pipeline-1");
  assert.equal(refreshCalls[0]?.reason, "level_finder_completed");

  assert.equal(seedCalls.length, 1);
  assert.equal(seedCalls[0]?.studentId, "student-pipeline-1");
  assert.equal(seedCalls[0]?.yearGroup, "Year 6");
  assert.equal(seedCalls[0]?.keyStage, "KS2");
  assert.equal(seedCalls[0]?.levels.maths.level, "below");
});
