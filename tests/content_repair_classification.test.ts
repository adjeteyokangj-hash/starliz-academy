import assert from "node:assert/strict";
import test from "node:test";

import {
  getBlackBoxRepairActionKind,
  isBlackBoxQuickRepairIssue,
  isBlackBoxRegenerationIssue,
  runIssueSpecificRepair,
} from "../src/lib/ai/content-repair";

test("local blackbox issues stay in quick repair lane", () => {
  assert.equal(isBlackBoxQuickRepairIssue("missing question/prompt text"), true);
  assert.equal(getBlackBoxRepairActionKind("duplicate options detected"), "local");

  const repair = runIssueSpecificRepair({
    item: { question: "", answer: "2", choices: ["2", "3"] },
    itemIndex: 0,
    issueText: "missing question/prompt text",
    selectedLevel: 3,
    selectedYearGroup: "Year 3",
    topic: "Addition",
  });

  assert.equal(repair.success, true);
  assert.equal(String(repair.after.question ?? repair.after.prompt ?? "").length > 0, true);
});

test("quality blackbox issues are classified for regeneration", () => {
  assert.equal(isBlackBoxRegenerationIssue("item too easy"), true);
  assert.equal(getBlackBoxRepairActionKind("weak distractors"), "quality");
});