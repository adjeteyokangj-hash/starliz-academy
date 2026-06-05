"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { KnowledgeEdgeType, KnowledgeGraphEdge, KnowledgeGraphMetrics, KnowledgeGraphNode } from "@/lib/knowledge_graph";
import type {
  CurriculumGraphApprovalWorkflow,
  CurriculumGraphAuditMetadata,
  CurriculumGraphFallback,
  CurriculumGraphHeartbeat,
  CurriculumGraphProtectionStatus,
  HeartbeatDecision,
} from "@/lib/academic-intelligence/types";
import type { BodyOrchestrationReport } from "@/lib/academic-intelligence/subject-feature-orchestration";
import { edgeFocusClass, topicKeyFromLabel } from "@/lib/academic-intelligence/graph-overlay";

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
  heartbeat: CurriculumGraphHeartbeat | null;
  heartbeatDecision: HeartbeatDecision | null;
  bodyOrchestration: BodyOrchestrationReport | null;
  protection: CurriculumGraphProtectionStatus | null;
  approvalWorkflow: CurriculumGraphApprovalWorkflow | null;
  fallback: CurriculumGraphFallback | null;
  graphAudit: CurriculumGraphAuditMetadata | null;
  studentOverlay: {
    masteryGapTopics: string[];
    weakAreaTopics: string[];
    confidenceScore: number;
    activeInterventions: Array<{
      topicKey: string;
      label: string;
      status: string;
      reason: string;
      dueDate: string | null;
    }>;
    temporal: {
      recentlyImproved: string[];
      decayingMastery: string[];
      overdueRevision: string[];
      forgottenConcepts: string[];
    };
    heatmap: {
      weakClusters: string[];
      highRiskConcepts: string[];
      interventionHeavyAreas: string[];
      curriculumBottlenecks: string[];
    };
    reasoning: {
      why: string[];
      prerequisiteBlockers: string[];
      chain: string[];
    };
    learningTwin: {
      preferredExplanationStyle: string;
      paceProfile: string;
      confidenceProfile: string;
      memoryProfile: string;
      retryDependency: string;
    };
    nodeSignals: Array<{
      topicKey: string;
      subject: string;
      topic: string;
      skill: string | null;
      masteryStatus: string;
      confidenceScore: number;
      weakAreaActive: boolean;
      revisionOverdue: boolean;
      lastPractisedAt: string | null;
      recommendationCount: number;
      activeInterventionCount: number;
      failureImpact: number;
      importanceScore: number;
      nodeState: "mastered" | "practising" | "weak" | "intervention_active" | "forgotten";
      recentlyImproved: boolean;
      decayingMastery: boolean;
      overdueRevision: boolean;
      forgottenConcept: boolean;
    }>;
    examReadinessBand: string;
    recommendationFocus: string[];
    reportSignals: string[];
  } | null;
};

type StudentHeartbeatProfile = {
  id: string;
  name: string;
  yearGroup: string | null;
  level: number;
  quickLevelFinder: {
    completed: boolean;
    status: string | null;
    responseCount: number;
    totalQuestions: number;
  };
};

type StudentHeartbeatProfileResponse = {
  student: StudentHeartbeatProfile;
};

type HeartbeatTab = "overview" | "graph" | "systems" | "protection" | "recommendations";

type HeartbeatBadge = "Protected" | "Graph-Aware" | "Student-Safe" | "AI-Suggestion Only";

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

const EDGE_DOT_CLASS: Record<KnowledgeEdgeType, string> = {
  prerequisite: "bg-amber-500",
  easier: "bg-green-500",
  harder: "bg-red-500",
  related: "bg-sky-400",
  intervention: "bg-orange-500",
  phonics: "bg-violet-500",
  curriculum: "bg-teal-500",
  has_mastery_state: "bg-indigo-500",
  has_weak_area: "bg-red-600",
  recommends: "bg-green-600",
  blocked_by: "bg-rose-500",
  requires: "bg-amber-500",
  informed_by: "bg-cyan-500",
  targets: "bg-sky-500",
  supports_readiness: "bg-emerald-500",
};

const NODE_COLORS: Record<string, string> = {
  word: "#0ea5e9",
  phonics_family: "#a855f7",
  curriculum_topic: "#14b8a6",
  intervention_concept: "#f97316",
  maths_concept: "#f59e0b",
  spelling_family: "#ec4899",
};

const MASTERY_STATE_STYLES: Record<
  "mastered" | "practising" | "weak" | "intervention_active" | "forgotten",
  {
    color: string;
    border: string;
    ring: string;
    className: string;
  }
> = {
  mastered: {
    color: "#16a34a",
    border: "#22c55e",
    ring: "0 0 0 1px rgba(34,197,94,0.35), 0 0 20px rgba(22,163,74,0.4)",
    className: "heartbeat-node heartbeat-node--mastered",
  },
  practising: {
    color: "#eab308",
    border: "#facc15",
    ring: "0 0 0 1px rgba(250,204,21,0.35), 0 0 18px rgba(234,179,8,0.33)",
    className: "heartbeat-node heartbeat-node--practising",
  },
  weak: {
    color: "#ef4444",
    border: "#f43f5e",
    ring: "0 0 0 1px rgba(244,63,94,0.4), 0 0 24px rgba(239,68,68,0.42)",
    className: "heartbeat-node heartbeat-node--weak",
  },
  intervention_active: {
    color: "#38bdf8",
    border: "#0ea5e9",
    ring: "0 0 0 1px rgba(14,165,233,0.45), 0 0 24px rgba(56,189,248,0.45)",
    className: "heartbeat-node heartbeat-node--intervention",
  },
  forgotten: {
    color: "#f97316",
    border: "#fb923c",
    ring: "0 0 0 1px rgba(251,146,60,0.4), 0 0 16px rgba(249,115,22,0.35)",
    className: "heartbeat-node heartbeat-node--forgotten",
  },
};

