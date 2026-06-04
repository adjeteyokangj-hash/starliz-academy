import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLearningActivitySummaries,
  learningActivityTopicBuckets,
} from "../src/lib/learning-activity-aggregation";

const today = new Date("2026-06-04T09:00:00.000Z");

test("attempt-only student appears active for admin and parent reads", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-attempt"],
    attempts: [{
      id: "attempt-1",
      studentId: "student-attempt",
      subject: "spelling",
      skillFocus: "Silent e",
      correct: true,
      createdAt: "2026-06-04T08:00:00.000Z",
    }],
    today,
  });

  const summary = summaries.get("student-attempt");
  assert.equal(summary?.activeToday, true);
  assert.equal(summary?.attemptCount, 1);
  assert.equal(summary?.progressRecordCount, 0);
  assert.equal(summary?.totalEvents, 1);
  assert.equal(summary?.accuracy, 100);
});

test("ProgressRecord-only student remains visible as active history", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-progress"],
    progressRecords: [{
      id: "progress-1",
      childId: "student-progress",
      activityType: "reading",
      activityName: "Inference check",
      correct: false,
      completed: true,
      score: 40,
      accuracy: 40,
      createdAt: "2026-06-04T07:00:00.000Z",
    }],
    today,
  });

  const summary = summaries.get("student-progress");
  assert.equal(summary?.activeToday, true);
  assert.equal(summary?.attemptCount, 0);
  assert.equal(summary?.progressRecordCount, 1);
  assert.equal(summary?.accuracy, 40);
});

test("completed session appears in recent activity without duplicate counts", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-session"],
    attempts: [{
      id: "attempt-session-1",
      studentId: "student-session",
      subject: "math",
      skillFocus: "Fractions",
      correct: true,
      createdAt: "2026-06-04T10:00:00.000Z",
    }],
    progressRecords: [{
      id: "progress-session-1",
      childId: "student-session",
      activityType: "math",
      activityName: "Fractions recap",
      correct: true,
      completed: true,
      score: 90,
      accuracy: 90,
      createdAt: "2026-06-04T09:30:00.000Z",
    }],
    today,
  });

  const events = summaries.get("student-session")?.events ?? [];
  assert.deepEqual(events.map((event) => event.id), ["attempt-session-1", "progress-session-1"]);
  assert.equal(summaries.get("student-session")?.totalEvents, 2);
});

test("QLF placement appears as readiness activity without creating mastery", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-qlf"],
    profiles: [{
      studentId: "student-qlf",
      aiLearningProfileJson: JSON.stringify({
        quickLevelFinder: {
          status: "completed",
          completedAt: "2026-06-02T12:00:00.000Z",
          levels: {
            maths: { accuracy: 70, level: "secure" },
          },
        },
      }),
    }],
    today,
  });

  const summary = summaries.get("student-qlf");
  assert.equal(summary?.hasQuickLevelFinderPlacement, true);
  assert.equal(summary?.events[0]?.source, "quick_level_finder");
  assert.equal(summary?.accuracy, null);
});

test("weak-area and mastery visibility share the same activity summary", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-mastery"],
    attempts: [{
      id: "attempt-weak-1",
      studentId: "student-mastery",
      subject: "reading",
      skillFocus: "Inference",
      correct: false,
      createdAt: "2026-06-03T09:00:00.000Z",
    }],
    weakAreas: [{
      studentId: "student-mastery",
      skillFocus: "Inference",
      status: "active",
      accuracy: 35,
      attemptsCount: 4,
      lastDetectedAt: "2026-06-03T09:00:00.000Z",
    }],
    studentSkills: [{
      studentId: "student-mastery",
      skill: "Inference",
      status: "weak",
      accuracy: 35,
      attempts: 4,
      updatedAt: "2026-06-03T09:00:00.000Z",
    }],
    today,
  });

  const summary = summaries.get("student-mastery");
  assert.equal(summary?.weakAreas[0]?.skillFocus, "Inference");
  assert.equal(summary?.studentSkills[0]?.status, "weak");
  assert.equal(summary?.accuracy, 0);
});

test("parent topic buckets include attempt activity correctly", () => {
  const summaries = buildLearningActivitySummaries({
    studentIds: ["student-parent"],
    attempts: [
      {
        id: "attempt-parent-1",
        studentId: "student-parent",
        subject: "spelling",
        skillFocus: "Silent e",
        correct: false,
        createdAt: "2026-06-01T09:00:00.000Z",
      },
      {
        id: "attempt-parent-2",
        studentId: "student-parent",
        subject: "spelling",
        skillFocus: "Silent e",
        correct: true,
        createdAt: "2026-06-01T09:01:00.000Z",
      },
    ],
    today,
  });

  const buckets = learningActivityTopicBuckets(summaries.get("student-parent")?.events ?? []);
  assert.deepEqual(buckets, [{ topic: "Silent e", accuracy: 50, attempts: 2 }]);
});
