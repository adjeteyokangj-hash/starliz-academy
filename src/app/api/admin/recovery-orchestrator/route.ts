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
  listRecoveryOrchestrationHistory,
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
  includePolicy: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(10).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

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
  const history = await listRecoveryOrchestrationHistory(query);

  const policy = query.includePolicy && query.schoolId
    ? await loadRecoveryTenantPolicy({ schoolId: query.schoolId })
    : null;

  return NextResponse.json({
    items: history.items,
    total: history.total,
    query,
    policy,
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