function buildNodeSignalMap(overlay: ApiResponse["studentOverlay"]): Map<string, NonNullable<ApiResponse["studentOverlay"]>["nodeSignals"][number]> {
  const map = new Map<string, NonNullable<ApiResponse["studentOverlay"]>["nodeSignals"][number]>();
  for (const signal of overlay?.nodeSignals ?? []) {
    map.set(topicKeyFromLabel(signal.topic), signal);
    map.set(topicKeyFromLabel(signal.topicKey), signal);
  }
  return map;
}

function nodeSize(signal?: NonNullable<ApiResponse["studentOverlay"]>["nodeSignals"][number]): number {
  if (!signal) return 176;
  const scaled = 150 + Math.round(signal.importanceScore * 0.95 + signal.failureImpact * 0.65 + signal.recommendationCount * 8);
  return Math.max(160, Math.min(360, scaled));
}

function nodeState(signal?: NonNullable<ApiResponse["studentOverlay"]>["nodeSignals"][number]) {
  if (!signal) return null;
  return MASTERY_STATE_STYLES[signal.nodeState];
}

function edgeAnimationType(edgeType: KnowledgeEdgeType): "recommendation" | "catchup" | "prerequisite" | "readiness" | "default" {
  if (edgeType === "recommends" || edgeType === "targets" || edgeType === "informed_by") return "recommendation";
  if (edgeType === "intervention" || edgeType === "has_weak_area" || edgeType === "blocked_by") return "catchup";
  if (edgeType === "prerequisite" || edgeType === "requires") return "prerequisite";
  if (edgeType === "supports_readiness" || edgeType === "has_mastery_state") return "readiness";
  return "default";
}

function toFlowNodes(
  nodes: KnowledgeGraphNode[],
  highlighted: Set<string>,
  overlay: ApiResponse["studentOverlay"],
): Node[] {
  const signalMap = buildNodeSignalMap(overlay);
  return nodes.map((node, index) => {
    const col = index % 10;
    const row = Math.floor(index / 10);
    const isHighlighted = highlighted.has(node.label.toLowerCase());
    const signal = signalMap.get(topicKeyFromLabel(node.label));
    const stateStyle = nodeState(signal);
    const baseColor = NODE_COLORS[node.type] ?? "#0ea5e9";
    const width = nodeSize(signal);
    const height = Math.max(68, Math.round(width * 0.42));
    const glowColor = stateStyle?.color ?? baseColor;

    return {
      id: node.id,
      position: { x: col * 220, y: row * 124 },
      data: {
        label: node.label,
        nodeType: node.type,
        details: node.data,
        signal,
      },
      style: {
        border: isHighlighted
          ? "2px solid #facc15"
          : `1px solid ${stateStyle?.border ?? "rgba(148,163,184,0.35)"}`,
        background: `radial-gradient(circle at 12% 12%, ${glowColor}26 0%, ${baseColor}1e 36%, #020617 78%)`,
        color: "#e2e8f0",
        borderRadius: 16,
        minWidth: width,
        minHeight: height,
        boxShadow: stateStyle?.ring ?? `0 0 0 1px rgba(148,163,184,0.22), 0 0 10px ${baseColor}20`,
        fontSize: 12,
        fontWeight: 700,
      },
      className: stateStyle?.className ?? "heartbeat-node",
      draggable: true,
    } satisfies Node;
  });
}

