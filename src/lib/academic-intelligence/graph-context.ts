import type {
  AcademicIntelligenceOutput,
  CurriculumContentGovernanceProfile,
  CurriculumGraphAiGenerationContext,
  CurriculumGraphHeartbeat,
  CurriculumGraphMediaPlan,
  CurriculumGraphMediaReference,
  CurriculumGraphNode,
  CurriculumGraphReportSummary,
  CurriculumIntelligenceGraph,
  CurriculumSchoolPlanningContext,
  QuickLevelFinderBaselineDiagnostic,
  SchoolWeekModeBlock,
  SchoolWeekModePlan,
} from "@/lib/academic-intelligence/types";

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function summarizeTopic(label: string | null | undefined, fallback: string): string {
  const clean = String(label ?? "").trim();
  return clean || fallback;
}

function linkedNodeIdsForBlock(
  block: SchoolWeekModeBlock,
  graphNodes: CurriculumGraphNode[],
  recommendationIds: string[],
): string[] {
  const linkedTopicIds = graphNodes
    .filter((node) => node.type === "topic")
    .filter((node) => {
      if (normalize(node.subject) !== normalize(block.subject)) return false;
      if (!block.topic) return true;
      const nodeTopic = typeof node.metadata?.topic === "string" ? node.metadata.topic : node.label;
      return normalize(nodeTopic) === normalize(block.topic) || normalize(node.label) === normalize(block.topic);
    })
    .map((node) => node.id);

  return uniqueStrings([
    ...recommendationIds.map((id) => `recommendation:${id}`),
    ...linkedTopicIds,
  ]);
}

function guessMediaAssetType(block: SchoolWeekModeBlock, aiContext: CurriculumGraphAiGenerationContext): CurriculumGraphMediaReference["assetType"] {
  if (block.activityType === "homework") return "homework_asset";
  if (block.activityType === "revision") return "diagram";
  if (aiContext.bestExplanationStyle === "voice_explanation") return "audio";
  if (/(science|maths|physics|chemistry|biology)/i.test(String(block.subject ?? ""))) return "diagram";
  return "lesson_image";
}

export function buildGraphHeartbeat(input: {
  generatedAt: string;
  nodeCount: number;
  edgeCount: number;
  quickLevelFinderBaseline?: QuickLevelFinderBaselineDiagnostic | null;
}): CurriculumGraphHeartbeat {
  const summary = `${input.nodeCount} nodes and ${input.edgeCount} edges available from the academic intelligence source of truth.`;
  const baseline = input.quickLevelFinderBaseline ?? null;
  const mathsBaseline = baseline?.parentSubjectScores.find((score) => score.subject === "maths") ?? null;
  const englishBaseline = baseline?.parentSubjectScores.find((score) => score.subject === "english") ?? null;
  const englishStrands = baseline?.englishStrandScores.map((score) => score.strand) ?? [];

  const baselineSignals = baseline
    ? [
      "Quick Level Finder baseline available",
      "Initial placement evidence captured",
      mathsBaseline
        ? `Maths baseline diagnostic: ${mathsBaseline.accuracy}% (${mathsBaseline.level})`
        : "Maths baseline diagnostic pending",
      englishBaseline
        ? `English baseline diagnostic: ${englishBaseline.accuracy}% (${englishBaseline.level})`
        : "English baseline diagnostic pending",
      englishStrands.length
        ? `English strand baselines detected: ${englishStrands.join(", ")}`
        : "English strand baseline signals not yet detected",
      "Use lesson attempts and progress records before confirming mastery or weak areas",
    ]
    : [];

  return {
    sourceOfTruth: "academic_intelligence",
    generatedAt: input.generatedAt,
    systemStates: [
      {
        system: "curriculum_knowledge_graph",
        connected: true,
        status: "ready",
        summary: `Admin graph projection can read the contract. ${summary}`,
        updatedAt: input.generatedAt,
      },
      {
        system: "student_mastery_data",
        connected: true,
        status: "ready",
        summary: baseline
          ? "Mastery overlay includes an initial Quick Level Finder placement pulse; mastery and weak-area conclusions still depend on lesson and progress evidence."
          : "Mastery overlay connects topics to mastery states and active weak areas.",
        updatedAt: input.generatedAt,
      },
      {
        system: "ai_generator",
        connected: true,
        status: "ready",
        summary: "AI generation can read gaps, blockers, and learning twin style from the graph.",
        updatedAt: input.generatedAt,
      },
      {
        system: "smart_catch_up",
        connected: true,
        status: "ready",
        summary: "Catch-up routes and recommendation priorities are mapped into the recommendation layer.",
        updatedAt: input.generatedAt,
      },
      {
        system: "assessment_exam_readiness",
        connected: true,
        status: "ready",
        summary: baseline
          ? "Assessment recommendations include baseline placement signals from Quick Level Finder while keeping readiness decisions evidence-driven."
          : "Assessment recommendations connect directly to readiness blockers and readiness support edges.",
        updatedAt: input.generatedAt,
      },
      {
        system: "learning_twin",
        connected: true,
        status: "ready",
        summary: baseline
          ? "Learning twin can read baseline placement context as an initial pulse before long-term personalization evidence accumulates."
          : "Learning twin explanation DNA signals are attached as graph signals that can guide delivery.",
        updatedAt: input.generatedAt,
      },
      {
        system: "school_day_week_mode",
        connected: true,
        status: "ready",
        summary: "School week blocks can point back to recommendation, revision, and homework graph context.",
        updatedAt: input.generatedAt,
      },
      {
        system: "parent_admin_reports",
        connected: true,
        status: "ready",
        summary: baseline
          ? "Parent/admin reports can include baseline placement evidence from Quick Level Finder alongside ongoing recommendation signals."
          : "Parent and admin reports can read recommendation reasons and report signals from the graph.",
        updatedAt: input.generatedAt,
      },
      {
        system: "content_quality_safeguarding",
        connected: true,
        status: "ready",
        summary: "Content quality and safeguarding checks can read age, alignment, and approval expectations from the graph.",
        updatedAt: input.generatedAt,
      },
      {
        system: "storage_media",
        connected: true,
        status: "ready",
        summary: "Storage/media is connected via guarded abstract references; internals are intentionally hidden for safety.",
        updatedAt: input.generatedAt,
      },
    ],
    baselineSignals,
  };
}

