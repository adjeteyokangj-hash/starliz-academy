import test from "node:test";
import assert from "node:assert/strict";

import { buildAnalyticsRebuildPlan } from "../src/lib/analytics-rebuild";

const now = new Date("2026-06-04T12:00:00.000Z");

function attempt(overrides: Partial<Parameters<typeof buildAnalyticsRebuildPlan>[0]["attempts"][number]> = {}) {
  return {
    id: "attempt-1",
    studentId: "student-1",
    subject: "spelling",
    keyStage: "KS1",
    yearGroup: "Year 2",
    skillFocus: "Silent e",
    contentId: "content-1",
    assignmentId: null,
    questionText: "cake",
    correctAnswer: "cake",
    answerGiven: "cake",
    correct: true,
    responseTimeMs: 3000,
    hintsUsed: 0,
    difficulty: 2,
    skills: "silent_e",
    createdAt: now,
    ...overrides,
  };
}

function plan(overrides: Partial<Parameters<typeof buildAnalyticsRebuildPlan>[0]> = {}) {
  return buildAnalyticsRebuildPlan({
    mode: "dry-run",
    generatedAt: now,
    studentIds: ["student-1"],
    attempts: [
      attempt({ id: "attempt-1", correct: false, answerGiven: "cak", createdAt: new Date("2026-06-04T10:00:00.000Z") }),
      attempt({ id: "attempt-2", correct: true, answerGiven: "cake", createdAt: new Date("2026-06-04T11:00:00.000Z") }),
    ],
    existingWeakAreas: [],
    existingStudentSkills: [],
    existingProfiles: [],
    assignments: [],
    homeworkTablesAvailable: true,
    ...overrides,
  });
}

test("dry-run rebuild plan reports changes without requiring writes", () => {
  const result = plan({ mode: "dry-run" });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.weakAreas.length, 1);
  assert.equal(result.studentSkills.length, 1);
  assert.equal(result.learningDna.length, 1);
  assert.equal(result.academicSnapshots.length, 1);
  assert.equal(result.learningDna[0]?.afterTotalAttempts, 2);
});

test("apply mode is available and updates only expected records in plan", () => {
  const result = plan({ mode: "apply" });

  assert.equal(result.mode, "apply");
  assert.deepEqual(result.weakAreas.map((row) => row.studentId), ["student-1"]);
  assert.deepEqual(result.studentSkills.map((row) => row.skill), ["silent_e"]);
});

test("running rebuild twice is replay-safe when records already match", () => {
  const first = plan();
  const weakArea = first.weakAreas[0];
  const skill = first.studentSkills[0];
  assert.ok(weakArea);
  assert.ok(skill);

  const second = plan({
    existingWeakAreas: [{
      id: "weak-1",
      studentId: weakArea.studentId,
      subject: weakArea.subject,
      keyStage: weakArea.keyStage,
      yearGroup: weakArea.yearGroup,
      skillFocus: weakArea.skillFocus,
      accuracy: weakArea.accuracy,
      attemptsCount: weakArea.attemptsCount,
      status: weakArea.status,
      weaknessType: weakArea.weaknessType,
      currentDifficulty: weakArea.currentDifficulty,
      metadataJson: weakArea.metadataJson,
    }],
    existingStudentSkills: [{
      id: "skill-1",
      studentId: skill.studentId,
      skill: skill.skill,
      attempts: skill.attempts,
      correct: skill.correct,
      accuracy: skill.accuracy,
      status: skill.status,
    }],
    existingProfiles: [{
      childId: "student-1",
      aiLearningProfileJson: first.learningDna[0]?.nextProfileJson ?? null,
    }],
  });

  assert.equal(second.weakAreas.length, 0);
  assert.equal(second.studentSkills.length, 0);
  assert.equal(second.learningDna.length, 0);
});

test("weak-area diff detects metadata, difficulty, type, and stage/year changes", () => {
  const base = plan();
  const target = base.weakAreas[0];
  assert.ok(target);

  const result = plan({
    existingWeakAreas: [{
      id: "weak-diff",
      studentId: target.studentId,
      subject: target.subject,
      keyStage: "KS0",
      yearGroup: "Year 0",
      skillFocus: target.skillFocus,
      accuracy: target.accuracy,
      attemptsCount: target.attemptsCount,
      status: target.status,
      weaknessType: "improving",
      currentDifficulty: 5,
      metadataJson: "{\"rebuiltFrom\":\"different\"}",
    }],
  });

  assert.equal(result.weakAreas.length, 1);
});

