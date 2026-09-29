import test from "node:test";
import assert from "node:assert/strict";
import { buildMathPracticeFillItems } from "../src/lib/schools/math-practice-fill";
import {
  extractRotatableQuestions,
  selectRemixedQuestions,
  type PriorQuestionExposure,
  type RotatableQuestion,
} from "../src/lib/schools/short-learning-question-rotation";
import { compareQuestionEquivalence } from "../src/lib/schools/short-learning-question-equivalence";
import { SHORT_LEARNING_MANUAL_SUBJECT_KEYS } from "../src/lib/schools/short-learning-subjects";
import { buildSubjectPracticeFillItems } from "../src/lib/schools/subject-practice-fill";

function q(prompt: string, answer = "A", extra: Record<string, unknown> = {}): RotatableQuestion {
  const raw = { prompt, answer, choices: [answer, "B", "C", "D"], ...extra };
  return extractRotatableQuestions(JSON.stringify({ questions: [raw] }))[0]!;
}

const SUBJECT_CASES: Record<string, {
  seen: string;
  seenAnswer: string;
  cosmetic: string;
  different: string;
  differentAnswer: string;
}> = {
  english: {
    seen: "Which word is a noun?",
    seenAnswer: "dog",
    cosmetic: "Which word is a noun? (check the subject carefully.)",
    different: "Which sentence is a question?",
    differentAnswer: "Where is the cat?",
  },
  maths: {
    seen: "What is 6 × 7?",
    seenAnswer: "42",
    cosmetic: "What is 7 × 6?",
    different: "What is 8 × 9?",
    differentAnswer: "72",
  },
  science: {
    seen: "What do we need to complete an electrical circuit?",
    seenAnswer: "a complete loop from the battery",
    cosmetic: "What do we need to complete an electrical circuit? (check the subject carefully.)",
    different: "Sound is made when objects…",
    differentAnswer: "vibrate",
  },
  computing: {
    seen: "An algorithm is…",
    seenAnswer: "a clear set of instructions",
    cosmetic: "An algorithm is… (check the subject carefully.)",
    different: "What does a search engine do?",
    differentAnswer: "finds web pages that match key words",
  },
  history: {
    seen: "Who built many straight roads in Britain?",
    seenAnswer: "the Romans",
    cosmetic: "Who built many straight roads in Britain? (check the subject carefully.)",
    different: "Ancient Egyptians wrote using…",
    differentAnswer: "hieroglyphs",
  },
  geography: {
    seen: "What is the capital of France?",
    seenAnswer: "Paris",
    cosmetic: "Which city is the capital of France?",
    different: "The start of a river is called the…",
    differentAnswer: "source",
  },
  "religious-education": {
    seen: "Ramadan is a month of fasting in…",
    seenAnswer: "Islam",
    cosmetic: "Ramadan is a month of fasting in… (check the subject carefully.)",
    different: "Diwali is widely celebrated in…",
    differentAnswer: "Hinduism",
  },
  "modern-foreign-languages": {
    seen: "Bonjour means…",
    seenAnswer: "hello",
    cosmetic: "Bonjour means… (check the subject carefully.)",
    different: "Merci means…",
    differentAnswer: "thank you",
  },
  "art-and-design": {
    seen: "Red and yellow mix to make…",
    seenAnswer: "orange",
    cosmetic: "Red and yellow mix to make… (check the subject carefully.)",
    different: "Primary colours are…",
    differentAnswer: "red, yellow and blue",
  },
  "design-and-technology": {
    seen: "A wheel and axle help a vehicle…",
    seenAnswer: "roll",
    cosmetic: "A wheel and axle help a vehicle… (check the subject carefully.)",
    different: "A lever is a…",
    differentAnswer: "simple mechanism that turns around a pivot",
  },
  music: {
    seen: "Pulse in music is…",
    seenAnswer: "the steady beat",
    cosmetic: "Pulse in music is… (check the subject carefully.)",
    different: "Forte means…",
    differentAnswer: "loud",
  },
  "physical-education": {
    seen: "A warm-up helps your body by…",
    seenAnswer: "raising heart rate and preparing muscles",
    cosmetic: "A warm-up helps your body by… (check the subject carefully.)",
    different: "Balance is…",
    differentAnswer: "keeping your body steady",
  },
  citizenship: {
    seen: "School rules exist to…",
    seenAnswer: "keep people safe and treat others fairly",
    cosmetic: "School rules exist to… (check the subject carefully.)",
    different: "A community is…",
    differentAnswer: "a group of people who live or work together",
  },
};