export function buildGraphAiGenerationContext(output: AcademicIntelligenceOutput): CurriculumGraphAiGenerationContext {
  const masteryGapTopics = uniqueStrings(output.masteryMap
    .filter((entry) => entry.masteryStatus === "needs_catch_up" || entry.masteryStatus === "practising")
    .slice(0, 6)
    .map((entry) => summarizeTopic(entry.topic, entry.skill ?? entry.subject)));

  const prerequisiteConcepts = uniqueStrings(output.catchUpRecommendations
    .flatMap((entry) => [entry.reason, entry.recommendedAction])
    .filter((entry) => /before|foundation|prerequisite|secure|review/i.test(entry))
    .slice(0, 6));

  const weakAreaTopics = uniqueStrings(output.catchUpRecommendations
    .filter((entry) => entry.status !== "completed" && entry.status !== "waived")
    .map((entry) => summarizeTopic(entry.topic, entry.skill ?? entry.subject))
    .slice(0, 6));

  const recommendationFocus = uniqueStrings(output.nextRecommendedActions.slice(0, 4));
  const catchUpRouteTargets = uniqueStrings(output.catchUpRecommendations.map((entry) => entry.routeTarget ?? null));
  const learningTwinSignals = uniqueStrings(output.learningTwin.explanationDNA.topSignals.map((entry) => entry.style));

  return {
    masteryGapTopics,
    prerequisiteConcepts,
    weakAreaTopics,
    recommendationFocus,
    catchUpRouteTargets,
    examReadinessBand: output.examReadinessProfile.band,
    examReadinessBlockers: uniqueStrings(output.examReadinessProfile.blockers.slice(0, 5)),
    learningTwinSignals,
    bestExplanationStyle: output.learningTwin.explanationDNA.bestExplanationStyle,
    recommendedApproach: output.learningTwin.explanationDNA.todayApproach,
  };
}

