import { prisma } from "@/lib/db";
import { DEFAULT_TENANT_POLICY, type RecoveryOrchestrationPlan, type RecoveryTenantPolicy } from "@/lib/recovery_orchestrator";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

type RecoveryAuditAction =
  | "recovery_orchestration_planned"
  | "recovery_orchestration_teacher_approved"
  | "recovery_orchestration_admin_confirmed"
  | "recovery_orchestration_rejected"
  | "recovery_orchestration_rolled_back"
  | "recovery_orchestration_executed"
  | "recovery_orchestration_policy_updated";

type PersistInput = {
  action: RecoveryAuditAction;
  plan: RecoveryOrchestrationPlan;
  actorUserId?: string | null;
  actorSchoolTeacherId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecoveryRunHistoryItem = {
  runId: string;
  schoolId: string;
  action: string;
  createdAt: string;
  actorUserId: string | null;
  actorSchoolTeacherId: string | null;
  planStatus: string;
  note: string | null;
  plan: RecoveryOrchestrationPlan;
  metadata: Record<string, unknown>;
};

export type RecoveryOrchestratorHistoryFilters = {
  schoolId?: string;
  runId?: string;
  status?: string;
  actorUserId?: string;
  actorSchoolTeacherId?: string;
  limit?: number;
  offset?: number;
};

export type RecoveryTimelineEvent = {
  runId: string;
  schoolId: string;
  atIso: string;
  action: string;
  stage:
    | "plan_created"
    | "teacher_approved"
    | "admin_confirmed"
    | "execution_started"
    | "partial_failure"
    | "retry_executed"
    | "rollback_completed"
    | "guardrail_failed"
    | "unknown";
  actorUserId: string | null;
  actorSchoolTeacherId: string | null;
  note: string | null;
};

export type RecoveryGovernanceMetrics = {
  totalRuns: number;
  approvalRate: number;
  rollbackRate: number;
  retryCount: number;
  averageExecutionDurationMs: number;
  guardrailBlockCount: number;
  partiallyExecutedRuns: number;
  mostActiveSchools: Array<{ schoolId: string; runCount: number }>;
};

export type RecoveryAnomalySeverity = "low" | "medium" | "high" | "critical";

export type RecoveryAnomalyType =
  | "unusual_rollback_spike"
  | "excessive_retries"
  | "repeated_guardrail_failures"
  | "abnormal_execution_durations"
  | "school_level_orchestration_anomaly";

export type RecoveryGovernanceAnomaly = {
  id: string;
  type: RecoveryAnomalyType;
  schoolId: string | null;
  severity: RecoveryAnomalySeverity;
  confidenceScore: number;
  summary: string;
  suggestedOperatorAction: string;
  detectedAtIso: string;
};

export type RecoveryGovernanceAlertType =
  | "repeated_execution_failures"
  | "policy_override_abuse"
  | "retry_storm"
  | "rollback_storm"
  | "stuck_execution"
  | "long_running_approval";

export type RecoveryGovernanceAlert = {
  id: string;
  type: RecoveryGovernanceAlertType;
  schoolId: string | null;
  severity: RecoveryAnomalySeverity;
  summary: string;
  recommendedAction: string;
  createdAtIso: string;
};

export type RecoveryGovernanceHealthScore = {
  schoolId: string;
  overallScore: number;
  stability: number;
  executionReliability: number;
  approvalQuality: number;
  rollbackFrequency: number;
  recoverySuccessRate: number;
};

export type RecoveryGovernanceInsights = {
  schoolsWithRisingInterventionPressure: Array<{ schoolId: string; pressureScore: number; reason: string }>;
  highestRollbackSchools: Array<{ schoolId: string; rollbackRate: number; rollbacks: number }>;
  interventionSuccessTrend: {
    currentWindowSuccessRate: number;
    previousWindowSuccessRate: number;
    direction: "up" | "down" | "flat";
  };
  weakestSubjectRecoveryClusters: Array<{ cluster: string; failureRate: number; runCount: number }>;
  approvalBottlenecks: Array<{ schoolId: string; pendingApprovals: number; avgApprovalDelayHours: number }>;
  retryFailureHotspots: Array<{ schoolId: string; retryCount: number; failureCount: number }>;
};

export type RecoveryGovernanceIntelligence = {
  anomalies: RecoveryGovernanceAnomaly[];
  alerts: RecoveryGovernanceAlert[];
  insights: RecoveryGovernanceInsights;
  operatorRecommendations: string[];
  healthScores: RecoveryGovernanceHealthScore[];
};

function parseJsonSafe<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseRecoveryEntry(row: {
  correlationId: string | null;
  schoolId: string;
  action: string;
  createdAt: Date;
  actorUserId: string | null;
  actorSchoolTeacherId: string | null;
  metadataJson: string | null;
}): RecoveryRunHistoryItem | null {
  const metadata = parseJsonSafe<Record<string, unknown>>(row.metadataJson);
  const plan = (metadata?.plan ?? null) as RecoveryOrchestrationPlan | null;
  if (!plan || !row.correlationId) return null;

  return {
    runId: row.correlationId,
    schoolId: row.schoolId,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    actorSchoolTeacherId: row.actorSchoolTeacherId,
    planStatus: plan.status,
    note: typeof metadata?.note === "string" ? metadata.note : null,
    plan,
    metadata: metadata ?? {},
  };
}

function mapTimelineStage(item: RecoveryRunHistoryItem): RecoveryTimelineEvent["stage"] {
  if (item.action === "recovery_orchestration_planned") return "plan_created";
  if (item.action === "recovery_orchestration_teacher_approved") return "teacher_approved";
  if (item.action === "recovery_orchestration_admin_confirmed") {
    if (!item.plan.guardrailsPassed && item.plan.blockedReasons.length > 0) return "guardrail_failed";
    return "admin_confirmed";
  }
  if (item.action === "recovery_orchestration_executed") {
    const retry = Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1;
    if (item.plan.execution.progressPercent > 0 && !item.plan.execution.executed) return "partial_failure";
    return retry ? "retry_executed" : "execution_started";
  }
  if (item.action === "recovery_orchestration_rolled_back") return "rollback_completed";
  return "unknown";
}

export async function persistRecoveryOrchestrationEvent(input: PersistInput): Promise<void> {
  await writeSchoolAuditLog({
    schoolId: input.plan.schoolId,
    actorUserId: input.actorUserId ?? undefined,
    actorSchoolTeacherId: input.actorSchoolTeacherId ?? undefined,
    action: input.action,
    entityType: "system",
    entityId: input.plan.runId,
    source: "api",
    operation: "recovery_orchestrator",
    correlationId: input.plan.runId,
    metadata: {
      runId: input.plan.runId,
      note: input.note ?? null,
      plan: input.plan,
      ...input.metadata,
    },
    severity: input.plan.status === "rolled_back" || input.plan.status === "rejected" ? "warning" : "info",
  });
}

export async function loadRecoveryOrchestrationPlan(input: {
  schoolId: string;
  runId: string;
}): Promise<RecoveryOrchestrationPlan | null> {
  const row = await prisma.schoolAuditLog.findFirst({
    where: {
      schoolId: input.schoolId,
      operation: "recovery_orchestrator",
      correlationId: input.runId,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      metadataJson: true,
    },
  });

  const metadata = parseJsonSafe<{ plan?: RecoveryOrchestrationPlan }>(row?.metadataJson ?? null);
  return metadata?.plan ?? null;
}

export async function listRecoveryOrchestrationHistory(input: RecoveryOrchestratorHistoryFilters): Promise<{ items: RecoveryRunHistoryItem[]; total: number }> {
  const limit = Math.max(10, Math.min(200, Math.floor(input.limit ?? 50)));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));

  const baseWhere = {
    operation: "recovery_orchestrator",
    ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    ...(input.runId ? { correlationId: input.runId } : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.actorSchoolTeacherId ? { actorSchoolTeacherId: input.actorSchoolTeacherId } : {}),
  };

  const fetchTake = input.status ? 1000 : limit;
  const fetchSkip = input.status ? 0 : offset;

  const [rows, totalRaw] = await Promise.all([
    prisma.schoolAuditLog.findMany({
      where: baseWhere,
      orderBy: [{ createdAt: "desc" }],
      skip: fetchSkip,
      take: fetchTake,
      select: {
        correlationId: true,
        schoolId: true,
        action: true,
        createdAt: true,
        actorUserId: true,
        actorSchoolTeacherId: true,
        metadataJson: true,
      },
    }),
    prisma.schoolAuditLog.count({ where: baseWhere }),
  ]);

  const parsed = rows
    .map((row) => parseRecoveryEntry(row))
    .filter((row): row is RecoveryRunHistoryItem => Boolean(row))
    .filter((row) => (input.status ? row.planStatus === input.status : true));

  if (!input.status) {
    return { items: parsed, total: totalRaw };
  }

  return {
    items: parsed.slice(offset, offset + limit),
    total: parsed.length,
  };
}

