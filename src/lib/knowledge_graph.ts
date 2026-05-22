import type { DictionaryWordRecord } from "@/lib/dictionary";
import { decodeDictionaryWordRelationships } from "@/lib/dictionary_relationships";
import { normalizeDictionaryWord } from "@/lib/dictionary";

export type KnowledgeNodeType =
  | "word"
  | "phonics_family"
  | "curriculum_topic"
  | "intervention_concept"
  | "maths_concept"
  | "spelling_family";

export type KnowledgeEdgeType =
  | "prerequisite"
  | "easier"
  | "harder"
  | "related"
  | "intervention"
  | "phonics"
  | "curriculum";

export type KnowledgeGraphNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  data: {
    origin: "dictionary" | "derived";
    wordId?: string;
    normalizedWord?: string;
    subject?: string;
    keyStage?: string;
    yearGroup?: string | null;
    difficulty?: string;
    definition?: string;
    curriculumTags?: string[];
    interventionTags?: string[];
  };
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: KnowledgeEdgeType;
};

export type KnowledgeGraphInsights = {
  mostImportantConcepts: Array<{ label: string; degree: number }>;
  highestFailureConcepts: Array<{ label: string; reason: string }>;
  mostReusedPrerequisiteChains: Array<{ chain: string[]; count: number }>;
  interventionHeavyConcepts: Array<{ label: string; count: number }>;
  curriculumBottlenecks: Array<{ label: string; reason: string }>;
};

export type KnowledgeGraphMetrics = {
  totalWords: number;
  totalGraphLinks: number;
  orphanConcepts: number;
  highestConnectedConcepts: Array<{ label: string; degree: number }>;
  interventionLinkedConcepts: number;
  curriculumCoveragePct: number;
  orphanWarnings: {
    isolatedWords: string[];
    missingPrerequisites: Array<{ word: string; missing: string[] }>;
    deadEndConcepts: string[];
    missingCurriculumMappings: string[];
  };
  aiInsights: KnowledgeGraphInsights;
};

export type RecoveryPathResult = {
  targetWord: string;
  path: string[];
  complexity: "low" | "medium" | "high";
};

export type BuildKnowledgeGraphInput = {
  words: DictionaryWordRecord[];
  search?: string | null;
  depthLimit?: number;
  offset?: number;
  limit?: number;
};

export type BuildKnowledgeGraphResult = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  metrics: KnowledgeGraphMetrics;
};

function safeText(value: unknown): string {
  return String(value ?? "").trim();
}

function conceptNodeId(type: KnowledgeNodeType, label: string): string {
  return `${type}:${safeText(label).toLowerCase()}`;
}

function relationshipMemo(words: DictionaryWordRecord[]): Map<string, ReturnType<typeof decodeDictionaryWordRelationships>> {
  const memo = new Map<string, ReturnType<typeof decodeDictionaryWordRelationships>>();
  for (const word of words) {
    memo.set(word.id, decodeDictionaryWordRelationships(word.relatedWords));
  }
  return memo;
}

function edgeId(source: string, target: string, type: KnowledgeEdgeType): string {
  return `${source}|${target}|${type}`;
}

function toComplexity(count: number): "low" | "medium" | "high" {
  if (count <= 1) return "low";
  if (count <= 5) return "medium";
  return "high";
}

