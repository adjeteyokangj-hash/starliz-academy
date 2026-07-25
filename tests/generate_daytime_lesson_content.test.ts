import assert from "node:assert/strict";
import test from "node:test";

import { buildDaytimeContentPack } from "../src/lib/schools/generate-daytime-lesson-content";
import { analyzeContentSessionSlots } from "../src/lib/session-slot-validation";

test("buildDaytimeContentPack maps Thursday-style slots to playable types", () => {
  const oracy = buildDaytimeContentPack({
    title: "English — Oracy & debate",
    subject: "English",
    skillFocus: "Spoken language",
    yearGroup: "Year 7",
  });
  assert.equal(oracy.contentType, "reading");
  const oracyItems = JSON.parse(oracy.contentJson) as Array<{ passage: string; question: string; answer: string }>;
  assert.ok(Array.isArray(oracyItems));
  assert.ok(oracyItems.length >= 4);
  assert.ok(oracyItems.every((item) => item.passage && item.question && item.answer));
  assert.ok(analyzeContentSessionSlots({
    contentJson: oracy.contentJson,
    contentType: oracy.contentType,
    metadataJson: oracy.metadataJson,
  }).isSessionComplete);

  const maths = buildDaytimeContentPack({
    title: "Maths — Reasoning problems",
    subject: "Maths",
    skillFocus: "Multi-step reasoning",
    yearGroup: "Year 7",
  });
  assert.equal(maths.contentType, "math");
  const mathsItems = JSON.parse(maths.contentJson) as Array<{ question: string; answer: number }>;
  assert.ok(mathsItems.length >= 6);
  assert.ok(mathsItems.every((item) => item.question && Number.isFinite(item.answer)));

  const computing = buildDaytimeContentPack({
    title: "Computing — Digital literacy",
    subject: "Computing",
    skillFocus: "Online safety",
    yearGroup: "Year 7",
  });
  assert.equal(computing.contentType, "lesson");
  const computingMeta = JSON.parse(computing.metadataJson) as { subject: string; title: string; schoolSubject: string };
  assert.equal(computingMeta.subject, "reading");
  assert.equal(computingMeta.schoolSubject, "Computing");
  assert.equal(computingMeta.title, "Computing — Digital literacy");
  assert.ok(analyzeContentSessionSlots({
    contentJson: computing.contentJson,
    contentType: computing.contentType,
    metadataJson: computing.metadataJson,
  }).isSessionComplete);

  const spelling = buildDaytimeContentPack({
    title: "Spelling & phonics fluency",
    subject: "Spelling",
    skillFocus: "Spelling patterns",
    yearGroup: "Year 5",
  });
  assert.equal(spelling.contentType, "spelling");
});

test("daytime lesson packs for different subjects use distinct prompts", () => {
  const pshe = buildDaytimeContentPack({
    title: "Assembly / PSHE",
    subject: "Assembly / PSHE",
    skillFocus: "Wellbeing",
    yearGroup: "Year 4",
  });
  const computing = buildDaytimeContentPack({
    title: "Computing — Digital literacy",
    subject: "Computing",
    skillFocus: "Online safety",
    yearGroup: "Year 4",
  });

  const psheMeta = JSON.parse(pshe.metadataJson) as { subject: string };
  assert.equal(psheMeta.subject, "reading");

  const psheQuestions = (JSON.parse(pshe.contentJson) as Array<{ question: string; answer: string }>)
    .map((item) => `${item.question}::${item.answer}`);
  const computingQuestions = (JSON.parse(computing.contentJson) as Array<{ question: string; answer: string }>)
    .map((item) => `${item.question}::${item.answer}`);

  const overlap = psheQuestions.filter((entry) => computingQuestions.includes(entry));
  assert.equal(overlap.length, 0, `shared question/answer pairs: ${overlap.join(" | ")}`);
});
