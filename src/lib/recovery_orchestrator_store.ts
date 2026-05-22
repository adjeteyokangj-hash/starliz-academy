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
  const metadata = parseJsonSafe<{ note?: string | null; plan?: RecoveryOrchestrationPlan }>(row.metadataJson);
  if (!metadata?.plan || !row.correlationId) return null;

  return {
    runId: row.correlationId,
    schoolId: row.schoolId,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    actorSchoolTeacherId: row.actorSchoolTeacherId,
    planStatus: metadata.plan.status,
    note: metadata.note ?? null,
    plan: metadata.plan,
  };
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