function normalizePolicy(policy: Partial<RecoveryTenantPolicy> | null | undefined): RecoveryTenantPolicy {
  const roles = Array.isArray(policy?.teacherApprovalRoles)
    ? policy.teacherApprovalRoles.filter((role): role is "teacher" | "admin" | "owner" =>
      role === "teacher" || role === "admin" || role === "owner",
    )
    : DEFAULT_TENANT_POLICY.teacherApprovalRoles;

  return {
    teacherApprovalRoles: roles.length ? roles : DEFAULT_TENANT_POLICY.teacherApprovalRoles,
    guardrails: {
      ...(policy?.guardrails ?? {}),
    },
  };
}

export async function persistRecoveryTenantPolicy(input: {
  schoolId: string;
  actorUserId?: string | null;
  policy: Partial<RecoveryTenantPolicy>;
  note?: string | null;
}): Promise<RecoveryTenantPolicy> {
  const normalized = normalizePolicy(input.policy);
  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId ?? undefined,
    action: "recovery_orchestration_policy_updated",
    entityType: "school",
    entityId: input.schoolId,
    source: "api",
    operation: "recovery_orchestrator_policy",
    correlationId: `recovery-policy:${input.schoolId}`,
    metadata: {
      schoolId: input.schoolId,
      note: input.note ?? null,
      policy: normalized,
    },
  });
  return normalized;
}

