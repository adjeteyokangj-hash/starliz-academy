import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUniversalPrefillContract,
  resolveUniversalPrefill,
  encodeUniversalPrefillContract,
  decodeUniversalPrefillContract,
  type LegacyAiGeneratorPrefill,
  type UniversalAiPrefillContract,
} from "../src/lib/ai-prefill-contract";
import { aiGeneratorSubjectsForYearGroup, normalizeSubject, skillsForSubjectAndYear, type Subject, type YearGroup } from "../src/lib/curriculum";

const emptyLegacy: LegacyAiGeneratorPrefill = {
  studentId: null,
  subject: null,
  skill: null,
  englishStrand: null,
  strand: null,
  topic: null,
  activityType: null,
  masteryOutcome: null,
  source: null,
  weakAreaId: null,
  yearGroup: null,
  keyStage: null,
  difficulty: null,
  itemCount: null,
};

function runResolve(contract: UniversalAiPrefillContract | null) {
  return resolveUniversalPrefill({
    contract,
    legacy: emptyLegacy,
    availableSubjectsForYear: (year: YearGroup) => aiGeneratorSubjectsForYearGroup(year),
    normalizeSubject,
    isEnglishParentSubject: (value: Subject) => value === "english-language" || value === "gcse-english" || value === "gcse-english-language",
    normalizeEnglishStrand: (value: string | null) => {
      const normalized = value?.trim().toLowerCase();
      if (!normalized) return null;
      return ["phonics", "spelling", "reading", "comprehension", "grammar", "punctuation", "writing", "vocabulary"].includes(normalized)
        ? normalized
        : null;
    },
    deriveSkillFromEnglishStrand: (strand: string, year: YearGroup, subject: Subject) => {
      const mappedSubject = subject === "english-language"
        ? (normalizeSubject(strand) ?? subject)
        : subject;
      return skillsForSubjectAndYear(mappedSubject, year)[0] ?? "";
    },
    availableSkillsForSubjectAndYear: (subject: Subject, year: YearGroup) => skillsForSubjectAndYear(subject, year),
  });
}

test("maths prefill resolves with canonical year/key-stage and no blocking warnings", () => {
  const mathsSkill = skillsForSubjectAndYear("maths", "Year 6")[0] ?? "number";
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-maths",
    fields: {
      yearGroup: { value: "Year 6", source: "student", confidence: "high" },
      keyStage: { value: "KS2", source: "student", confidence: "high" },
      subject: { value: "maths", source: "prediction", confidence: "high" },
      skillFocus: { value: mathsSkill, source: "prediction", confidence: "medium" },
      topic: { value: "Multi-digit place value", source: "recommendation", confidence: "medium" },
      difficulty: { value: 3, source: "recommendation", confidence: "medium" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.yearGroup, "Year 6");
  assert.equal(resolved.values.keyStage, "KS2");
  assert.equal(resolved.values.subject, "maths");
  assert.equal(resolved.blockingWarnings.length, 0);
});

test("science prefill blocks when student-triggered year group is missing", () => {
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-science",
    fields: {
      subject: { value: "science", source: "prediction", confidence: "high" },
      skillFocus: { value: "Forces", source: "prediction", confidence: "medium" },
      topic: { value: "Balanced and unbalanced forces", source: "recommendation", confidence: "medium" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.subject, "science");
  assert.ok(resolved.blockingWarnings.some((entry) => entry.toLowerCase().includes("year group")));
});

test("english grammar prefill prevents silent phonics fallback", () => {
  const grammarSkill = skillsForSubjectAndYear("grammar", "Year 5")[0] ?? "grammar";
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-english",
    fields: {
      yearGroup: { value: "Year 5", source: "student", confidence: "high" },
      keyStage: { value: "KS2", source: "student", confidence: "high" },
      subject: { value: "english-language", source: "prediction", confidence: "high" },
      englishStrand: { value: "grammar", source: "prediction", confidence: "high" },
      skillFocus: { value: grammarSkill, source: "prediction", confidence: "medium" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.englishStrand, "grammar");
  assert.equal(/phonics/i.test(resolved.values.skillFocus), false);
});

test("year 1 english grammar prefill resolves to grammar skill", () => {
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-year-1-grammar",
    fields: {
      yearGroup: { value: "Year 1", source: "student", confidence: "high" },
      keyStage: { value: "KS1", source: "student", confidence: "high" },
      subject: { value: "english-language", source: "prediction", confidence: "high" },
      englishStrand: { value: "grammar", source: "prediction", confidence: "high" },
      skillFocus: { value: "Grammar", source: "prediction", confidence: "medium" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.subject, "english-language");
  assert.equal(resolved.values.englishStrand, "grammar");
  assert.equal(resolved.values.skillFocus, "Simple sentences");
  assert.equal(/phonics/i.test(resolved.values.skillFocus), false);
  assert.equal(resolved.blockingWarnings.length, 0);
});

test("comprehension strand maps to reading skill internally", () => {
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-comprehension",
    fields: {
      yearGroup: { value: "Year 1", source: "student", confidence: "high" },
      keyStage: { value: "KS1", source: "student", confidence: "high" },
      subject: { value: "english-language", source: "prediction", confidence: "high" },
      englishStrand: { value: "comprehension", source: "prediction", confidence: "high" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.subject, "english-language");
  assert.equal(resolved.values.englishStrand, "comprehension");
  assert.equal(resolved.values.skillFocus, skillsForSubjectAndYear("reading", "Year 1")[0]);
  assert.equal(resolved.blockingWarnings.length, 0);
});

test("student-targeted english prefill without strand blocks for review", () => {
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-english-missing-strand",
    fields: {
      yearGroup: { value: "Year 1", source: "student", confidence: "high" },
      keyStage: { value: "KS1", source: "student", confidence: "high" },
      subject: { value: "english-language", source: "prediction", confidence: "high" },
    },
  });

  const resolved = runResolve(contract);
  assert.equal(resolved.values.subject, "english-language");
  assert.ok(resolved.blockingWarnings.some((entry) => entry.toLowerCase().includes("english strand is missing")));
});

test("prefill contract encode/decode roundtrip preserves trigger and fields", () => {
  const contract = buildUniversalPrefillContract({
    trigger: "student-target",
    studentId: "student-roundtrip",
    fields: {
      yearGroup: { value: "Year 10", source: "student", confidence: "high" },
      keyStage: { value: "KS4", source: "curriculum", confidence: "high" },
      subject: { value: "gcse-science", source: "prediction", confidence: "high" },
    },
    warnings: ["check exam board"],
    blockingIssues: [],
  });

  const encoded = encodeUniversalPrefillContract(contract);
  const decoded = decodeUniversalPrefillContract(encoded);
  assert.ok(decoded);
  assert.equal(decoded?.trigger, "student-target");
  assert.equal(decoded?.fields.subject?.value, "gcse-science");
  assert.deepEqual(decoded?.warnings, ["check exam board"]);
});
