import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRotatableQuestions,
  pickRotatedQuestions,
  replacePackQuestions,
  selectRemixedQuestions,
  QUESTION_BANK_REFILL_THRESHOLD,
} from "../src/lib/schools/short-learning-question-rotation";

function q(prompt: string, answer = "A", extra: Record<string, unknown> = {}): ReturnType<typeof extractRotatableQuestions>[number] {
  const raw = { prompt, answer, choices: [answer, "B", "C", "D"], ...extra };
  return extractRotatableQuestions(JSON.stringify({ questions: [raw] }))[0]!;
}

test("extracts unique questions from a daytime pack", () => {
  const items = extractRotatableQuestions({
    subjectType: "humanities",
    questions: [
      { prompt: "Who built many straight roads in Britain?", answer: "the Romans", choices: ["the Romans", "the Maya"] },
      { prompt: "Who built many straight roads in Britain?", answer: "the Romans", choices: ["the Romans", "the Maya"] },
    ],
  });
  assert.equal(items.length, 1);
  assert.match(items[0]!.prompt, /straight roads/);
});

test("rotates unused questions to other students and never repeats for the same student", () => {
  const pool = ["Q1", "Q2", "Q3", "Q4"].map((prompt) => q(prompt));
  const usageCounts = new Map<string, number>([
    [pool[0]!.fingerprint, 1],
    [pool[1]!.fingerprint, 0],
    [pool[2]!.fingerprint, 0],
    [pool[3]!.fingerprint, 0],
  ]);

  const firstStudent = pickRotatedQuestions({
    pool,
    usedFingerprints: [pool[0]!.fingerprint],
    usageCounts,
    needed: 2,
  });
  assert.equal(firstStudent.selected.length, 2);
  assert.equal(firstStudent.selected.some((item) => item.prompt === "Q1"), false);

  const secondStudent = pickRotatedQuestions({
    pool,
    usedFingerprints: [],
    usageCounts,
    needed: 2,
  });
  assert.equal(secondStudent.selected.some((item) => item.prompt === "Q1"), false);
  assert.ok(secondStudent.selected.every((item) => ["Q2", "Q3", "Q4"].includes(item.prompt)));
});

test("asks Admin to generate when the unused bank runs low", () => {
  const pool = Array.from({ length: 6 }, (_, index) => q(`Prompt ${index + 1}`));
  const picked = pickRotatedQuestions({
    pool,
    usedFingerprints: pool.slice(0, 5).map((item) => item.fingerprint),
    usageCounts: new Map(),
    needed: 8,
  });
  assert.equal(picked.selected.length, 1);
  assert.equal(picked.refillNeeded, true);
  assert.ok(QUESTION_BANK_REFILL_THRESHOLD >= 1);
});

test("replacePackQuestions keeps teaching fields and swaps questions", () => {
  const json = replacePackQuestions(
    JSON.stringify({
      subjectType: "humanities",
      title: "history: Lesson",
      learningObjective: "The Romans in Britain",
      questions: [{ prompt: "Old", answer: "x" }],
    }),
    [q("New question", "yes")],
  );
  const parsed = JSON.parse(json) as { title: string; questions: Array<{ prompt: string }> };
  assert.equal(parsed.title, "history: Lesson");
  assert.equal(parsed.questions[0]?.prompt, "New question");
});

