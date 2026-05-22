import assert from "node:assert/strict";
import test from "node:test";
import type { DictionaryWordRecord } from "../src/lib/dictionary";
import { buildKnowledgeGraph, deriveRecoveryPathFromPrerequisites } from "../src/lib/knowledge_graph";
import { encodeDictionaryWordRelationships } from "../src/lib/dictionary_relationships";

function makeWord(input: Partial<DictionaryWordRecord> & Pick<DictionaryWordRecord, "id" | "word" | "normalizedWord">): DictionaryWordRecord {
  const now = new Date("2026-05-22T00:00:00.000Z");
  return {
    id: input.id,
    word: input.word,
    normalizedWord: input.normalizedWord,
    subject: input.subject ?? "maths",
    keyStage: input.keyStage ?? "ks2",
    yearGroup: input.yearGroup ?? "Year 4",
    difficulty: input.difficulty ?? "medium",
    topic: input.topic ?? null,
    skillFocus: input.skillFocus ?? null,
    definitionChild: input.definitionChild ?? `${input.word} definition`,
    definitionParent: input.definitionParent ?? null,
    exampleSentence: input.exampleSentence ?? null,
    secondExampleSentence: input.secondExampleSentence ?? null,
    phonicsPattern: input.phonicsPattern ?? null,
    syllables: input.syllables ?? null,
    pronunciationHint: input.pronunciationHint ?? null,
    synonyms: input.synonyms ?? [],
    antonyms: input.antonyms ?? [],
    relatedWords: input.relatedWords ?? [],
    isTrickyWord: input.isTrickyWord ?? false,
    isTopicKeyword: input.isTopicKeyword ?? false,
    isMathsKeyword: input.isMathsKeyword ?? true,
    isScienceKeyword: input.isScienceKeyword ?? false,
    isReadingKeyword: input.isReadingKeyword ?? false,
    isSpellingKeyword: input.isSpellingKeyword ?? false,
    interventionTags: input.interventionTags ?? [],
    senTags: input.senTags ?? [],
    safeguardingTags: input.safeguardingTags ?? [],
    curriculumTags: input.curriculumTags ?? [],
    importSource: input.importSource ?? "test",
    createdByUserId: input.createdByUserId ?? null,
    updatedByUserId: input.updatedByUserId ?? null,
    deactivatedByUserId: input.deactivatedByUserId ?? null,
    deactivatedAt: input.deactivatedAt ?? null,
    active: input.active ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

test("buildKnowledgeGraph generates typed edges", () => {
  const words = [
    makeWord({
      id: "w1",
      word: "equivalent fraction",
      normalizedWord: "equivalent fraction",
      relatedWords: encodeDictionaryWordRelationships({
        prerequisiteWords: ["fraction", "numerator"],
        easierWords: ["half"],
        relatedWords: ["denominator"],
        interventionPaths: ["fraction-recovery"],
        curriculumTopics: ["fractions"],
      }),
      curriculumTags: ["fractions.y4"],
    }),
    makeWord({ id: "w2", word: "fraction", normalizedWord: "fraction" }),
    makeWord({ id: "w3", word: "numerator", normalizedWord: "numerator" }),
  ];

  const graph = buildKnowledgeGraph({ words, depthLimit: 2, limit: 100, offset: 0 });
  const edgeTypes = new Set(graph.edges.map((edge) => edge.type));

  assert.equal(graph.metrics.totalWords, 3);
  assert.ok(edgeTypes.has("prerequisite"));
  assert.ok(edgeTypes.has("intervention"));
  assert.ok(edgeTypes.has("curriculum"));
});

test("buildKnowledgeGraph detects orphan and missing prerequisite warnings", () => {
  const words = [
    makeWord({
      id: "w1",
      word: "triangle",
      normalizedWord: "triangle",
      relatedWords: encodeDictionaryWordRelationships({ prerequisiteWords: ["polygon"] }),
    }),
    makeWord({
      id: "w2",
      word: "standalone",
      normalizedWord: "standalone",
      relatedWords: [],
      curriculumTags: [],
    }),
  ];

  const graph = buildKnowledgeGraph({ words, depthLimit: 2, limit: 100, offset: 0 });

  assert.ok(graph.metrics.orphanWarnings.isolatedWords.includes("standalone"));
  assert.ok(graph.metrics.orphanWarnings.missingPrerequisites.some((entry) => entry.word === "triangle"));
  assert.ok(graph.metrics.orphanWarnings.missingCurriculumMappings.includes("standalone"));
});

test("deriveRecoveryPathFromPrerequisites resolves shortest chain", () => {
  const map = new Map<string, string[]>([
    ["equivalent fraction", ["fraction"]],
    ["fraction", ["equal parts"]],
    ["equal parts", []],
  ]);

  const result = deriveRecoveryPathFromPrerequisites("equivalent fraction", map, 6);
  assert.deepEqual(result.path, ["equal parts", "fraction", "equivalent fraction"]);
  assert.equal(result.complexity, "medium");
});

test("deriveRecoveryPathFromPrerequisites enforces traversal depth protection", () => {
  const map = new Map<string, string[]>([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", ["d"]],
    ["d", ["e"]],
    ["e", ["f"]],
    ["f", ["g"]],
    ["g", ["h"]],
    ["h", ["i"]],
    ["i", []],
  ]);

  const result = deriveRecoveryPathFromPrerequisites("a", map, 3);
  assert.ok(result.path.length <= 4);
});
