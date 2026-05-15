import test from "node:test";
import assert from "node:assert/strict";
import { tagDifficulty, tagTopic } from "../src/lib/ai/difficulty-tagger";
import { reportsToCsv } from "../src/lib/reports/admin-reports";

test("difficulty tagger returns bounded levels", () => {
  assert.equal(tagDifficulty("cat sat", 1) >= 1, true);
  assert.equal(tagDifficulty("extraordinary comprehension vocabulary", 5) <= 5, true);
});

test("topic tagger identifies common subjects", () => {
  assert.equal(tagTopic("fractions and multiply"), "maths");
  assert.equal(tagTopic("phonics spelling sound"), "spelling");
  assert.equal(tagTopic("reading passage comprehension"), "reading");
});

test("reports csv includes overview and weak topics", () => {
  const csv = reportsToCsv({
    generatedAt: new Date().toISOString(),
    filters: { keyStage: null, yearGroup: null, examBoard: null },
    overview: { parents: 1, students: 2, activeStudents: 1, activeParents: 1, avgAccuracy: 80, completed: 3, activeSubscriptions: 1, lessons: 2, rewards: 1, storeItems: 1, supportTickets: 0 },
    ai: { contentItems: 1, estimatedCostPence: 4, totalUses: 2 },
    weakTopics: [{ topic: "spelling: silent e", count: 3 }],
    subscriptions: [],
  });
  assert.match(csv, /parents/);
  assert.match(csv, /spelling: silent e/);
});
