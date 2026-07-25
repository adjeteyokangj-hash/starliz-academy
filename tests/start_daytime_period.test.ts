import assert from "node:assert/strict";
import test from "node:test";

import {
  AssignmentSafetyError,
  DuplicateAssignmentError,
} from "../src/lib/assignments";
import {
  isPlayableDaytimeLessonType,
  practiceHrefForPeriod,
  preferredContentTypesForPeriod,
  startDaytimePeriod,
  continueDaytimePeriod,
  type StartDaytimePeriodDeps,
} from "../src/lib/schools/start-daytime-period";

test("isPlayableDaytimeLessonType skips break lunch registration", () => {
  assert.equal(isPlayableDaytimeLessonType("core"), true);
  assert.equal(isPlayableDaytimeLessonType("intervention"), true);
  assert.equal(isPlayableDaytimeLessonType("break"), false);
  assert.equal(isPlayableDaytimeLessonType("lunch"), false);
  assert.equal(isPlayableDaytimeLessonType("registration"), false);
});

test("preferredContentTypesForPeriod maps school subjects", () => {
  assert.deepEqual(preferredContentTypesForPeriod("Maths", "Fractions"), ["math", "maths"]);
  assert.ok(preferredContentTypesForPeriod("Spelling", null).includes("spelling"));
  assert.ok(preferredContentTypesForPeriod("English", "Reading inference").includes("reading"));
  assert.deepEqual(preferredContentTypesForPeriod("Intervention", "Number facts"), ["math", "maths"]);
});

test("practiceHrefForPeriod returns game routes for practiceable subjects", () => {
  const maths = practiceHrefForPeriod("Maths", "Place value");
  assert.ok(maths?.startsWith("/games/math"));
  assert.ok(maths?.includes("daytime=1"));
  assert.equal(practiceHrefForPeriod("Science", "Enquiry"), null);
});

function baseDeps(overrides: Partial<StartDaytimePeriodDeps> = {}): StartDaytimePeriodDeps {
  return {
    findActiveEnrolment: async () => ({
      id: "enrol-1",
      schoolId: "school-1",
      classroomId: "class-1",
    }),
    findDayLesson: async () => ({
      id: "period-1",
      schoolId: "school-1",
      classroomId: "class-1",
      subject: "Maths",
      title: "Maths — Number fluency",
      lessonType: "core",
      yearGroup: "Year 5",
      skillFocus: "Place value",
      startsAt: "09:00",
      endsAt: "09:50",
      lessonId: "lesson-1",
      lesson: {
        id: "lesson-1",
        contentRefs: "content-linked",
        yearGroup: "Year 5",
        skillFocus: "Place value",
        reviewStatus: "approved",
      },
    }),
    findContentByIds: async () => [],
    findCompletedContentIds: async () => [],
    findCandidateContent: async () => [],
    assignContent: async () => ({ id: "asg-1", contentType: "math" }),
    getAssignmentContentType: async () => "math",
    now: () => new Date("2026-07-23T08:10:00.000Z"),
    ...overrides,
  };
}

