import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyGenerationDiagnosticOutcome,
  isKnownDiagnosticOutcome,
  validateGeneratedTupleContainment,
  validateStrictRequestTuple,
  type GenerationRequestTuple,
} from "../src/lib/ai/generator-tuple-validation";

function baseTuple(): GenerationRequestTuple {
  return {
    yearGroup: "Year 4",
    keyStage: "KS2",
    subject: "english-language",
    strand: "reading",
    skillFocus: "Reading comprehension",
    difficulty: 3,
    itemCount: 5,
  };
}

test("strict tuple preflight accepts valid english tuple", () => {
  const result = validateStrictRequestTuple({
    requestTuple: baseTuple(),
    rawYearGroup: "Year 4",
    rawKeyStage: "KS2",
    sourceSubject: "english-language",
    isEnglishParent: true,
  });
  assert.equal(result.ok, true);
});

test("strict tuple preflight rejects english tuple without strand", () => {
  const tuple = baseTuple();
  tuple.strand = null;
  const result = validateStrictRequestTuple({
    requestTuple: tuple,
    rawYearGroup: "Year 4",
    rawKeyStage: "KS2",
    sourceSubject: "english-language",
    isEnglishParent: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticOutcome, "policy_mismatch");
  }
});

test("strict tuple preflight rejects mismatched yearGroup/keyStage", () => {
  const result = validateStrictRequestTuple({
    requestTuple: baseTuple(),
    rawYearGroup: "Year 4",
    rawKeyStage: "KS4",
    sourceSubject: "english-language",
    isEnglishParent: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticOutcome, "policy_mismatch");
  }
});

test("postflight containment rejects subject contamination", () => {
  const result = validateGeneratedTupleContainment({
    requestTuple: baseTuple(),
    content: [{
      subject: "maths",
      yearGroup: "Year 4",
      keyStage: "KS2",
      strand: "reading",
      skillFocus: "Reading comprehension",
      question: "What is 2 + 2?",
    }],
    validation: { validationDiagnostics: {} },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticOutcome, "subject_contamination");
  }
});

test("postflight containment rejects strand contamination", () => {
  const result = validateGeneratedTupleContainment({
    requestTuple: baseTuple(),
    content: [{
      subject: "english-language",
      yearGroup: "Year 4",
      keyStage: "KS2",
      strand: "grammar",
      skillFocus: "Reading comprehension",
    }],
    validation: { validationDiagnostics: {} },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticOutcome, "subject_contamination");
  }
});

test("postflight containment rejects skill-focus contamination", () => {
  const result = validateGeneratedTupleContainment({
    requestTuple: baseTuple(),
    content: [{
      subject: "english-language",
      yearGroup: "Year 4",
      keyStage: "KS2",
      strand: "reading",
      skillFocus: "Punctuation",
    }],
    validation: { validationDiagnostics: {} },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticOutcome, "subject_contamination");
  }
});

test("diagnostic classifier maps provider failures and recognized codes", () => {
  const providerOutcome = classifyGenerationDiagnosticOutcome({
    errorCode: "model_error",
    message: "Provider timeout",
    status: 503,
  });
  assert.equal(providerOutcome, "provider_unavailable");
  assert.equal(isKnownDiagnosticOutcome(providerOutcome), true);
});
