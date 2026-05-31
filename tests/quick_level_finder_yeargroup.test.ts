import test from "node:test";
import assert from "node:assert/strict";

import {
  autoQuickLevelFinderSubjectsForYearGroup,
  inferQuickLevelFinderPlacementProfile,
  parseQuickLevelFinderPlacementDiagnostic,
  parseQuickLevelFinderRetestEnabled,
  quickLevelFinderQuestionRangeForYearGroup,
  resolveQuickLevelFinderCanonicalPlacement,
  upsertQuickLevelFinderPlacementDiagnostic,
  upsertQuickLevelFinderRetestEnabled,
} from "../src/lib/quick-level-finder";

test("returns null when no placement levels exist", () => {
  const result = inferQuickLevelFinderPlacementProfile({ levels: {} });
  assert.equal(result, null);
});

test("keeps baseline year group when placement signal is secure", () => {
  const result = inferQuickLevelFinderPlacementProfile({
    levels: {
      maths: { level: "secure", accuracy: 62 },
      science: { level: "secure", accuracy: 68 },
    },
    baselineYearGroup: "Year 5",
  });

  assert.ok(result);
  assert.equal(result?.yearGroup, "Year 5");
  assert.equal(result?.keyStage, "KS2");
});

test("moves up one year for strong advanced signal", () => {
  const result = inferQuickLevelFinderPlacementProfile({
    levels: {
      maths: { level: "advanced", accuracy: 96 },
      science: { level: "advanced", accuracy: 92 },
      "english:reading": { level: "secure", accuracy: 80 },
    },
    baselineYearGroup: "Year 5",
  });

  assert.ok(result);
  assert.equal(result?.yearGroup, "Year 6");
  assert.equal(result?.keyStage, "KS2");
});

test("moves down one year for consistent below signal", () => {
  const result = inferQuickLevelFinderPlacementProfile({
    levels: {
      maths: { level: "below", accuracy: 18 },
      science: { level: "below", accuracy: 24 },
      "english:spelling": { level: "secure", accuracy: 55 },
    },
    baselineYearGroup: "Year 6",
  });

  assert.ok(result);
  assert.equal(result?.yearGroup, "Year 5");
  assert.equal(result?.keyStage, "KS2");
});

test("uses key stage baseline when year group is not present", () => {
  const result = inferQuickLevelFinderPlacementProfile({
    levels: {
      maths: { level: "advanced", accuracy: 90 },
      science: { level: "advanced", accuracy: 93 },
    },
    baselineKeyStage: "KS3",
  });

  assert.ok(result);
  assert.equal(result?.yearGroup, "Year 10");
  assert.equal(result?.keyStage, "KS4");
});

test("retest flag defaults to disabled", () => {
  assert.equal(parseQuickLevelFinderRetestEnabled(null), false);
  assert.equal(parseQuickLevelFinderRetestEnabled("{}"), false);
});

test("retest flag can be enabled and disabled", () => {
  const enabledJson = upsertQuickLevelFinderRetestEnabled("{}", true);
  assert.equal(parseQuickLevelFinderRetestEnabled(enabledJson), true);

  const disabledJson = upsertQuickLevelFinderRetestEnabled(enabledJson, false);
  assert.equal(parseQuickLevelFinderRetestEnabled(disabledJson), false);
});

test("year group auto-generates subject mix", () => {
  assert.deepEqual(autoQuickLevelFinderSubjectsForYearGroup("Year 2"), ["maths", "reading", "spelling"]);
  assert.deepEqual(autoQuickLevelFinderSubjectsForYearGroup("Year 5"), ["maths", "reading", "spelling"]);
  assert.deepEqual(autoQuickLevelFinderSubjectsForYearGroup("Year 8"), ["maths", "english", "science"]);
  assert.deepEqual(autoQuickLevelFinderSubjectsForYearGroup("Year 10"), ["maths", "english", "science"]);
});

test("year group maps to expected question count range", () => {
  assert.deepEqual(quickLevelFinderQuestionRangeForYearGroup("Year 1"), { min: 9, max: 9 });
  assert.deepEqual(quickLevelFinderQuestionRangeForYearGroup("Year 4"), { min: 12, max: 12 });
  assert.deepEqual(quickLevelFinderQuestionRangeForYearGroup("Year 8"), { min: 12, max: 12 });
  assert.deepEqual(quickLevelFinderQuestionRangeForYearGroup("Year 10"), { min: 15, max: 15 });
});

test("preserves canonical year group when inferred placement is lower and no explicit override", () => {
  const decision = resolveQuickLevelFinderCanonicalPlacement({
    inferredPlacement: {
      yearGroup: "Year 1",
      keyStage: "KS1",
      confidence: 84,
    },
    existingYearGroup: "Year 4",
    existingKeyStage: "KS2",
    explicitOverride: false,
  });

  assert.equal(decision.shouldUpdateCanonical, false);
  assert.equal(decision.nextYearGroup, "Year 4");
  assert.equal(decision.nextKeyStage, "KS2");
  assert.equal(decision.reason, "preserved_existing_canonical_year_group");
});

test("allows canonical placement update when canonical year group is missing", () => {
  const decision = resolveQuickLevelFinderCanonicalPlacement({
    inferredPlacement: {
      yearGroup: "Year 3",
      keyStage: "KS2",
      confidence: 76,
    },
    existingYearGroup: null,
    existingKeyStage: null,
    explicitOverride: false,
  });

  assert.equal(decision.shouldUpdateCanonical, true);
  assert.equal(decision.nextYearGroup, "Year 3");
  assert.equal(decision.nextKeyStage, "KS2");
  assert.equal(decision.reason, "missing_canonical_year_group");
});

test("stores inferred placement as diagnostic metadata without changing canonical year", () => {
  const nextJson = upsertQuickLevelFinderPlacementDiagnostic("{}", {
    recommendedYearGroup: "Year 1",
    recommendedKeyStage: "KS1",
    confidence: 88,
    computedAt: "2026-05-31T00:00:00.000Z",
    appliedToCanonicalProfile: false,
    reason: "preserved_existing_canonical_year_group",
  });

  const parsed = parseQuickLevelFinderPlacementDiagnostic(nextJson);
  assert.ok(parsed);
  assert.equal(parsed?.recommendedYearGroup, "Year 1");
  assert.equal(parsed?.recommendedKeyStage, "KS1");
  assert.equal(parsed?.confidence, 88);
  assert.equal(parsed?.appliedToCanonicalProfile, false);
  assert.equal(parsed?.reason, "preserved_existing_canonical_year_group");
});
