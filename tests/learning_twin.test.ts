import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import { buildLearningTwinProfile } from "../src/lib/academic-intelligence/learningTwin";
import type { AcademicSourceData, CatchUpTaskRecord } from "../src/lib/academic-intelligence/types";

function baseSource(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId: "student-1",
    yearGroup: "Year 6",
    keyStage: "KS2",
    examBoard: null,
    assignments: [],
    attempts: [],
    weakAreas: [],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function catchUpTask(overrides: Partial<CatchUpTaskRecord> = {}): CatchUpTaskRecord {
  return {
    taskId: "task-1",
    studentId: "student-1",
    recommendationId: "rec-1",
    title: "Guided practice",
    subject: "math",
    topic: "Fractions",
    skill: "fractions",
    status: "completed",
    priority: "medium",
    estimatedMinutes: 15,
    dueDate: null,
    scheduledDay: null,
    routeTarget: "/student/dashboard",
    sourceTrigger: "low_attempt_score",
    note: null,
    metadata: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("safe default profile is returned when little data exists", () => {
  const profile = buildLearningTwinProfile({ source: baseSource() });
  assert.equal(profile.hasEnoughData, false);
  assert.equal(profile.defaultsApplied, true);
  assert.equal(profile.subtitle, "How I Learn Best");
});

test("coach-guided support is identified when coach usage is high", () => {
  const profile = buildLearningTwinProfile({
    source: baseSource({
      attempts: Array.from({ length: 8 }).map((_, index) => ({
        id: `attempt-${index}`,
        subject: "reading",
        topic: "Comprehension",
        skill: "comprehension",
        correct: index % 2 === 0,
        hintsUsed: 2,
        createdAt: new Date().toISOString(),
        score: index % 2 === 0 ? 100 : 0,
      })),
      coachUsage: Array.from({ length: 10 }).map((_, index) => ({
        id: `coach-${index}`,
        subject: "reading",
        topic: "Comprehension",
        skill: "comprehension",
        mode: "coach_hint",
        hintLevel: 2,
        createdAt: new Date().toISOString(),
      })),
      progressRecords: [{
        id: "progress-1",
        subject: "reading",
        topic: "Comprehension",
        skill: "comprehension",
        activityType: "guided_practice",
        activityName: "Guided reading",
        completed: true,
        correct: true,
        accuracy: 80,
        score: 80,
        createdAt: new Date().toISOString(),
      }],
    }),
  });

  assert.equal(profile.hasEnoughData, true);
  assert.ok(profile.explanationDNA.coachSupportSignal === "helpful" || profile.explanationDNA.coachSupportSignal === "active");
  assert.ok(profile.insights.some((insight) => insight.key === "coach_support" && /coach hints|coach support/i.test(insight.text)));
});

test("practice-first support is identified when catch-up or practice activity exists", () => {
  const profile = buildLearningTwinProfile({
    source: baseSource({
      attempts: Array.from({ length: 6 }).map((_, index) => ({
        id: `attempt-${index}`,
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        correct: true,
        hintsUsed: 1,
        createdAt: new Date().toISOString(),
        score: 90,
      })),
      progressRecords: [
        {
          id: "progress-1",
          subject: "math",
          topic: "Fractions",
          skill: "fractions",
          activityType: "practice_session",
          activityName: "Fractions practice",
          completed: true,
          correct: true,
          accuracy: 90,
          score: 90,
          createdAt: new Date().toISOString(),
        },
      ],
    }),
    catchUpTasks: [catchUpTask()],
  });

  assert.equal(profile.hasEnoughData, true);
  assert.equal(profile.explanationDNA.learningPacePattern, "practice_first");
  assert.ok(profile.insights.some((insight) => insight.key === "todays_approach"));
});

test("learning twin wording stays child-friendly", () => {
  const profile = buildLearningTwinProfile({
    source: baseSource({
      attempts: Array.from({ length: 7 }).map((_, index) => ({
        id: `attempt-${index}`,
        subject: "lesson",
        topic: "General",
        skill: "general",
        correct: index > 2,
        hintsUsed: 1,
        createdAt: new Date().toISOString(),
        score: index > 2 ? 100 : 0,
      })),
      progressRecords: [
        {
          id: "progress-1",
          subject: "lesson",
          topic: "General",
          skill: "general",
          activityType: "lesson_practice",
          activityName: "Lesson practice",
          completed: true,
          correct: true,
          accuracy: 75,
          score: 75,
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  });

  const textBlob = profile.insights.map((item) => item.text.toLowerCase()).join(" ");
  for (const forbidden of ["failed", "weak child", "poor", "behind", "dropped", "struggling"]) {
    assert.equal(textBlob.includes(forbidden), false, `Found forbidden wording: ${forbidden}`);
  }
});

test("no schema change is required for phase 1 learning twin", () => {
  const output = buildAcademicIntelligence(baseSource({
    attempts: [{
      id: "attempt-1",
      subject: "reading",
      topic: "Inference",
      skill: "inference",
      correct: true,
      hintsUsed: 0,
      createdAt: new Date().toISOString(),
      score: 100,
    }],
  }));

  assert.equal(typeof output.learningTwin.title, "string");
  assert.equal(output.learningTwin.subtitle, "How I Learn Best");
});