export function buildGraphSchoolPlanningContext(input: {
  output: AcademicIntelligenceOutput;
  graphNodes: CurriculumGraphNode[];
}): CurriculumSchoolPlanningContext {
  const blockMetadata = input.output.schoolWeekModePlan.dailySchedules.flatMap((schedule) => schedule.blocks.map((block) => {
    const matchedRecommendations = input.output.catchUpRecommendations.filter((entry) => {
      if (block.recommendationId && entry.id === block.recommendationId) return true;
      return normalize(entry.subject) === normalize(block.subject)
        && (!block.topic || normalize(entry.topic) === normalize(block.topic) || normalize(entry.skill) === normalize(block.topic));
    });

    const matchedHomeworkTasks = input.output.homeworkTasks.filter((task) => normalize(task.subject) === normalize(block.subject)
      && (!block.topic || normalize(task.topic) === normalize(block.topic)));

    const revisionTopicKeys = uniqueStrings(input.output.masteryMap
      .filter((entry) => entry.revisionOverdue)
      .filter((entry) => normalize(entry.subject) === normalize(block.subject)
        && (!block.topic || normalize(entry.topic) === normalize(block.topic) || normalize(entry.skill) === normalize(block.topic)))
      .map((entry) => entry.topicKey));

    const recommendationIds = uniqueStrings(matchedRecommendations.map((entry) => entry.id));
    const linkedNodeIds = linkedNodeIdsForBlock(block, input.graphNodes, recommendationIds);
    const catchUpRouteTargets = uniqueStrings(matchedRecommendations.map((entry) => entry.routeTarget ?? null));
    const homeworkTaskIds = uniqueStrings(matchedHomeworkTasks.map((entry) => entry.taskId));

    let rationale = "Graph-linked timetable block.";
    if (recommendationIds.length > 0) rationale = "Timed directly from a graph recommendation.";
    else if (revisionTopicKeys.length > 0) rationale = "Scheduled from graph revision-overdue topics.";
    else if (homeworkTaskIds.length > 0) rationale = "Linked to active homework tasks already connected to the graph.";

    return {
      blockId: block.blockId,
      linkedNodeIds,
      recommendationIds,
      catchUpRouteTargets,
      homeworkTaskIds,
      revisionTopicKeys,
      rationale,
    };
  }));

  return {
    strategy: input.output.schoolWeekModePlan.strategy,
    activeDayCount: input.output.schoolWeekModePlan.days.length,
    blockMetadata,
    recommendationIds: uniqueStrings(blockMetadata.flatMap((entry) => entry.recommendationIds)),
    homeworkTaskIds: uniqueStrings(blockMetadata.flatMap((entry) => entry.homeworkTaskIds)),
    revisionTopicKeys: uniqueStrings(blockMetadata.flatMap((entry) => entry.revisionTopicKeys)),
  };
}

export function buildGraphReportSummary(output: AcademicIntelligenceOutput): CurriculumGraphReportSummary {
  const recommendationReasons = uniqueStrings([
    ...output.catchUpRecommendations.map((entry) => entry.reason),
    ...output.assessmentRecommendations.map((entry) => entry.reason),
  ].slice(0, 5));

  const reportSignals = uniqueStrings([
    `${output.summary.needsCatchUpCount} topics need catch-up`,
    `${output.summary.needsRevisionCount} topics need revision`,
    `${output.catchUpRecommendations.length} catch-up recommendations active`,
    `${output.assessmentRecommendations.length} assessment recommendations active`,
    `${output.examReadinessProfile.blockers.length} readiness blockers tracked`,
  ]);

  const parentSummary = output.catchUpRecommendations.length > 0
    ? `Focus first on ${summarizeTopic(output.catchUpRecommendations[0]?.topic, output.catchUpRecommendations[0]?.skill ?? "the highest-priority gap")} because the graph shows linked weak areas and unfinished catch-up work.`
    : `The graph shows stable coverage for the current plan with ${output.summary.coveredCount} covered topics.`;

  const adminSummary = `Graph summary: ${output.summary.needsCatchUpCount} catch-up topics, ${output.summary.needsRevisionCount} revision topics, readiness band ${output.examReadinessProfile.band}.`;

  return {
    recommendationReasons,
    parentSummary,
    adminSummary,
    reportSignals,
  };
}

