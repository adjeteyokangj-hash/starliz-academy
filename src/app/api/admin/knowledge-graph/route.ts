import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api_guard";
import { buildCoachWordHelpResponse } from "@/lib/coachDictionary";
import type { CoachWordHelpResponse } from "@/lib/coachDictionary";
import { buildKnowledgeGraph } from "@/lib/knowledge_graph";
import { countDictionaryWordsForGraph, listDictionaryWords } from "@/lib/dictionary";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { listCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import { mergeKnowledgeGraphViews, projectCurriculumGraphToKnowledgeGraph } from "@/lib/admin_graph";
import { evaluateGraphChangeProposal } from "@/lib/academic-intelligence/graph-protection";

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

export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
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
      countDictionaryWordsForGraph({
        q: parsed.q,
        subject: parsed.subject,
        keyStage: parsed.keyStage,
        yearGroup: parsed.yearGroup,
        active: true,
      }),
      listDictionaryWords({
        q: parsed.q,
        subject: parsed.subject,
        keyStage: parsed.keyStage,
        yearGroup: parsed.yearGroup,
        active: true,
        skip: offset,
        limit,
      }),
    ]);

    const graph = buildKnowledgeGraph({
      words: listPayload.items,
      search: parsed.q,
      depthLimit: depth,
      offset: 0,
      limit,
    });

    if (parsed.recoveryWord) {
      const coachResponse = await buildCoachWordHelpResponse({
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
  let heartbeat: ReturnType<typeof buildAcademicIntelligence>["curriculumIntelligenceGraph"]["heartbeat"] | null = null;
  let protection: ReturnType<typeof buildAcademicIntelligence>["curriculumIntelligenceGraph"]["protection"] | null = null;
  let approvalWorkflow: ReturnType<typeof buildAcademicIntelligence>["curriculumIntelligenceGraph"]["approvalWorkflow"] | null = null;
  let fallback: ReturnType<typeof buildAcademicIntelligence>["curriculumIntelligenceGraph"]["fallback"] | null = null;
  let graphAudit: ReturnType<typeof buildAcademicIntelligence>["curriculumIntelligenceGraph"]["auditMetadata"] | null = null;
  let studentOverlay: {
    masteryGapTopics: string[];
    weakAreaTopics: string[];
    examReadinessBand: string;
    recommendationFocus: string[];
    reportSignals: string[];
  } | null = null;

  if (mode === "academic_intelligence" || mode === "hybrid") {
    const studentId = parsed.studentId!.trim();
    const source = await buildAcademicSourceForStudent(studentId);
    if (!source) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const [existingCatchUpTasks, existingHomeworkTasks] = await Promise.all([
      listCatchUpTasks(studentId),
      listHomeworkTasks(studentId),
    ]);
    const output = buildAcademicIntelligence(source, {
      existingCatchUpTasks,
      existingHomeworkTasks,
    });

    academicView = projectCurriculumGraphToKnowledgeGraph({
      graph: output.curriculumIntelligenceGraph,
      prefix: "academic",
    });
    heartbeat = output.curriculumIntelligenceGraph.heartbeat;
    protection = output.curriculumIntelligenceGraph.protection;
    approvalWorkflow = output.curriculumIntelligenceGraph.approvalWorkflow;
    fallback = output.curriculumIntelligenceGraph.fallback;
    graphAudit = output.curriculumIntelligenceGraph.auditMetadata;
    studentOverlay = {
      masteryGapTopics: output.curriculumIntelligenceGraph.aiGenerationContext.masteryGapTopics,
      weakAreaTopics: output.curriculumIntelligenceGraph.aiGenerationContext.weakAreaTopics,
      examReadinessBand: output.curriculumIntelligenceGraph.aiGenerationContext.examReadinessBand,
      recommendationFocus: output.curriculumIntelligenceGraph.aiGenerationContext.recommendationFocus,
      reportSignals: output.curriculumIntelligenceGraph.reportSummary.reportSignals,
    };
  }
  const merged = mergeKnowledgeGraphViews({
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
    studentOverlay,
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const parsed = proposalSchema.parse(await request.json());
  const source = await buildAcademicSourceForStudent(parsed.studentId.trim());
  if (!source) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const [existingCatchUpTasks, existingHomeworkTasks] = await Promise.all([
    listCatchUpTasks(parsed.studentId.trim()),
    listHomeworkTasks(parsed.studentId.trim()),
  ]);
  const output = buildAcademicIntelligence(source, {
    existingCatchUpTasks,
    existingHomeworkTasks,
  });

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

  const evaluated = evaluateGraphChangeProposal({
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