test("replacePackQuestions clears mirrored items when remix excludes every question", () => {
  const seen = q("What is the english anchor fact for session 1?", "english-anchor");
  const cosmetic = q(
    "What is the english anchor fact for session 1? (check the subject carefully.)",
    "english-anchor",
  );
  const packQuestions = [seen, cosmetic];
  const source = JSON.stringify({
    subjectType: "english",
    title: "Lesson block 2",
    learningObjective: "Keep metadata",
    questions: packQuestions.map((item) => item.raw),
    items: packQuestions.map((item) => item.raw),
  });
  const remixed = selectRemixedQuestions({
    packQuestions,
    bankPool: packQuestions,
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 2,
    studentId: "child-1",
    subject: "english",
    blockType: "lesson",
    priorExposure: [
      {
        studentId: "child-1",
        subject: "english",
        fingerprint: seen.fingerprint,
        prompt: seen.prompt,
        answer: seen.answer,
      },
    ],
  });
  assert.equal(remixed.selected.length, 0);
  assert.equal(remixed.excludedRepeatCount, 2);

  const json = replacePackQuestions(source, remixed.selected);
  const parsed = JSON.parse(json) as {
    learningObjective: string;
    questions: unknown[];
    items: unknown[];
  };
  assert.equal(parsed.learningObjective, "Keep metadata");
  assert.deepEqual(parsed.questions, []);
  assert.deepEqual(parsed.items, []);
  assert.equal(extractRotatableQuestions(json).length, 0);
});

test("replacePackQuestions keeps questions and items synchronized for surviving remixes", () => {
  const kept = q("Fresh english practice item", "fresh");
  const dropped = q("What is the english anchor fact for session 1?", "english-anchor");
  const packQuestions = [dropped, kept];
  const source = JSON.stringify({
    subjectType: "english",
    title: "Lesson block 1",
    questions: packQuestions.map((item) => item.raw),
    items: packQuestions.map((item) => ({ ...item.raw, fromItems: true })),
  });
  const remixed = selectRemixedQuestions({
    packQuestions,
    bankPool: packQuestions,
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 2,
    studentId: "child-1",
    subject: "english",
    blockType: "lesson",
    priorExposure: [
      {
        studentId: "child-1",
        subject: "english",
        fingerprint: dropped.fingerprint,
        prompt: dropped.prompt,
        answer: dropped.answer,
      },
    ],
  });
  assert.equal(remixed.selected.length, 1);
  assert.equal(remixed.selected[0]?.prompt, kept.prompt);

  const json = replacePackQuestions(source, remixed.selected);
  const parsed = JSON.parse(json) as {
    questions: Array<{ prompt: string }>;
    items: Array<{ prompt: string }>;
  };
  assert.deepEqual(
    parsed.questions.map((row) => row.prompt),
    [kept.prompt],
  );
  assert.deepEqual(
    parsed.items.map((row) => row.prompt),
    [kept.prompt],
  );
  assert.equal(extractRotatableQuestions(json).some((item) => item.prompt === dropped.prompt), false);
});

test("replacePackQuestions still supports packs that only use items", () => {
  const json = replacePackQuestions(
    JSON.stringify({
      title: "items-only pack",
      items: [{ prompt: "Old items prompt", answer: "old" }],
    }),
    [q("New items prompt", "new")],
  );
  const parsed = JSON.parse(json) as { items: Array<{ prompt: string }>; questions?: unknown };
  assert.equal(parsed.items[0]?.prompt, "New items prompt");
  assert.equal(parsed.questions, undefined);
  assert.equal(extractRotatableQuestions(json)[0]?.prompt, "New items prompt");
});