export function buildGraphContentGovernance(output: AcademicIntelligenceOutput): CurriculumContentGovernanceProfile {
  const firstTopic = output.masteryMap[0];
  const flaggedTags = uniqueStrings(output.catchUpTriggers.flatMap((entry) => {
    const evidence = `${entry.source} ${entry.evidenceSummary}`.toLowerCase();
    const tags: string[] = [];
    if (evidence.includes("safeguard")) tags.push("safeguarding_review");
    if (evidence.includes("age")) tags.push("age_check");
    if (evidence.includes("sensitive")) tags.push("sensitive_content_review");
    return tags;
  }));

  const gapTopicCount = output.summary.needsCatchUpCount + output.summary.needsRevisionCount;

  return {
    ageSuitability: {
      keyStage: firstTopic?.keyStage ?? null,
      yearGroup: firstTopic?.yearGroup ?? null,
      status: firstTopic?.yearGroup || firstTopic?.keyStage ? "aligned" : "review",
    },
    curriculumAlignment: {
      coveredTopicCount: output.summary.coveredCount,
      gapTopicCount,
      status: gapTopicCount > 0 ? "review" : "aligned",
    },
    sensitiveContent: {
      status: flaggedTags.length > 0 ? "needs_review" : "clear",
      flaggedTags,
    },
    approvalStatus: {
      requiredStatuses: ["reviewed", "published"],
      recommendedDefault: "reviewed",
      status: gapTopicCount > 0 || flaggedTags.length > 0 ? "review_required" : "ready",
    },
    auditTrailTags: uniqueStrings([
      "curriculum_intelligence_graph",
      "academic_intelligence_source_of_truth",
      "graph_review_before_assignment",
      firstTopic?.yearGroup ?? null,
      firstTopic?.keyStage ?? null,
    ]),
  };
}

export function buildGraphMediaPlan(input: {
  output: AcademicIntelligenceOutput;
  aiContext: CurriculumGraphAiGenerationContext;
  schoolPlanningContext: CurriculumSchoolPlanningContext;
  readinessNodeId: string;
}): CurriculumGraphMediaPlan {
  const references: CurriculumGraphMediaReference[] = input.output.schoolWeekModePlan.dailySchedules.flatMap((schedule) => schedule.blocks.map((block) => {
    const blockMetadata = input.schoolPlanningContext.blockMetadata.find((entry) => entry.blockId === block.blockId);
    return {
      id: `media:${block.blockId}`,
      assetType: guessMediaAssetType(block, input.aiContext),
      label: block.friendlyLabel || block.title,
      nodeIds: blockMetadata?.linkedNodeIds ?? [],
      routeTarget: block.routeTarget,
      mediaRole: block.activityType === "homework"
        ? "revision"
        : block.activityType === "revision"
          ? "revision"
          : "instructional",
      storageStatus: "planned",
      publicUrl: null,
    } as CurriculumGraphMediaReference;
  }));

  references.push({
    id: "media:generated-assets",
    assetType: "generated_asset",
    label: "AI-generated lesson assets",
    nodeIds: uniqueStrings(input.schoolPlanningContext.blockMetadata.flatMap((entry) => entry.linkedNodeIds)),
    routeTarget: input.aiContext.catchUpRouteTargets[0] ?? null,
    mediaRole: "instructional",
    storageStatus: "planned",
    publicUrl: null,
  });

  references.push({
    id: "media:certificate-pdf",
    assetType: "certificate_pdf",
    label: "Certificate export evidence",
    nodeIds: [input.readinessNodeId],
    routeTarget: null,
    mediaRole: "certificate",
    storageStatus: "planned",
    publicUrl: null,
  });

  return {
    supportedAssetTypes: ["lesson_image", "diagram", "audio", "certificate_pdf", "generated_asset", "homework_asset"],
    references,
    summary: `${references.length} media references planned from graph-linked timetable, AI generation, and certificate surfaces.`,
  };
}

export function attachGraphMetadataToSchoolWeekPlan(
  plan: SchoolWeekModePlan,
  context: CurriculumSchoolPlanningContext,
): SchoolWeekModePlan {
  return {
    ...plan,
    dailySchedules: plan.dailySchedules.map((schedule) => ({
      ...schedule,
      blocks: schedule.blocks.map((block) => ({
        ...block,
        graphMetadata: context.blockMetadata.find((entry) => entry.blockId === block.blockId) ?? null,
      })),
    })),
  };
}

