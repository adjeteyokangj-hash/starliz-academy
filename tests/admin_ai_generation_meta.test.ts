import assert from "node:assert/strict";
import test from "node:test";

import {
  generationDisplayLabel,
  isFallbackAllowed,
  parseAiGenerationMode,
  shouldAttemptOpenAi,
} from "../src/lib/admin-ai-generation-meta";

test("fallback-only mode disables OpenAI attempt and fallback is labeled clearly", () => {
  assert.equal(parseAiGenerationMode("fallback only / testing"), "fallback_only");
  assert.equal(shouldAttemptOpenAi("fallback_only"), false);
  assert.equal(isFallbackAllowed("fallback_only"), true);
  assert.equal(generationDisplayLabel({ generationSource: "fallback" }), "Generated using fallback");
});

test("openai with fallback still attempts OpenAI first", () => {
  assert.equal(parseAiGenerationMode("OpenAI with fallback"), "openai_with_fallback");
  assert.equal(shouldAttemptOpenAi("openai_with_fallback"), true);
  assert.equal(isFallbackAllowed("openai_with_fallback"), true);
});