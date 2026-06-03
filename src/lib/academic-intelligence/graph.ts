import type {
  AcademicIntelligenceOutput,
  AcademicSourceData,
  CatchUpTaskRecord,
  CurriculumGraphEdge,
  CurriculumGraphNode,
  CurriculumIntelligenceGraph,
  CurriculumMasteryOverlayEntry,
  CurriculumRecommendationLayer,
  CurriculumWeakAreaTrace,
  MasteryMapEntry,
  WeakAreaRecord,
} from "@/lib/academic-intelligence/types";
import {
  buildGraphAiGenerationContext,
  buildGraphContentGovernance,
  buildGraphHeartbeat,
  buildGraphMediaPlan,
  buildGraphReportSummary,
  buildGraphSchoolPlanningContext,
} from "@/lib/academic-intelligence/graph-context";
import {
  buildDefaultApprovalWorkflow,
  buildDefaultGraphAuditMetadata,
  buildDefaultGraphFallback,
  buildGraphProtectionStatus,
} from "@/lib/academic-intelligence/graph-protection";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function keyPart(value: string | null | undefined): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "na";
}

function nodeId(prefix: string, parts: Array<string | null | undefined>): string {
  return `${prefix}:${parts.map((part) => keyPart(part)).join(":")}`;
}

function recommendationTopicKey(input: {
  subject: string | null | undefined;
  topic: string | null | undefined;
  skill: string | null | undefined;
}): string {
  return `${keyPart(input.subject)}|${keyPart(input.topic)}|${keyPart(input.skill)}`;
}

function weakAreaPrerequisites(weakArea: WeakAreaRecord): string[] {
  const metadata = weakArea.metadata;
  if (!metadata || typeof metadata !== "object") return [];

  const candidates: string[] = [];
  const possibleKeys = ["prerequisites", "prerequisiteWords", "prerequisiteTopics", "prerequisiteSkills"];
  for (const key of possibleKeys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = typeof item === "string" ? item.trim() : "";
        if (text) candidates.push(text);
      }
    }
  }

  return Array.from(new Set(candidates));
}

