import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyHumanSupportCounts,
  humanSupportCountsFromCohort,
  parentSafeFocusLabel,
  sanitizeFocusTopicsFromSkills,
  sanitizeSignalsForAudience,
  summarizeAttendanceMarks,
} from "../src/lib/progress-reporting";
import type { MisconceptionCohortSummary, MisconceptionSignal } from "../src/lib/misconception-analytics/types";

test("parentSafeFocusLabel never includes raw free text", () => {
  assert.equal(
    parentSafeFocusLabel("math", "fractions"),
    "Needs more practice: fractions (math)",
  );
});

test("sanitizeFocusTopicsFromSkills strips sampleText and opaque tutor keys for parents", () => {
  const topics = sanitizeFocusTopicsFromSkills(
    [
      {
        subject: "math",
        skillFocus: "fractions",
        signalCount: 4,
        sources: ["attempt_pattern", "ai_help"],
        sampleText: "Adds numerators and denominators separately — secret teacher note",
      },
      {
        subject: "math",
        skillFocus: "dts:period:asg:q1:conv",
        signalCount: 9,
        sources: ["ai_help"],
        sampleText: "should be hidden",
      },
      {
        subject: "math",
        skillFocus: "teacher-only",
        signalCount: 2,
        sources: ["human_notes", "unresolved_report"],
        sampleText: "private unresolved detail",
      },
    ],
    "parent",
    8,
  );

  assert.equal(topics.length, 1);
  assert.equal(topics[0].skillFocus, "fractions");
  assert.match(topics[0].label, /Needs more practice/);
  assert.ok(!topics[0].label.includes("secret"));
  assert.ok(!topics[0].label.includes("private"));
});

test("sanitizeSignalsForAudience redacts parent-blocked sources and staff free text", () => {
  const signals: MisconceptionSignal[] = [
    {
      studentId: "s1",
      subject: "math",
      skillFocus: "fractions",
      source: "attempt_pattern",
      text: "ok pattern",
      code: "a",
      confidence: 0.6,
      evidenceRefs: [{ kind: "attempt", id: "a1" }],
      detectedAt: "2026-07-24T12:00:00.000Z",
    },
    {
      studentId: "s1",
      subject: "math",
      skillFocus: "fractions",
      source: "human_notes",
      text: "Treats fractions as whole numbers",
      code: "h",
      confidence: 0.9,
      evidenceRefs: [{ kind: "human_support_session", id: "sess-1" }],
      detectedAt: "2026-07-24T12:00:00.000Z",
    },
  ];

  const parentSignals = sanitizeSignalsForAudience(signals, "parent");
  assert.equal(parentSignals.length, 1);
  assert.equal(parentSignals[0].source, "attempt_pattern");
  assert.equal(parentSignals[0].text, null);

  const teacherSignals = sanitizeSignalsForAudience(signals, "teacher");
  assert.equal(teacherSignals.length, 2);
  const human = teacherSignals.find((row) => row.source === "human_notes");
  assert.ok(human);
  assert.equal(human?.text, null);
  assert.equal((human?.metadata as { textRedacted?: boolean } | undefined)?.textRedacted, true);
});

test("summarizeAttendanceMarks never exposes notes and computes rates", () => {
  const summary = summarizeAttendanceMarks(
    ["present", "present", "late", "absent", "not_recorded"],
    30,
    true,
  );
  assert.equal(summary.linkedToSchool, true);
  assert.equal(summary.recordedMarks, 4);
  assert.equal(summary.counts.present, 2);
  assert.equal(summary.counts.late, 1);
  assert.equal(summary.presentRatePct, 75);
  assert.equal(summary.absentRatePct, 25);
  assert.ok(!("note" in summary));
});

test("humanSupportCountsFromCohort counts outcomes without prose", () => {
  const cohort: MisconceptionCohortSummary = {
    version: 1,
    generatedAt: "2026-07-24T12:00:00.000Z",
    schoolId: "school-1",
    windowDays: 30,
    studentCount: 1,
    totalSignals: 0,
    bySource: [],
    topSkills: [],
    students: [],
    humanOutcomeLinks: [
      {
        sessionId: "1",
        studentId: "s1",
        outcome: "partially_resolved",
        outcomeLabel: "Needs monitoring",
        misconception: "should not appear in counts object",
        remainingDifficulty: "secret",
        endedAt: null,
      },
      {
        sessionId: "2",
        studentId: "s1",
        outcome: "resolved",
        outcomeLabel: "Resolved",
        misconception: null,
        remainingDifficulty: null,
        endedAt: null,
      },
    ],
  };

  const counts = humanSupportCountsFromCohort(cohort, "s1");
  assert.equal(counts.needsMonitoring, 1);
  assert.equal(counts.resolved, 1);
  assert.equal(counts.total, 2);
  assert.deepEqual(emptyHumanSupportCounts().total, 0);
});