test("startDaytimePeriod assigns linked content and returns game href", async () => {
  const result = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1", actorUserId: "user-1" },
    baseDeps({
      findContentByIds: async () => ([
        {
          id: "content-linked",
          contentType: "math",
          yearGroup: "Year 5",
          skillFocus: "Place value",
          status: "published",
        },
      ]),
      assignContent: async ({ contentId }) => {
        assert.equal(contentId, "content-linked");
        return { id: "asg-linked", contentType: "math" };
      },
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mode, "assigned");
  assert.equal(result.assignmentId, "asg-linked");
  assert.ok(result.href.includes("assignmentId=asg-linked"));
  assert.ok(result.href.includes("daytimePeriodId=period-1"));
  assert.ok(result.href.startsWith("/games/math"));
  assert.ok(result.sessionPlan);
  assert.equal(result.sessionPlan?.stages.length, 1);
});

test("startDaytimePeriod reuses duplicate assignment", async () => {
  const result = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1" },
    baseDeps({
      findCandidateContent: async () => ([
        {
          id: "content-1",
          contentType: "math",
          yearGroup: "Year 5",
          skillFocus: null,
          status: "reviewed",
        },
      ]),
      assignContent: async () => {
        throw new DuplicateAssignmentError("asg-existing");
      },
      getAssignmentContentType: async (id) => {
        assert.equal(id, "asg-existing");
        return "math";
      },
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.assignmentId, "asg-existing");
  assert.ok(result.href.includes("asg-existing"));
});

test("startDaytimePeriod falls back to practice when no assignable content", async () => {
  const result = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1" },
    baseDeps({
      findCandidateContent: async () => ([
        {
          id: "unsafe",
          contentType: "math",
          yearGroup: "Year 9",
          skillFocus: null,
          status: "reviewed",
        },
      ]),
      assignContent: async () => {
        throw new AssignmentSafetyError("Year mismatch");
      },
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mode, "practice");
  assert.equal(result.assignmentId, null);
  assert.ok(result.href.startsWith("/games/math"));
});

test("startDaytimePeriod blocks wrong classroom and non-playable periods", async () => {
  const wrongClass = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1" },
    baseDeps({
      findDayLesson: async () => ({
        id: "period-1",
        schoolId: "school-1",
        classroomId: "other-class",
        subject: "Maths",
        title: "Maths",
        lessonType: "core",
        yearGroup: null,
        skillFocus: null,
        startsAt: "09:00",
        endsAt: "09:50",
        lessonId: null,
        lesson: null,
      }),
    }),
  );
  assert.equal(wrongClass.ok, false);
  if (wrongClass.ok) return;
  assert.equal(wrongClass.status, 403);

  const breakPeriod = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-break" },
    baseDeps({
      findDayLesson: async () => ({
        id: "period-break",
        schoolId: "school-1",
        classroomId: "class-1",
        subject: "Break",
        title: "Morning break",
        lessonType: "break",
        yearGroup: null,
        skillFocus: null,
        startsAt: "10:00",
        endsAt: "10:15",
        lessonId: null,
        lesson: null,
      }),
    }),
  );
  assert.equal(breakPeriod.ok, false);
  if (breakPeriod.ok) return;
  assert.equal(breakPeriod.code, "NOT_PLAYABLE");
});

test("startDaytimePeriod returns NO_PLAYABLE_CONTENT for lesson-only subjects without content", async () => {
  const result = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1" },
    baseDeps({
      findDayLesson: async () => ({
        id: "period-1",
        schoolId: "school-1",
        classroomId: "class-1",
        subject: "Science",
        title: "Science enquiry",
        lessonType: "core",
        yearGroup: "Year 5",
        skillFocus: "Enquiry",
        startsAt: "09:00",
        endsAt: "09:50",
        lessonId: null,
        lesson: null,
      }),
      findCandidateContent: async () => [],
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "NO_PLAYABLE_CONTENT");
  assert.equal(result.status, 409);
});

test("startDaytimePeriod assigns first incomplete stage in linked multi-stage plan", async () => {
  const { continueDaytimePeriod } = await import("../src/lib/schools/start-daytime-period");
  const assigned: string[] = [];
  const deps = baseDeps({
    findDayLesson: async () => ({
      id: "period-1",
      schoolId: "school-1",
      classroomId: "class-1",
      subject: "English",
      title: "Guided reading",
      lessonType: "core",
      yearGroup: "Year 5",
      skillFocus: "Inference",
      startsAt: "09:00",
      endsAt: "09:50",
      lessonId: "lesson-1",
      lesson: {
        id: "lesson-1",
        contentRefs: "stage-1,stage-2,stage-3",
        yearGroup: "Year 5",
        skillFocus: "Inference",
        reviewStatus: "approved",
      },
    }),
    findContentByIds: async () => ([
      { id: "stage-1", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8, label: "Warm-up" } }) },
      { id: "stage-2", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22, label: "Core practice" } }) },
      { id: "stage-3", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "stretch", stageIndex: 2, estimatedMinutes: 10, label: "Stretch" } }) },
    ]),
    findCompletedContentIds: async () => ["stage-1"],
    assignContent: async ({ contentId }) => {
      assigned.push(contentId);
      return { id: `asg-${contentId}`, contentType: "reading" };
    },
    now: () => new Date("2026-07-23T08:10:00.000Z"),
  });

  const start = await startDaytimePeriod({ childId: "child-1", dayLessonId: "period-1" }, deps);
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.contentId, "stage-2");
  assert.equal(start.sessionPlan?.currentIndex, 1);
  assert.equal(start.sessionPlan?.stages.length, 3);
  assert.equal(start.sessionPlan?.progressLabel, "Stage 2 of 3");

  const cont = await continueDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1", completedContentId: "stage-2" },
    {
      ...deps,
      findCompletedContentIds: async () => ["stage-1", "stage-2"],
    },
  );
  assert.equal(cont.ok, true);
  if (!cont.ok) return;
  assert.equal(cont.contentId, "stage-3");
  assert.deepEqual(assigned, ["stage-2", "stage-3"]);
  assert.equal(cont.sessionPlan?.progressLabel, "Stage 3 of 3");
  assert.deepEqual(assigned, ["stage-2", "stage-3"]);

  const contAgain = await continueDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1", completedContentId: "stage-2" },
    {
      ...deps,
      findCompletedContentIds: async () => ["stage-1", "stage-2"],
      assignContent: async ({ contentId }) => {
        assigned.push(contentId);
        return { id: `asg-${contentId}-retry`, contentType: "reading" };
      },
    },
  );
  assert.equal(contAgain.ok, true);
  if (contAgain.ok) assert.equal(contAgain.contentId, "stage-3");
});