test("assignment completion is only planned when linked attempts prove completion", () => {
  const result = plan({
    attempts: [
      attempt({ id: "attempt-cake", assignmentId: "assignment-1", questionText: "cake", correctAnswer: "cake", correct: true }),
      attempt({ id: "attempt-make", assignmentId: "assignment-1", questionText: "make", correctAnswer: "make", correct: true }),
    ],
    assignments: [{
      id: "assignment-1",
      studentId: "student-1",
      contentId: "content-1",
      status: "in_progress",
      completedAt: null,
      content: {
        contentType: "spelling",
        contentJson: JSON.stringify([{ word: "cake" }, { word: "make" }]),
      },
    }],
  });

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0]?.toStatus, "completed");
});

test("incomplete assignment evidence is not fabricated into completion", () => {
  const result = plan({
    attempts: [
      attempt({ id: "attempt-cake", assignmentId: "assignment-1", questionText: "cake", correctAnswer: "cake", correct: true }),
    ],
    assignments: [{
      id: "assignment-1",
      studentId: "student-1",
      contentId: "content-1",
      status: "in_progress",
      completedAt: null,
      content: {
        contentType: "spelling",
        contentJson: JSON.stringify([{ word: "cake" }, { word: "make" }]),
      },
    }],
  });

  assert.equal(result.assignments.length, 0);
});

test("assignment with unparseable contentJson is not auto-completed and is marked for review", () => {
  const result = plan({
    attempts: [
      attempt({ id: "attempt-1", assignmentId: "assignment-1", correct: true }),
    ],
    assignments: [{
      id: "assignment-1",
      studentId: "student-1",
      contentId: "content-1",
      status: "in_progress",
      completedAt: null,
      content: {
        contentType: "spelling",
        contentJson: "{not-json",
      },
    }],
  });

  assert.equal(result.assignments.length, 0);
  assert.equal(result.assignmentsNeedsReview.length, 1);
  assert.equal(result.assignmentsNeedsReview[0]?.reason, "unparseable_content_json");
});

test("learning DNA rebuild preserves existing academic snapshot keys", () => {
  const existingProfile = {
    childId: "student-1",
    aiLearningProfileJson: JSON.stringify({
      academicIntelligenceSnapshot: { lastCalculatedAt: "2026-06-04T11:00:00.000Z", marker: "keep-me" },
      academicIntelligenceSnapshotRefreshReason: "manual_refresh",
      learningDna: { totalAttempts: 99 },
      keepOther: { safe: true },
    }),
  };

  const result = plan({ existingProfiles: [existingProfile] });
  const rebuilt = result.learningDna[0]?.nextProfileJson;
  assert.ok(rebuilt);
  const parsed = JSON.parse(rebuilt) as Record<string, unknown>;
  assert.ok(parsed.academicIntelligenceSnapshot);
  assert.equal((parsed.academicIntelligenceSnapshot as { marker?: string }).marker, "keep-me");
  assert.equal((parsed.keepOther as { safe?: boolean }).safe, true);
});

test("apply mode rejects incomplete evidence", () => {
  assert.throws(() =>
    buildAnalyticsRebuildPlan({
      mode: "apply",
      generatedAt: now,
      studentIds: ["student-1"],
      attempts: [attempt()],
      existingWeakAreas: [],
      existingStudentSkills: [],
      existingProfiles: [],
      assignments: [],
      homeworkTablesAvailable: true,
      evidenceComplete: false,
      evidenceNote: "partial evidence for test",
    }),
  );
});

test("snapshots are marked for fresh rebuild after evidence", () => {
  const result = plan();

  assert.deepEqual(result.academicSnapshots, [{
    studentId: "student-1",
    reason: "manual_refresh",
    wouldRefresh: true,
  }]);
});

test("missing homework tables are skipped safely", () => {
  const result = plan({ homeworkTablesAvailable: false });

  assert.equal(result.homeworkBackfill.available, false);
  assert.match(result.homeworkBackfill.note.toLowerCase(), /skipped safely/);
});