function toFlowEdges(
  edges: KnowledgeGraphEdge[],
  selectedType: KnowledgeEdgeType | "all",
  highlighted: Set<string>,
  overlay: ApiResponse["studentOverlay"],
): Edge[] {
  const overlayHotTopics = new Set((overlay?.weakAreaTopics ?? []).map((entry) => topicKeyFromLabel(entry)));
  return edges.map((edge) => {
    const activeByType = selectedType === "all" || edge.type === selectedType;
    const edgeIsInPath = highlighted.size > 0
      && highlighted.has(edge.source.toLowerCase())
      && highlighted.has(edge.target.toLowerCase());
    const edgeMode = edgeAnimationType(edge.type);
    const edgeHot = overlayHotTopics.has(topicKeyFromLabel(edge.source)) || overlayHotTopics.has(topicKeyFromLabel(edge.target));
    const shouldAnimate = edgeIsInPath || edgeHot || edgeMode !== "default";

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      type: "smoothstep",
      animated: shouldAnimate,
      className: edgeFocusClass(edgeMode, shouldAnimate),
      style: {
        stroke: EDGE_COLORS[edge.type],
        strokeWidth: edgeIsInPath ? 3.2 : edgeHot ? 2.6 : activeByType ? 2 : 1,
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
  if (type === "has_mastery_state") return "Mastery link";
  if (type === "has_weak_area") return "Weak-area link";
  if (type === "recommends") return "Recommendation link";
  if (type === "blocked_by") return "Blocker edge";
  if (type === "requires") return "Prerequisite edge";
  if (type === "informed_by") return "Learning twin edge";
  if (type === "targets") return "Recommendation target";
  if (type === "supports_readiness") return "Readiness support";
  return "Context link";
}

function statusTone(status: "ready" | "partial" | "missing"): string {
  if (status === "ready") return "border-emerald-400/40 bg-emerald-500/12 text-emerald-100";
  if (status === "partial") return "border-amber-400/40 bg-amber-500/12 text-amber-100";
  return "border-rose-400/40 bg-rose-500/12 text-rose-100";
}

function prettySystemLabel(system: string): string {
  const labels: Record<string, string> = {
    curriculum_knowledge_graph: "Curriculum Knowledge Graph",
    student_mastery_data: "Student Mastery Data",
    ai_generator: "AI Generator",
    smart_catch_up: "Smart Catch-Up",
    assessment_exam_readiness: "Assessment / Exam Readiness",
    learning_twin: "Learning Twin",
    school_day_week_mode: "School Day / School Week",
    parent_admin_reports: "Parent/Admin Reports",
    content_quality_safeguarding: "Content Quality & Safeguarding",
    storage_media: "Cloudflare R2 / Media",
  };
  return labels[system] ?? system;
}

function buildAdminLoginHref(pathname: string, searchParams: URLSearchParams): string {
  const search = searchParams.toString();
  const next = `${pathname}${search ? `?${search}` : ""}`;
  return `/admin/login?next=${encodeURIComponent(next)}`;
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialStudentId = searchParams.get("studentId") ?? "";
  const initialMode = searchParams.get("mode") ?? (initialStudentId.trim() ? "academic_intelligence" : null);
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<HeartbeatTab>(
    initialTab === "overview" || initialTab === "graph" || initialTab === "systems" || initialTab === "protection" || initialTab === "recommendations"
      ? initialTab
      : "overview",
  );
  const [mode, setMode] = useState<"dictionary" | "academic_intelligence" | "hybrid">(
    initialMode === "dictionary" || initialMode === "academic_intelligence" || initialMode === "hybrid" ? initialMode : "dictionary",
  );
  const [studentId, setStudentId] = useState(initialStudentId);
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
  const [heartbeat, setHeartbeat] = useState<CurriculumGraphHeartbeat | null>(null);
  const [heartbeatDecision, setHeartbeatDecision] = useState<HeartbeatDecision | null>(null);
  const [protection, setProtection] = useState<CurriculumGraphProtectionStatus | null>(null);
  const [approvalWorkflow, setApprovalWorkflow] = useState<CurriculumGraphApprovalWorkflow | null>(null);
  const [fallback, setFallback] = useState<CurriculumGraphFallback | null>(null);
  const [graphAudit, setGraphAudit] = useState<CurriculumGraphAuditMetadata | null>(null);
  const [bodyOrchestration, setBodyOrchestration] = useState<ApiResponse["bodyOrchestration"]>(null);
  const [studentOverlay, setStudentOverlay] = useState<ApiResponse["studentOverlay"]>(null);
  const [studentHeartbeatProfile, setStudentHeartbeatProfile] = useState<StudentHeartbeatProfile | null>(null);
  const [studentHeartbeatLoading, setStudentHeartbeatLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdgeType, setSelectedEdgeType] = useState<KnowledgeEdgeType | "all">("all");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [recoveryWord, setRecoveryWord] = useState("");
  const [recoveryPlan, setRecoveryPlan] = useState<ApiResponse["recoveryPath"]>(null);
  const [searchTick, setSearchTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const trimmedStudentId = studentId.trim();
  const hasStudentHeartbeatContext = trimmedStudentId.length > 0;
  const adminLoginHref = useMemo(() => buildAdminLoginHref(pathname, new URLSearchParams(searchParams.toString())), [pathname, searchParams]);

  const heartbeatBadges: HeartbeatBadge[] = [
    "Protected",
    "Graph-Aware",
    "Student-Safe",
    "AI-Suggestion Only",
  ];

  const systemStatus = useMemo(() => {
    const expected = [
      "curriculum_knowledge_graph",
      "ai_generator",
      "smart_catch_up",
      "assessment_exam_readiness",
      "learning_twin",
      "school_day_week_mode",
      "parent_admin_reports",
      "content_quality_safeguarding",
      "storage_media",
    ];
    const bySystem = new Map((heartbeat?.systemStates ?? []).map((entry) => [entry.system, entry]));

    return expected.map((system) => {
      const row = bySystem.get(system as never);
      if (!row) {
        return {
          system,
          label: prettySystemLabel(system),
          status: "missing" as const,
          summary: "No heartbeat state reported yet.",
        };
      }
      return {
        system,
        label: prettySystemLabel(system),
        status: row.status,
        summary: row.summary,
      };
    });
  }, [heartbeat]);

  const connectedCount = systemStatus.filter((entry) => entry.status === "ready").length;
  const partialCount = systemStatus.filter((entry) => entry.status === "partial").length;
  const missingCount = systemStatus.filter((entry) => entry.status === "missing").length;

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
          router.replace(adminLoginHref);
          return;
        }

        if (!response.ok) {
          setError("Unable to load heartbeat graph data.");
          return;
        }

        const payload = (await response.json()) as ApiResponse;
        const highlighted = new Set<string>((payload.recoveryPath?.shortestRecoveryPath ?? []).map((entry) => entry.toLowerCase()));
        const flowNodes = toFlowNodes(payload.nodes, highlighted, payload.studentOverlay);
        const flowEdges = toFlowEdges(payload.edges, selectedEdgeType, highlighted, payload.studentOverlay);

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
        setRecoveryPlan(payload.recoveryPath);
        setHeartbeat(payload.heartbeat);
        setHeartbeatDecision(payload.heartbeatDecision);
        setProtection(payload.protection);
        setApprovalWorkflow(payload.approvalWorkflow);
        setFallback(payload.fallback);
        setGraphAudit(payload.graphAudit);
        setBodyOrchestration(payload.bodyOrchestration);
        setStudentOverlay(payload.studentOverlay);
      } catch {
        setError("Unable to load heartbeat graph data.");
      } finally {
        setLoading(false);
      }
    },
    [adminLoginHref, depth, interventionType, keyStage, limit, mode, query, router, school, selectedEdgeType, studentId, subject, yearGroup],
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

  useEffect(() => {
    if (!trimmedStudentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStudentHeartbeatProfile(null);
      setStudentHeartbeatLoading(false);
      return;
    }

    let cancelled = false;
    setStudentHeartbeatLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/students/${encodeURIComponent(trimmedStudentId)}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace(adminLoginHref);
          return;
        }

        if (!response.ok) {
          if (!cancelled) setStudentHeartbeatProfile(null);
          return;
        }

        const payload = (await response.json()) as StudentHeartbeatProfileResponse;
        if (!cancelled) {
          setStudentHeartbeatProfile(payload.student);
        }
      } finally {
        if (!cancelled) setStudentHeartbeatLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminLoginHref, router, trimmedStudentId]);

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

  const overlaySummary = useMemo(() => {
    const temporal = studentOverlay?.temporal ?? {
      recentlyImproved: [],
      decayingMastery: [],
      overdueRevision: [],
      forgottenConcepts: [],
    };
    const heatmap = studentOverlay?.heatmap ?? {
      weakClusters: [],
      highRiskConcepts: [],
      interventionHeavyAreas: [],
      curriculumBottlenecks: [],
    };
    const reasoning = studentOverlay?.reasoning ?? {
      why: [],
      prerequisiteBlockers: [],
      chain: [],
    };
    return { temporal, heatmap, reasoning };
  }, [studentOverlay]);

  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode) return null;
    const outgoing = edges.filter((edge) => edge.source === selectedNode.id);
    const incoming = edges.filter((edge) => edge.target === selectedNode.id);
    const linkedConcepts = [...new Set([...outgoing.map((edge) => edge.target), ...incoming.map((edge) => edge.source)])].length;

    return {
      outgoingCount: outgoing.length,
      incomingCount: incoming.length,
      linkedConcepts,
    };
  }, [edges, selectedNode]);

  const stats = useMemo(() => {
    const baseStats = [
      { label: "Connected", value: String(connectedCount), tone: "ready" as const, tab: "systems" as HeartbeatTab },
      { label: "Partial", value: String(partialCount), tone: "partial" as const, tab: "systems" as HeartbeatTab },
      { label: "Missing", value: String(missingCount), tone: "missing" as const, tab: "systems" as HeartbeatTab },
      { label: "Nodes", value: String(nodes.length), tone: "ready" as const, tab: "graph" as HeartbeatTab },
      { label: "Edges", value: String(edges.length), tone: "ready" as const, tab: "graph" as HeartbeatTab },
      { label: "Validation Issues", value: String(protection?.validation.issues.length ?? 0), tone: (protection?.validation.valid ?? true) ? "ready" as const : "partial" as const, tab: "protection" as HeartbeatTab },
    ];

    if (!hasStudentHeartbeatContext) {
      return baseStats;
    }

    const confidence = studentOverlay?.confidenceScore ?? 0;
    return [
      {
        label: "Confidence",
        value: studentOverlay ? `${confidence}%` : "-",
        tone: confidence >= 70 ? "ready" as const : confidence >= 50 ? "partial" as const : "missing" as const,
        tab: "overview" as HeartbeatTab,
      },
      { label: "Mastery Gaps", value: String(studentOverlay?.masteryGapTopics.length ?? 0), tone: "partial" as const, tab: "overview" as HeartbeatTab },
      { label: "Interventions", value: String(studentOverlay?.activeInterventions.length ?? 0), tone: "ready" as const, tab: "overview" as HeartbeatTab },
      { label: "Decision Signals", value: String(studentOverlay?.reportSignals.length ?? 0), tone: "ready" as const, tab: "recommendations" as HeartbeatTab },
      ...baseStats,
    ];
  }, [connectedCount, partialCount, missingCount, nodes.length, edges.length, hasStudentHeartbeatContext, protection, studentOverlay]);

  const engineSummary = useMemo(() => {
    const totalSystems = connectedCount + partialCount + missingCount;
    const latestDecision = heartbeatDecision?.primaryAction ?? graphAudit?.decisions[graphAudit.decisions.length - 1]?.decision ?? "awaiting input";
    const baselineSignalCount = heartbeat?.baselineSignals?.length ?? 0;
    const studentLabel = studentHeartbeatLoading
      ? "Loading student..."
      : (studentHeartbeatProfile?.name ?? (hasStudentHeartbeatContext ? `Student ${trimmedStudentId}` : "Select a student"));

    return [
      {
        title: "System Heartbeat",
        value: `${connectedCount}/${totalSystems || 9} connected`,
        detail: hasStudentHeartbeatContext
          ? "System diagnostics are available in Connected Systems."
          : mode === "dictionary"
          ? "Dictionary graph mode is a separate system view."
          : `${partialCount} partial, ${missingCount} missing modules`,
        tab: "systems" as HeartbeatTab,
      },
      {
        title: "Student Heartbeat",
        value: studentLabel,
        detail: hasStudentHeartbeatContext
          ? (baselineSignalCount > 0
            ? `${baselineSignalCount} placement diagnostics from Quick Level Finder`
            : "Waiting for baseline and mastery signals")
          : "Open a student in Academic Intelligence or Hybrid mode.",
        tab: "overview" as HeartbeatTab,
      },
      {
        title: "Decision Heartbeat",
        value: latestDecision,
        detail: studentOverlay?.recommendationFocus?.length
          ? `Next actions: ${studentOverlay.recommendationFocus.slice(0, 3).join(" | ")}`
          : "No decision signals yet.",
        tab: "recommendations" as HeartbeatTab,
      },
    ];
  }, [connectedCount, partialCount, missingCount, graphAudit, hasStudentHeartbeatContext, heartbeat, heartbeatDecision, mode, studentHeartbeatLoading, studentHeartbeatProfile, studentOverlay, trimmedStudentId]);

  const navigateToTab = useCallback((tab: HeartbeatTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "overview" || tab === "graph" || tab === "systems" || tab === "protection" || tab === "recommendations") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const paramMode = searchParams.get("mode");
    const paramStudentId = searchParams.get("studentId") ?? "";

    if (paramMode === "dictionary" || paramMode === "academic_intelligence" || paramMode === "hybrid") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(paramMode);
    } else if (paramStudentId.trim()) {
      setMode("academic_intelligence");
    }

    if (paramStudentId !== studentId) {
      setStudentId(paramStudentId);
    }
  }, [searchParams, studentId]);

  const tabs: Array<{ id: HeartbeatTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "graph", label: "Graph View" },
    { id: "systems", label: "Connected Systems" },
    { id: "protection", label: "Protection" },
    { id: "recommendations", label: "Recommendations" },
  ];

  const graphControls = (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select title="Select graph mode" value={mode} onChange={(event) => setMode(event.target.value as "dictionary" | "academic_intelligence" | "hybrid")} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="dictionary">Dictionary graph</option>
          <option value="academic_intelligence">Academic intelligence graph</option>
          <option value="hybrid">Hybrid graph</option>
        </select>
        <input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Student ID (required for academic/hybrid)" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search concepts" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <select title="Filter by subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">All subjects</option>
          <option value="english">English</option>
          <option value="spelling">Spelling</option>
          <option value="reading">Reading</option>
          <option value="maths">Maths</option>
          <option value="science">Science</option>
        </select>
        <select title="Filter by key stage" value={keyStage} onChange={(event) => setKeyStage(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">All key stages</option>
          <option value="early-years">Early Years</option>
          <option value="ks1">KS1</option>
          <option value="ks2">KS2</option>
          <option value="ks3">KS3</option>
          <option value="ks4">KS4</option>
          <option value="ks5">KS5</option>
        </select>
        <input value={yearGroup} onChange={(event) => setYearGroup(event.target.value)} placeholder="Year group" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input value={school} onChange={(event) => setSchool(event.target.value)} placeholder="School filter" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <input value={interventionType} onChange={(event) => setInterventionType(event.target.value)} placeholder="Intervention type" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <label className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          Depth limit: {depth}
          <input type="range" min={1} max={6} value={depth} onChange={(event) => setDepth(Number(event.target.value))} className="mt-1 w-full" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", "prerequisite", "easier", "harder", "related", "intervention", "phonics", "curriculum", "has_mastery_state", "has_weak_area", "targets", "supports_readiness"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedEdgeType(type)}
            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
              selectedEdgeType === type
                ? "border-cyan-400/80 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={recoveryWord} onChange={(event) => setRecoveryWord(event.target.value)} placeholder="Recovery path word" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
        <button
          type="button"
          onClick={() => {
            setOffset(0);
            setSearchTick((tick) => tick + 1);
          }}
          className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-black uppercase tracking-widest text-cyan-100"
        >
          Show Recovery Path
        </button>
      </div>
    </section>
  );

  return (
    <div className="space-y-4 pb-12">
      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-5">
        <p className="text-xs font-black uppercase tracking-widest text-cyan-300">StarLiz Intelligence Infrastructure</p>
        <h1 className="mt-2 text-3xl font-black text-white">{hasStudentHeartbeatContext ? "Student HEART BEAT Engine" : "StarLiz Heartbeat Engine"}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {hasStudentHeartbeatContext
            ? "Student-specific heartbeat view for placement, mastery, catch-up, learning twin, and decision signals."
            : "Central learning brain for student placement, system health, catch-up, mastery, and reporting."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {heartbeatBadges.map((badge) => (
            <span key={badge} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-cyan-100">
              {badge}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {engineSummary.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => navigateToTab(card.tab)}
            className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 text-left transition hover:border-cyan-400/40 hover:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <p className="text-[11px] font-black uppercase tracking-widest text-cyan-200">{card.title}</p>
            <p className="mt-2 text-lg font-black text-white">{card.value}</p>
            <p className="mt-1 text-xs text-slate-300">{card.detail}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {stats.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => navigateToTab(card.tab)}
            className={`cursor-pointer rounded-xl border p-3 text-left transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${statusTone(card.tone)}`}
          >
            <p className="text-[11px] uppercase tracking-widest">{card.label}</p>
            <p className="mt-1 text-lg font-black">{card.value}</p>
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateToTab(tab.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-black uppercase tracking-widest ${
                activeTab === tab.id
                  ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {activeTab === "overview" ? (
            <>
              {graphControls}
              {!hasStudentHeartbeatContext ? (
                <section className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-amber-100">
                  <h2 className="text-sm font-black uppercase tracking-widest">Select a student for accurate HEART BEAT</h2>
                  <p className="mt-2 text-xs">
                    Select a student to view an accurate Student HEART BEAT with QLF baseline, mastery, catch-up, learning twin, and decision signals.
                  </p>
                </section>
              ) : null}

              {hasStudentHeartbeatContext ? (
                <section className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-cyan-100">Student Identity</h2>
                    <p className="mt-2 text-xs text-cyan-50">Student: {studentHeartbeatProfile?.name ?? trimmedStudentId}</p>
                    <p className="text-xs text-cyan-50">Year group: {studentHeartbeatProfile?.yearGroup ?? "-"}</p>
                    <p className="text-xs text-cyan-50">Level: {studentHeartbeatProfile?.level ?? "-"}</p>
                    <p className="text-xs text-cyan-50">Student ID: {trimmedStudentId}</p>
                    <div className="mt-2">
                      <Link
                        href={`/admin/students/${encodeURIComponent(trimmedStudentId)}`}
                        className="inline-flex rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-50"
                      >
                        Open Student Profile
                      </Link>
                    </div>
                  </article>
                  <article className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                    <h2 className="text-sm font-black uppercase tracking-widest text-cyan-100">QLF and Baseline Pulse</h2>
                    <p className="mt-2 text-xs text-cyan-50">QLF status: {studentHeartbeatProfile?.quickLevelFinder.status ?? "-"}</p>
                    <p className="text-xs text-cyan-50">QLF completed: {studentHeartbeatProfile?.quickLevelFinder.completed ? "yes" : "no"}</p>
                    <p className="text-xs text-cyan-50">QLF responses: {studentHeartbeatProfile?.quickLevelFinder.responseCount ?? 0}/{studentHeartbeatProfile?.quickLevelFinder.totalQuestions ?? 0}</p>
                    <p className="text-xs text-cyan-50">Baseline signals: {(heartbeat?.baselineSignals ?? []).join(" | ") || "-"}</p>
                  </article>
                </section>
              ) : null}

              {hasStudentHeartbeatContext ? (
                <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-black uppercase tracking-widest text-emerald-100">Next Best Action</h2>
                    <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-widest">
                      <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-1 text-emerald-50">Action: {heartbeatDecision?.primaryAction ?? "-"}</span>
                      <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2 py-1 text-amber-50">Urgency: {heartbeatDecision?.urgency ?? "-"}</span>
                      <span className="rounded-full border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-rose-50">Risk: {heartbeatDecision?.riskLevel ?? "-"}</span>
                      <span className="rounded-full border border-cyan-300/40 bg-cyan-500/20 px-2 py-1 text-cyan-50">Confidence: {heartbeatDecision ? `${heartbeatDecision.confidenceScore}%` : "-"}</span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-emerald-50">
                    Actor required: <span className="font-bold uppercase">{heartbeatDecision?.actorRequired ?? "-"}</span>
                  </p>
                  <p className="mt-1 text-xs text-emerald-50">
                    Suggested next step: {heartbeatDecision?.suggestedNextStep ?? "Awaiting decision signals."}
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-100">Reasons</p>
                      <div className="mt-1 space-y-1 text-xs text-emerald-50">
                        {(heartbeatDecision?.reasons ?? []).slice(0, 4).map((reason, index) => (
                          <p key={`reason-${index}`}>- {reason}</p>
                        ))}
                        {(heartbeatDecision?.reasons.length ?? 0) === 0 ? <p>- -</p> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-100">Blockers</p>
                      <div className="mt-1 space-y-1 text-xs text-emerald-50">
                        {(heartbeatDecision?.blockers ?? []).slice(0, 4).map((blocker, index) => (
                          <p key={`blocker-${index}`}>- {blocker}</p>
                        ))}
                        {(heartbeatDecision?.blockers.length ?? 0) === 0 ? <p>- None</p> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-100">Evidence Summary</p>
                      <div className="mt-1 space-y-1 text-xs text-emerald-50">
                        {(heartbeatDecision?.evidence ?? []).slice(0, 5).map((entry, index) => (
                          <p key={`evidence-${index}`}>- {entry}</p>
                        ))}
                        {(heartbeatDecision?.evidence.length ?? 0) === 0 ? <p>- -</p> : null}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">System Heartbeat Diagnostics</h2>
                  <p className="mt-2 text-xs text-slate-300">Source of truth: {heartbeat?.sourceOfTruth ?? "not available"}</p>
                  <p className="text-xs text-slate-300">Validation: {protection?.validation.valid ? "valid" : "needs attention"}</p>
                  <p className="text-xs text-slate-300">Pending proposals: {approvalWorkflow?.pendingProposals.length ?? 0}</p>
                  <p className="text-xs text-slate-300">Fallback applied: {fallback?.applied ? "yes" : "no"}</p>
                </article>
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Subject & Feature Body Orchestration</h2>
                  <p className="mt-2 text-xs text-slate-300">Verdict: {bodyOrchestration?.verdict ?? "unknown"}</p>
                  <p className="text-xs text-slate-300">Schema changes required: {bodyOrchestration?.canShipWithoutSchemaChanges ? "no" : "yes"}</p>
                  <p className="text-xs text-slate-300">HEART BEAT warning: {bodyOrchestration?.heartBeatWarning ?? "-"}</p>
                  <div className="mt-3 space-y-2">
                    {(bodyOrchestration?.phases ?? []).map((phase) => (
                      <div key={phase.phase} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-300">
                        <p className="font-black uppercase tracking-widest text-slate-100">Phase {phase.phase}: {phase.name}</p>
                        <p className="text-slate-400">{phase.status}</p>
                        <p className="mt-1 text-slate-300">{phase.summary}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Body System Warnings</h2>
                  {(bodyOrchestration?.warnings ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">No body-system warnings reported.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs text-slate-300">
                      {(bodyOrchestration?.warnings ?? []).map((warning) => (
                        <div key={warning.title} className={`rounded-lg border px-3 py-2 ${warning.severity === "critical" ? "border-rose-500/30 bg-rose-500/10 text-rose-50" : "border-amber-500/30 bg-amber-500/10 text-amber-50"}`}>
                          <p className="font-black uppercase tracking-widest">{warning.title}</p>
                          <p className="mt-1">{warning.summary}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-widest">Affected surfaces: {warning.affectedSurfaces.join(" | ")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Registry & Phase 1</h2>
                  <p className="mt-2 text-xs text-slate-300">Registry input source: {bodyOrchestration?.registry.inputSource ?? "-"}</p>
                  <p className="text-xs text-slate-300">English strands: {(bodyOrchestration?.registry.englishStrands ?? []).join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Supported subjects: {bodyOrchestration?.registry.subjectCount ?? 0}</p>
                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                    {(bodyOrchestration?.recommendedPhase1 ?? []).map((step) => (
                      <p key={step}>- {step}</p>
                    ))}
                  </div>
                </article>
              </section>

              <section className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">System Connections</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(bodyOrchestration?.surfaces ?? []).map((surface) => (
                    <article key={surface.key} className={`rounded-lg border px-3 py-2 ${surface.status === "missing" ? "border-rose-500/30 bg-rose-500/10 text-rose-50" : surface.status === "partial" ? "border-amber-500/30 bg-amber-500/10 text-amber-50" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-50"}`}>
                      <p className="text-xs font-black uppercase tracking-widest">{surface.label}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-widest">{surface.status}</p>
                      <p className="mt-1 text-xs">{surface.summary}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Student Intelligence Overlay</h2>
                  <p className="mt-2 text-xs text-slate-300">Mastery gaps: {(studentOverlay?.masteryGapTopics ?? []).join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Weak areas: {(studentOverlay?.weakAreaTopics ?? []).join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Confidence: {studentOverlay?.confidenceScore ?? "-"}%</p>
                  <p className="text-xs text-slate-300">Exam readiness: {studentOverlay?.examReadinessBand ?? "-"}</p>
                  <p className="text-xs text-slate-300">Active interventions: {studentOverlay?.activeInterventions.length ?? 0}</p>
                  <p className="text-xs text-slate-300">Focus: {(studentOverlay?.recommendationFocus ?? []).join(" | ") || "-"}</p>
                </article>
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-cyan-200">Temporal Intelligence</h3>
                  <p className="mt-2 text-xs text-slate-300">Recently improved: {overlaySummary.temporal.recentlyImproved.join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Decaying mastery: {overlaySummary.temporal.decayingMastery.join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Overdue revision: {overlaySummary.temporal.overdueRevision.join(", ") || "-"}</p>
                  <p className="text-xs text-slate-300">Forgotten concepts: {overlaySummary.temporal.forgottenConcepts.join(", ") || "-"}</p>
                </article>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <article className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-cyan-200">Learning Twin Visualization</h3>
                  <p className="mt-2 text-xs text-slate-300">Preferred style: {studentOverlay?.learningTwin.preferredExplanationStyle ?? "-"}</p>
                  <p className="text-xs text-slate-300">Pace profile: {studentOverlay?.learningTwin.paceProfile ?? "-"}</p>
                  <p className="text-xs text-slate-300">Confidence profile: {studentOverlay?.learningTwin.confidenceProfile ?? "-"}</p>
                  <p className="text-xs text-slate-300">Memory profile: {studentOverlay?.learningTwin.memoryProfile ?? "-"}</p>
                  <p className="text-xs text-slate-300">Retry dependency: {studentOverlay?.learningTwin.retryDependency ?? "-"}</p>
                </article>
              </section>
            </>
          ) : null}

          {activeTab === "graph" ? (
            <>
              {graphControls}
              <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                <div className="h-[68vh] rounded-xl border border-slate-800 bg-slate-950">
                  <ReactFlow
                    className="knowledge-graph-flow"
                    nodes={nodes}
                    edges={renderedEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={(_event, node) => setSelectedNode(node)}
                    onEdgeClick={(_event, edge) => {
                      const edgeLabel = String(edge.label ?? "") as KnowledgeEdgeType;
                      if (edgeLabel) setSelectedEdgeType(edgeLabel);
                    }}
                    fitView
                  >
                    <MiniMap
                      className="knowledge-graph-flow__minimap"
                      nodeColor={(node) => NODE_COLORS[(node.data as { nodeType?: string })?.nodeType ?? "word"] ?? "#334155"}
                      maskColor="rgba(148, 163, 184, 0.12)"
                      pannable
                      zoomable
                      style={{ backgroundColor: "#020617", border: "1px solid rgba(56, 189, 248, 0.35)", borderRadius: 10 }}
                    />
                    <Controls className="knowledge-graph-flow__controls" />
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
                {!loading && !error && nodes.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">No graph data returned for the current filters. Adjust mode, student ID, or filters and try again.</p>
                ) : null}
              </section>
            </>
          ) : null}

          {activeTab === "systems" ? (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Connected Systems</h2>
                <p className="text-[11px] uppercase tracking-widest text-slate-400">System diagnostics (secondary when student selected)</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {systemStatus.map((entry) => (
                  <article key={entry.system} className={`rounded-xl border p-3 ${statusTone(entry.status)}`}>
                    <p className="text-xs font-black uppercase tracking-widest">{entry.label}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-widest">{entry.status}</p>
                    <p className="mt-1 text-xs">{entry.summary}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "protection" ? (
            <section className="space-y-3">
              <article className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Graph Protection Status</h2>
                <p className="mt-2 text-xs text-slate-300">Status: {protection?.status ?? "unknown"}</p>
                <p className="text-xs text-slate-300">AI mode: {protection?.aiSuggestionMode ?? "suggestion_only"}</p>
                <p className="text-xs text-slate-300">Approval required: {protection?.approvalRequiredForActivation ? "yes" : "yes"}</p>
                <p className="text-xs text-slate-300">Blocked changes: {protection?.blockedChangesCount ?? 0}</p>
                <p className="text-xs text-slate-300">Protected node IDs: {(protection?.protectedNodeIds ?? []).join(", ") || "-"}</p>
              </article>

              <article className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-amber-100">Validation Issues</h2>
                {(protection?.validation.issues.length ?? 0) === 0 ? (
                  <p className="mt-2 text-xs text-amber-50">No validation issues reported.</p>
                ) : (
                  <div className="mt-2 space-y-1 text-xs text-amber-50">
                    {(protection?.validation.issues ?? []).map((issue, index) => (
                      <p key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</p>
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Pending/Admin Approval Workflow</h2>
                <p className="mt-2 text-xs text-slate-300">Latest decision: {approvalWorkflow?.latestDecision ?? "not_requested"}</p>
                <p className="text-xs text-slate-300">Decision reason: {approvalWorkflow?.latestDecisionReason ?? "-"}</p>
                <p className="text-xs text-slate-300">Pending proposals: {approvalWorkflow?.pendingProposals.length ?? 0}</p>
              </article>

              <article className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-100">AI Reasoning Visualization</h2>
                <p className="mt-2 text-xs text-cyan-50">Why: {(overlaySummary.reasoning.why ?? []).join(" | ") || "-"}</p>
                <p className="text-xs text-cyan-50">Prerequisite blockers: {(overlaySummary.reasoning.prerequisiteBlockers ?? []).join(" | ") || "-"}</p>
                <p className="text-xs text-cyan-50">Reasoning chain: {(overlaySummary.reasoning.chain ?? []).join(" -> ") || "-"}</p>
              </article>
            </section>
          ) : null}

          {activeTab === "recommendations" ? (
            <section className="space-y-3">
              <article className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-100">Recommendation Signals</h2>
                <div className="mt-2 space-y-1 text-xs text-cyan-50">
                  {(studentOverlay?.reportSignals ?? []).map((signal, index) => (
                    <p key={`${signal}-${index}`}>{signal}</p>
                  ))}
                  {(studentOverlay?.reportSignals ?? []).length === 0 ? <p>-</p> : null}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Recovery Path</h2>
                {recoveryPlan ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-200">
                    <p>Target: {recoveryPlan.targetWord ?? "-"}</p>
                    <p>Path: {recoveryPlan.shortestRecoveryPath.join(" -> ") || "-"}</p>
                    <p>Complexity: {recoveryPlan.estimatedComplexity}</p>
                    <p>Duration: {recoveryPlan.estimatedInterventionMinutes} mins</p>
                    <p>Visual hint: {recoveryPlan.visualSupportHint}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Enter a concept and run recovery path.</p>
                )}
              </article>

              <article className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-rose-100">Graph Heatmaps</h2>
                <p className="mt-2 text-xs text-rose-50">Weak clusters: {overlaySummary.heatmap.weakClusters.join(" | ") || "-"}</p>
                <p className="text-xs text-rose-50">High-risk concepts: {overlaySummary.heatmap.highRiskConcepts.join(" | ") || "-"}</p>
                <p className="text-xs text-rose-50">Intervention-heavy areas: {overlaySummary.heatmap.interventionHeavyAreas.join(" | ") || "-"}</p>
                <p className="text-xs text-rose-50">Curriculum bottlenecks: {overlaySummary.heatmap.curriculumBottlenecks.join(" | ") || "-"}</p>
              </article>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Heartbeat Inspector</h2>
            <p className="mt-2 text-xs text-slate-300">Mode: {mode}</p>
            <p className="text-xs text-slate-300">Connected: {connectedCount} | Partial: {partialCount} | Missing: {missingCount}</p>
            <p className="text-xs text-slate-300">Fallback: {fallback?.applied ? "active" : "not active"}</p>
            <p className="text-xs text-slate-300">Latest audit decision: {graphAudit?.decisions[graphAudit.decisions.length - 1]?.decision ?? "-"}</p>
            <p className="text-xs text-slate-300">Overlay confidence: {studentOverlay?.confidenceScore ?? "-"}%</p>
            <p className="text-xs text-slate-300">Active interventions: {studentOverlay?.activeInterventions.length ?? 0}</p>
            {mode === "dictionary" && heartbeat === null ? (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                Switch to <strong>Academic Intelligence</strong> or <strong>Hybrid</strong> mode and enter a Student ID to view HEART BEAT diagnostics. Dictionary mode shows curriculum graph only.
              </p>
            ) : null}
            {heartbeat?.baselineSignals && heartbeat.baselineSignals.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Initial Placement Pulse</p>
                <p className="mt-1 text-[10px] text-slate-400">Diagnostic evidence from Quick Level Finder — not confirmed mastery.</p>
                <div className="mt-2 space-y-1">
                  {heartbeat.baselineSignals.map((signal, index) => (
                    <p key={`baseline-signal-${index}`} className="text-xs text-slate-300">{signal}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Selected Node</h2>
            {selectedNode ? (
              <div className="mt-2 space-y-1 text-xs text-slate-300">
                <p className="text-sm font-black text-white">{String((selectedNode.data as { label?: string })?.label ?? selectedNode.id)}</p>
                <p>Type: {String((selectedNode.data as { nodeType?: string })?.nodeType ?? "-")}</p>
                <p>Outgoing links: {selectedNodeDetails?.outgoingCount ?? 0}</p>
                <p>Incoming links: {selectedNodeDetails?.incomingCount ?? 0}</p>
                <p>Linked concepts: {selectedNodeDetails?.linkedConcepts ?? 0}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Select any graph node to inspect it here.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-cyan-200">Relationship Legend</h2>
            <div className="mt-2 space-y-1">
              {(Object.keys(EDGE_COLORS) as KnowledgeEdgeType[]).map((edgeType) => (
                <div key={edgeType} className="flex items-center justify-between text-xs text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${EDGE_DOT_CLASS[edgeType]}`} />
                    {edgeType}
                  </span>
                  <span className="text-slate-500">{relationBadge(edgeType)}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
