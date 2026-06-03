import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";
import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import { buildKnowledgeGraph } from "@/lib/knowledge_graph";
import { countDictionaryWordsForGraph, listDictionaryWords } from "@/lib/dictionary";
import { mergeKnowledgeGraphViews, projectCurriculumGraphToKnowledgeGraph } from "@/lib/admin_graph";
import { evaluateGraphChangeProposal } from "@/lib/academic-intelligence/graph-protection";
import { buildStudentGraphOverlay } from "@/lib/academic-intelligence/graph-overlay";
import { getProgressionDecisionBrainView, getStudentLearningBrain } from "@/lib/student-learning-brain";

const proposalSchema = z.object({
  studentId: z.string().min(1),
  approve: z.boolean().optional(),
  reason: z.string().min(3),
  action: z.enum(["add_node", "add_edge", "update_node", "update_edge", "remove_node", "remove_edge"]),
  source: z.enum(["ai", "admin"]),
  node: z.object({
    id: z.string(),
    type: z.enum(["topic", "mastery_state", "weak_area", "recommendation", "prerequisite", "learning_twin_signal", "assessment_readiness"]),
    label: z.string(),
    subject: z.string().nullable().optional(),
    topicKey: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  edge: z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.enum(["has_mastery_state", "has_weak_area", "recommends", "blocked_by", "requires", "informed_by", "targets", "supports_readiness"]),
    weight: z.number(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

const querySchema = z.object({
  mode: z.enum(["dictionary", "academic_intelligence", "hybrid"]).optional(),
  studentId: z.string().optional(),
  q: z.string().optional(),
  subject: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  school: z.string().optional(),
  interventionType: z.string().optional(),
  depth: z.coerce.number().int().min(1).max(6).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(25).max(600).optional(),
  recoveryWord: z.string().optional(),
});

const EXPECTED_CONNECTED_SYSTEMS = [
  "curriculum_knowledge_graph",
  "ai_generator",
  "smart_catch_up",
  "assessment_exam_readiness",
  "learning_twin",
  "school_day_week_mode",
  "parent_admin_reports",
  "content_quality_safeguarding",
  "storage_media",
] as const;

type AdminKnowledgeGraphDeps = {
  requireAdmin: typeof requireAdmin;
  buildCoachWordHelpResponse: typeof buildCoachWordHelpResponse;
  countDictionaryWordsForGraph: typeof countDictionaryWordsForGraph;
  listDictionaryWords: typeof listDictionaryWords;
  buildKnowledgeGraph: typeof buildKnowledgeGraph;
  getStudentLearningBrain: typeof getStudentLearningBrain;
  getProgressionDecisionBrainView: typeof getProgressionDecisionBrainView;
  mergeKnowledgeGraphViews: typeof mergeKnowledgeGraphViews;
  projectCurriculumGraphToKnowledgeGraph: typeof projectCurriculumGraphToKnowledgeGraph;
  buildStudentGraphOverlay: typeof buildStudentGraphOverlay;
  evaluateGraphChangeProposal: typeof evaluateGraphChangeProposal;
};

const defaultDeps: AdminKnowledgeGraphDeps = {
  requireAdmin,
  buildCoachWordHelpResponse,
  countDictionaryWordsForGraph,
  listDictionaryWords,
  buildKnowledgeGraph,
  getStudentLearningBrain,
  getProgressionDecisionBrainView,
  mergeKnowledgeGraphViews,
  projectCurriculumGraphToKnowledgeGraph,
  buildStudentGraphOverlay,
  evaluateGraphChangeProposal,
};

function ensureConnectedSystemStates(input: {
  heartbeat: { sourceOfTruth: string; generatedAt: string; systemStates: Array<{ system: string; connected: boolean; status: string; summary: string; updatedAt: string }> } | null;
  generatedAt: string;
  hasBrainEvidence: boolean;
  weakAreaActiveCount: number;
  placementReady: boolean;
  progressionReady: boolean;
}): { sourceOfTruth: string; generatedAt: string; systemStates: Array<{ system: string; connected: boolean; status: string; summary: string; updatedAt: string }> } | null {
  if (!input.heartbeat && !input.hasBrainEvidence) return null;

  const generatedAt = input.heartbeat?.generatedAt ?? input.generatedAt;
  const sourceOfTruth = input.heartbeat?.sourceOfTruth ?? "student_learning_brain";
  const bySystem = new Map((input.heartbeat?.systemStates ?? []).map((entry) => [entry.system, entry]));

  const fallbackSummaries: Record<(typeof EXPECTED_CONNECTED_SYSTEMS)[number], string> = {
    curriculum_knowledge_graph: "Brain-backed curriculum graph diagnostics are available.",
    ai_generator: "Brain-backed recommendation context is available for AI generation.",
    smart_catch_up: input.weakAreaActiveCount > 0
      ? `Active weak areas detected (${input.weakAreaActiveCount}); catch-up diagnostics are available.`
      : "No active weak areas detected; catch-up diagnostics are available.",
    assessment_exam_readiness: "Exam-readiness signals are available from academic intelligence.",
    learning_twin: "Learning twin summary signals are available from academic intelligence.",
    school_day_week_mode: "School day/week planning context is available from academic intelligence.",
    parent_admin_reports: "Parent/admin reporting signals are available from Brain summaries.",
    content_quality_safeguarding: "Content quality and safeguarding diagnostics are available in graph governance.",
    storage_media: "Media/storage references are available through graph media planning.",
  };

  const systemStates = EXPECTED_CONNECTED_SYSTEMS.map((system) => {
    const existing = bySystem.get(system);
    if (existing) return existing;
    return {
      system,
      connected: input.hasBrainEvidence,
      status: input.hasBrainEvidence ? "ready" : "missing",
      summary: input.hasBrainEvidence ? fallbackSummaries[system] : "No heartbeat state reported yet.",
      updatedAt: generatedAt,
    };
  });

  if (input.hasBrainEvidence && input.placementReady && input.progressionReady) {
    for (const row of systemStates) {
      if (row.system === "assessment_exam_readiness" && row.status === "missing") {
        row.status = "partial";
        row.summary = "Placement and progression summaries are available; exam readiness context may still be building.";
      }
    }
  }

  return {
    sourceOfTruth,
    generatedAt,
    systemStates,
  };
}

export async function GET(request: Request) {
  return handleAdminKnowledgeGraphGet(request);
}

export async function handleAdminKnowledgeGraphGet(request: Request, deps: AdminKnowledgeGraphDeps = defaultDeps) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.parse(Object.fromEntries(searchParams.entries()));
  const mode = parsed.mode ?? "dictionary";

  const limit = parsed.limit ?? 250;
  const offset = parsed.offset ?? 0;
  const depth = parsed.depth ?? 2;

  if ((mode === "academic_intelligence" || mode === "hybrid") && !parsed.studentId?.trim()) {
    return NextResponse.json({ error: "studentId is required for academic_intelligence and hybrid graph modes." }, { status: 400 });
  }

  let dictionaryView: {
    nodes: ReturnType<typeof buildKnowledgeGraph>["nodes"];
    edges: ReturnType<typeof buildKnowledgeGraph>["edges"];
    metrics: ReturnType<typeof buildKnowledgeGraph>["metrics"];
    totalWords: number;
    returned: number;
    hasMore: boolean;
  } | null = null;

  let recoveryPath: CoachWordHelpResponse["recoveryPlan"] | null = null;

  if (mode === "dictionary" || mode === "hybrid") {
    const [totalWords, listPayload] = await Promise.all([
      deps.countDictionaryWordsForGraph({
        q: parsed.q,
        subject: parsed.subject,
        keyStage: parsed.keyStage,
        yearGroup: parsed.yearGroup,
        active: true,
      }),
      deps.listDictionaryWords({
        q: parsed.q,
        subject: parsed.subject,
        keyStage: parsed.keyStage,
        yearGroup: parsed.yearGroup,
        active: true,
        skip: offset,
        limit,
      }),
    ]);

    const graph = deps.buildKnowledgeGraph({
      words: listPayload.items,
      search: parsed.q,
      depthLimit: depth,
      offset: 0,
      limit,
    });

    if (parsed.recoveryWord) {
      const coachResponse = await deps.buildCoachWordHelpResponse({
        word: parsed.recoveryWord,
        subject: parsed.subject,
        keyStage: parsed.keyStage,
        yearGroup: parsed.yearGroup,
        supportLevel: 2,
      });
      recoveryPath = coachResponse.recoveryPlan;
    }

    const hasMore = offset + listPayload.items.length < totalWords;
    dictionaryView = {
      nodes: graph.nodes,
      edges: graph.edges,
      metrics: {
        ...graph.metrics,
        totalWords,
      },
      totalWords,
      returned: listPayload.items.length,
      hasMore,
    };
  }

  let academicView: {
    nodes: ReturnType<typeof projectCurriculumGraphToKnowledgeGraph>["nodes"];
    edges: ReturnType<typeof projectCurriculumGraphToKnowledgeGraph>["edges"];
    metrics: ReturnType<typeof projectCurriculumGraphToKnowledgeGraph>["metrics"];
  } | null = null;
  let heartbeat: {
    sourceOfTruth: string;
    generatedAt: string;
    systemStates: Array<{ system: string; connected: boolean; status: string; summary: string; updatedAt: string }>;
  } | null = null;
  let protection: {
    status: string;
    aiSuggestionMode: string;
    approvalRequiredForActivation: boolean;
    blockedChangesCount: number;
    protectedNodeIds: string[];
    validation: { valid: boolean; issues: Array<{ code: string; message: string }> };
  } | null = null;
  let approvalWorkflow: {
    pendingProposals: unknown[];
    latestDecision: string;
    latestDecisionReason: string | null;
  } | null = null;
  let fallback: { applied: boolean; reason: string | null; fallbackGeneratedAt: string | null } | null = null;
  let graphAudit: { decisions: Array<{ decision: string }> } | null = null;
  let heartbeatDecision: {
    primaryAction: string;
    urgency: string;
    riskLevel: string;
    confidenceScore: number;
    actorRequired: string;
    suggestedNextStep: string;
    reasons: string[];
    blockers: string[];
    evidence: string[];
  } | null = null;
  let brainContext: {
    learningDnaSummary: Record<string, unknown> | null;
    languageReadiness: unknown;
    progressionSummary: unknown;
    placementSummary: unknown;
    weakAreaSummary: { total: number; active: number; top: string[] } | null;
    progressSummary: { total: number; completed: number; averageScore: number | null } | null;
  } | null = null;
  let studentOverlay: {
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
  } | null = null;

  if (mode === "academic_intelligence" || mode === "hybrid") {
    const studentId = parsed.studentId!.trim();
    const [brain, decisionBrain] = await Promise.all([
      deps.getStudentLearningBrain(studentId, { includeCoachSignals: true }),
      deps.getProgressionDecisionBrainView({ studentId }),
    ]);
    if (!brain) return NextResponse.json({ error: "Student not found." }, { status: 404 });
    const output = brain.academicIntelligence;

    academicView = deps.projectCurriculumGraphToKnowledgeGraph({
      graph: output.curriculumIntelligenceGraph,
      prefix: "academic",
    });
    heartbeat = ensureConnectedSystemStates({
      heartbeat: output.curriculumIntelligenceGraph.heartbeat,
      generatedAt: output.generatedAt,
      hasBrainEvidence: true,
      weakAreaActiveCount: brain.evidenceSummary.weakAreas.active,
      placementReady: Boolean(decisionBrain?.quick?.status === "completed"),
      progressionReady: Boolean(decisionBrain?.progression),
    });
    protection = output.curriculumIntelligenceGraph.protection;
    approvalWorkflow = output.curriculumIntelligenceGraph.approvalWorkflow;
    fallback = output.curriculumIntelligenceGraph.fallback;
    graphAudit = output.curriculumIntelligenceGraph.auditMetadata;
    heartbeatDecision = output.heartbeatDecision;
    brainContext = {
      learningDnaSummary: brain.learningDnaSummary,
      languageReadiness: brain.languageReadiness,
      progressionSummary: decisionBrain?.summary ?? null,
      placementSummary: decisionBrain
        ? {
          quickStatus: decisionBrain.quick?.status ?? null,
          recommendationCount: decisionBrain.placementLessons.recommendations.length,
          assignedCount: decisionBrain.placementLessons.recommendations.filter((entry) => entry.status === "assigned").length,
          contentGapCount: decisionBrain.placementLessons.contentGaps.length,
        }
        : null,
      weakAreaSummary: brain.evidenceSummary.weakAreas,
      progressSummary: brain.evidenceSummary.progress,
    };
    const liveOverlay = deps.buildStudentGraphOverlay({
      output,
      graph: output.curriculumIntelligenceGraph,
    });
    studentOverlay = {
      masteryGapTopics: liveOverlay.masteryGapTopics,
      weakAreaTopics: liveOverlay.weakAreaTopics,
      confidenceScore: liveOverlay.confidenceScore,
      activeInterventions: liveOverlay.activeInterventions,
      temporal: liveOverlay.temporal,
      heatmap: liveOverlay.heatmap,
      reasoning: liveOverlay.reasoning,
      learningTwin: liveOverlay.learningTwin,
      nodeSignals: liveOverlay.nodeSignals,
      examReadinessBand: liveOverlay.examReadinessBand,
      recommendationFocus: liveOverlay.recommendationFocus,
      reportSignals: liveOverlay.reportSignals,
    };
  }
  const merged = deps.mergeKnowledgeGraphViews({
    dictionary: dictionaryView
      ? {
        nodes: dictionaryView.nodes,
        edges: dictionaryView.edges,
        metrics: dictionaryView.metrics,
      }
      : null,
    academic: academicView,
    mode,
  });

  const hasMore = dictionaryView?.hasMore ?? false;
  const returned = dictionaryView?.returned ?? merged.nodes.length;
  const totalWords = dictionaryView?.totalWords ?? merged.metrics.totalWords;

  return NextResponse.json({
    nodes: merged.nodes,
    edges: merged.edges,
    metrics: merged.metrics,
    recoveryPath,
    pagination: {
      offset,
      limit,
      returned,
      totalWords,
      hasMore,
    },
    mode,
    filtersApplied: {
      studentId: parsed.studentId ?? null,
      subject: parsed.subject ?? null,
      keyStage: parsed.keyStage ?? null,
      yearGroup: parsed.yearGroup ?? null,
      school: parsed.school ?? null,
      interventionType: parsed.interventionType ?? null,
      depth,
      q: parsed.q ?? null,
    },
    heartbeat,
    protection,
    approvalWorkflow,
    fallback,
    graphAudit,
    heartbeatDecision,
    brainContext,
    studentOverlay,
  });
}

export async function POST(request: Request) {
  return handleAdminKnowledgeGraphPost(request);
}

export async function handleAdminKnowledgeGraphPost(request: Request, deps: AdminKnowledgeGraphDeps = defaultDeps) {
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const parsed = proposalSchema.parse(await request.json());
  const brain = await deps.getStudentLearningBrain(parsed.studentId.trim(), { includeCoachSignals: true });
  if (!brain) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  const output = brain.academicIntelligence;

  const proposal = {
    proposalId: `${parsed.source}-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    submittedBy: session.userId,
    source: parsed.source,
    action: parsed.action,
    reason: parsed.reason,
    node: parsed.node,
    edge: parsed.edge,
  } as const;

  const evaluated = deps.evaluateGraphChangeProposal({
    graph: output.curriculumIntelligenceGraph,
    proposal,
    approvedBy: parsed.approve ? session.userId : null,
  });

  return NextResponse.json({
    accepted: evaluated.accepted,
    reason: evaluated.reason,
    workflow: evaluated.graph.approvalWorkflow,
    protection: evaluated.graph.protection,
    fallback: evaluated.graph.fallback,
    audit: evaluated.graph.auditMetadata,
    aiSuggestionMode: evaluated.graph.protection.aiSuggestionMode,
  });
}