export async function loadRecoveryTenantPolicy(input: {
  schoolId: string;
}): Promise<RecoveryTenantPolicy> {
  const row = await prisma.schoolAuditLog.findFirst({
    where: {
      schoolId: input.schoolId,
      operation: "recovery_orchestrator_policy",
      correlationId: `recovery-policy:${input.schoolId}`,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      metadataJson: true,
    },
  });

  const metadata = parseJsonSafe<{ policy?: Partial<RecoveryTenantPolicy> }>(row?.metadataJson ?? null);
  return normalizePolicy(metadata?.policy);
}

export async function listRecoveryRunTimeline(input: {
  schoolId: string;
  runId: string;
}): Promise<RecoveryTimelineEvent[]> {
  const history = await listRecoveryOrchestrationHistory({
    schoolId: input.schoolId,
    runId: input.runId,
    limit: 200,
    offset: 0,
  });

  return history.items
    .slice()
    .reverse()
    .map((item) => ({
      runId: item.runId,
      schoolId: item.schoolId,
      atIso: item.createdAt,
      action: item.action,
      stage: mapTimelineStage(item),
      actorUserId: item.actorUserId,
      actorSchoolTeacherId: item.actorSchoolTeacherId,
      note: item.note,
    }));
}

function getLatestRunState(items: RecoveryRunHistoryItem[]): RecoveryRunHistoryItem[] {
  const latest = new Map<string, RecoveryRunHistoryItem>();
  for (const item of items) {
    const existing = latest.get(item.runId);
    if (!existing || new Date(item.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latest.set(item.runId, item);
    }
  }
  return Array.from(latest.values());
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number((value * 100).toFixed(2));
}

function toScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function extractCluster(targetConcept: string): string {
  const cleaned = targetConcept.trim().toLowerCase();
  if (!cleaned) return "unknown";
  const [first = "unknown"] = cleaned.split(/\s+/);
  return first;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sinceHours(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export async function getRecoveryGovernanceMetrics(input: RecoveryOrchestratorHistoryFilters): Promise<RecoveryGovernanceMetrics> {
  const history = await listRecoveryOrchestrationHistory({
    ...input,
    limit: 1000,
    offset: 0,
  });
  const latestStates = getLatestRunState(history.items);
  const totalRuns = latestStates.length;
  const approvedRuns = latestStates.filter((item) => item.plan.status === "approved" || item.plan.status === "rolled_back").length;
  const rolledBackRuns = latestStates.filter((item) => item.plan.status === "rolled_back").length;
  const retryCount = history.items.filter((item) => item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1)).length;
  const durationRows = latestStates
    .map((item) => item.plan.execution.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const averageExecutionDurationMs = durationRows.length
    ? Math.round(durationRows.reduce((sum, value) => sum + value, 0) / durationRows.length)
    : 0;
  const guardrailBlockCount = latestStates.filter((item) => !item.plan.guardrailsPassed || item.plan.blockedReasons.length > 0).length;
  const partiallyExecutedRuns = latestStates.filter((item) => item.plan.execution.partialExecution || ((item.plan.execution.progressPercent ?? 0) > 0 && !item.plan.execution.executed)).length;

  const bySchool = new Map<string, number>();
  for (const item of latestStates) {
    bySchool.set(item.schoolId, (bySchool.get(item.schoolId) ?? 0) + 1);
  }
  const mostActiveSchools = Array.from(bySchool.entries())
    .map(([schoolId, runCount]) => ({ schoolId, runCount }))
    .sort((a, b) => b.runCount - a.runCount)
    .slice(0, 5);

  return {
    totalRuns,
    approvalRate: toPercent(totalRuns ? approvedRuns / totalRuns : 0),
    rollbackRate: toPercent(totalRuns ? rolledBackRuns / totalRuns : 0),
    retryCount,
    averageExecutionDurationMs,
    guardrailBlockCount,
    partiallyExecutedRuns,
    mostActiveSchools,
  };
}

export async function getRecoveryGovernanceIntelligence(input: RecoveryOrchestratorHistoryFilters): Promise<RecoveryGovernanceIntelligence> {
  const [history, policyHistory] = await Promise.all([
    listRecoveryOrchestrationHistory({ ...input, limit: 2000, offset: 0 }),
    listRecoveryPolicyHistory({ schoolId: input.schoolId, limit: 1000, offset: 0 }),
  ]);

  const nowIso = new Date().toISOString();
  const latestStates = getLatestRunState(history.items);
  const bySchool = new Map<string, RecoveryRunHistoryItem[]>();
  const runEvents = new Map<string, RecoveryRunHistoryItem[]>();

  for (const item of history.items) {
    bySchool.set(item.schoolId, [...(bySchool.get(item.schoolId) ?? []), item]);
    runEvents.set(item.runId, [...(runEvents.get(item.runId) ?? []), item]);
  }

  const totalRuns = latestStates.length;
  const totalRollbacks = latestStates.filter((item) => item.plan.status === "rolled_back").length;
  const totalRetries = history.items.filter((item) => item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1)).length;
  const totalGuardrailFailures = history.items.filter((item) => item.action === "recovery_orchestration_admin_confirmed" && !item.plan.guardrailsPassed).length;
  const durationValues = latestStates
    .map((item) => item.plan.execution.durationMs)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const meanDuration = avg(durationValues);

  const anomalies: RecoveryGovernanceAnomaly[] = [];
  const alerts: RecoveryGovernanceAlert[] = [];

  const rollbackRate = totalRuns ? totalRollbacks / totalRuns : 0;
  if (totalRuns >= 5 && rollbackRate >= 0.35) {
    anomalies.push({
      id: `anom-rollback-${Date.now()}`,
      type: "unusual_rollback_spike",
      schoolId: input.schoolId ?? null,
      severity: rollbackRate >= 0.5 ? "critical" : rollbackRate >= 0.4 ? "high" : "medium",
      confidenceScore: confidence(Math.min(0.95, rollbackRate + totalRuns / 200)),
      summary: `Rollback spike detected at ${(rollbackRate * 100).toFixed(1)}% across ${totalRuns} runs.`,
      suggestedOperatorAction: "Escalate to manual review and pause orchestration for affected schools.",
      detectedAtIso: nowIso,
    });
  }

  const retryRate = totalRuns ? totalRetries / totalRuns : 0;
  if (totalRuns >= 5 && retryRate >= 0.25) {
    anomalies.push({
      id: `anom-retry-${Date.now()}`,
      type: "excessive_retries",
      schoolId: input.schoolId ?? null,
      severity: retryRate >= 0.45 ? "high" : "medium",
      confidenceScore: confidence(Math.min(0.9, retryRate + totalRuns / 300)),
      summary: `Excessive retry behavior detected (${totalRetries} retries over ${totalRuns} runs).`,
      suggestedOperatorAction: "Reduce intervention frequency and enforce tighter approval checks.",
      detectedAtIso: nowIso,
    });
  }

  const guardrailRate = totalRuns ? totalGuardrailFailures / totalRuns : 0;
  if (totalRuns >= 5 && guardrailRate >= 0.3) {
    anomalies.push({
      id: `anom-guardrail-${Date.now()}`,
      type: "repeated_guardrail_failures",
      schoolId: input.schoolId ?? null,
      severity: guardrailRate >= 0.5 ? "high" : "medium",
      confidenceScore: confidence(Math.min(0.92, guardrailRate + totalRuns / 250)),
      summary: `Repeated guardrail failures observed (${totalGuardrailFailures} blocked confirmations).`,
      suggestedOperatorAction: "Tighten cooldown windows or throttle orchestration cadence for high-pressure cohorts.",
      detectedAtIso: nowIso,
    });
  }

  const abnormalDurationRuns = latestStates.filter((item) => (item.plan.execution.durationMs ?? 0) > Math.max(meanDuration * 2, 120000));
  if (abnormalDurationRuns.length >= 2) {
    anomalies.push({
      id: `anom-duration-${Date.now()}`,
      type: "abnormal_execution_durations",
      schoolId: input.schoolId ?? null,
      severity: abnormalDurationRuns.length >= 5 ? "high" : "medium",
      confidenceScore: confidence(Math.min(0.9, abnormalDurationRuns.length / Math.max(1, totalRuns))),
      summary: `${abnormalDurationRuns.length} runs exceeded abnormal execution duration thresholds.`,
      suggestedOperatorAction: "Investigate executor performance and queue contention before increasing run volume.",
      detectedAtIso: nowIso,
    });
  }

  for (const [schoolId, schoolRuns] of bySchool.entries()) {
    const latestSchoolRuns = getLatestRunState(schoolRuns);
    if (latestSchoolRuns.length < 5) continue;
    const schoolRollbacks = latestSchoolRuns.filter((item) => item.plan.status === "rolled_back").length;
    const schoolFailures = latestSchoolRuns.filter((item) => Boolean(item.plan.execution.lastExecutionError)).length;
    const schoolRetries = schoolRuns.filter((item) => item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1)).length;
    const anomalyRatio = Math.max(
      schoolRollbacks / latestSchoolRuns.length,
      schoolFailures / latestSchoolRuns.length,
      schoolRetries / latestSchoolRuns.length,
    );

    if (anomalyRatio >= 0.45) {
      anomalies.push({
        id: `anom-school-${schoolId}`,
        type: "school_level_orchestration_anomaly",
        schoolId,
        severity: anomalyRatio >= 0.65 ? "critical" : "high",
        confidenceScore: confidence(Math.min(0.97, anomalyRatio + latestSchoolRuns.length / 250)),
        summary: `School ${schoolId} shows elevated orchestration risk patterns.`,
        suggestedOperatorAction: "Pause orchestration for this school and switch to manual approval workflow.",
        detectedAtIso: nowIso,
      });
    }
  }

  const last24h = sinceHours(24);
  const recentItems = history.items.filter((item) => new Date(item.createdAt).getTime() >= last24h.getTime());
  const recentRetries = recentItems.filter((item) => item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1));
  const recentRollbacks = recentItems.filter((item) => item.action === "recovery_orchestration_rolled_back");
  const repeatedExecutionFailures = latestStates.filter((item) => Boolean(item.plan.execution.lastExecutionError));

  if (repeatedExecutionFailures.length >= 3) {
    alerts.push({
      id: `alert-failures-${Date.now()}`,
      type: "repeated_execution_failures",
      schoolId: input.schoolId ?? null,
      severity: repeatedExecutionFailures.length >= 6 ? "high" : "medium",
      summary: `${repeatedExecutionFailures.length} runs currently have unresolved execution failures.`,
      recommendedAction: "Escalate to manual review and inspect runtime dependency health.",
      createdAtIso: nowIso,
    });
  }

  const policyUpdatesBySchool = new Map<string, number>();
  for (const policyEvent of policyHistory.filter((event) => new Date(event.createdAt).getTime() >= last24h.getTime())) {
    policyUpdatesBySchool.set(policyEvent.schoolId, (policyUpdatesBySchool.get(policyEvent.schoolId) ?? 0) + 1);
  }
  for (const [schoolId, count] of policyUpdatesBySchool.entries()) {
    if (count >= 4) {
      alerts.push({
        id: `alert-policy-${schoolId}`,
        type: "policy_override_abuse",
        schoolId,
        severity: count >= 7 ? "high" : "medium",
        summary: `High policy override cadence detected (${count} updates in 24h).`,
        recommendedAction: "Increase approval restrictions and require dual admin confirmation for policy updates.",
        createdAtIso: nowIso,
      });
    }
  }

  if (recentRetries.length >= 5) {
    alerts.push({
      id: `alert-retry-${Date.now()}`,
      type: "retry_storm",
      schoolId: input.schoolId ?? null,
      severity: recentRetries.length >= 10 ? "critical" : "high",
      summary: `Retry storm detected (${recentRetries.length} retry executions in 24h).`,
      recommendedAction: "Reduce intervention frequency and investigate upstream execution failures.",
      createdAtIso: nowIso,
    });
  }

  if (recentRollbacks.length >= 4) {
    alerts.push({
      id: `alert-rollback-${Date.now()}`,
      type: "rollback_storm",
      schoolId: input.schoolId ?? null,
      severity: recentRollbacks.length >= 8 ? "critical" : "high",
      summary: `Rollback storm detected (${recentRollbacks.length} rollback events in 24h).`,
      recommendedAction: "Pause orchestration for impacted schools and force manual intervention triage.",
      createdAtIso: nowIso,
    });
  }

  const stuckExecutions = latestStates.filter((item) => item.plan.status === "approved" && !item.plan.execution.executed && new Date(item.createdAt).getTime() <= sinceHours(6).getTime());
  if (stuckExecutions.length >= 2) {
    alerts.push({
      id: `alert-stuck-${Date.now()}`,
      type: "stuck_execution",
      schoolId: input.schoolId ?? null,
      severity: stuckExecutions.length >= 5 ? "high" : "medium",
      summary: `${stuckExecutions.length} approved runs appear stuck without completed execution.`,
      recommendedAction: "Trigger controlled retries and escalate persistent stuck runs to operators.",
      createdAtIso: nowIso,
    });
  }

  const longRunningApprovals = latestStates.filter((item) => (item.plan.status === "planned" || item.plan.status === "teacher_approved") && new Date(item.createdAt).getTime() <= sinceHours(24).getTime());
  if (longRunningApprovals.length >= 3) {
    alerts.push({
      id: `alert-approvals-${Date.now()}`,
      type: "long_running_approval",
      schoolId: input.schoolId ?? null,
      severity: longRunningApprovals.length >= 8 ? "high" : "medium",
      summary: `${longRunningApprovals.length} runs are waiting in approval stages longer than expected.`,
      recommendedAction: "Escalate approval queue and assign additional approvers for blocked schools.",
      createdAtIso: nowIso,
    });
  }

  const schoolsWithRisingInterventionPressure = Array.from(bySchool.entries())
    .map(([schoolId, items]) => {
      const latest = getLatestRunState(items);
      const pendingApprovals = latest.filter((item) => item.plan.status === "planned" || item.plan.status === "teacher_approved").length;
      const guardrailFails = items.filter((item) => item.action === "recovery_orchestration_admin_confirmed" && !item.plan.guardrailsPassed).length;
      const pressureScore = pendingApprovals * 1.4 + guardrailFails * 1.8;
      return {
        schoolId,
        pressureScore: Number(pressureScore.toFixed(2)),
        reason: `${pendingApprovals} pending approvals, ${guardrailFails} guardrail blocks`,
      };
    })
    .filter((item) => item.pressureScore > 0)
    .sort((a, b) => b.pressureScore - a.pressureScore)
    .slice(0, 5);

  const highestRollbackSchools = Array.from(bySchool.entries())
    .map(([schoolId, items]) => {
      const latest = getLatestRunState(items);
      const rollbacks = latest.filter((item) => item.plan.status === "rolled_back").length;
      const rollbackRateSchool = latest.length ? rollbacks / latest.length : 0;
      return {
        schoolId,
        rollbackRate: Number((rollbackRateSchool * 100).toFixed(2)),
        rollbacks,
      };
    })
    .sort((a, b) => b.rollbackRate - a.rollbackRate)
    .slice(0, 5);

  const now = Date.now();
  const currentWindow = latestStates.filter((item) => now - new Date(item.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const previousWindow = latestStates.filter((item) => {
    const diff = now - new Date(item.createdAt).getTime();
    return diff > 7 * 24 * 60 * 60 * 1000 && diff <= 14 * 24 * 60 * 60 * 1000;
  });
  const currentSuccessRate = currentWindow.length
    ? currentWindow.filter((item) => item.plan.execution.executed && !item.plan.execution.lastExecutionError).length / currentWindow.length
    : 0;
  const previousSuccessRate = previousWindow.length
    ? previousWindow.filter((item) => item.plan.execution.executed && !item.plan.execution.lastExecutionError).length / previousWindow.length
    : 0;

  const clusterMap = new Map<string, { failures: number; total: number }>();
  for (const run of latestStates) {
    const cluster = extractCluster(run.plan.targetConcept);
    const current = clusterMap.get(cluster) ?? { failures: 0, total: 0 };
    current.total += 1;
    if (run.plan.status === "rolled_back" || Boolean(run.plan.execution.lastExecutionError)) current.failures += 1;
    clusterMap.set(cluster, current);
  }
  const weakestSubjectRecoveryClusters = Array.from(clusterMap.entries())
    .map(([cluster, values]) => ({
      cluster,
      failureRate: Number(((values.total ? values.failures / values.total : 0) * 100).toFixed(2)),
      runCount: values.total,
    }))
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 5);

  const approvalBottlenecks = Array.from(bySchool.entries())
    .map(([schoolId, items]) => {
      const latest = getLatestRunState(items);
      const pending = latest.filter((item) => item.plan.status === "planned" || item.plan.status === "teacher_approved");
      const delays = pending.map((item) => (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60));
      return {
        schoolId,
        pendingApprovals: pending.length,
        avgApprovalDelayHours: Number(avg(delays).toFixed(2)),
      };
    })
    .filter((item) => item.pendingApprovals > 0)
    .sort((a, b) => b.pendingApprovals - a.pendingApprovals)
    .slice(0, 5);

  const retryFailureHotspots = Array.from(bySchool.entries())
    .map(([schoolId, items]) => {
      const retryCount = items.filter((item) => item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1)).length;
      const failureCount = getLatestRunState(items).filter((item) => Boolean(item.plan.execution.lastExecutionError)).length;
      return { schoolId, retryCount, failureCount };
    })
    .filter((item) => item.retryCount > 0 || item.failureCount > 0)
    .sort((a, b) => (b.retryCount + b.failureCount) - (a.retryCount + a.failureCount))
    .slice(0, 5);

  const insights: RecoveryGovernanceInsights = {
    schoolsWithRisingInterventionPressure,
    highestRollbackSchools,
    interventionSuccessTrend: {
      currentWindowSuccessRate: toPercent(currentSuccessRate),
      previousWindowSuccessRate: toPercent(previousSuccessRate),
      direction: currentSuccessRate > previousSuccessRate ? "up" : currentSuccessRate < previousSuccessRate ? "down" : "flat",
    },
    weakestSubjectRecoveryClusters,
    approvalBottlenecks,
    retryFailureHotspots,
  };

  const healthScores: RecoveryGovernanceHealthScore[] = Array.from(bySchool.entries()).map(([schoolId, items]) => {
    const latest = getLatestRunState(items);
    const total = latest.length || 1;
    const rollbackRateLocal = latest.filter((item) => item.plan.status === "rolled_back").length / total;
    const executionReliability = latest.filter((item) => item.plan.execution.executed && !item.plan.execution.lastExecutionError).length / total;
    const approvalQuality = latest.filter((item) => item.plan.status === "approved" || item.plan.status === "rolled_back").length / total;
    const recoverySuccessRate = latest.filter((item) => item.plan.execution.executed).length / total;

    const stability = toScore(100 - rollbackRateLocal * 100);
    const execScore = toScore(executionReliability * 100);
    const approvalScore = toScore(approvalQuality * 100);
    const rollbackFrequency = toScore(100 - rollbackRateLocal * 100);
    const recoveryScore = toScore(recoverySuccessRate * 100);
    const overallScore = toScore(
      stability * 0.24
      + execScore * 0.24
      + approvalScore * 0.18
      + rollbackFrequency * 0.14
      + recoveryScore * 0.20,
    );

    return {
      schoolId,
      overallScore,
      stability,
      executionReliability: execScore,
      approvalQuality: approvalScore,
      rollbackFrequency,
      recoverySuccessRate: recoveryScore,
    };
  }).sort((a, b) => a.overallScore - b.overallScore);

  const operatorRecommendations: string[] = [];
  if (guardrailRate >= 0.3) operatorRecommendations.push("Tighten cooldown windows for high-risk schools.");
  if (totalRuns && totalRetries / totalRuns >= 0.25) operatorRecommendations.push("Reduce intervention frequency until retry pressure normalizes.");
  if (longRunningApprovals.length >= 3) operatorRecommendations.push("Increase approval restrictions with escalation for long-running approvals.");
  if (repeatedExecutionFailures.length >= 3) operatorRecommendations.push("Escalate to manual review for repeated execution failures.");
  if (anomalies.some((item) => item.type === "school_level_orchestration_anomaly" && item.severity !== "medium")) {
    operatorRecommendations.push("Pause orchestration for a school with critical anomaly signals.");
  }

  return {
    anomalies: anomalies.slice(0, 20),
    alerts: alerts.slice(0, 20),
    insights,
    operatorRecommendations,
    healthScores,
  };
}

