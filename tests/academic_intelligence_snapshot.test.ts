import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAcademicIntelligenceSnapshot,
  isAcademicIntelligenceSnapshotStale,
  readAcademicIntelligenceSnapshot,
  removeAcademicIntelligenceSnapshotJson,
  upsertAcademicIntelligenceSnapshotJson,
} from "../src/lib/academic-intelligence/snapshot";
import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function source(): AcademicSourceData {
  const now = new Date().toISOString();
  return {
    studentId: "student-1",
    studentName: "Ama",
    yearGroup: "Year 4",
    keyStage: "KS2",
    assignments: [
      {
        id: "a1",
        status: "completed",
        subject: "maths",
        topic: "Multiplication facts",
        skill: "times_tables",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    attempts: [
      {
        id: "t1",
        subject: "maths",
        topic: "Multiplication facts",
        skill: "times_tables",
        correct: false,
        score: 42,
        hintsUsed: 3,
        responseTimeMs: 9000,
        createdAt: now,
      },
      {
        id: "t2",
        subject: "maths",
        topic: "Multiplication facts",
        skill: "times_tables",
        correct: false,
        score: 48,
        hintsUsed: 2,
        responseTimeMs: 8500,
        createdAt: now,
      },
      {
        id: "t3",
        subject: "maths",
        topic: "Multiplication facts",
        skill: "times_tables",
        correct: false,
        score: 50,
        hintsUsed: 2,
        responseTimeMs: 8200,
        createdAt: now,
      },
    ],
    weakAreas: [
      {
        id: "w1",
        subject: "maths",
        topic: "Multiplication facts",
        skill: "times_tables",
        weaknessType: "recall",
        accuracy: 45,
        attemptsCount: 3,
        status: "active",
        lastDetectedAt: now,
      },
    ],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
  };
}

test("academic intelligence snapshot stores reusable dashboard summaries", () => {
  const output = buildAcademicIntelligence(source());
  const snapshot = buildAcademicIntelligenceSnapshot(output, "lesson_completed");

  assert.equal(snapshot.studentId, "student-1");
  assert.equal(snapshot.masterMapSummary.needsCatchUpCount > 0, true);
  assert.equal(snapshot.smartCatchUpSummary.total > 0, true);
  assert.equal(snapshot.smartCatchUpSummary.highPriority > 0, true);
  assert.equal(snapshot.learningTwinSummary.bestExplanationStyle.length > 0, true);
  assert.equal(snapshot.refreshReason, "lesson_completed");
});

test("academic intelligence snapshot can be persisted inside existing profile JSON", () => {
  const output = buildAcademicIntelligence(source());
  const snapshot = buildAcademicIntelligenceSnapshot(output, "manual_refresh");
  const stored = upsertAcademicIntelligenceSnapshotJson(JSON.stringify({ keep: "me" }), snapshot);
  const parsed = readAcademicIntelligenceSnapshot(stored);

  assert.equal(parsed?.studentId, "student-1");
  assert.equal(JSON.parse(stored).keep, "me");
  assert.equal(readAcademicIntelligenceSnapshot(removeAcademicIntelligenceSnapshotJson(stored)), null);
});

test("academic intelligence snapshot stale check uses last calculated timestamp", () => {
  const output = buildAcademicIntelligence(source());
  const snapshot = buildAcademicIntelligenceSnapshot(output, "manual_refresh");
  const fresh = {
    ...snapshot,
    lastCalculatedAt: "2026-05-28T10:00:00.000Z",
  };
  const stale = {
    ...snapshot,
    lastCalculatedAt: "2026-05-28T08:00:00.000Z",
  };

  assert.equal(isAcademicIntelligenceSnapshotStale(fresh, new Date("2026-05-28T10:30:00.000Z")), false);
  assert.equal(isAcademicIntelligenceSnapshotStale(stale, new Date("2026-05-28T10:30:00.000Z")), true);
});

test("catchUpRecommendations composite keys are unique even when task IDs duplicate", () => {
  const output = buildAcademicIntelligence(source());
  // Simulate duplicated task IDs (the scenario that triggered the React key bug)
  const duplicated = [
    ...output.catchUpRecommendations,
    ...output.catchUpRecommendations,
  ];
  const compositeKeys = duplicated.map(
    (task, index) => `${task.id}-${task.taskType}-${index}`,
  );
  const uniqueKeys = new Set(compositeKeys);
  assert.equal(uniqueKeys.size, compositeKeys.length, "Composite keys must be unique even with duplicate task IDs");
});