function exposureFor(studentId: string, subject: string, item: RotatableQuestion): PriorQuestionExposure {
  return {
    studentId,
    subject,
    fingerprint: item.fingerprint,
    prompt: item.prompt,
    answer: item.answer,
  };
}

test("commutative maths and reworded facts are near-equivalent, different problems are not", () => {
  assert.equal(
    compareQuestionEquivalence(
      { prompt: "What is 6 × 7?", answer: "42" },
      { prompt: "What is 7 × 6?", answer: "42" },
    ),
    "near",
  );
  assert.equal(
    compareQuestionEquivalence(
      { prompt: "What is the capital of France?", answer: "Paris" },
      { prompt: "Which city is the capital of France?", answer: "Paris" },
    ),
    "near",
  );
  assert.equal(
    compareQuestionEquivalence(
      { prompt: "What is 6 × 7?", answer: "42" },
      { prompt: "What is 8 × 9?", answer: "72" },
    ),
    null,
  );
  assert.equal(
    compareQuestionEquivalence(
      { prompt: "Who built many straight roads in Britain?", answer: "the Romans" },
      { prompt: "Who built many straight roads in Britain? (check the subject carefully.)", answer: "the Romans" },
    ),
    "near",
  );
});

for (const subject of SHORT_LEARNING_MANUAL_SUBJECT_KEYS) {
  const sample = SUBJECT_CASES[subject]!;
  const seen = q(sample.seen, sample.seenAnswer);
  const cosmetic = q(sample.cosmetic, sample.seenAnswer);
  const different = q(sample.different, sample.differentAnswer);
  const retry = q(sample.seen, sample.seenAnswer, { repetitionPurpose: "mastery" });

  test(`${subject}: exact, cosmetic, different, retry, student and subject isolation`, () => {
    assert.notEqual(seen.fingerprint, cosmetic.fingerprint);

    const exact = selectRemixedQuestions({
      packQuestions: [seen, different],
      bankPool: [seen, different],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 2,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      blockTitle: "Lesson block 1 · New concept",
      priorExposure: [exposureFor("child-1", subject, seen)],
    });
    assert.equal(exact.selected.some((item) => item.prompt === sample.seen), false);
    assert.equal(exact.selected.some((item) => item.prompt === sample.different), true);

    const reworded = selectRemixedQuestions({
      packQuestions: [cosmetic, different],
      bankPool: [cosmetic, different],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 2,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      priorExposure: [exposureFor("child-1", subject, seen)],
    });
    assert.equal(reworded.selected.some((item) => item.fingerprint === cosmetic.fingerprint), false);
    assert.equal(reworded.selected.some((item) => item.prompt === sample.different), true);

    const sameSkill = selectRemixedQuestions({
      packQuestions: [different],
      bankPool: [different],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      priorExposure: [exposureFor("child-1", subject, seen)],
    });
    assert.equal(sameSkill.selected[0]?.prompt, sample.different);
    assert.equal(sameSkill.selected[0]?.raw.intentionalRepetition, false);

    const mastery = selectRemixedQuestions({
      packQuestions: [retry],
      bankPool: [retry],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      priorExposure: [exposureFor("child-1", subject, seen)],
    });
    assert.equal(mastery.selected.length, 1);
    assert.equal(mastery.selected[0]?.raw.repetitionPurpose, "mastery");
    assert.equal(mastery.selected[0]?.raw.intentionalRepetition, true);
    assert.equal(mastery.intentionalRepeatCount, 1);

    const otherChild = selectRemixedQuestions({
      packQuestions: [seen],
      bankPool: [seen],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-2",
      subject,
      blockType: "lesson",
      priorExposure: [exposureFor("child-1", subject, seen)],
    });
    assert.equal(otherChild.selected[0]?.prompt, sample.seen);
    assert.equal(otherChild.selected[0]?.raw.intentionalRepetition, false);

    const otherSubject = subject === "maths" ? "english" : "maths";
    const crossSubject = selectRemixedQuestions({
      packQuestions: [seen],
      bankPool: [seen],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      priorExposure: [exposureFor("child-1", otherSubject, seen)],
    });
    assert.equal(crossSubject.selected[0]?.prompt, sample.seen);
  });

  test(`${subject}: repeated sessions exhaust the bank instead of repeating ordinary questions`, () => {
    const extraA = q(`Which new ${subject} check uses a different fact?`, "a different fact");
    const extraB = q(`Why does this ${subject} example not repeat the earlier answer?`, "it tests another fact");
    const first = selectRemixedQuestions({
      packQuestions: [seen, different],
      bankPool: [seen, different, extraA, extraB],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 2,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      blockTitle: "Lesson block 1 · New concept",
      priorExposure: [],
    });
    assert.equal(first.selected.length, 2);

    const second = selectRemixedQuestions({
      packQuestions: [seen, different, extraA, extraB],
      bankPool: [seen, different, extraA, extraB],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 4,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      blockTitle: "Lesson block 2 · Guided practice",
      priorExposure: first.selected.map((item) => exposureFor("child-1", subject, item)),
    });
    assert.equal(second.selected.length, 2);
    assert.equal(second.selected.some((item) => item.prompt === sample.seen), false);
    assert.equal(second.selected.some((item) => item.prompt === sample.different), false);

    const exposure = [...first.selected, ...second.selected].map((item) => exposureFor("child-1", subject, item));
    const third = selectRemixedQuestions({
      packQuestions: [seen, different, extraA, extraB],
      bankPool: [seen, different, extraA, extraB],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 4,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      blockTitle: "Lesson block 3 · Harder questions",
      priorExposure: exposure,
    });
    assert.equal(third.selected.length, 0);
    assert.equal(third.refillNeeded, true);
    assert.ok((third.excludedRepeatCount ?? 0) >= 4);

    const fourth = selectRemixedQuestions({
      packQuestions: [seen, different, extraA, extraB],
      bankPool: [seen, different, extraA, extraB],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 2,
      studentId: "child-1",
      subject,
      blockType: "lesson",
      priorExposure: exposure,
    });
    assert.equal(fourth.selected.length, 0);
    assert.equal(fourth.refillNeeded, true);

    const retrieval = selectRemixedQuestions({
      packQuestions: [seen],
      bankPool: [seen, different, extraA, extraB],
      usedFingerprints: [],
      usageCounts: new Map(),
      needed: 1,
      studentId: "child-1",
      subject,
      blockType: "recap",
      blockTitle: "Quick recap",
      priorExposure: exposure,
    });
    assert.equal(retrieval.selected.length, 1);
    assert.equal(retrieval.selected[0]?.raw.repetitionPurpose, "retrieval");
    assert.equal(retrieval.selected[0]?.raw.intentionalRepetition, true);
  });
}

