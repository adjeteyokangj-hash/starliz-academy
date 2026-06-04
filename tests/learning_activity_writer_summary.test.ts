import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeLearningActivity } from "../src/lib/learning-activity/writeLearningActivity";

function makeSummaryDeps() {
  const calls = {
    attemptsCreated: 0,
    weakAreaUpserts: [] as Array<Record<string, unknown>>,
    studentSkillUpserts: [] as Array<Record<string, unknown>>,
    snapshots: [] as Array<Record<string, unknown>>,
  };

  return {
    calls,
    deps: {
      recalculateWeakAreaFromAttempts: async () => null,
      updateStudentSkills: async () => undefined,
      upsertLearningDnaProfileFromAttempt: async () => ({ childId: "student-1", nextProfileJson: "{}" }),
      writeAuditLog: async () => undefined,
      invalidateAcademicIntelligenceSnapshot: async (args: Record<string, unknown>) => {
        calls.snapshots.push(args);
      },
      prisma: {
        attempt: {
          create: async () => {
            calls.attemptsCreated += 1;
            throw new Error("session summary must not create Attempt");
          },
          findMany: async () => [],
        },
        assignment: {
          update: async () => ({}),
        },
        weakArea: {
          findUnique: async () => ({ metadataJson: null, attemptsCount: 2 }),
          update: async () => ({}),
          upsert: async (args: Record<string, unknown>) => {
            calls.weakAreaUpserts.push(args);
            return { id: `weak-${calls.weakAreaUpserts.length}` };
          },
        },
        studentSkill: {
          upsert: async (args: Record<string, unknown>) => {
            calls.studentSkillUpserts.push(args);
            return {};
          },
        },
      },
    },
  };
}

test("session summary routes lesson/spelling completion evidence through writer without creating attempts", async () => {
  const { deps, calls } = makeSummaryDeps();

  const result = await writeLearningActivity({
    kind: "session_summary",
    actorUserId: "parent-1",
    clientStudentId: "student-1",
    resolvedStudentId: "student-1",
    summary: {
      subject: "spelling",
      skillFocus: "cvc",
      assignmentId: "assignment-1",
      score: 50,
      correct: 1,
      incorrect: 1,
      attempts: 2,
      weakWords: ["cat"],
      weakSkills: ["cvc"],
      confidenceStatus: "weak",
      snapshotReason: "lesson_completed",
      intervention: null,
    },
  }, deps as never);

  assert.equal(result.attempt, null);
  assert.equal(calls.attemptsCreated, 0);
  assert.equal(calls.weakAreaUpserts.length, 1);
  assert.equal(calls.studentSkillUpserts.length, 1);
  assert.deepEqual(calls.snapshots[0], { studentId: "student-1", reason: "lesson_completed" });
});

test("maths and reading gameplay keep canonical attempt evidence before wallet reward records", () => {
  const mathPage = readFileSync(join(process.cwd(), "src/app/games/math/page.tsx"), "utf8");
  const readingPage = readFileSync(join(process.cwd(), "src/app/games/reading/page.tsx"), "utf8");

  for (const [label, source] of [["math", mathPage], ["reading", readingPage]] as const) {
    const attemptIndex = source.indexOf("syncAttemptToServer");
    const rewardIndex = source.indexOf("awardChildRewards");
    assert.notEqual(attemptIndex, -1, `${label} gameplay must send canonical attempts`);
    assert.notEqual(rewardIndex, -1, `${label} gameplay must keep rewards working`);
    assert.ok(attemptIndex < rewardIndex, `${label} gameplay should record learning evidence before wallet rewards`);
  }
});
