import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import {
  applyOrchestrationDecision,
  planAdaptiveRecovery,
  type RecoveryOrchestrationPlan,
} from "@/lib/recovery_orchestrator";
import {
  getRecoveryGovernanceMetrics,
  listRecoveryOrchestrationHistory,
  listRecoveryPolicyHistory,
  listRecoveryRunTimeline,
  loadRecoveryOrchestrationPlan,
  loadRecoveryTenantPolicy,
  persistRecoveryOrchestrationEvent,
  persistRecoveryTenantPolicy,
} from "@/lib/recovery_orchestrator_store";
import {
  executeRecoveryOrchestrationPlan,
  retryRecoveryOrchestrationExecution,
  rollbackRecoveryOrchestrationPlan,
} from "@/lib/recovery_orchestrator_runtime";

const plannerInputSchema = z.object({
  schoolId: z.string().min(1),
  studentId: z.string().min(1).optional().nullable(),
  targetConcept: z.string().trim().min(1),
  subject: z.string().trim().optional().nullable(),
  keyStage: z.string().trim().optional().nullable(),
  yearGroup: z.string().trim().optional().nullable(),
  currentInterventionMinutesWeek: z.number().int().min(0).optional().nullable(),
  lastInterventionAtIso: z.string().datetime().optional().nullable(),
  supportLevel: z.number().int().min(1).max(5).optional().nullable(),
  signals: z
    .object({
      baselineAccuracyPct: z.number().min(0).max(100).optional().nullable(),
      hintCount: z.number().int().min(0).optional().nullable(),
      confidenceScore: z.number().min(0).max(1).optional().nullable(),
      stalledDays: z.number().int().min(0).optional().nullable(),
    })
    .optional(),
  rules: z
    .object({
      minAssessmentAccuracyPct: z.number().int().min(10).max(95).optional(),
      repeatedHintThreshold: z.number().int().min(1).max(20).optional(),
      lowConfidenceThreshold: z.number().min(0.05).max(0.95).optional(),
      stalledDaysThreshold: z.number().int().min(1).max(60).optional(),
      maxInterventionMinutesPerWeek: z.number().int().min(10).max(240).optional(),
      cooldownHours: z.number().int().min(1).max(168).optional(),
    })
    .optional(),
});

