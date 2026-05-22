import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDictionaryWord } from "@/lib/dictionary";
import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";

test("normalizeDictionaryWord trims and lowercases", () => {
  assert.equal(normalizeDictionaryWord("  Bright  "), "bright");
});

test("Coach fallback does not crash without a word", async () => {
  const response = await buildCoachWordHelpResponse({
    word: "",
    subject: "spelling",
    keyStage: "ks1",
    yearGroup: "Year 2",
    supportLevel: 1,
  });

  assert.equal(response.found, false);
  assert.equal(response.shouldReadAloud, false);
  assert.match(response.coachMessage, /Word Bank yet/);
});