test("recap and review tag block purpose without requiring prior exposure", () => {
  const fresh = q("Brand new recap check", "recall");
  const seen = q("Previously seen fact", "seen-answer");
  const mastery = q("Previously seen fact", "seen-answer", { repetitionPurpose: "mastery" });
  const retry = q("Previously seen fact", "seen-answer", { repetitionPurpose: "retry" });
  const support = q("Previously seen fact", "seen-answer", { repetitionPurpose: "support" });
  const prior = [
    {
      studentId: "child-1",
      subject: "science",
      fingerprint: seen.fingerprint,
      prompt: seen.prompt,
      answer: seen.answer,
    },
  ];

  const newRecap = selectRemixedQuestions({
    packQuestions: [fresh],
    bankPool: [fresh],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 1,
    studentId: "child-1",
    subject: "science",
    blockType: "recap",
    blockTitle: "Quick recap",
    priorExposure: [],
  });
  assert.equal(newRecap.selected.length, 1);
  assert.equal(newRecap.selected[0]?.raw.repetitionPurpose, "retrieval");

  const exposedRecap = selectRemixedQuestions({
    packQuestions: [seen],
    bankPool: [seen],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 1,
    studentId: "child-1",
    subject: "science",
    blockType: "recap",
    priorExposure: prior,
  });
  assert.equal(exposedRecap.selected.length, 1);
  assert.equal(exposedRecap.selected[0]?.raw.repetitionPurpose, "retrieval");
  assert.equal(exposedRecap.intentionalRepeatCount, 1);

  const finalReview = selectRemixedQuestions({
    packQuestions: [fresh],
    bankPool: [fresh],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 1,
    studentId: "child-1",
    subject: "science",
    blockType: "review",
    blockTitle: "Final review",
    priorExposure: [],
  });
  assert.equal(finalReview.selected[0]?.raw.repetitionPurpose, "retrieval");

  const ordinaryNew = selectRemixedQuestions({
    packQuestions: [fresh],
    bankPool: [fresh],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 1,
    studentId: "child-1",
    subject: "science",
    blockType: "lesson",
    priorExposure: prior,
  });
  assert.equal(ordinaryNew.selected[0]?.raw.repetitionPurpose, "ordinary");

  const ordinaryExposed = selectRemixedQuestions({
    packQuestions: [seen],
    bankPool: [seen],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 1,
    studentId: "child-1",
    subject: "science",
    blockType: "lesson",
    priorExposure: prior,
  });
  assert.equal(ordinaryExposed.selected.length, 0);
  assert.equal(ordinaryExposed.excludedRepeatCount, 1);

  for (const [label, pack] of [
    ["mastery", mastery],
    ["retry", retry],
    ["support", support],
  ] as const) {
    const result = selectRemixedQuestions({
      packQuestions: [pack],
      bankPool: [pack],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-1",
      subject: "science",
      blockType: "lesson",
      priorExposure: prior,
    });
    assert.equal(result.selected.length, 1, label);
    assert.equal(result.selected[0]?.raw.repetitionPurpose, label);
  }
});

test("ordinary pack questions already seen by this student are not kept just because they were generated", () => {
  const pack = [
    q("Identify the relative clause in the garden sentence."),
    q("Complete the butterfly sentence with a relative clause."),
    q("Rewrite the pond sentences using a relative clause."),
    q("Create a relative clause sentence about the garden."),
  ];
  const remixed = selectRemixedQuestions({
    packQuestions: pack,
    bankPool: pack,
    usedFingerprints: [pack[1]!.fingerprint, pack[3]!.fingerprint],
    usageCounts: new Map([
      [pack[1]!.fingerprint, 1],
      [pack[3]!.fingerprint, 1],
    ]),
    needed: 4,
  });
  assert.deepEqual(
    remixed.selected.map((item) => item.prompt).sort(),
    [pack[0]!.prompt, pack[2]!.prompt].sort(),
  );
  assert.equal(remixed.excludedRepeatCount, 2);
  assert.equal(remixed.refillNeeded, true);
});

test("remix still supplements a short pack from unused bank items", () => {
  const pack = [q("Pack only")];
  const bank = [q("Bank A"), q("Bank B"), q("Bank C")];
  const remixed = selectRemixedQuestions({
    packQuestions: pack,
    bankPool: [...bank, ...pack],
    usedFingerprints: [bank[0]!.fingerprint],
    usageCounts: new Map(),
    needed: 3,
  });
  assert.equal(remixed.selected[0]?.prompt, "Pack only");
  assert.equal(remixed.selected.length, 3);
  assert.equal(remixed.selected.some((item) => item.prompt === "Bank A"), false);
});