function addNode(nodes: Map<string, CurriculumGraphNode>, node: CurriculumGraphNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function addEdge(edges: Map<string, CurriculumGraphEdge>, edge: CurriculumGraphEdge): void {
  if (!edges.has(edge.id)) edges.set(edge.id, edge);
}

function buildMasteryOverlay(output: AcademicIntelligenceOutput): CurriculumMasteryOverlayEntry[] {
  const coverageByKey = new Map(output.curriculumCoverage.map((entry) => [entry.topicKey, entry.coverageStatus]));

  return output.masteryMap.map((entry) => ({
    topicKey: entry.topicKey,
    subject: entry.subject,
    topic: entry.topic,
    skill: entry.skill,
    masteryStatus: entry.masteryStatus,
    coverageStatus: coverageByKey.get(entry.topicKey) ?? "not_covered",
    confidenceScore: entry.confidenceScore,
    weakAreaActive: entry.weakAreaActive,
    revisionOverdue: entry.revisionOverdue,
  }));
}

function buildRecommendationLayer(output: AcademicIntelligenceOutput): CurriculumRecommendationLayer[] {
  const catchUp: CurriculumRecommendationLayer[] = output.catchUpRecommendations.map((item) => ({
    recommendationId: item.id,
    source: "catch_up",
    priority: item.priority,
    status: item.status,
    subject: item.subject,
    topic: item.topic,
    skill: item.skill,
    reason: item.reason,
    action: item.recommendedAction,
    routeTarget: item.routeTarget ?? null,
  }));

  const assessmentByKey = new Map<string, CurriculumRecommendationLayer>();
  for (const item of output.assessmentRecommendations) {
    const id = nodeId("assessment", [item.assessmentType, item.subject, item.topic, item.skill]);
    const key = `${normalize(item.assessmentType)}|${recommendationTopicKey({
      subject: item.subject,
      topic: item.topic,
      skill: item.skill,
    })}`;
    const priority = item.readinessStatus === "needs_catch_up" || item.readinessStatus === "not_ready"
      ? "high"
      : item.readinessStatus === "developing"
        ? "medium"
        : "low";
    const current: CurriculumRecommendationLayer = {
      recommendationId: id,
      source: "assessment",
      priority,
      status: item.readinessStatus,
      subject: item.subject,
      topic: item.topic,
      skill: item.skill,
      reason: item.reason,
      action: `Assign ${item.assessmentType}`,
      routeTarget: item.routeTarget ?? null,
    };
    const previous = assessmentByKey.get(key);
    if (!previous) {
      assessmentByKey.set(key, current);
      continue;
    }
    if (current.priority === "high" || (current.priority === "medium" && previous.priority === "low")) {
      previous.priority = current.priority;
    }
    if (previous.status === "ready" && current.status !== "ready") {
      previous.status = current.status;
    }
    if (current.reason && !previous.reason.includes(current.reason)) {
      previous.reason = `${previous.reason}; ${current.reason}`;
    }
    if (!previous.routeTarget && current.routeTarget) {
      previous.routeTarget = current.routeTarget;
    }
  }
  const assessment = Array.from(assessmentByKey.values());

  return [...catchUp, ...assessment];
}

function findTopicNodeId(topics: Map<string, string>, fallback: Pick<MasteryMapEntry, "subject" | "topic" | "skill">): string {
  const directKey = `${normalize(fallback.subject)}|${normalize(fallback.topic)}|${normalize(fallback.skill)}`;
  const existing = topics.get(directKey);
  if (existing) return existing;
  return nodeId("topic", [fallback.subject, fallback.topic, fallback.skill]);
}

function topicLookupKey(subject: string | null | undefined, topic: string | null | undefined, skill: string | null | undefined): string {
  return `${normalize(subject)}|${normalize(topic)}|${normalize(skill)}`;
}

function attachCatchUpTaskLinks(
  output: AcademicIntelligenceOutput,
  nodes: Map<string, CurriculumGraphNode>,
  edges: Map<string, CurriculumGraphEdge>,
  topicNodeBySignal: Map<string, string>,
): void {
  const taskByRecommendation = new Map<string, CatchUpTaskRecord>();
  for (const task of output.catchUpTasks) {
    taskByRecommendation.set(task.recommendationId, task);
  }

  for (const recommendation of output.catchUpRecommendations) {
    const recommendationNodeId = nodeId("recommendation", [recommendation.id]);
    const task = taskByRecommendation.get(recommendation.id);

    addNode(nodes, {
      id: recommendationNodeId,
      type: "recommendation",
      label: recommendation.title,
      subject: recommendation.subject,
      topicKey: recommendationTopicKey({
        subject: recommendation.subject,
        topic: recommendation.topic,
        skill: recommendation.skill,
      }),
      metadata: {
        recommendationId: recommendation.id,
        source: "catch_up",
        priority: recommendation.priority,
        status: recommendation.status,
        taskType: recommendation.taskType,
        sourceTrigger: recommendation.sourceTrigger,
        dueDate: recommendation.dueDate ?? null,
        taskId: task?.taskId ?? null,
      },
    });

    const topicNodeId = topicNodeBySignal.get(topicLookupKey(recommendation.subject, recommendation.topic, recommendation.skill))
      ?? nodeId("topic", [recommendation.subject, recommendation.topic, recommendation.skill]);

    addEdge(edges, {
      id: `${recommendationNodeId}|${topicNodeId}|targets`,
      source: recommendationNodeId,
      target: topicNodeId,
      type: "targets",
      weight: recommendation.priority === "high" ? 1 : recommendation.priority === "medium" ? 0.7 : 0.5,
    });
  }
}

export function buildCurriculumIntelligenceGraph(input: {
  source: AcademicSourceData;
  output: AcademicIntelligenceOutput;
}): CurriculumIntelligenceGraph {
  const { source, output } = input;
  const nodes = new Map<string, CurriculumGraphNode>();
  const edges = new Map<string, CurriculumGraphEdge>();

  const masteryOverlay = buildMasteryOverlay(output);
  const recommendationLayer = buildRecommendationLayer(output);

  const topicNodeBySignal = new Map<string, string>();
  const topicNodeByTopicKey = new Map<string, string>();

  for (const entry of output.masteryMap) {
    const topicId = nodeId("topic", [entry.subject, entry.topic, entry.skill]);
    topicNodeBySignal.set(topicLookupKey(entry.subject, entry.topic, entry.skill), topicId);
    topicNodeByTopicKey.set(entry.topicKey, topicId);

    addNode(nodes, {
      id: topicId,
      type: "topic",
      label: entry.topic ?? entry.skill ?? entry.subject,
      subject: entry.subject,
      topicKey: entry.topicKey,
      metadata: {
        topic: entry.topic ?? null,
        skill: entry.skill ?? null,
        keyStage: entry.keyStage ?? null,
        yearGroup: entry.yearGroup ?? null,
        examBoard: entry.examBoard ?? null,
      },
    });

    const masteryId = nodeId("mastery", [entry.topicKey, entry.masteryStatus]);
    addNode(nodes, {
      id: masteryId,
      type: "mastery_state",
      label: entry.masteryStatus,
      subject: entry.subject,
      topicKey: entry.topicKey,
      metadata: {
        confidenceScore: entry.confidenceScore,
        coverage: output.curriculumCoverage.find((row) => row.topicKey === entry.topicKey)?.coverageStatus ?? "not_covered",
        revisionOverdue: entry.revisionOverdue,
        averageScore: entry.averageScore,
        attemptsCount: entry.attemptsCount,
      },
    });

    addEdge(edges, {
      id: `${topicId}|${masteryId}|has_mastery_state`,
      source: topicId,
      target: masteryId,
      type: "has_mastery_state",
      weight: Math.max(0.2, Math.min(1, entry.confidenceScore / 100)),
    });
  }

  for (const weakArea of source.weakAreas) {
    const weakId = nodeId("weak", [weakArea.id]);
    const topicId = findTopicNodeId(topicNodeBySignal, {
      subject: weakArea.subject,
      topic: weakArea.topic,
      skill: weakArea.skill,
    });

    addNode(nodes, {
      id: weakId,
      type: "weak_area",
      label: `${weakArea.topic ?? weakArea.skill ?? weakArea.subject} weak area`,
      subject: weakArea.subject,
      metadata: {
        weakAreaId: weakArea.id,
        status: weakArea.status,
        weaknessType: weakArea.weaknessType ?? null,
        accuracy: weakArea.accuracy ?? null,
        attemptsCount: weakArea.attemptsCount ?? null,
      },
    });

    addEdge(edges, {
      id: `${topicId}|${weakId}|has_weak_area`,
      source: topicId,
      target: weakId,
      type: "has_weak_area",
      weight: weakArea.status === "active" ? 1 : 0.4,
    });

    const prerequisites = weakAreaPrerequisites(weakArea);
    for (const prerequisite of prerequisites) {
      const prerequisiteId = nodeId("prerequisite", [weakArea.subject, prerequisite]);
      addNode(nodes, {
        id: prerequisiteId,
        type: "prerequisite",
        label: prerequisite,
        subject: weakArea.subject,
      });
      addEdge(edges, {
        id: `${topicId}|${prerequisiteId}|requires`,
        source: topicId,
        target: prerequisiteId,
        type: "requires",
        weight: 0.8,
      });
    }
  }

  attachCatchUpTaskLinks(output, nodes, edges, topicNodeBySignal);

  const twinSignals = output.learningTwin.explanationDNA.topSignals;
  const signalIds: string[] = [];
  for (const signal of twinSignals) {
    const signalId = nodeId("signal", [signal.style]);
    signalIds.push(signalId);
    addNode(nodes, {
      id: signalId,
      type: "learning_twin_signal",
      label: signal.style,
      metadata: {
        score: signal.score,
        evidence: signal.evidence,
      },
    });

    for (const recommendation of recommendationLayer) {
      const recommendationId = nodeId("recommendation", [recommendation.recommendationId]);
      if (!nodes.has(recommendationId)) continue;
      addEdge(edges, {
        id: `${signalId}|${recommendationId}|informed_by`,
        source: signalId,
        target: recommendationId,
        type: "informed_by",
        weight: Math.max(0.2, Math.min(1, signal.score / 100)),
      });
    }
  }

  const readinessNodeId = nodeId("readiness", [output.assessmentReadiness, output.examReadinessProfile.band]);
  addNode(nodes, {
    id: readinessNodeId,
    type: "assessment_readiness",
    label: output.examReadinessProfile.headline,
    metadata: {
      assessmentReadiness: output.assessmentReadiness,
      examBand: output.examReadinessProfile.band,
      score: output.examReadinessProfile.score,
      blockers: output.examReadinessProfile.blockers,
    },
  });

  for (const layerItem of recommendationLayer) {
    if (layerItem.source !== "assessment") continue;
    const recommendationId = nodeId("recommendation", [layerItem.recommendationId]);

    addNode(nodes, {
      id: recommendationId,
      type: "recommendation",
      label: `${layerItem.action}: ${layerItem.topic ?? layerItem.subject ?? "General"}`,
      subject: layerItem.subject,
      topicKey: recommendationTopicKey({
        subject: layerItem.subject,
        topic: layerItem.topic,
        skill: layerItem.skill,
      }),
      metadata: {
        source: layerItem.source,
        recommendationId: layerItem.recommendationId,
        priority: layerItem.priority,
        status: layerItem.status,
      },
    });

    const topicId = topicNodeBySignal.get(topicLookupKey(layerItem.subject, layerItem.topic, layerItem.skill))
      ?? nodeId("topic", [layerItem.subject, layerItem.topic, layerItem.skill]);

    addEdge(edges, {
      id: `${recommendationId}|${topicId}|targets`,
      source: recommendationId,
      target: topicId,
      type: "targets",
      weight: layerItem.priority === "high" ? 1 : layerItem.priority === "medium" ? 0.7 : 0.5,
    });

    addEdge(edges, {
      id: `${recommendationId}|${readinessNodeId}|supports_readiness`,
      source: recommendationId,
      target: readinessNodeId,
      type: "supports_readiness",
      weight: layerItem.priority === "high" ? 1 : 0.6,
    });
  }

  for (const signalId of signalIds) {
    addEdge(edges, {
      id: `${signalId}|${readinessNodeId}|supports_readiness`,
      source: signalId,
      target: readinessNodeId,
      type: "supports_readiness",
      weight: 0.5,
    });
  }

  for (const weakArea of source.weakAreas) {
    const weakId = nodeId("weak", [weakArea.id]);
    const topicId = topicNodeBySignal.get(topicLookupKey(weakArea.subject, weakArea.topic, weakArea.skill));
    if (!topicId) continue;

    for (const layerItem of recommendationLayer) {
      const sameScope = normalize(layerItem.subject) === normalize(weakArea.subject)
        && (normalize(layerItem.topic) === normalize(weakArea.topic) || normalize(layerItem.skill) === normalize(weakArea.skill));
      if (!sameScope) continue;
      const recommendationId = nodeId("recommendation", [layerItem.recommendationId]);
      if (!nodes.has(recommendationId)) continue;
      addEdge(edges, {
        id: `${weakId}|${recommendationId}|blocked_by`,
        source: weakId,
        target: recommendationId,
        type: "blocked_by",
        weight: weakArea.status === "active" ? 1 : 0.5,
      });
    }
  }

  const weakAreaTrace: CurriculumWeakAreaTrace[] = source.weakAreas.map((weakArea) => {
    const linkedTopicKeys: string[] = [];
    for (const row of output.masteryMap) {
      const sameSubject = normalize(row.subject) === normalize(weakArea.subject);
      const sameTopic = normalize(row.topic) === normalize(weakArea.topic);
      const sameSkill = normalize(row.skill) === normalize(weakArea.skill);
      if (sameSubject && (sameTopic || sameSkill)) linkedTopicKeys.push(row.topicKey);
    }

    const linkedRecommendationIds = output.catchUpRecommendations
      .filter((item) => normalize(item.subject) === normalize(weakArea.subject)
        && (normalize(item.topic) === normalize(weakArea.topic) || normalize(item.skill) === normalize(weakArea.skill)))
      .map((item) => item.id);

    const prerequisiteIds = weakAreaPrerequisites(weakArea).map((value) => nodeId("prerequisite", [weakArea.subject, value]));

    return {
      weakAreaId: weakArea.id,
      subject: weakArea.subject,
      topic: weakArea.topic,
      skill: weakArea.skill,
      linkedTopicKeys,
      linkedRecommendationIds,
      prerequisiteIds,
    };
  });

  const nodesArray = Array.from(nodes.values());
  const edgesArray = Array.from(edges.values());
  const aiGenerationContext = buildGraphAiGenerationContext(output);
  const schoolPlanningContext = buildGraphSchoolPlanningContext({
    output,
    graphNodes: nodesArray,
  });
  const protection = buildGraphProtectionStatus({
    nodes: nodesArray,
    edges: edgesArray,
  });
  const auditMetadata = buildDefaultGraphAuditMetadata();
  auditMetadata.decisions.push({
    at: output.generatedAt,
    actor: "academic_intelligence_builder",
    decision: "build_success",
    reason: "Curriculum graph built and validated from source-of-truth pipeline.",
  });

  return {
    version: "v1",
    generatedAt: output.generatedAt,
    studentId: output.studentId,
    nodes: nodesArray,
    edges: edgesArray,
    recommendationLayer,
    masteryOverlay,
    weakAreaTrace,
    heartbeat: buildGraphHeartbeat({
      generatedAt: output.generatedAt,
      nodeCount: nodesArray.length,
      edgeCount: edgesArray.length,
      quickLevelFinderBaseline: source.quickLevelFinderBaseline ?? null,
    }),
    aiGenerationContext,
    schoolPlanningContext,
    reportSummary: buildGraphReportSummary(output),
    contentGovernance: buildGraphContentGovernance(output),
    mediaPlan: buildGraphMediaPlan({
      output,
      aiContext: aiGenerationContext,
      schoolPlanningContext,
      readinessNodeId,
    }),
    protection,
    approvalWorkflow: buildDefaultApprovalWorkflow(),
    fallback: buildDefaultGraphFallback(),
    auditMetadata,
  };
}
