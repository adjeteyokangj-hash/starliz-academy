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