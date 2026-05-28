import test from "node:test";
import assert from "node:assert/strict";

import { parseQuickLevelFinderBaselineDiagnostic } from "../src/lib/academic-intelligence/quickLevelFinderBaseline";
import { buildAcademicIntelligence } from "../src/lib/academic-intelligence/academicIntelligence";
import { buildMasteryMap } from "../src/lib/academic-intelligence/masteryMap";
import type { AcademicSourceData } from "../src/lib/academic-intelligence/types";

function baseSource(overrides: Partial<AcademicSourceData> = {}): AcademicSourceData {
  return {
    studentId: "student-baseline-1",
    studentName: "Student Baseline",
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

function completedQuickLevelFinderProfile(): string {
  return JSON.stringify({
    quickLevelFinder: {
      status: "completed",
      completedAt: "2026-01-12T10:00:00.000Z",
      levels: {
        maths: { accuracy: 64, level: "secure" },
        english: { accuracy: 58, level: "below" },
        "english:reading": { accuracy: 72, level: "secure" },
        "english:spelling": { accuracy: 49, level: "below" },
      },
      questions: [
        {
          yearGroup: "Year 6",
          keyStage: "KS2",
        },
      ],
    },
  });
}

test("parser extracts completed QLF baseline with parent and english strand scores", () => {
  const parsed = parseQuickLevelFinderBaselineDiagnostic(completedQuickLevelFinderProfile());

  assert.ok(parsed);
  assert.equal(parsed?.confidenceLabel, "baseline_placement_signal");
  assert.equal(parsed?.parentSubjectScores.length, 2);
  assert.deepEqual(parsed?.parentSubjectScores.find((item) => item.subject === "maths"), {
    subject: "maths",
    accuracy: 64,
    level: "secure",
  });
  assert.deepEqual(parsed?.englishStrandScores.find((item) => item.strand === "reading"), {
    strand: "reading",
    accuracy: 72,
    level: "secure",
  });
  assert.deepEqual(parsed?.englishStrandScores.find((item) => item.strand === "spelling"), {
    strand: "spelling",
    accuracy: 49,
    level: "below",
  });
});

test("parser returns null when quick level finder session is not completed", () => {
  const profile = JSON.stringify({
    quickLevelFinder: {
      status: "in_progress",
      levels: {
        maths: { accuracy: 60, level: "secure" },
      },
    },
  });

  const parsed = parseQuickLevelFinderBaselineDiagnostic(profile);
  assert.equal(parsed, null);
});

test("heartbeat carries baseline diagnostic signals when QLF baseline is available", () => {
  const baseline = parseQuickLevelFinderBaselineDiagnostic(completedQuickLevelFinderProfile());
  const output = buildAcademicIntelligence(baseSource({
    quickLevelFinderBaseline: baseline,
  }));

  const signals = output.curriculumIntelligenceGraph.heartbeat.baselineSignals ?? [];
  assert.ok(signals.includes("Quick Level Finder baseline available"));
  assert.ok(signals.some((entry) => entry.includes("Maths baseline diagnostic")));
  assert.ok(signals.some((entry) => entry.includes("English strand baselines detected: reading, spelling")));
  assert.ok(signals.some((entry) => entry.includes("before confirming mastery or weak areas")));
});

test("QLF baseline does not create mastery or weak-area records without attempts", () => {
  const baseline = parseQuickLevelFinderBaselineDiagnostic(completedQuickLevelFinderProfile());
  const source = baseSource({
    quickLevelFinderBaseline: baseline,
    assignments: [],
    attempts: [],
    weakAreas: [],
    progressRecords: [],
  });

  const mastery = buildMasteryMap(source);
  assert.equal(mastery.masteryMap.length, 0);

  const output = buildAcademicIntelligence(source);
  assert.equal(output.masteryMap.length, 0);
  assert.equal(output.curriculumIntelligenceGraph.heartbeat.systemStates.length, 10);
});