const decisionPlanSchema = z.custom<RecoveryOrchestrationPlan>((value) => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.runId === "string" && typeof row.schoolId === "string" && typeof row.status === "string";
}, "Invalid orchestration plan payload.");

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    payload: plannerInputSchema,
  }),
  z.object({
    action: z.literal("teacher_approve"),
    payload: z.object({
      plan: decisionPlanSchema,
      teacherApproverUserId: z.string().min(1).optional().nullable(),
      note: z.string().max(1500).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("admin_confirm"),
    payload: z.object({
      plan: decisionPlanSchema,
      note: z.string().max(1500).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("reject"),
    payload: z.object({
      plan: decisionPlanSchema,
      note: z.string().max(1500).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("rollback"),
    payload: z.object({
      plan: decisionPlanSchema,
      note: z.string().max(1500).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("retry_execution"),
    payload: z.object({
      plan: decisionPlanSchema,
      note: z.string().max(1500).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("update_policy"),
    payload: z.object({
      schoolId: z.string().min(1),
      note: z.string().max(1500).optional().nullable(),
      teacherApprovalRoles: z.array(z.enum(["teacher", "admin", "owner"])) .min(1).max(3),
      guardrails: z.object({
        minAssessmentAccuracyPct: z.number().int().min(10).max(95).optional(),
        repeatedHintThreshold: z.number().int().min(1).max(20).optional(),
        lowConfidenceThreshold: z.number().min(0.05).max(0.95).optional(),
        stalledDaysThreshold: z.number().int().min(1).max(60).optional(),
        maxInterventionMinutesPerWeek: z.number().int().min(10).max(240).optional(),
        cooldownHours: z.number().int().min(1).max(168).optional(),
      }).optional(),
    }),
  }),
]);

const historyQuerySchema = z.object({
  schoolId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  status: z.enum(["planned", "teacher_approved", "approved", "rejected", "rolled_back"]).optional(),
  actorUserId: z.string().min(1).optional(),
  actorSchoolTeacherId: z.string().min(1).optional(),
  transport: z.enum(["sse", "polling"]).optional(),
  sinceIso: z.string().datetime().optional(),
  includeMetrics: z.coerce.boolean().optional(),
  includePolicy: z.coerce.boolean().optional(),
  includeTimeline: z.coerce.boolean().optional(),
  exportType: z.enum(["orchestration_history", "rollback_history", "retry_activity", "school_policy_settings"]).optional(),
  limit: z.coerce.number().int().min(10).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    return text;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
}

type GovernanceLiveEventType =
  | "run_status_change"
  | "execution_progress"
  | "retry"
  | "rollback"
  | "guardrail_failure";

type GovernanceLiveEvent = {
  eventType: GovernanceLiveEventType;
  runId: string;
  schoolId: string;
  action: string;
  createdAt: string;
  status: string;
  progressPercent: number;
  lastExecutionError: string | null;
};

type GovernanceLiveEnvelope = {
  generatedAt: string;
  events: GovernanceLiveEvent[];
};

function toSseChunk(payload: GovernanceLiveEnvelope): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function toLiveEvents(items: Awaited<ReturnType<typeof listRecoveryOrchestrationHistory>>["items"]): GovernanceLiveEvent[] {
  return items.map((item) => {
    const hasRetry = Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1;
    const isGuardrailFailure = item.action === "recovery_orchestration_admin_confirmed" && !item.plan.guardrailsPassed && item.plan.blockedReasons.length > 0;
    const isRollback = item.action === "recovery_orchestration_rolled_back";
    const isExecution = item.action === "recovery_orchestration_executed";

    let eventType: GovernanceLiveEventType = "run_status_change";
    if (isGuardrailFailure) eventType = "guardrail_failure";
    else if (isRollback) eventType = "rollback";
    else if (isExecution && hasRetry) eventType = "retry";
    else if (isExecution) eventType = "execution_progress";

    return {
      eventType,
      runId: item.runId,
      schoolId: item.schoolId,
      action: item.action,
      createdAt: item.createdAt,
      status: item.plan.status,
      progressPercent: item.plan.execution.progressPercent ?? 0,
      lastExecutionError: item.plan.execution.lastExecutionError,
    };
  });
}

async function resolveTeacherApprover(input: {
  schoolId: string;
  sessionUserId: string;
  teacherApproverUserId?: string | null;
  allowedRoles: Array<"teacher" | "admin" | "owner">;
}) {
  const userId = input.teacherApproverUserId?.trim() || input.sessionUserId;
  const link = await prisma.schoolTeacher.findFirst({
    where: {
      schoolId: input.schoolId,
      userId,
      status: "active",
      role: { in: input.allowedRoles },
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  return link;
}

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const query = historyQuerySchema.parse(Object.fromEntries(searchParams.entries()));

  if (query.transport === "sse") {
    let streamClosed = false;
    let lastSeenIso = query.sinceIso ?? new Date(Date.now() - 60_000).toISOString();
    let pushTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const safeEnqueue = (chunk: string) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            streamClosed = true;
            clearTimers();
          }
        };

        const push = async () => {
          if (streamClosed) return;
          try {
            const history = await listRecoveryOrchestrationHistory({
              schoolId: query.schoolId,
              runId: query.runId,
              status: query.status,
              actorUserId: query.actorUserId,
              actorSchoolTeacherId: query.actorSchoolTeacherId,
              limit: 120,
              offset: 0,
            });

            const fresh = history.items
              .filter((item) => new Date(item.createdAt).getTime() > new Date(lastSeenIso).getTime())
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

            if (!fresh.length) return;
            lastSeenIso = fresh[fresh.length - 1].createdAt;
            const envelope: GovernanceLiveEnvelope = {
              generatedAt: new Date().toISOString(),
              events: toLiveEvents(fresh),
            };
            safeEnqueue(toSseChunk(envelope));
          } catch {
            safeEnqueue("event: error\ndata: {\"error\":\"recovery_live_snapshot_failed\"}\n\n");
          }
        };

        void push();
        pushTimer = setInterval(() => {
          void push();
        }, 5000);
        heartbeatTimer = setInterval(() => {
          safeEnqueue(": heartbeat\n\n");
        }, 10000);
      },
      cancel() {
        streamClosed = true;
        clearTimers();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  if (query.transport === "polling") {
    const sinceIso = query.sinceIso ?? new Date(Date.now() - 60_000).toISOString();
    const history = await listRecoveryOrchestrationHistory({
      schoolId: query.schoolId,
      runId: query.runId,
      status: query.status,
      actorUserId: query.actorUserId,
      actorSchoolTeacherId: query.actorSchoolTeacherId,
      limit: 120,
      offset: 0,
    });

    const fresh = history.items
      .filter((item) => new Date(item.createdAt).getTime() > new Date(sinceIso).getTime())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      events: toLiveEvents(fresh),
    });
  }

  if (query.exportType) {
    if (query.exportType === "school_policy_settings") {
      const policies = await listRecoveryPolicyHistory({
        schoolId: query.schoolId,
        limit: query.limit,
        offset: query.offset,
      });
      const rows = policies.map((item) => ({
        schoolId: item.schoolId,
        createdAt: item.createdAt,
        actorUserId: item.actorUserId ?? "",
        note: item.note ?? "",
        teacherApprovalRoles: item.policy.teacherApprovalRoles.join("|"),
        minAssessmentAccuracyPct: item.policy.guardrails.minAssessmentAccuracyPct ?? "",
        repeatedHintThreshold: item.policy.guardrails.repeatedHintThreshold ?? "",
        lowConfidenceThreshold: item.policy.guardrails.lowConfidenceThreshold ?? "",
        stalledDaysThreshold: item.policy.guardrails.stalledDaysThreshold ?? "",
        maxInterventionMinutesPerWeek: item.policy.guardrails.maxInterventionMinutesPerWeek ?? "",
        cooldownHours: item.policy.guardrails.cooldownHours ?? "",
      }));
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=\"recovery-policy-settings-${new Date().toISOString().slice(0, 10)}.csv\"`,
        },
      });
    }

    const history = await listRecoveryOrchestrationHistory({
      schoolId: query.schoolId,
      runId: query.runId,
      status: query.status,
      actorUserId: query.actorUserId,
      actorSchoolTeacherId: query.actorSchoolTeacherId,
      limit: 1000,
      offset: 0,
    });

    const rows = history.items.filter((item) => {
      if (query.exportType === "rollback_history") return item.action === "recovery_orchestration_rolled_back";
      if (query.exportType === "retry_activity") return item.action === "recovery_orchestration_executed" && (Boolean(item.metadata.retry) || (item.plan.execution.attempts ?? 0) > 1);
      return true;
    }).map((item) => ({
      runId: item.runId,
      schoolId: item.schoolId,
      action: item.action,
      createdAt: item.createdAt,
      planStatus: item.plan.status,
      actorUserId: item.actorUserId ?? "",
      actorSchoolTeacherId: item.actorSchoolTeacherId ?? "",
      targetConcept: item.plan.targetConcept,
      guardrailsPassed: item.plan.guardrailsPassed,
      blockedReasons: item.plan.blockedReasons.join(" | "),
      executionProgressPercent: item.plan.execution.progressPercent ?? 0,
      executionAttempts: item.plan.execution.attempts ?? 0,
      executed: item.plan.execution.executed,
      durationMs: item.plan.execution.durationMs ?? "",
      failureCategory: item.plan.execution.failureClassification?.category ?? "",
      failureSeverity: item.plan.execution.failureClassification?.severity ?? "",
      retryRecommended: item.plan.execution.failureClassification?.retryRecommended ?? "",
      operatorGuidance: item.plan.execution.failureClassification?.operatorGuidance ?? "",
      lastExecutionError: item.plan.execution.lastExecutionError ?? "",
      note: item.note ?? "",
    }));

    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${query.exportType}-${new Date().toISOString().slice(0, 10)}.csv\"`,
      },
    });
  }

  const history = await listRecoveryOrchestrationHistory(query);

  const policy = query.includePolicy && query.schoolId
    ? await loadRecoveryTenantPolicy({ schoolId: query.schoolId })
    : null;

  const metrics = query.includeMetrics
    ? await getRecoveryGovernanceMetrics(query)
    : null;

  const timeline = query.includeTimeline && query.runId && query.schoolId
    ? await listRecoveryRunTimeline({ schoolId: query.schoolId, runId: query.runId })
    : null;

  return NextResponse.json({
    items: history.items,
    total: history.total,
    query,
    policy,
    metrics,
    timeline,
  });
}

export async function POST(request: Request) {
  const parsedBody = requestSchema.parse(await request.json());

  if (parsedBody.action === "plan") {
    const { session, response } = await requireAdminPermission("ai:run");
    if (!session) return response;

    const tenantPolicy = await loadRecoveryTenantPolicy({ schoolId: parsedBody.payload.schoolId });
    const plan = await planAdaptiveRecovery({
      ...parsedBody.payload,
      tenantPolicy,
    });
    await persistRecoveryOrchestrationEvent({
      action: "recovery_orchestration_planned",
      plan,
      actorUserId: session.userId,
      note: null,
    });

    return NextResponse.json({
      orchestration: plan,
      decision: null,
      actorUserId: session.userId,
      policy: tenantPolicy,
    });
  }

  if (parsedBody.action === "update_policy") {
    const { session, response } = await requireAdminPermission("ai:run");
    if (!session) return response;

    const policy = await persistRecoveryTenantPolicy({
      schoolId: parsedBody.payload.schoolId,
      actorUserId: session.userId,
      note: parsedBody.payload.note,
      policy: {
        teacherApprovalRoles: parsedBody.payload.teacherApprovalRoles,
        guardrails: parsedBody.payload.guardrails,
      },
    });

    return NextResponse.json({
      policy,
      schoolId: parsedBody.payload.schoolId,
      actorUserId: session.userId,
    });
  }

  if (parsedBody.action === "teacher_approve") {
    const { session, response } = await requireSession();
    if (!session) return response;

    const planFromStore = await loadRecoveryOrchestrationPlan({
      schoolId: parsedBody.payload.plan.schoolId,
      runId: parsedBody.payload.plan.runId,
    });
    const plan = planFromStore ?? parsedBody.payload.plan;

    const tenantPolicy = await loadRecoveryTenantPolicy({ schoolId: plan.schoolId });
    const teacherApprover = await resolveTeacherApprover({
      schoolId: plan.schoolId,
      sessionUserId: session.userId,
      teacherApproverUserId: parsedBody.payload.teacherApproverUserId,
      allowedRoles: tenantPolicy.teacherApprovalRoles,
    });

    if (!teacherApprover) {
      return NextResponse.json({ error: "Teacher-level approval requires an active school role permitted by the tenant policy." }, { status: 403 });
    }

    const decision = applyOrchestrationDecision(plan, {
      decision: "teacher_approve",
      actorUserId: teacherApprover.userId,
      actorSchoolTeacherId: teacherApprover.id,
      note: parsedBody.payload.note,
    });

    await persistRecoveryOrchestrationEvent({
      action: "recovery_orchestration_teacher_approved",
      plan: decision.plan,
      actorUserId: teacherApprover.userId,
      actorSchoolTeacherId: teacherApprover.id,
      note: parsedBody.payload.note,
      metadata: {
        teacherRole: teacherApprover.role,
      },
    });

    return NextResponse.json({
      orchestration: decision.plan,
      decision: {
        ...decision.result,
        actorUserId: teacherApprover.userId,
        actorSchoolTeacherId: teacherApprover.id,
        note: parsedBody.payload.note ?? null,
      },
    });
  }

  const { session, response } = await requireAdminPermission("ai:run");
  if (!session) return response;

  const planFromStore = await loadRecoveryOrchestrationPlan({
    schoolId: parsedBody.payload.plan.schoolId,
    runId: parsedBody.payload.plan.runId,
  });
  const plan = planFromStore ?? parsedBody.payload.plan;

  if (parsedBody.action === "admin_confirm") {
    const decision = applyOrchestrationDecision(plan, {
      decision: "admin_confirm",
      actorUserId: session.userId,
      note: parsedBody.payload.note,
    });

    let finalPlan = decision.plan;
    if (decision.result.changed && finalPlan.status === "approved") {
      finalPlan = await executeRecoveryOrchestrationPlan({
        plan: finalPlan,
        actorUserId: session.userId,
      });
    }

    await persistRecoveryOrchestrationEvent({
      action: "recovery_orchestration_admin_confirmed",
      plan: finalPlan,
      actorUserId: session.userId,
      note: parsedBody.payload.note,
      metadata: {
        execution: finalPlan.execution,
      },
    });

    if (finalPlan.execution.executed) {
      await persistRecoveryOrchestrationEvent({
        action: "recovery_orchestration_executed",
        plan: finalPlan,
        actorUserId: session.userId,
        note: "Execution completed.",
        metadata: {
          execution: finalPlan.execution,
        },
      });
    }

    return NextResponse.json({
      orchestration: finalPlan,
      decision: {
        ...decision.result,
        actorUserId: session.userId,
        note: parsedBody.payload.note ?? null,
      },
    });
  }

  if (parsedBody.action === "reject") {
    const decision = applyOrchestrationDecision(plan, {
      decision: "reject",
      actorUserId: session.userId,
      note: parsedBody.payload.note,
    });

    await persistRecoveryOrchestrationEvent({
      action: "recovery_orchestration_rejected",
      plan: decision.plan,
      actorUserId: session.userId,
      note: parsedBody.payload.note,
    });

    return NextResponse.json({
      orchestration: decision.plan,
      decision: {
        ...decision.result,
        actorUserId: session.userId,
        note: parsedBody.payload.note ?? null,
      },
    });
  }

  if (parsedBody.action === "retry_execution") {
    const planForRetry = await loadRecoveryOrchestrationPlan({
      schoolId: plan.schoolId,
      runId: plan.runId,
    }) ?? plan;

    if (planForRetry.status !== "approved") {
      return NextResponse.json({
        error: "Retry execution is only available for admin-confirmed runs.",
      }, { status: 400 });
    }

    const retried = await retryRecoveryOrchestrationExecution({
      plan: planForRetry,
      actorUserId: session.userId,
    });

    await persistRecoveryOrchestrationEvent({
      action: "recovery_orchestration_executed",
      plan: retried,
      actorUserId: session.userId,
      note: parsedBody.payload.note,
      metadata: {
        retry: true,
        execution: retried.execution,
      },
    });

    return NextResponse.json({
      orchestration: retried,
      decision: {
        previousStatus: planForRetry.status,
        status: retried.status,
        decision: "admin_confirm",
        changed: retried.execution.executed,
        reason: retried.execution.executed ? "Retry completed execution." : (retried.execution.lastExecutionError ?? "Retry did not complete."),
        rollbackExecuted: false,
        actorUserId: session.userId,
        note: parsedBody.payload.note ?? null,
      },
    });
  }

  const decision = applyOrchestrationDecision(plan, {
    decision: "rollback",
    actorUserId: session.userId,
    note: parsedBody.payload.note,
  });

  let rollbackPlan = decision.plan;
  if (decision.result.changed && decision.result.rollbackExecuted) {
    rollbackPlan = await rollbackRecoveryOrchestrationPlan({
      plan: rollbackPlan,
      actorUserId: session.userId,
    });
  }

  await persistRecoveryOrchestrationEvent({
    action: "recovery_orchestration_rolled_back",
    plan: rollbackPlan,
    actorUserId: session.userId,
    note: parsedBody.payload.note,
    metadata: {
      rollbackExecuted: decision.result.rollbackExecuted,
    },
  });

  return NextResponse.json({
    orchestration: rollbackPlan,
    decision: {
      ...decision.result,
      actorUserId: session.userId,
      note: parsedBody.payload.note ?? null,
    },
  });
}