export async function listRecoveryPolicyHistory(input: {
  schoolId?: string;
  limit?: number;
  offset?: number;
}): Promise<Array<{
  schoolId: string;
  createdAt: string;
  actorUserId: string | null;
  note: string | null;
  policy: RecoveryTenantPolicy;
}>> {
  const rows = await prisma.schoolAuditLog.findMany({
    where: {
      operation: "recovery_orchestrator_policy",
      ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(10, Math.min(500, Math.floor(input.limit ?? 200))),
    skip: Math.max(0, Math.floor(input.offset ?? 0)),
    select: {
      schoolId: true,
      createdAt: true,
      actorUserId: true,
      metadataJson: true,
    },
  });

  return rows
    .map((row) => {
      const metadata = parseJsonSafe<{ note?: string | null; policy?: Partial<RecoveryTenantPolicy> }>(row.metadataJson);
      if (!metadata?.policy) return null;
      return {
        schoolId: row.schoolId,
        createdAt: row.createdAt.toISOString(),
        actorUserId: row.actorUserId,
        note: metadata.note ?? null,
        policy: normalizePolicy(metadata.policy),
      };
    })
    .filter((row): row is { schoolId: string; createdAt: string; actorUserId: string | null; note: string | null; policy: RecoveryTenantPolicy } => Boolean(row));
}