test("fallback banks do not manufacture duplicates with a cosmetic suffix", () => {
  for (const subject of SHORT_LEARNING_MANUAL_SUBJECT_KEYS) {
    if (subject === "maths") {
      const items = buildMathPracticeFillItems({ yearGroup: "Year 4", count: 16 });
      assert.ok(items.length >= 8);
      assert.equal(items.some((item) => /check the subject carefully/i.test(item.prompt)), false);
      for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
          assert.equal(
            compareQuestionEquivalence(
              { prompt: items[left]!.prompt, answer: items[left]!.answer },
              { prompt: items[right]!.prompt, answer: items[right]!.answer },
            ),
            null,
            `${items[left]!.prompt} ~ ${items[right]!.prompt}`,
          );
        }
      }
      continue;
    }

    const items = buildSubjectPracticeFillItems({ subject, yearGroup: "Year 4", count: 12 });
    assert.ok(items.length >= 2, subject);
    assert.ok(items.length < 12, `${subject} should stop when the distinct bank runs out`);
    assert.equal(items.some((item) => /check the subject carefully/i.test(item.prompt)), false);
    const prompts = items.map((item) => item.prompt.trim().toLowerCase());
    assert.equal(new Set(prompts).size, prompts.length, subject);
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        assert.equal(
          compareQuestionEquivalence(items[left]!, items[right]!),
          null,
          subject,
        );
      }
    }
  }
});

test("a seen question is replaced from the unused bank so the session still has new practice", () => {
  const seen = q("What is 6 × 7?", "42");
  const freshA = q("What is 8 × 9?", "72");
  const freshB = q("What is 5 × 4?", "20");
  const picked = selectRemixedQuestions({
    packQuestions: [seen],
    bankPool: [seen, freshA, freshB],
    usedFingerprints: [],
    usageCounts: new Map(),
    needed: 2,
    studentId: "child-1",
    subject: "maths",
    blockType: "lesson",
    priorExposure: [exposureFor("child-1", "maths", seen)],
  });
  assert.equal(picked.selected.length, 2);
  assert.equal(picked.selected.some((item) => item.prompt === seen.prompt), false);
  assert.deepEqual(
    picked.selected.map((item) => item.prompt).sort(),
    [freshA.prompt, freshB.prompt].sort(),
  );
});
