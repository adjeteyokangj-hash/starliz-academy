import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRotatableQuestions,
  pickRotatedQuestions,
  replacePackQuestions,
  selectRemixedQuestions,
  QUESTION_BANK_REFILL_THRESHOLD,
} from "../src/lib/schools/short-learning-question-rotation";

function q(prompt: string, answer = "A"): ReturnType<typeof extractRotatableQuestions>[number] {
  const raw = { prompt, answer, choices: [answer, "B", "C", "D"] };
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

test("remix keeps generated pack questions even when earlier blocks used the same fingerprints", () => {
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
  assert.equal(remixed.selected.length, 4);
  assert.deepEqual(
    remixed.selected.map((item) => item.prompt),
    pack.map((item) => item.prompt),
  );
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
