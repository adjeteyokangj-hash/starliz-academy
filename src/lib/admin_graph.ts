import type {
  CurriculumGraphEdge,
  CurriculumGraphNode,
  CurriculumIntelligenceGraph,
} from "@/lib/academic-intelligence/types";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphInsights,
  KnowledgeGraphMetrics,
  KnowledgeGraphNode,
} from "@/lib/knowledge_graph";

export type AdminGraphMode = "dictionary" | "academic_intelligence" | "hybrid";

function toNodeId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function toEdgeId(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function buildEmptyInsights(): KnowledgeGraphInsights {
  return {
    mostImportantConcepts: [],
    highestFailureConcepts: [],
    mostReusedPrerequisiteChains: [],
    interventionHeavyConcepts: [],
    curriculumBottlenecks: [],
  };
}

function percent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function degreeMap(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of nodes) map.set(node.id, 0);
  for (const edge of edges) {
    map.set(edge.source, (map.get(edge.source) ?? 0) + 1);
    map.set(edge.target, (map.get(edge.target) ?? 0) + 1);
  }
  return map;
}

function topConnected(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): Array<{ label: string; degree: number }> {
  const degrees = degreeMap(nodes, edges);
  return nodes
    .map((node) => ({ label: node.label, degree: degrees.get(node.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);
}

function orphanWarnings(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]) {
  const degrees = degreeMap(nodes, edges);
  const isolatedWords = nodes
    .filter((node) => (degrees.get(node.id) ?? 0) === 0)
    .map((node) => node.label)
    .slice(0, 20);

  return {
    isolatedWords,
    missingPrerequisites: [] as Array<{ word: string; missing: string[] }>,
    deadEndConcepts: [],
    missingCurriculumMappings: [],
  };
}

export function projectCurriculumGraphToKnowledgeGraph(input: {
  graph: CurriculumIntelligenceGraph;
  prefix?: string;
}): {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  metrics: KnowledgeGraphMetrics;
} {
  const prefix = input.prefix ?? "academic";

  const nodes: KnowledgeGraphNode[] = input.graph.nodes.map((node: CurriculumGraphNode) => ({
    id: toNodeId(prefix, node.id),
    type: node.type,
    label: node.label,
    data: {
      origin: "derived",
      subject: node.subject ?? undefined,
      curriculumTags: node.topicKey ? [node.topicKey] : [],
      interventionTags: node.type === "weak_area" ? ["weak_area"] : [],
      ...(node.metadata ?? {}),
    },
  }));

  const edges: KnowledgeGraphEdge[] = input.graph.edges.map((edge: CurriculumGraphEdge) => ({
    id: toEdgeId(prefix, edge.id),
    source: toNodeId(prefix, edge.source),
    target: toNodeId(prefix, edge.target),
    type: edge.type,
  }));

  const connected = topConnected(nodes, edges);
  const warnings = orphanWarnings(nodes, edges);
  const covered = input.graph.masteryOverlay.filter((row) => row.coverageStatus === "covered").length;
  const coveragePct = input.graph.masteryOverlay.length > 0
    ? percent((covered / input.graph.masteryOverlay.length) * 100)
    : 0;

  const metrics: KnowledgeGraphMetrics = {
    totalWords: input.graph.masteryOverlay.length,
    totalGraphLinks: edges.length,
    orphanConcepts: warnings.isolatedWords.length,
    highestConnectedConcepts: connected,
    interventionLinkedConcepts: input.graph.weakAreaTrace.length,
    curriculumCoveragePct: coveragePct,
    orphanWarnings: warnings,
    aiInsights: buildEmptyInsights(),
  };

  return { nodes, edges, metrics };
}

export function mergeKnowledgeGraphViews(input: {
  dictionary?: {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
    metrics: KnowledgeGraphMetrics;
  } | null;
  academic?: {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
    metrics: KnowledgeGraphMetrics;
  } | null;
  mode: AdminGraphMode;
}): {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  metrics: KnowledgeGraphMetrics;
} {
  if (input.mode === "dictionary" && input.dictionary) return input.dictionary;
  if (input.mode === "academic_intelligence" && input.academic) return input.academic;

  const dictionaryNodes = input.dictionary?.nodes ?? [];
  const dictionaryEdges = input.dictionary?.edges ?? [];
  const academicNodes = input.academic?.nodes ?? [];
  const academicEdges = input.academic?.edges ?? [];

  const nodeById = new Map<string, KnowledgeGraphNode>();
  for (const node of [...dictionaryNodes, ...academicNodes]) nodeById.set(node.id, node);

  const edgeById = new Map<string, KnowledgeGraphEdge>();
  for (const edge of [...dictionaryEdges, ...academicEdges]) edgeById.set(edge.id, edge);

  const nodes = Array.from(nodeById.values());
  const edges = Array.from(edgeById.values());

  const highestConnectedConcepts = topConnected(nodes, edges);
  const warnings = orphanWarnings(nodes, edges);

  const metrics: KnowledgeGraphMetrics = {
    totalWords: (input.dictionary?.metrics.totalWords ?? 0) + (input.academic?.metrics.totalWords ?? 0),
    totalGraphLinks: edges.length,
    orphanConcepts: warnings.isolatedWords.length,
    highestConnectedConcepts,
    interventionLinkedConcepts: (input.dictionary?.metrics.interventionLinkedConcepts ?? 0)
      + (input.academic?.metrics.interventionLinkedConcepts ?? 0),
    curriculumCoveragePct: percent(((input.dictionary?.metrics.curriculumCoveragePct ?? 0)
      + (input.academic?.metrics.curriculumCoveragePct ?? 0)) / 2),
    orphanWarnings: warnings,
    aiInsights: buildEmptyInsights(),
  };

  return { nodes, edges, metrics };
}