test("startDaytimePeriod assigns warm-up first for a fresh three-stage lesson", async () => {
  const assigned: string[] = [];
  const deps = baseDeps({
    findDayLesson: async () => ({
      id: "period-1",
      schoolId: "school-1",
      classroomId: "class-1",
      subject: "English",
      title: "Guided reading",
      lessonType: "core",
      yearGroup: "Year 5",
      skillFocus: "Inference",
      startsAt: "09:00",
      endsAt: "09:50",
      lessonId: "lesson-1",
      lesson: {
        id: "lesson-1",
        contentRefs: "stage-1,stage-2,stage-3",
        yearGroup: "Year 5",
        skillFocus: "Inference",
        reviewStatus: "approved",
      },
    }),
    findContentByIds: async () => ([
      { id: "stage-1", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8, label: "Warm-up" } }) },
      { id: "stage-2", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22, label: "Core practice" } }) },
      { id: "stage-3", contentType: "reading", yearGroup: "Year 5", skillFocus: "Inference", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "stretch", stageIndex: 2, estimatedMinutes: 10, label: "Stretch" } }) },
    ]),
    findCompletedContentIds: async () => [],
    assignContent: async ({ contentId }) => {
      assigned.push(contentId);
      return { id: `asg-${contentId}`, contentType: "reading" };
    },
  });

  const start = await startDaytimePeriod({ childId: "child-1", dayLessonId: "period-1" }, deps);
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.contentId, "stage-1");
  assert.equal(start.sessionPlan?.currentIndex, 0);
  assert.equal(start.sessionPlan?.progressLabel, "Stage 1 of 3");
  assert.deepEqual(assigned, ["stage-1"]);
});

test("startDaytimePeriod blocks unapproved lessons", async () => {
  const result = await startDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1" },
    baseDeps({
      findDayLesson: async () => ({
        id: "period-1",
        schoolId: "school-1",
        classroomId: "class-1",
        subject: "Maths",
        title: "Maths",
        lessonType: "core",
        yearGroup: "Year 5",
        skillFocus: "Number",
        startsAt: "09:00",
        endsAt: "09:50",
        lessonId: "lesson-1",
        lesson: {
          id: "lesson-1",
          contentRefs: "content-1",
          yearGroup: "Year 5",
          skillFocus: "Number",
          reviewStatus: "awaiting_review",
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "LESSON_NOT_APPROVED");
});

test("continueDaytimePeriod persists completedContentId so later continues advance", async () => {
  const completed = new Set<string>();
  const assigned: string[] = [];
  const deps = baseDeps({
    findDayLesson: async () => ({
      id: "period-1",
      schoolId: "school-1",
      classroomId: "class-1",
      subject: "Maths",
      title: "Maths",
      lessonType: "core",
      yearGroup: "Year 5",
      skillFocus: "Number",
      startsAt: "09:00",
      endsAt: "09:50",
      lessonId: "lesson-1",
      lesson: {
        id: "lesson-1",
        contentRefs: "stage-1,stage-2,stage-3",
        yearGroup: "Year 5",
        skillFocus: "Number",
        reviewStatus: "approved",
      },
    }),
    findContentByIds: async () => ([
      { id: "stage-1", contentType: "math", yearGroup: "Year 5", skillFocus: "Number", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "warmup", stageIndex: 0, estimatedMinutes: 8, label: "Warm-up" } }) },
      { id: "stage-2", contentType: "math", yearGroup: "Year 5", skillFocus: "Number", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "core", stageIndex: 1, estimatedMinutes: 22, label: "Core practice" } }) },
      { id: "stage-3", contentType: "math", yearGroup: "Year 5", skillFocus: "Number", status: "reviewed", metadataJson: JSON.stringify({ daytimeSession: { stage: "stretch", stageIndex: 2, estimatedMinutes: 10, label: "Stretch" } }) },
    ]),
    findCompletedContentIds: async () => [...completed],
    markContentCompleted: async (_studentId, contentId) => {
      completed.add(contentId);
    },
    assignContent: async ({ contentId }) => {
      assigned.push(contentId);
      return { id: `asg-${contentId}`, contentType: "math" };
    },
  });

  const start = await startDaytimePeriod({ childId: "child-1", dayLessonId: "period-1" }, deps);
  assert.equal(start.ok, true);
  if (!start.ok) return;
  assert.equal(start.contentId, "stage-1");
  assert.equal(start.sessionPlan?.progressLabel, "Stage 1 of 3");

  const toCore = await continueDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1", completedContentId: "stage-1" },
    deps,
  );
  assert.equal(toCore.ok, true);
  if (!toCore.ok) return;
  assert.equal(toCore.contentId, "stage-2");
  assert.equal(toCore.sessionPlan?.progressLabel, "Stage 2 of 3");
  assert.ok(completed.has("stage-1"));

  const toStretch = await continueDaytimePeriod(
    { childId: "child-1", dayLessonId: "period-1", completedContentId: "stage-2" },
    deps,
  );
  assert.equal(toStretch.ok, true);
  if (!toStretch.ok) return;
  assert.equal(toStretch.contentId, "stage-3");
  assert.equal(toStretch.sessionPlan?.progressLabel, "Stage 3 of 3");
  assert.ok(completed.has("stage-2"));
});