export function deriveRecoveryPathFromPrerequisites(
  targetWord: string,
  prerequisitesByWord: Map<string, string[]>,
  depthLimit = 8,
): RecoveryPathResult {
  const normalizedTarget = normalizeDictionaryWord(targetWord);
  if (!normalizedTarget) {
    return { targetWord, path: [], complexity: "low" };
  }

  const queue: Array<{ node: string; path: string[]; depth: number }> = [
    { node: normalizedTarget, path: [normalizedTarget], depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    if (visited.has(current.node)) continue;
    visited.add(current.node);

    const deps = prerequisitesByWord.get(current.node) ?? [];
    if (deps.length === 0 || current.depth >= depthLimit) {
      const finalPath = [...current.path].reverse();
      return {
        targetWord,
        path: finalPath,
        complexity: toComplexity(finalPath.length - 1),
      };
    }

    for (const dep of deps) {
      if (current.path.includes(dep)) continue;
      queue.push({ node: dep, path: [...current.path, dep], depth: current.depth + 1 });
    }
  }

  return {
    targetWord,
    path: [normalizedTarget],
    complexity: "low",
  };
}

export function buildKnowledgeGraph(input: BuildKnowledgeGraphInput): BuildKnowledgeGraphResult {
  const words = input.words;
  const depthLimit = Math.max(1, Math.min(6, Math.floor(input.depthLimit ?? 2)));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const limit = Math.max(25, Math.min(600, Math.floor(input.limit ?? 250)));
  const search = safeText(input.search).toLowerCase();

  const relationships = relationshipMemo(words);
  const byNormalizedWord = new Map<string, DictionaryWordRecord>();
  for (const word of words) {
    byNormalizedWord.set(word.normalizedWord, word);
  }

  const matchingWords = search
    ? words.filter((word) => {
      return [word.word, word.definitionChild, word.topic ?? "", word.skillFocus ?? ""].some((field) =>
        safeText(field).toLowerCase().includes(search),
      );
    })
    : words;

  const seedWords = matchingWords.slice(offset, offset + limit);

  const nodes = new Map<string, KnowledgeGraphNode>();
  const edges = new Map<string, KnowledgeGraphEdge>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();

  const queue: Array<{ word: DictionaryWordRecord; depth: number }> = seedWords.map((word) => ({ word, depth: 0 }));
  const visitedWords = new Set<string>();

  const ensureNode = (node: KnowledgeGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  const ensureWordNode = (word: DictionaryWordRecord) => {
    ensureNode({
      id: `word:${word.id}`,
      type: "word",
      label: word.word,
      data: {
        origin: "dictionary",
        wordId: word.id,
        normalizedWord: word.normalizedWord,
        subject: word.subject,
        keyStage: word.keyStage,
        yearGroup: word.yearGroup,
        difficulty: word.difficulty,
        definition: word.definitionChild,
        curriculumTags: word.curriculumTags,
        interventionTags: word.interventionTags,
      },
    });
  };

  const ensureEdge = (source: string, target: string, type: KnowledgeEdgeType) => {
    const id = edgeId(source, target, type);
    if (edges.has(id)) return;
    edges.set(id, { id, source, target, type });
    outgoing.set(source, (outgoing.get(source) ?? 0) + 1);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  };

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (visitedWords.has(current.word.id)) continue;
    visitedWords.add(current.word.id);

    ensureWordNode(current.word);

    const rel = relationships.get(current.word.id) ?? decodeDictionaryWordRelationships(current.word.relatedWords);
    const sourceId = `word:${current.word.id}`;

    const linkWordLike = (values: string[], type: KnowledgeEdgeType) => {
      for (const value of values) {
        const normalized = normalizeDictionaryWord(value);
        if (!normalized) continue;

        const linkedWord = byNormalizedWord.get(normalized);
        if (linkedWord) {
          ensureWordNode(linkedWord);
          ensureEdge(sourceId, `word:${linkedWord.id}`, type);
          if (current.depth < depthLimit) {
            queue.push({ word: linkedWord, depth: current.depth + 1 });
          }
        } else {
          const targetId = conceptNodeId("word", value);
          ensureNode({
            id: targetId,
            type: "word",
            label: value,
            data: { origin: "derived", normalizedWord: normalized },
          });
          ensureEdge(sourceId, targetId, type);
        }
      }
    };

    linkWordLike(rel.prerequisiteWords, "prerequisite");
    linkWordLike(rel.easierWords, "easier");
    linkWordLike(rel.harderWords, "harder");
    linkWordLike(rel.relatedWords, "related");

    const linkConcept = (values: string[], nodeType: KnowledgeNodeType, edgeType: KnowledgeEdgeType) => {
      for (const value of values) {
        const label = safeText(value);
        if (!label) continue;
        const targetId = conceptNodeId(nodeType, label);
        ensureNode({
          id: targetId,
          type: nodeType,
          label,
          data: { origin: "derived" },
        });
        ensureEdge(sourceId, targetId, edgeType);
      }
    };

    linkConcept(rel.relatedMathConcepts, "maths_concept", "related");
    linkConcept(rel.phonicsFamilies, "phonics_family", "phonics");
    linkConcept(rel.spellingFamilies, "spelling_family", "related");
    linkConcept(rel.curriculumTopics, "curriculum_topic", "curriculum");
    linkConcept(rel.interventionPaths, "intervention_concept", "intervention");

    for (const tag of current.word.curriculumTags) {
      const label = safeText(tag);
      if (!label) continue;
      const targetId = conceptNodeId("curriculum_topic", label);
      ensureNode({ id: targetId, type: "curriculum_topic", label, data: { origin: "derived" } });
      ensureEdge(sourceId, targetId, "curriculum");
    }

    for (const tag of current.word.interventionTags) {
      const label = safeText(tag);
      if (!label) continue;
      const targetId = conceptNodeId("intervention_concept", label);
      ensureNode({ id: targetId, type: "intervention_concept", label, data: { origin: "derived" } });
      ensureEdge(sourceId, targetId, "intervention");
    }
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];

  const dictionaryWordNodes = nodeList.filter((node) => node.type === "word" && node.data.origin === "dictionary");
  const isolatedWords = dictionaryWordNodes
    .filter((node) => (incoming.get(node.id) ?? 0) + (outgoing.get(node.id) ?? 0) === 0)
    .map((node) => node.label);

  const deadEndConcepts = dictionaryWordNodes
    .filter((node) => (incoming.get(node.id) ?? 0) > 0 && (outgoing.get(node.id) ?? 0) === 0)
    .map((node) => node.label);

  const missingPrerequisites = seedWords
    .map((word) => {
      const rel = relationships.get(word.id);
      const missing = (rel?.prerequisiteWords ?? []).filter((entry) => !byNormalizedWord.has(normalizeDictionaryWord(entry)));
      return missing.length ? { word: word.word, missing } : null;
    })
    .filter((entry): entry is { word: string; missing: string[] } => Boolean(entry));

  const missingCurriculumMappings = seedWords
    .filter((word) => {
      const rel = relationships.get(word.id);
      return (word.curriculumTags.length === 0) && ((rel?.curriculumTopics.length ?? 0) === 0);
    })
    .map((word) => word.word);

  const degreeList = nodeList
    .map((node) => ({ label: node.label, degree: (incoming.get(node.id) ?? 0) + (outgoing.get(node.id) ?? 0), id: node.id }))
    .sort((a, b) => b.degree - a.degree);

  const interventionLinkedConcepts = new Set(
    edgeList.filter((edge) => edge.type === "intervention").flatMap((edge) => [edge.source, edge.target]),
  ).size;

  const curriculumLinkedWords = seedWords.filter((word) => {
    const rel = relationships.get(word.id);
    return word.curriculumTags.length > 0 || (rel?.curriculumTopics.length ?? 0) > 0;
  }).length;

  const prerequisiteChains = new Map<string, number>();
  for (const word of seedWords) {
    const rel = relationships.get(word.id);
    const chain = [...(rel?.prerequisiteWords ?? []), word.word].filter(Boolean);
    if (chain.length < 2) continue;
    const key = chain.join(" -> ");
    prerequisiteChains.set(key, (prerequisiteChains.get(key) ?? 0) + 1);
  }

  const interventionHeavyConcepts = seedWords
    .map((word) => ({
      label: word.word,
      count: (relationships.get(word.id)?.interventionPaths.length ?? 0) + word.interventionTags.length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const metrics: KnowledgeGraphMetrics = {
    totalWords: seedWords.length,
    totalGraphLinks: edgeList.length,
    orphanConcepts: isolatedWords.length,
    highestConnectedConcepts: degreeList.slice(0, 5).map((entry) => ({ label: entry.label, degree: entry.degree })),
    interventionLinkedConcepts,
    curriculumCoveragePct: seedWords.length ? Math.round((curriculumLinkedWords / seedWords.length) * 100) : 0,
    orphanWarnings: {
      isolatedWords,
      missingPrerequisites,
      deadEndConcepts,
      missingCurriculumMappings,
    },
    aiInsights: {
      mostImportantConcepts: degreeList.slice(0, 5).map((entry) => ({ label: entry.label, degree: entry.degree })),
      highestFailureConcepts: isolatedWords.slice(0, 5).map((label) => ({ label, reason: "isolated concept" })),
      mostReusedPrerequisiteChains: [...prerequisiteChains.entries()]
        .map(([chain, count]) => ({ chain: chain.split(" -> "), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      interventionHeavyConcepts,
      curriculumBottlenecks: missingCurriculumMappings.slice(0, 5).map((label) => ({ label, reason: "missing curriculum mapping" })),
    },
  };

  return {
    nodes: nodeList,
    edges: edgeList,
    metrics,
  };
}
