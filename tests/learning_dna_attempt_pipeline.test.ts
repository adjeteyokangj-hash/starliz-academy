import test from "node:test";
import assert from "node:assert/strict";
import { resolveAttemptStudentIdentity, upsertLearningDnaProfileFromAttempt } from "../src/lib/attempts/learning_dna_pipeline";

test("attempt pipeline resolves assignment-owned child and updates that profile only", async () => {
  const createdProfiles: Array<Record<string, unknown>> = [];
  const updatedProfiles: Array<Record<string, unknown>> = [];

  const prismaMock = {
    assignment: {
      findFirst: async () => ({
        id: "assignment-1",
        studentId: "child-a",
        status: "assigned",
        contentId: "content-1",
        content: {
          contentType: "math",
          contentJson: JSON.stringify([{ prompt: "2x + 4 = 12", answer: 4 }]),
        },
      }),
    },
    studentProfile: {
      findUnique: async ({ where }: { where: { childId: string } }) => (
        where.childId === "child-a" ? null : { id: "profile-b", aiLearningProfileJson: null }
      ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdProfiles.push(data);
        return { id: "profile-a", ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updatedProfiles.push(data);
        return { id: "profile-a", ...data };
      },
    },
  };

  const identity = await resolveAttemptStudentIdentity(prismaMock, {
    assignmentId: "assignment-1",
    requestedStudentId: "child-b",
    parentId: "parent-1",
  });
  assert.equal(identity.resolvedStudentId, "child-a");
  assert.equal(identity.assignment?.studentId, "child-a");

  const result = await upsertLearningDnaProfileFromAttempt(prismaMock, identity.resolvedStudentId, {
    subject: "math",
    skillFocus: "Solving equations",
    correct: true,
    responseTimeMs: 12000,
    hintsUsed: 1,
    difficulty: 2,
  });

  assert.equal(result.childId, "child-a");
  assert.equal(createdProfiles[0]?.childId, "child-a");
  assert.equal(createdProfiles.some((entry) => entry.childId === "child-b"), false);
  assert.equal(updatedProfiles.length, 0);

  const profileJson = createdProfiles[0]?.aiLearningProfileJson;
  assert.equal(typeof profileJson, "string");
  const parsed = JSON.parse(String(profileJson)) as { learningDna?: { totalAttempts?: number; subjectStates?: { math?: { attempts?: number } } } };
  assert.equal(parsed.learningDna?.totalAttempts, 1);
  assert.equal(parsed.learningDna?.subjectStates?.math?.attempts, 1);
});
