import test from "node:test";
import assert from "node:assert/strict";

import {
  runWeeklyHomeworkFridayGeneration,
  type WeeklyHomeworkGenerationStudentInput,
} from "../src/lib/homework-phase1f/service";

const FRIDAY_NOW = new Date("2025-05-16T12:00:00.000Z");

type CapturedPersistPayload = {
  generation: {
    batch: {
      plannedMinutes: number;
      questions: Array<{ id: string }>;
    };
  };
};

function makeStudent(overrides?: Partial<WeeklyHomeworkGenerationStudentInput>): WeeklyHomeworkGenerationStudentInput {
  return {
    id: "student-1",
    yearGroup: "Year 5",
    parent: {
      parentProfile: {
        timezone: "Europe/London",
      },
    },
    studentProfile: {
      aiLearningProfileJson: JSON.stringify({
        schoolWeekModeSettings: {
          enabled: true,
          includeHomeworkBlock: true,
          parentAdminNotes: null,
        },
      }),
    },
    progressRecords: [
      { id: "p1", createdAt: new Date("2025-05-16T09:00:00.000Z"), completed: true },
      { id: "p2", createdAt: new Date("2025-05-16T10:00:00.000Z"), completed: true },
    ],
    weakAreas: [
      {
        id: "w-low",
        subject: "math",
        skillFocus: "fractions",
        weaknessType: "core_topic",
        accuracy: 40,
        attemptsCount: 5,
        metadataJson: null,
      },
      {
        id: "w-mid",
        subject: "math",
        skillFocus: "decimals",
        weaknessType: "active",
        accuracy: 60,
        attemptsCount: 3,
        metadataJson: null,
      },
    ],
    coachInteractionLogs: [
      { subject: "math", skillFocus: "fractions" },
      { subject: "math", skillFocus: "fractions" },
      { subject: "math", skillFocus: "decimals" },
    ],
    homeworkBatches: [],
    ...overrides,
  };
}

test("Friday generation creates homework for eligible student", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";
  const persisted: CapturedPersistPayload[] = [];

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent()],
    persistGeneratedBatch: async (payload) => {
      persisted.push(payload as CapturedPersistPayload);
      return "created";
    },
  });

  assert.equal(summary.totals.created, 1);
  assert.equal(summary.students[0]?.action, "created");
  assert.ok((persisted[0]?.generation.batch.questions.length ?? 0) > 0);
});

test("no completed sessions creates no homework", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent({ progressRecords: [{ id: "p1", createdAt: FRIDAY_NOW, completed: false }] })],
    persistGeneratedBatch: async () => "created",
  });

  assert.equal(summary.totals.created, 0);
  assert.equal(summary.students[0]?.action, "skipped");
  assert.equal(summary.students[0]?.reason, "CATCH_UP_ONLY");
});

test("duplicate generation prevented", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent()],
    persistGeneratedBatch: async () => "duplicate_prevented",
  });

  assert.equal(summary.totals.duplicatePrevented, 1);
  assert.equal(summary.students[0]?.action, "duplicate_prevented");
});

test("generated homework uses weakness ranking", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";
  const persistedPayloads: unknown[] = [];

  await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent()],
    persistGeneratedBatch: async (payload) => {
      persistedPayloads.push(payload);
      return "created";
    },
  });

  const persisted = persistedPayloads[0] as CapturedPersistPayload | undefined;
  assert.ok(persisted);
  const orderedIds = (persisted?.generation.batch.questions ?? []).map((question) => question.id);
  assert.equal(orderedIds[0], "w-low");
});

test("workload caps by year group", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";
  const persistedPayloads: unknown[] = [];

  await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent({
      yearGroup: "Year 3",
      weakAreas: [
        {
          id: "w1",
          subject: "math",
          skillFocus: "fractions",
          weaknessType: "core_topic",
          accuracy: 40,
          attemptsCount: 5,
          metadataJson: null,
        },
        {
          id: "w2",
          subject: "math",
          skillFocus: "place value",
          weaknessType: "active",
          accuracy: 45,
          attemptsCount: 4,
          metadataJson: null,
        },
      ],
    })],
    persistGeneratedBatch: async (payload) => {
      persistedPayloads.push(payload);
      return "created";
    },
  });

  const persisted = persistedPayloads[0] as CapturedPersistPayload | undefined;
  assert.ok(persisted);
  assert.ok((persisted?.generation.batch.plannedMinutes ?? 999) <= 15);
});

test("feature flag off prevents live effect", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "false";
  let persistedCount = 0;

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent()],
    persistGeneratedBatch: async () => {
      persistedCount += 1;
      return "created";
    },
  });

  assert.equal(summary.featureEnabled, false);
  assert.equal(summary.totals.considered, 0);
  assert.equal(persistedCount, 0);
});

test("paused/holiday student does not receive unfair homework where settings exist", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent({
      studentProfile: {
        aiLearningProfileJson: JSON.stringify({
          schoolWeekModeSettings: {
            enabled: true,
            includeHomeworkBlock: false,
            parentAdminNotes: "Holiday week",
          },
        }),
      },
    })],
    persistGeneratedBatch: async () => "created",
  });

  assert.equal(summary.totals.created, 0);
  assert.equal(summary.students[0]?.reason, "PAUSED_OR_HOLIDAY");
});

test("generation does not mutate started homework", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";
  let persistedCount = 0;

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    students: [makeStudent({
      homeworkBatches: [{
        id: "hb-1",
        weekStart: new Date("2025-05-12T00:00:00.000Z"),
        status: "STARTED",
        scorePercent: null,
        recapOnly: false,
        questions: [{ id: "q1", subject: "math", topic: "fractions", skill: "fractions", estimatedMinutes: 5 }],
        answers: [],
      }],
    })],
    persistGeneratedBatch: async () => {
      persistedCount += 1;
      return "created";
    },
  });

  assert.equal(summary.students[0]?.reason, "ALREADY_GENERATED");
  assert.equal(persistedCount, 0);
});

test("dry-run does not persist homework", async () => {
  process.env.WEEKLY_HOMEWORK_PHASE1B_ENABLED = "true";
  let persistedCount = 0;

  const summary = await runWeeklyHomeworkFridayGeneration({
    now: FRIDAY_NOW,
    dryRun: true,
    students: [makeStudent()],
    persistGeneratedBatch: async () => {
      persistedCount += 1;
      return "created";
    },
  });

  assert.equal(summary.totals.dryRun, 1);
  assert.equal(summary.students[0]?.action, "dry_run");
  assert.equal(persistedCount, 0);
});
