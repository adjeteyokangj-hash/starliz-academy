import type {
  CurriculumGraphApprovalWorkflow,
  CurriculumGraphAuditMetadata,
  CurriculumGraphChangeProposal,
  CurriculumGraphEdge,
  CurriculumGraphFallback,
  CurriculumGraphNode,
  CurriculumGraphProtectionStatus,
  CurriculumGraphValidationIssue,
  CurriculumGraphValidationReport,
  CurriculumIntelligenceGraph,
} from "@/lib/academic-intelligence/types";

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isDependencyEdge(type: CurriculumGraphEdge["type"]): boolean {
  return type === "requires" || type === "blocked_by" || type === "recommends";
}

function protectedNodeType(node: CurriculumGraphNode): boolean {
  return node.type === "assessment_readiness" || node.type === "learning_twin_signal";
}

function hasNode(nodes: Map<string, CurriculumGraphNode>, id: string): boolean {
  return nodes.has(id);
}

function nodeFingerprint(node: CurriculumGraphNode): string {
  const recommendationId = node.type === "recommendation" && node.metadata && typeof node.metadata.recommendationId === "string"
    ? normalize(node.metadata.recommendationId)
    : "";
  return [
    normalize(node.type),
    normalize(node.subject),
    normalize(node.topicKey),
    normalize(node.label),
    recommendationId,
  ].join("|");
}

