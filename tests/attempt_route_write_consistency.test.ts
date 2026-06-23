import test from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { handleAttemptPost } from "../src/app/api/attempts.handler";

function attemptRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://starliz.test/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: "client-student",
      subject: "spelling",
      skillFocus: "cvc",
      assignmentId: "assignment-1",
      questionText: "cat",
      answerGiven: "kat",
      correctAnswer: "cat",
      correct: false,
      responseTimeMs: 1200,
      hintsUsed: 1,
      difficulty: 1,
      ...overrides,
    }),
  });
}

function makeDeps(input: {
  session?: null | { userId: string; email: string; role: "parent" };
  requestedStudentId?: string;
  resolvedStudentId?: string;
  assignment?: null | {
    id: string;
    studentId: string;
    status: string;
    contentId: string;
    content: { contentType: string; contentJson: string };
  };
} = {}) {
  const calls = {
    attemptsCreated: [] as Array<Record<string, unknown>>,
    weakAreaFindUnique: [] as Array<Record<string, unknown>>,
    weakAreaUpdate: [] as Array<Record<string, unknown>>,
    recalculatedWeakAreas: [] as Array<Record<string, unknown>>,
    invalidatedSnapshots: [] as Array<Record<string, unknown>>,
    skillsUpdated: [] as Array<Record<string, unknown>>,
    learningDna: [] as Array<Record<string, unknown>>,
    assignmentUpdates: [] as Array<Record<string, unknown>>,
  };
  const resolvedStudentId = input.resolvedStudentId ?? "resolved-student";
  const assignment = input.assignment === undefined
    ? {
        id: "assignment-1",
        studentId: resolvedStudentId,
        status: "assigned",
        contentId: "content-1",
        content: { contentType: "spelling", contentJson: JSON.stringify([{ word: "cat" }]) },
      }
    : input.assignment;

  return {
    calls,
    deps: {
      requireSession: async () => {
        if (input.session === null) {
          return {
            session: null,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          };
        }
        return {
          session: input.session ?? { userId: "parent-user", email: "parent@starliz.test", role: "parent" as const },
          response: null,
        };
      },
      resolveParentScope: async () => ({ parentId: "parent-user", source: "session" as const }),
      checkSubscriptionAccess: async () => ({ allowed: true, hasPaidSubscription: true, reason: null, status: "active" }),
      getTrialSessionLimit: () => 10,
      resolveAttemptStudentIdentity: async () => ({ resolvedStudentId, assignment }),
      recalculateWeakAreaFromAttempts: async (args: Record<string, unknown>) => {
        calls.recalculatedWeakAreas.push(args);
        return { id: "weak-area-1", studentId: args.studentId };
      },
      updateStudentSkills: async (args: Record<string, unknown>) => {
        calls.skillsUpdated.push(args);
      },
      upsertLearningDnaProfileFromAttempt: async (_db: unknown, childId: string, signal: Record<string, unknown>) => {
        calls.learningDna.push({ childId, ...signal });
        return { childId, nextProfileJson: "{}" };
      },
      invalidateAcademicIntelligenceSnapshot: async (args: Record<string, unknown>) => {
        calls.invalidatedSnapshots.push(args);
      },
      writeAuditLog: async () => undefined,
      prisma: {
        user: {
          findUnique: async () => ({ trialSessionsUsed: 0 }),
        },
        childProfile: {
          findFirst: async ({ where }: { where: { id: string; parentId: string } }) =>
            where.id === resolvedStudentId && where.parentId === "parent-user" ? { id: resolvedStudentId } : null,
        },
        attempt: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            calls.attemptsCreated.push(data);
            return { id: "attempt-1", ...data };
          },
          findMany: async () => [
            { questionText: "cat", answerGiven: "kat", correctAnswer: "cat" },
          ],
        },
        assignment: {
          update: async (args: Record<string, unknown>) => {
            calls.assignmentUpdates.push(args);
            return {};
          },
        },
        weakArea: {
          findUnique: async (args: Record<string, unknown>) => {
            calls.weakAreaFindUnique.push(args);
            return { metadataJson: null };
          },
          update: async (args: Record<string, unknown>) => {
            calls.weakAreaUpdate.push(args);
            return {};
          },
        },
      },
    },
  };
}

