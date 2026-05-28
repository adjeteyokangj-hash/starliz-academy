"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  KnowledgeEdgeType,
  KnowledgeGraphEdge,
  KnowledgeGraphMetrics,
  KnowledgeGraphNode,
} from "@/lib/knowledge_graph";

type ApiResponse = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  metrics: KnowledgeGraphMetrics;
  mode?: "dictionary" | "academic_intelligence" | "hybrid";
  recoveryPath: {
    targetWord: string | null;
    prerequisites: string[];
    revisionOrder: string[];
    shortestRecoveryPath: string[];
    missingConcepts: string[];
    estimatedComplexity: "low" | "medium" | "high";
    estimatedInterventionMinutes: number;
    visualSupportHint: string;
    interventionLessonFocus: string[];
  } | null;
  pagination: {
    offset: number;
    limit: number;
    returned: number;
    totalWords: number;
    hasMore: boolean;
  };
};

const EDGE_COLORS: Record<KnowledgeEdgeType, string> = {
  prerequisite: "#f59e0b",
  easier: "#22c55e",
  harder: "#ef4444",
  related: "#38bdf8",
  intervention: "#f97316",
  phonics: "#8b5cf6",
  curriculum: "#14b8a6",
  has_mastery_state: "#6366f1",
  has_weak_area: "#dc2626",
  recommends: "#16a34a",
  blocked_by: "#f43f5e",
  requires: "#f59e0b",
  informed_by: "#06b6d4",
  targets: "#0ea5e9",
  supports_readiness: "#10b981",
};

const NODE_COLORS: Record<string, string> = {
  word: "#0ea5e9",
  phonics_family: "#a855f7",
  curriculum_topic: "#14b8a6",
  intervention_concept: "#f97316",
  maths_concept: "#f59e0b",
  spelling_family: "#ec4899",
};

function toFlowNodes(nodes: KnowledgeGraphNode[], highlighted: Set<string>): Node[] {
  return nodes.map((node, index) => {
    const col = index % 12;
    const row = Math.floor(index / 12);
    const isHighlighted = highlighted.has(node.label.toLowerCase());
    const baseColor = NODE_COLORS[node.type] ?? "#0ea5e9";
    const nodeRadius = node.type === "word" ? 12 : node.type === "intervention_concept" ? 22 : 16;
    return {
      id: node.id,
      position: { x: col * 240, y: row * 130 },
      data: {
        label: node.label,
        nodeType: node.type,
        details: node.data,
      },
      style: {
        border: isHighlighted ? "2px solid #facc15" : "1px solid rgba(148,163,184,0.35)",
        background: `linear-gradient(135deg, ${baseColor}22, #020617 72%)`,
        color: "#e2e8f0",
        borderRadius: nodeRadius,
        minWidth: 170,
        fontSize: 12,
        boxShadow: isHighlighted ? "0 0 0 2px rgba(250, 204, 21, 0.25)" : "none",
      },
      className: "kg-node",
      draggable: true,
    } satisfies Node;
  });
}

function toFlowEdges(
  edges: KnowledgeGraphEdge[],
  selectedType: KnowledgeEdgeType | "all",
  highlighted: Set<string>,
): Edge[] {
  return edges.map((edge) => {
    const activeByType = selectedType === "all" || edge.type === selectedType;
    const edgeIsInPath = highlighted.size > 0 && highlighted.has(edge.source.toLowerCase()) && highlighted.has(edge.target.toLowerCase());
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      type: "smoothstep",
      animated: edge.type === "prerequisite" || edge.type === "intervention",
      style: {
        stroke: EDGE_COLORS[edge.type],
        strokeWidth: edgeIsInPath ? 3 : activeByType ? 2 : 1,
        opacity: activeByType ? 1 : 0.15,
      },
    } satisfies Edge;
  });
}

function relationBadge(type: KnowledgeEdgeType): string {
  if (type === "prerequisite") return "Critical dependency";
  if (type === "intervention") return "Recovery pathway";
  if (type === "curriculum") return "Curriculum mapping";
  if (type === "phonics") return "Phonics grouping";
  if (type === "has_mastery_state") return "Mastery state link";
  if (type === "has_weak_area") return "Weak-area link";
  if (type === "recommends") return "Recommendation link";
  if (type === "blocked_by") return "Weak-area blocker";
  if (type === "requires") return "Prerequisite link";
  if (type === "informed_by") return "Learning twin signal";
  if (type === "targets") return "Recommendation target";
  if (type === "supports_readiness") return "Readiness support";
  if (type === "harder") return "Progression step";
  if (type === "easier") return "Scaffold concept";
  return "Context link";
}