export function detectCircularDependencies(input: {
  nodes: CurriculumGraphNode[];
  edges: CurriculumGraphEdge[];
}): string[][] {
  const graph = new Map<string, string[]>();
  for (const node of input.nodes) graph.set(node.id, []);
  for (const edge of input.edges) {
    if (!isDependencyEdge(edge.type)) continue;
    const list = graph.get(edge.source) ?? [];
    list.push(edge.target);
    graph.set(edge.source, list);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (nodeId: string) => {
    visiting.add(nodeId);
    stack.push(nodeId);

    for (const next of graph.get(nodeId) ?? []) {
      if (!visiting.has(next) && !visited.has(next)) {
        dfs(next);
        continue;
      }
      if (visiting.has(next)) {
        const start = stack.indexOf(next);
        if (start >= 0) cycles.push([...stack.slice(start), next]);
      }
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const node of input.nodes) {
    if (!visited.has(node.id)) dfs(node.id);
  }

  const seen = new Set<string>();
  return cycles.filter((cycle) => {
    const key = cycle.join("->");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectOrphanNodes(input: {
  nodes: CurriculumGraphNode[];
  edges: CurriculumGraphEdge[];
}): string[] {
  const degree = new Map<string, number>();
  for (const node of input.nodes) degree.set(node.id, 0);

  for (const edge of input.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  return input.nodes
    .filter((node) => (degree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
}

export function detectDuplicateNodes(nodes: CurriculumGraphNode[]): {
  duplicateNodeIds: string[];
  duplicateFingerprints: string[];
} {
  const byId = new Set<string>();
  const duplicateById = new Set<string>();

  const byFingerprint = new Map<string, string[]>();
  for (const node of nodes) {
    if (byId.has(node.id)) duplicateById.add(node.id);
    byId.add(node.id);

    const fingerprint = nodeFingerprint(node);
    const list = byFingerprint.get(fingerprint) ?? [];
    list.push(node.id);
    byFingerprint.set(fingerprint, list);
  }

  const duplicateFingerprints: string[] = [];
  const duplicateNodeIds = new Set<string>(duplicateById);
  for (const [fingerprint, ids] of byFingerprint.entries()) {
    if (ids.length <= 1) continue;
    duplicateFingerprints.push(fingerprint);
    for (const id of ids) duplicateNodeIds.add(id);
  }

  return {
    duplicateNodeIds: Array.from(duplicateNodeIds),
    duplicateFingerprints,
  };
}

export function validateCurriculumGraph(input: {
  nodes: CurriculumGraphNode[];
  edges: CurriculumGraphEdge[];
}): CurriculumGraphValidationReport {
  const nodesMap = new Map(input.nodes.map((node) => [node.id, node]));
  const issues: CurriculumGraphValidationIssue[] = [];

  const cycles = detectCircularDependencies(input);
  for (const cycle of cycles) {
    issues.push({
      code: "circular_dependency",
      severity: "error",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      nodeId: cycle[0],
    });
  }

  const orphans = detectOrphanNodes(input);
  for (const nodeId of orphans) {
    issues.push({
      code: "orphan_node",
      severity: "warning",
      message: `Orphan node detected: ${nodeId}`,
      nodeId,
    });
  }

  const duplicates = detectDuplicateNodes(input.nodes);
  for (const nodeId of duplicates.duplicateNodeIds) {
    issues.push({
      code: "duplicate_node",
      severity: "error",
      message: `Duplicate node detected: ${nodeId}`,
      nodeId,
    });
  }

  for (const edge of input.edges) {
    if (hasNode(nodesMap, edge.source) && hasNode(nodesMap, edge.target)) continue;
    issues.push({
      code: "invalid_edge",
      severity: "error",
      message: `Edge references missing node(s): ${edge.id}`,
      edgeId: edge.id,
    });
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    circularDependencies: cycles,
    orphanNodeIds: orphans,
    duplicateNodeIds: duplicates.duplicateNodeIds,
    duplicateFingerprints: duplicates.duplicateFingerprints,
  };
}

export function buildGraphProtectionStatus(input: {
  nodes: CurriculumGraphNode[];
  edges: CurriculumGraphEdge[];
  blockedChangesCount?: number;
}): CurriculumGraphProtectionStatus {
  const validation = validateCurriculumGraph({
    nodes: input.nodes,
    edges: input.edges,
  });
  const protectedNodeIds = input.nodes.filter((node) => protectedNodeType(node)).map((node) => node.id);

  return {
    protectedNodeIds,
    protectedNodeTypes: ["assessment_readiness", "learning_twin_signal"],
    aiSuggestionMode: "suggestion_only",
    approvalRequiredForActivation: true,
    validation,
    blockedChangesCount: Math.max(0, Number(input.blockedChangesCount ?? 0)),
    status: validation.valid ? "protected" : "needs_attention",
  };
}

function cloneGraph(graph: CurriculumIntelligenceGraph): CurriculumIntelligenceGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, metadata: node.metadata ? { ...node.metadata } : undefined })),
    edges: graph.edges.map((edge) => ({ ...edge, metadata: edge.metadata ? { ...edge.metadata } : undefined })),
    recommendationLayer: graph.recommendationLayer.map((item) => ({ ...item })),
    masteryOverlay: graph.masteryOverlay.map((item) => ({ ...item })),
    weakAreaTrace: graph.weakAreaTrace.map((item) => ({ ...item })),
    heartbeat: {
      ...graph.heartbeat,
      systemStates: graph.heartbeat.systemStates.map((item) => ({ ...item })),
    },
    aiGenerationContext: {
      ...graph.aiGenerationContext,
      masteryGapTopics: [...graph.aiGenerationContext.masteryGapTopics],
      prerequisiteConcepts: [...graph.aiGenerationContext.prerequisiteConcepts],
      weakAreaTopics: [...graph.aiGenerationContext.weakAreaTopics],
      recommendationFocus: [...graph.aiGenerationContext.recommendationFocus],
      catchUpRouteTargets: [...graph.aiGenerationContext.catchUpRouteTargets],
      examReadinessBlockers: [...graph.aiGenerationContext.examReadinessBlockers],
      learningTwinSignals: [...graph.aiGenerationContext.learningTwinSignals],
    },
    schoolPlanningContext: {
      ...graph.schoolPlanningContext,
      blockMetadata: graph.schoolPlanningContext.blockMetadata.map((item) => ({
        ...item,
        linkedNodeIds: [...item.linkedNodeIds],
        recommendationIds: [...item.recommendationIds],
        catchUpRouteTargets: [...item.catchUpRouteTargets],
        homeworkTaskIds: [...item.homeworkTaskIds],
        revisionTopicKeys: [...item.revisionTopicKeys],
      })),
      recommendationIds: [...graph.schoolPlanningContext.recommendationIds],
      homeworkTaskIds: [...graph.schoolPlanningContext.homeworkTaskIds],
      revisionTopicKeys: [...graph.schoolPlanningContext.revisionTopicKeys],
    },
    reportSummary: {
      ...graph.reportSummary,
      recommendationReasons: [...graph.reportSummary.recommendationReasons],
      reportSignals: [...graph.reportSummary.reportSignals],
    },
    contentGovernance: {
      ...graph.contentGovernance,
      sensitiveContent: {
        ...graph.contentGovernance.sensitiveContent,
        flaggedTags: [...graph.contentGovernance.sensitiveContent.flaggedTags],
      },
      approvalStatus: {
        ...graph.contentGovernance.approvalStatus,
        requiredStatuses: [...graph.contentGovernance.approvalStatus.requiredStatuses],
      },
      auditTrailTags: [...graph.contentGovernance.auditTrailTags],
    },
    mediaPlan: {
      ...graph.mediaPlan,
      supportedAssetTypes: [...graph.mediaPlan.supportedAssetTypes],
      references: graph.mediaPlan.references.map((item) => ({ ...item, nodeIds: [...item.nodeIds] })),
    },
    protection: {
      ...graph.protection,
      protectedNodeIds: [...graph.protection.protectedNodeIds],
      protectedNodeTypes: [...graph.protection.protectedNodeTypes],
      validation: {
        ...graph.protection.validation,
        issues: graph.protection.validation.issues.map((item) => ({ ...item })),
        circularDependencies: graph.protection.validation.circularDependencies.map((cycle) => [...cycle]),
        orphanNodeIds: [...graph.protection.validation.orphanNodeIds],
        duplicateNodeIds: [...graph.protection.validation.duplicateNodeIds],
        duplicateFingerprints: [...graph.protection.validation.duplicateFingerprints],
      },
    },
    approvalWorkflow: {
      ...graph.approvalWorkflow,
      pendingProposals: graph.approvalWorkflow.pendingProposals.map((item) => ({ ...item })),
    },
    fallback: { ...graph.fallback },
    auditMetadata: {
      decisions: graph.auditMetadata.decisions.map((item) => ({ ...item })),
    },
  };
}

function protectedNodeIds(nodes: CurriculumGraphNode[]): Set<string> {
  return new Set(nodes.filter((node) => protectedNodeType(node)).map((node) => node.id));
}

export function evaluateGraphChangeProposal(input: {
  graph: CurriculumIntelligenceGraph;
  proposal: CurriculumGraphChangeProposal;
  approvedBy?: string | null;
}): {
  graph: CurriculumIntelligenceGraph;
  accepted: boolean;
  reason: string;
} {
  const graph = cloneGraph(input.graph);
  const proposal = input.proposal;
  const now = new Date().toISOString();

  const isAiSuggestion = proposal.source === "ai";
  const approver = input.approvedBy?.trim() ?? null;
  if (isAiSuggestion && !approver) {
    graph.approvalWorkflow.pendingProposals = [...graph.approvalWorkflow.pendingProposals, proposal];
    graph.approvalWorkflow.latestDecision = "pending";
    graph.approvalWorkflow.latestDecisionReason = "AI suggestions are suggestion-only and require admin approval.";
    graph.approvalWorkflow.latestDecisionAt = now;
    graph.approvalWorkflow.latestDecisionBy = null;
    graph.auditMetadata.decisions.push({
      at: now,
      actor: proposal.submittedBy,
      decision: "proposal_pending",
      reason: "AI suggestion pending admin approval.",
    });
    return { graph, accepted: false, reason: "proposal_pending_admin_approval" };
  }

  const protectedIds = protectedNodeIds(graph.nodes);
  const touchesProtectedNode = proposal.node
    ? protectedIds.has(proposal.node.id)
    : proposal.edge
      ? protectedIds.has(proposal.edge.source) || protectedIds.has(proposal.edge.target)
      : false;

  if (touchesProtectedNode && (proposal.action === "remove_node" || proposal.action === "update_node" || proposal.action === "remove_edge")) {
    graph.protection.blockedChangesCount += 1;
    graph.approvalWorkflow.latestDecision = "rejected";
    graph.approvalWorkflow.latestDecisionReason = "Protected system nodes cannot be modified directly.";
    graph.approvalWorkflow.latestDecisionAt = now;
    graph.approvalWorkflow.latestDecisionBy = approver ?? proposal.submittedBy;
    graph.auditMetadata.decisions.push({
      at: now,
      actor: approver ?? proposal.submittedBy,
      decision: "proposal_rejected",
      reason: "Protected system node violation.",
    });
    return { graph, accepted: false, reason: "protected_node_violation" };
  }

  const nextNodes = [...graph.nodes];
  const nextEdges = [...graph.edges];
  if ((proposal.action === "add_node" || proposal.action === "update_node") && proposal.node) {
    const index = nextNodes.findIndex((node) => node.id === proposal.node!.id);
    if (index >= 0) nextNodes[index] = proposal.node;
    else nextNodes.push(proposal.node);
  }
  if (proposal.action === "remove_node" && proposal.node) {
    const filteredNodes = nextNodes.filter((node) => node.id !== proposal.node!.id);
    nextNodes.length = 0;
    nextNodes.push(...filteredNodes);
    const filteredEdges = nextEdges.filter((edge) => edge.source !== proposal.node!.id && edge.target !== proposal.node!.id);
    nextEdges.length = 0;
    nextEdges.push(...filteredEdges);
  }
  if ((proposal.action === "add_edge" || proposal.action === "update_edge") && proposal.edge) {
    const index = nextEdges.findIndex((edge) => edge.id === proposal.edge!.id);
    if (index >= 0) nextEdges[index] = proposal.edge;
    else nextEdges.push(proposal.edge);
  }
  if (proposal.action === "remove_edge" && proposal.edge) {
    const filtered = nextEdges.filter((edge) => edge.id !== proposal.edge!.id);
    nextEdges.length = 0;
    nextEdges.push(...filtered);
  }

  const validation = validateCurriculumGraph({ nodes: nextNodes, edges: nextEdges });
  if (!validation.valid) {
    graph.protection.blockedChangesCount += 1;
    graph.approvalWorkflow.latestDecision = "rejected";
    graph.approvalWorkflow.latestDecisionReason = "Graph validation failed.";
    graph.approvalWorkflow.latestDecisionAt = now;
    graph.approvalWorkflow.latestDecisionBy = approver ?? proposal.submittedBy;
    graph.auditMetadata.decisions.push({
      at: now,
      actor: approver ?? proposal.submittedBy,
      decision: "proposal_rejected",
      reason: "Graph validation failed.",
    });
    return { graph, accepted: false, reason: "validation_failed" };
  }

  graph.nodes = nextNodes;
  graph.edges = nextEdges;
  graph.protection = buildGraphProtectionStatus({
    nodes: graph.nodes,
    edges: graph.edges,
    blockedChangesCount: graph.protection.blockedChangesCount,
  });
  graph.approvalWorkflow.pendingProposals = graph.approvalWorkflow.pendingProposals
    .filter((item) => item.proposalId !== proposal.proposalId);
  graph.approvalWorkflow.latestDecision = "approved";
  graph.approvalWorkflow.latestDecisionReason = "Validated and approved.";
  graph.approvalWorkflow.latestDecisionAt = now;
  graph.approvalWorkflow.latestDecisionBy = approver ?? proposal.submittedBy;
  graph.auditMetadata.decisions.push({
    at: now,
    actor: approver ?? proposal.submittedBy,
    decision: "proposal_approved",
    reason: "Graph proposal applied after validation.",
  });

  return { graph, accepted: true, reason: "approved" };
}

export function buildDefaultApprovalWorkflow(): CurriculumGraphApprovalWorkflow {
  return {
    pendingProposals: [],
    latestDecision: "not_requested",
    latestDecisionReason: null,
    latestDecisionBy: null,
    latestDecisionAt: null,
  };
}

export function buildDefaultGraphFallback(): CurriculumGraphFallback {
  return {
    applied: false,
    reason: null,
    fallbackGeneratedAt: null,
  };
}

export function buildDefaultGraphAuditMetadata(): CurriculumGraphAuditMetadata {
  return {
    decisions: [],
  };
}

export function buildStudentSafeGraph(graph: CurriculumIntelligenceGraph): CurriculumIntelligenceGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      subject: node.subject ?? null,
      topicKey: node.topicKey ?? null,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight,
    })),
    protection: {
      ...graph.protection,
      validation: {
        ...graph.protection.validation,
        issues: graph.protection.validation.issues.filter((issue) => issue.severity === "warning"),
      },
    },
    auditMetadata: {
      decisions: graph.auditMetadata.decisions.map((decision) => ({
        at: decision.at,
        actor: decision.actor,
        decision: decision.decision,
        reason: decision.decision === "build_fallback"
          ? "Fallback applied to keep graph available."
          : "Graph decision recorded.",
      })),
    },
  };
}