test("assigned gameplay uses resolved student id for attempts, weak-area metadata, and snapshot invalidation", async () => {
  const { deps, calls } = makeDeps({ resolvedStudentId: "assignment-student" });

  const response = await handleAttemptPost(attemptRequest({ studentId: "spoofed-client-student" }), deps as never);
  const payload = await response.json() as { studentResolution?: { resolvedStudentId?: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.studentResolution?.resolvedStudentId, "assignment-student");
  assert.equal(calls.attemptsCreated[0].studentId, "assignment-student");
  assert.equal(calls.recalculatedWeakAreas[0].studentId, "assignment-student");
  assert.deepEqual(calls.skillsUpdated[0], { studentId: "assignment-student", skills: ["cvc"], isCorrect: false });
  assert.deepEqual(calls.learningDna[0], {
    childId: "assignment-student",
    subject: "spelling",
    skillFocus: "cvc",
    correct: false,
    responseTimeMs: 1200,
    hintsUsed: 1,
    difficulty: 1,
    errorType: undefined,
  });
  assert.equal(
    (calls.weakAreaFindUnique[0].where as { studentId_subject_skillFocus: { studentId: string } }).studentId_subject_skillFocus.studentId,
    "assignment-student",
  );
  assert.equal(
    (calls.weakAreaUpdate[0].where as { studentId_subject_skillFocus: { studentId: string } }).studentId_subject_skillFocus.studentId,
    "assignment-student",
  );
  assert.deepEqual(calls.invalidatedSnapshots[0], { studentId: "assignment-student", reason: "lesson_completed" });
});

test("parent-created or admin-created student attempts record against requested canonical student when no assignment resolves", async () => {
  const { deps, calls } = makeDeps({ resolvedStudentId: "direct-student", assignment: null });

  const response = await handleAttemptPost(attemptRequest({
    studentId: "direct-student",
    assignmentId: undefined,
    correct: true,
  }), deps as never);

  assert.equal(response.status, 201);
  assert.equal(calls.attemptsCreated[0].studentId, "direct-student");
  assert.equal(calls.weakAreaUpdate.length, 0);
  assert.deepEqual(calls.invalidatedSnapshots[0], { studentId: "direct-student", reason: "quiz_or_test_completed" });
});

test("unauthenticated attempts fail before creating attempts or completion signals", async () => {
  const { deps, calls } = makeDeps({ session: null });

  const response = await handleAttemptPost(attemptRequest(), deps as never);
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 401);
  assert.equal(payload.error, "Unauthorized");
  assert.equal(calls.attemptsCreated.length, 0);
  assert.equal(calls.assignmentUpdates.length, 0);
  assert.equal(calls.invalidatedSnapshots.length, 0);
});

test("idempotency key is accepted but identical practice still creates an attempt without a stored marker", async () => {
  const { deps, calls } = makeDeps({ resolvedStudentId: "assignment-student" });

  const response = await handleAttemptPost(attemptRequest({
    studentId: "spoofed-client-student",
    idempotencyKey: "attempt-key-1",
  }), deps as never);
  const payload = await response.json() as { attempt?: { id?: string } };

  assert.equal(response.status, 201);
  assert.equal(payload.attempt?.id, "attempt-1");
  assert.equal(calls.attemptsCreated.length, 1);
  assert.equal(calls.recalculatedWeakAreas.length, 1);
  assert.equal(calls.skillsUpdated.length, 1);
  assert.equal(calls.learningDna.length, 1);
  assert.equal(calls.invalidatedSnapshots.length, 1);
});

test("assigned attempts bypass subscription trial lock when the assignment is still playable", async () => {
  const { deps, calls } = makeDeps({
    resolvedStudentId: "assignment-student",
    assignment: {
      id: "assignment-1",
      studentId: "assignment-student",
      status: "assigned",
      contentId: "content-1",
      content: { contentType: "spelling", contentJson: JSON.stringify([{ word: "cat" }]) },
    },
  });

  const lockedDeps = {
    ...deps,
    checkSubscriptionAccess: async () => ({ allowed: false, hasPaidSubscription: false, reason: "TRIAL_LIMIT_REACHED", status: "active" }),
    getTrialSessionLimit: () => 3,
    prisma: {
      ...deps.prisma,
      user: {
        findUnique: async () => ({ trialSessionsUsed: 3 }),
      },
    },
  };

  const response = await handleAttemptPost(attemptRequest(), lockedDeps as never);

  assert.equal(response.status, 201);
  assert.equal(calls.attemptsCreated.length, 1);
});