export function buildGraphAwarePromptContext(graph: CurriculumIntelligenceGraph): string {
  const aiContext = graph.aiGenerationContext;
  const governance = graph.contentGovernance;
  const heartbeatBaseline = graph.heartbeat.baselineSignals ?? [];
  const mastery = aiContext.masteryGapTopics.length
    ? `Priority gaps: ${aiContext.masteryGapTopics.join(", ")}.`
    : "No major mastery gaps are currently active.";
  const blockers = aiContext.examReadinessBlockers.length
    ? `Readiness blockers: ${aiContext.examReadinessBlockers.join(", ")}.`
    : "No major exam-readiness blockers are active.";

  return [
    `Curriculum graph context is active for this learner.`,
    mastery,
    aiContext.prerequisiteConcepts.length ? `Prerequisites to reinforce: ${aiContext.prerequisiteConcepts.join(", ")}.` : "",
    aiContext.learningTwinSignals.length ? `Preferred explanation styles: ${aiContext.learningTwinSignals.join(", ")}.` : "",
    `Recommended approach: ${aiContext.recommendedApproach}.`,
    heartbeatBaseline.length ? `Baseline pulse: ${heartbeatBaseline.slice(0, 2).join(". ")}.` : "",
    blockers,
    `Approval expectation: default to ${governance.approvalStatus.recommendedDefault} before assignment.`,
  ].filter(Boolean).join(" ");
}

export function buildGraphContentQualityChecks(input: {
  graph: CurriculumIntelligenceGraph;
  subject?: string;
  yearGroup?: string;
  keyStage?: string;
  topic?: string;
}): {
  ageSuitability: "aligned" | "review";
  curriculumAlignment: "aligned" | "review";
  approvalStatus: "review_required" | "ready";
  flaggedTags: string[];
  auditTrailTags: string[];
} {
  const profile = input.graph.contentGovernance;
  const yearMismatch = input.yearGroup
    ? normalize(input.yearGroup) !== normalize(profile.ageSuitability.yearGroup)
    : false;
  const stageMismatch = input.keyStage
    ? normalize(input.keyStage) !== normalize(profile.ageSuitability.keyStage)
    : false;
  const topicMismatch = input.topic
    ? !input.graph.aiGenerationContext.masteryGapTopics.some((entry) => normalize(entry) === normalize(input.topic))
      && !input.graph.reportSummary.recommendationReasons.some((entry) => normalize(entry).includes(normalize(input.topic)))
    : false;

  return {
    ageSuitability: yearMismatch || stageMismatch ? "review" : profile.ageSuitability.status,
    curriculumAlignment: topicMismatch ? "review" : profile.curriculumAlignment.status,
    approvalStatus: profile.approvalStatus.status,
    flaggedTags: profile.sensitiveContent.flaggedTags,
    auditTrailTags: profile.auditTrailTags,
  };
}

export function buildGraphStorageMediaReferences(input: {
  graph: CurriculumIntelligenceGraph;
  assets?: Array<{ id: string; title: string; r2Key?: string | null; imageUrl?: string | null; type?: string | null }>;
  certificateExport?: { objectKey: string; publicUrl: string } | null;
}): CurriculumGraphMediaReference[] {
  const planned = input.graph.mediaPlan.references;
  const assetReferences = (input.assets ?? []).map((asset) => ({
    id: `media:${asset.id}`,
    assetType: asset.type === "diagram" ? "diagram" : "generated_asset",
    label: asset.title,
    nodeIds: uniqueStrings(planned.flatMap((entry) => entry.nodeIds)).slice(0, 8),
    routeTarget: null,
    mediaRole: "instructional",
    storageStatus: asset.r2Key || asset.imageUrl ? "stored" : "generated",
    publicUrl: asset.imageUrl ?? null,
  } as CurriculumGraphMediaReference));

  const certificateReference = input.certificateExport
    ? [{
      id: "media:certificate-export-stored",
      assetType: "certificate_pdf",
      label: "Stored certificate export",
      nodeIds: planned.find((entry) => entry.assetType === "certificate_pdf")?.nodeIds ?? [],
      routeTarget: null,
      mediaRole: "certificate",
      storageStatus: "stored",
      publicUrl: input.certificateExport.publicUrl,
    } as CurriculumGraphMediaReference]
    : [];

  return [...assetReferences, ...certificateReference];
}

// Backward-compatible re-exports for older import sites during rollout.
export {
  buildDefaultApprovalWorkflow,
  buildDefaultGraphAuditMetadata,
  buildDefaultGraphFallback,
  buildGraphProtectionStatus,
} from "@/lib/academic-intelligence/graph-protection";
