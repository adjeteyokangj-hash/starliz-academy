import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupportContextSnapshot,
  outcomeUiLabel,
  parseSessionMetadata,
  serializeSessionMetadata,
  validateUnresolvedReport,
} from "../src/lib/schools/human-support-session";

test("outcomeUiLabel maps partially_resolved to Needs monitoring", () => {
  assert.equal(outcomeUiLabel("partially_resolved"), "Needs monitoring");
  assert.equal(outcomeUiLabel("resolved"), "Resolved");
  assert.equal(outcomeUiLabel("escalated"), "Escalated");
});

test("validateUnresolvedReport enforces structured mandatory fields", () => {
  const weak = validateUnresolvedReport({ summary: "too short", whatWasTried: [], urgency: "low" });
  assert.equal(weak.ok, false);

  const empty = validateUnresolvedReport({});
  assert.equal(empty.ok, false);

  const ok = validateUnresolvedReport({
    summary: "Student still confuses place value in 3-digit numbers.",
    whatWasTried: ["Place-value chart", "Concrete counters"],
    remainingDifficulty: "Cannot explain hundreds vs tens",
    recommendedFollowUp: "Teacher small-group tomorrow on place value",
    urgency: "high",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.report.urgency, "high");
    assert.equal(ok.report.whatWasTried.length, 2);
  }
});

test("buildSupportContextSnapshot freezes accept-time fields", () => {
  const snapshot = buildSupportContextSnapshot({
    schoolId: "school_1",
    classroomId: "class_1",
    dayLessonId: "period_1",
    lessonId: "lesson_1",
    subject: "Maths",
    lessonTitle: "Place value",
    curriculumSkill: "Place value",
    periodEndsAt: "11:45",
    minutesRemainingAtAccept: 12,
    budgetMinutes: 8,
    plannedEndsAt: "2026-07-24T11:00:00.000Z",
    acceptedAt: "2026-07-24T10:52:00.000Z",
    student: {
      activeContentId: "content_1",
      activeAssignmentId: "asg_1",
      currentQuestionKey: "q4",
      aiSupportState: "exhausted",
      misconception: null,
      studentRecovered: false,
      stages: [{ contentId: "content_1", stage: "core", stageIndex: 1, completed: false }],
      attempts: [
        {
          createdAt: "2026-07-24T10:50:00.000Z",
          correct: false,
          questionText: "What is the value of 7 in 704?",
          answerGiven: "7",
          hintsUsed: 2,
        },
      ],
      tutorHistory: [
        {
          createdAt: "2026-07-24T10:51:00.000Z",
          intent: "hint",
          source: "openai",
          hintLevel: 2,
          needsTeacher: true,
          message: "Look at the hundreds column.",
        },
      ],
    },
  });

  assert.equal(snapshot.acceptedAt, "2026-07-24T10:52:00.000Z");
  assert.equal(snapshot.questionKey, "q4");
  assert.equal(snapshot.wrongAttemptCount, 1);
  assert.equal(snapshot.budgetMinutes, 8);
  assert.equal(snapshot.stage, "core");
  assert.equal(snapshot.needsTeacherReason, "AI marked needsTeacher");
});

test("serializeSessionMetadata never drops snapshot on notes merge path", () => {
  const snapshot = buildSupportContextSnapshot({
    schoolId: "s",
    classroomId: null,
    dayLessonId: "p",
    lessonId: null,
    subject: "English",
    lessonTitle: null,
    curriculumSkill: null,
    periodEndsAt: null,
    minutesRemainingAtAccept: 5,
    budgetMinutes: 5,
    plannedEndsAt: "2026-07-24T11:00:00.000Z",
    student: {
      activeContentId: null,
      activeAssignmentId: null,
      currentQuestionKey: null,
      aiSupportState: "exhausted",
      misconception: null,
      stages: [],
      attempts: [],
      tutorHistory: [],
    },
  });
  const raw = serializeSessionMetadata({
    metaVersion: 1,
    supportContextSnapshot: snapshot,
    sessionNotes: { privateNotes: "try diagram", actionsTaken: ["diagram"], followUpNeeded: false },
    guidanceMessages: [{
      id: "g1",
      text: "Read paragraph 3",
      createdAt: "2026-07-24T10:53:00.000Z",
      authorTeacherId: "t1",
    }],
    returnAction: "resume_current",
  });
  const parsed = parseSessionMetadata(raw);
  assert.equal(parsed.supportContextSnapshot?.budgetMinutes, 5);
  assert.equal(parsed.sessionNotes.privateNotes, "try diagram");
  assert.equal(parsed.guidanceMessages[0]?.text, "Read paragraph 3");
  assert.equal(parsed.returnAction, "resume_current");

  // Mutating parsed notes object must not imply snapshot overwrite when re-serialized with same snapshot.
  parsed.sessionNotes.privateNotes = "updated";
  const again = serializeSessionMetadata({
    ...parsed,
    supportContextSnapshot: parsed.supportContextSnapshot,
  });
  const reparsed = parseSessionMetadata(again);
  assert.equal(reparsed.supportContextSnapshot?.acceptedAt, snapshot.acceptedAt);
  assert.equal(reparsed.sessionNotes.privateNotes, "updated");
});
