import test from "node:test";
import assert from "node:assert/strict";

import { buildAcademicIntelligence, toStudentSafeAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import type { AcademicSourceData, SchoolWeekSettings } from "../src/lib/academic-intelligence/types";

function sourceWithSettings(settings?: Partial<SchoolWeekSettings>): AcademicSourceData {
  return {
    studentId: "student-swm-1",
    studentName: "Learner",
    yearGroup: "Year 9",
    keyStage: "KS3",
    examBoard: null,
    assignments: [],
    attempts: [
      {
        id: "attempt-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        correct: false,
        hintsUsed: 2,
        createdAt: new Date().toISOString(),
        score: 28,
      },
      {
        id: "attempt-2",
        subject: "english",
        topic: "Inference",
        skill: "inference",
        correct: true,
        hintsUsed: 0,
        createdAt: new Date().toISOString(),
        score: 82,
      },
    ],
    weakAreas: [
      {
        id: "weak-1",
        subject: "math",
        topic: "Fractions",
        skill: "fractions",
        status: "active",
        lastDetectedAt: new Date().toISOString(),
      },
    ],
    studentSkills: [],
    coachUsage: [],
    dictionarySignals: [],
    progressRecords: [],
    assessmentHistory: [],
    schoolWeekSettings: {
      enabled: true,
      activeDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      startTime: "16:00",
      endTime: "19:00",
      lessonBlockMinutes: 35,
      shortBreakMinutes: 10,
      lunchMinutes: 30,
      dailySubjectLimit: 2,
      weeklySubjectSelection: [],
      includeCatchUpTasks: true,
      includeRevisionBlocks: true,
      includeHomeworkBlock: true,
      includeQuizReviewBlock: true,
      includeWellbeingBlock: false,
      includeEndOfDaySummary: true,
      parentAdminNotes: "Adults only note",
      ...settings,
    },
    generatedAt: new Date().toISOString(),
  };
}

test("school week mode respects disabled setting", () => {
  const output = buildAcademicIntelligence(sourceWithSettings({ enabled: false }));
  assert.equal(output.schoolWeekModePlan.enabled, false);
  assert.ok(output.schoolWeekModePlan.dailySchedules.every((day) => day.blocks.length === 0));
});

test("school week mode only schedules active days", () => {
  const output = buildAcademicIntelligence(sourceWithSettings({ activeDays: ["Monday", "Wednesday"] }));
  const active = output.schoolWeekModePlan.dailySchedules.filter((day) => day.blocks.length > 0).map((day) => day.day);
  assert.deepEqual(active, ["Monday", "Wednesday"]);
});

test("school week mode can exclude catch-up blocks", () => {
  const output = buildAcademicIntelligence(sourceWithSettings({ includeCatchUpTasks: false }));
  const hasCatchUp = output.schoolWeekModePlan.dailySchedules.some((day) => day.blocks.some((block) => block.activityType === "catch_up"));
  assert.equal(hasCatchUp, false);
});

test("student-safe payload strips school week sensitive notes", () => {
  const output = buildAcademicIntelligence(sourceWithSettings());
  const safe = toStudentSafeAcademicIntelligence(output);
  const serialized = JSON.stringify(safe.schoolWeekModePlan);
  assert.equal(serialized.includes("parentAdminNotes"), false);
});
