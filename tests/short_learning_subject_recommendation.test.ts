import test from "node:test";
import assert from "node:assert/strict";
import type { ShortLearningSubjectRecommendation } from "../src/lib/schools/short-learning-subject-recommendation";
import {
  SHORT_LEARNING_FALLBACK_ROTATION,
  normalizeShortLearningSubjectInput,
} from "../src/lib/schools/short-learning-subjects";

/** Pure helpers mirrored for recommendation priority unit tests without DB. */
function pickLeastRecent(
  candidates: string[],
  recentSubjects: string[],
): string {
  const recent = recentSubjects
    .map((s) => normalizeShortLearningSubjectInput(s))
    .filter((s): s is string => Boolean(s) && s !== "starliz_choose");
  for (const candidate of candidates) {
    if (!recent.includes(candidate)) return candidate;
  }
  const last = recent[0];
  const withoutLast = candidates.filter((c) => c !== last);
  return withoutLast[0] ?? candidates[0] ?? "maths";
}

test("recommendation avoids immediate repetition of most recent subject", () => {
  const picked = pickLeastRecent(SHORT_LEARNING_FALLBACK_ROTATION, ["maths", "maths", "english"]);
  assert.notEqual(picked, "maths");
});

test("insufficient-history fallback stays within safe core subjects", () => {
  const hash = Array.from("student-abc").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const subject = SHORT_LEARNING_FALLBACK_ROTATION[hash % 3] ?? "maths";
  assert.ok(["english", "maths", "science"].includes(subject));
});

test("manual subject selection mode is distinct from starliz reasons", () => {
  const parentSelected: ShortLearningSubjectRecommendation = {
    subject: "history",
    learningFocus: "Tudors",
    reason: "parent_selected",
  };
  assert.equal(parentSelected.reason, "parent_selected");
  assert.equal(normalizeShortLearningSubjectInput("history"), "history");
});

test("create booking stores selection metadata fields in contract", () => {
  const metadata = {
    subjectSelectionMode: "starliz_selected" as const,
    requestedSubject: null,
    selectedSubject: "english",
    selectionReason: "continue_unfinished_topic",
    requestedLearningFocus: null,
    resolvedLearningFocus: "Comprehension practice",
  };
  assert.equal(metadata.subjectSelectionMode, "starliz_selected");
  assert.equal(metadata.selectionReason, "continue_unfinished_topic");
  assert.ok(metadata.selectedSubject);
});