export default function KnowledgeGraphPage() {
  const [mode, setMode] = useState<"dictionary" | "academic_intelligence" | "hybrid">("dictionary");
  const [studentId, setStudentId] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [keyStage, setKeyStage] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [school, setSchool] = useState("");
  const [interventionType, setInterventionType] = useState("");
  const [depth, setDepth] = useState(2);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(250);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<KnowledgeGraphMetrics | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState<KnowledgeEdgeType | "all">("all");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [recoveryWord, setRecoveryWord] = useState("");
  const [recoveryPlan, setRecoveryPlan] = useState<ApiResponse["recoveryPath"]>(null);
  const [searchTick, setSearchTick] = useState(0);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const debounceRef = useRef<number | null>(null);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const runFetch = useCallback(
    async (nextOffset: number, includeRecoveryWord: string | null) => {
      setLoading(true);
      setError(null);
      try {
        if ((mode === "academic_intelligence" || mode === "hybrid") && !studentId.trim()) {
          setError("Student ID is required for academic intelligence and hybrid graph modes.");
          setLoading(false);
          return;
        }

        const params = new URLSearchParams();
        params.set("mode", mode);
        if (studentId.trim()) params.set("studentId", studentId.trim());
        if (query.trim()) params.set("q", query.trim());
        if (subject) params.set("subject", subject);
        if (keyStage) params.set("keyStage", keyStage);
        if (yearGroup.trim()) params.set("yearGroup", yearGroup.trim());
        if (school.trim()) params.set("school", school.trim());
        if (interventionType.trim()) params.set("interventionType", interventionType.trim());
        params.set("depth", String(depth));
        params.set("offset", String(nextOffset));
        params.set("limit", String(limit));
        if (includeRecoveryWord?.trim()) params.set("recoveryWord", includeRecoveryWord.trim());

        const response = await fetch(`/api/admin/knowledge-graph?${params.toString()}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          window.location.replace("/admin/login?next=/admin/knowledge-graph");
          return;
        }

        if (!response.ok) {
          setError("Unable to load knowledge graph.");
          return;
        }

        const payload = (await response.json()) as ApiResponse;
        const highlighted = new Set<string>((payload.recoveryPath?.shortestRecoveryPath ?? []).map((entry) => entry.toLowerCase()));
        const flowNodes = toFlowNodes(payload.nodes, highlighted);
        const flowEdges = toFlowEdges(payload.edges, selectedEdgeType, highlighted);

        if (nextOffset === 0) {
          setNodes(flowNodes);
          setEdges(flowEdges);
        } else {
          setNodes((current) => {
            const byId = new Map(current.map((node) => [node.id, node]));
            for (const node of flowNodes) byId.set(node.id, node);
            return [...byId.values()];
          });
          setEdges((current) => {
            const byId = new Map(current.map((edge) => [edge.id, edge]));
            for (const edge of flowEdges) byId.set(edge.id, edge);
            return [...byId.values()];
          });
        }

        setHasMore(payload.pagination.hasMore);
        setMetrics(payload.metrics);
        setRecoveryPlan(payload.recoveryPath);
      } catch {
        setError("Unable to load knowledge graph.");
      } finally {
        setLoading(false);
      }
    },
    [depth, interventionType, keyStage, limit, mode, query, school, selectedEdgeType, studentId, subject, yearGroup],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setOffset(0);
      setSearchTick((tick) => tick + 1);
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, subject, keyStage, yearGroup, school, interventionType, depth, mode, studentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runFetch(offset, recoveryWord.trim() ? recoveryWord : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [offset, recoveryWord, runFetch, searchTick]);

  const renderedEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      style: {
        ...(edge.style ?? {}),
        opacity: selectedEdgeType === "all" || edge.label === selectedEdgeType ? 1 : 0.15,
        strokeWidth: selectedEdgeType === "all" || edge.label === selectedEdgeType ? 2 : 1,
      },
    }));
  }, [edges, selectedEdgeType]);

  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode) return null;
    const outgoing = edges.filter((edge) => edge.source === selectedNode.id);
    const incoming = edges.filter((edge) => edge.target === selectedNode.id);
    const linkedConcepts = [...new Set([...outgoing.map((edge) => edge.target), ...incoming.map((edge) => edge.source)])].length;

    return {
      outgoingCount: outgoing.length,
      incomingCount: incoming.length,
      linkedConcepts,
      outgoing,
      incoming,
    };
  }, [edges, selectedNode]);

  const focusOnSearch = useCallback(() => {
    if (!flowInstance) return;
    const target = nodes.find((node) => {
      const label = String((node.data as { label?: string })?.label ?? "").toLowerCase();
      return query.trim() && label.includes(query.trim().toLowerCase());
    });
    if (!target) return;

    setSelectedNode(target);
    flowInstance.setCenter(target.position.x + 90, target.position.y + 45, {
      duration: 450,
      zoom: 1.25,
    });
  }, [flowInstance, nodes, query]);

  const stats = useMemo(() => {
    return [
      { label: "Total words", value: String(metrics?.totalWords ?? 0) },
      { label: "Total graph links", value: String(metrics?.totalGraphLinks ?? 0) },
      { label: "Orphan concepts", value: String(metrics?.orphanConcepts ?? 0) },
      { label: "Intervention-linked concepts", value: String(metrics?.interventionLinkedConcepts ?? 0) },
      { label: "Curriculum coverage", value: `${metrics?.curriculumCoveragePct ?? 0}%` },
      {
        label: "Highest connected concept",
        value: metrics?.highestConnectedConcepts?.[0]
          ? `${metrics.highestConnectedConcepts[0].label} (${metrics.highestConnectedConcepts[0].degree})`
          : "-",
      },
    ];
  }, [metrics]);

  return (
    <div className="space-y-4 pb-12">
      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Knowledge Engine</p>
        <h1 className="mt-2 text-3xl font-black text-white">Visual Knowledge Graph Explorer</h1>
        <p className="mt-2 text-sm text-slate-300">Interactive graph canvas for concept dependencies, recovery paths, curriculum links, and intervention intelligence.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
            <p className="mt-1 text-lg font-black text-white">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select value={mode} onChange={(event) => setMode(event.target.value as "dictionary" | "academic_intelligence" | "hybrid")} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="dictionary">Dictionary graph</option>
            <option value="academic_intelligence">Academic intelligence graph</option>
            <option value="hybrid">Hybrid graph</option>
          </select>
          <input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Student ID (required for academic/hybrid)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search concepts" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <select value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">All subjects</option>
            <option value="english">English</option>
            <option value="spelling">Spelling</option>
            <option value="reading">Reading</option>
            <option value="maths">Maths</option>
            <option value="science">Science</option>
          </select>
          <select value={keyStage} onChange={(event) => setKeyStage(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">All key stages</option>
            <option value="early-years">Early Years</option>
            <option value="ks1">KS1</option>
            <option value="ks2">KS2</option>
            <option value="ks3">KS3</option>
            <option value="ks4">KS4</option>
            <option value="ks5">KS5</option>
          </select>
          <input value={yearGroup} onChange={(event) => setYearGroup(event.target.value)} placeholder="Year group" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <input value={school} onChange={(event) => setSchool(event.target.value)} placeholder="School filter (future)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <input value={interventionType} onChange={(event) => setInterventionType(event.target.value)} placeholder="Intervention type" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          <label className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
            Depth limit: {depth}
            <input type="range" min={1} max={6} value={depth} onChange={(event) => setDepth(Number(event.target.value))} className="mt-1 w-full" />
          </label>
          <div className="flex gap-2">
            <input value={recoveryWord} onChange={(event) => setRecoveryWord(event.target.value)} placeholder="Recovery path word" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            <button
              type="button"
              onClick={() => {
                setOffset(0);
                setSearchTick((tick) => tick + 1);
              }}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-100"
            >
              Show Recovery Path
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "prerequisite", "easier", "harder", "related", "intervention", "phonics", "curriculum"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedEdgeType(type)}
              className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                selectedEdgeType === type
                  ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={focusOnSearch} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-100">
            Focus Search Result
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
          <div className="h-[68vh] rounded-xl border border-slate-800 bg-slate-950">
            <ReactFlow
              nodes={nodes}
              edges={renderedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onInit={setFlowInstance}
              onEdgeClick={(_event, edge) => {
                const edgeLabel = String(edge.label ?? "") as KnowledgeEdgeType;
                if (edgeLabel) setSelectedEdgeType(edgeLabel);
              }}
              fitView
              onNodeClick={(_event, node) => setSelectedNode(node)}
            >
              <MiniMap nodeColor={(node) => NODE_COLORS[(node.data as { nodeType?: string })?.nodeType ?? "word"] ?? "#334155"} />
              <Controls />
              <Background gap={18} color="#0f172a" />
            </ReactFlow>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">{loading ? "Loading graph..." : `${nodes.length} nodes · ${edges.length} edges`}</p>
            <div className="flex gap-2">
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => setOffset((current) => current + limit)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-100"
                >
                  Load More Nodes
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-200">Node Detail</h2>
            {selectedNode ? (
              <div className="mt-2 space-y-2 text-xs text-slate-300">
                <p className="text-base font-black text-white">{String((selectedNode.data as { label?: string })?.label ?? selectedNode.id)}</p>
                <p>Type: {String((selectedNode.data as { nodeType?: string })?.nodeType ?? "-")}</p>
                <p>Definition: {String((selectedNode.data as { details?: { definition?: string } })?.details?.definition ?? "-")}</p>
                <p>KS / Year: {String((selectedNode.data as { details?: { keyStage?: string; yearGroup?: string | null } })?.details?.keyStage ?? "-")} / {String((selectedNode.data as { details?: { yearGroup?: string | null } })?.details?.yearGroup ?? "-")}</p>
                <p>Difficulty: {String((selectedNode.data as { details?: { difficulty?: string } })?.details?.difficulty ?? "-")}</p>
                <p>Relationship counts: out {selectedNodeDetails?.outgoingCount ?? 0}, in {selectedNodeDetails?.incomingCount ?? 0}</p>
                <p>Linked concepts: {selectedNodeDetails?.linkedConcepts ?? 0}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Select a node to inspect concept detail, links, and relationship counts.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-200">Relationship Legend</h2>
            <div className="mt-2 space-y-1">
              {(Object.keys(EDGE_COLORS) as KnowledgeEdgeType[]).map((edgeType) => (
                <div key={edgeType} className="flex items-center justify-between text-xs text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: EDGE_COLORS[edgeType] }} />
                    {edgeType}
                  </span>
                  <span className="text-slate-500">{relationBadge(edgeType)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-200">AI Insight Panel</h2>
            <div className="mt-2 space-y-2 text-xs text-slate-300">
              <p>Most important concepts: {metrics?.aiInsights.mostImportantConcepts.map((item) => item.label).join(", ") || "-"}</p>
              <p>Highest failure concepts: {metrics?.aiInsights.highestFailureConcepts.map((item) => item.label).join(", ") || "-"}</p>
              <p>Most reused prerequisite chains: {metrics?.aiInsights.mostReusedPrerequisiteChains.map((item) => item.chain.join(" -> ")).join(" | ") || "-"}</p>
              <p>Intervention-heavy concepts: {metrics?.aiInsights.interventionHeavyConcepts.map((item) => item.label).join(", ") || "-"}</p>
              <p>Curriculum bottlenecks: {metrics?.aiInsights.curriculumBottlenecks.map((item) => item.label).join(", ") || "-"}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-amber-100">Orphan Detection</h2>
            <div className="mt-2 space-y-2 text-xs text-amber-50">
              <p>Isolated words: {metrics?.orphanWarnings.isolatedWords.length ?? 0}</p>
              <p>Missing prerequisites: {metrics?.orphanWarnings.missingPrerequisites.length ?? 0}</p>
              <p>Dead-end concepts: {metrics?.orphanWarnings.deadEndConcepts.length ?? 0}</p>
              <p>Missing curriculum mappings: {metrics?.orphanWarnings.missingCurriculumMappings.length ?? 0}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-cyan-100">Recovery Path</h2>
            {recoveryPlan ? (
              <div className="mt-2 space-y-1 text-xs text-cyan-50">
                <p>Target: {recoveryPlan.targetWord ?? "-"}</p>
                <p>Path: {recoveryPlan.shortestRecoveryPath.join(" -> ") || "-"}</p>
                <p>Complexity: {recoveryPlan.estimatedComplexity}</p>
                <p>Estimated duration: {recoveryPlan.estimatedInterventionMinutes} mins</p>
                <p>Visual support: {recoveryPlan.visualSupportHint}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-cyan-100/80">Enter a concept and click Show Recovery Path.</p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
