import { prisma } from "@/lib/db";
import { assignContentToStudent } from "@/lib/assignments";
import { parseWeakAreaMetadata, stringifyWeakAreaMetadata } from "@/lib/weakAreas";
import { classifyRecoveryFailure, type RecoveryOrchestrationPlan } from "@/lib/recovery_orchestrator";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

function normalizeContentType(subject: string | null | undefined): string {
  const value = String(subject ?? "").trim().toLowerCase();
  if (value.includes("math")) return "math";
  if (value.includes("read") || value.includes("english")) return "reading";
  if (value.includes("science")) return "lesson";
  return "lesson";
}

function revisionCheckpoints(now = new Date()): { first: string; second: string } {
  const first = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 2);
  const second = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
  return {
    first: first.toISOString(),
    second: second.toISOString(),
  };
}

function appendUniqueWarning(warnings: string[], warning: string): string[] {
  if (warnings.includes(warning)) return warnings;
  return [...warnings, warning];
}

function withExecutionError(plan: RecoveryOrchestrationPlan, message: string): RecoveryOrchestrationPlan {
  const classified = classifyRecoveryFailure(message);
  return {
    ...plan,
    warnings: appendUniqueWarning(plan.warnings, message),
    execution: {
      ...plan.execution,
      executed: false,
      lastExecutionError: message,
      partialExecution: false,
      progressPercent: 0,
      failureClassification: classified,
    },
  };
}

function isExecutionComplete(plan: RecoveryOrchestrationPlan): boolean {
  const effects = plan.execution.executionEffects;
  return Boolean(effects.createdContentId && effects.assignmentId && effects.weakAreaId && effects.revisionScheduled);
}

async function executeOrRetry(plan: RecoveryOrchestrationPlan, actorUserId: string): Promise<RecoveryOrchestrationPlan> {
  if (plan.status !== "approved") return plan;
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const attempt = (plan.execution.attempts ?? 0) + 1;

  if (!plan.studentId) {
    const erroredPlan = withExecutionError(plan, "Execution skipped because no student is attached to this recovery plan.");
    return {
      ...erroredPlan,
      execution: {
        ...erroredPlan.execution,
        startedAtIso,
        attempts: attempt,
        durationMs: Date.now() - startedAt.getTime(),
      },
    };
  }

  const student = await prisma.childProfile.findUnique({
    where: { id: plan.studentId },
    select: {
      id: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
        },
      },
    },
  });

  if (!student) {
    const erroredPlan = withExecutionError(plan, "Execution skipped because the referenced student no longer exists.");
    return {
      ...erroredPlan,
      execution: {
        ...erroredPlan.execution,
        startedAtIso,
        attempts: attempt,
        durationMs: Date.now() - startedAt.getTime(),
      },
    };
  }

  const subject = "maths";
  const skillFocus = plan.targetConcept;
  const checkpoints = revisionCheckpoints();
  const effects = {
    ...plan.execution.executionEffects,
  };

  const computeProgressPercent = () => {
    const score = [
      effects.createdContentId ? 1 : 0,
      effects.assignmentId ? 1 : 0,
      effects.weakAreaId ? 1 : 0,
      effects.revisionScheduled ? 1 : 0,
    ].reduce((sum, part) => sum + part, 0);
    return Math.round((score / 4) * 100);
  };

  try {
    let contentId = effects.createdContentId;
    if (!contentId) {
      const content = await prisma.aIContentCache.create({
        data: {
          contentType: normalizeContentType(subject),
          level: plan.estimatedComplexity === "high" ? 3 : plan.estimatedComplexity === "medium" ? 2 : 1,
          topic: `Recovery: ${plan.targetConcept}`,
          contentJson: JSON.stringify([
            {
              type: "recovery_chain",
              prompt: `Practice ${plan.targetConcept} using prerequisite checkpoints.`,
              recoveryPath: plan.recoveryPath,
              guidance: plan.explainability.summary,
            },
          ]),
          status: "reviewed",
          createdBy: actorUserId,
          keyStage: student.studentProfile?.keyStageLevel ?? null,
          yearGroup: student.yearGroup ?? null,
          skillFocus,
          metadataJson: JSON.stringify({
            schoolId: plan.schoolId,
            subject,
            targetConcept: plan.targetConcept,
            runId: plan.runId,
            yearGroup: student.yearGroup ?? null,
            keyStage: student.studentProfile?.keyStageLevel ?? null,
          }),
        },
        select: { id: true },
      });
      contentId = content.id;
      effects.createdContentId = content.id;
    }

    if (!effects.assignmentId && contentId) {
      const assignment = await assignContentToStudent({
        studentId: student.id,
        contentId,
        actorUserId,
        reason: `Adaptive recovery orchestration ${plan.runId}`,
        forceResend: true,
      });
      effects.assignmentId = assignment.id;
    }

    if (!effects.weakAreaId) {
      const previousWeakArea = await prisma.weakArea.findUnique({
        where: {
          studentId_subject_skillFocus: {
            studentId: student.id,
            subject,
            skillFocus,
          },
        },
        select: {
          id: true,
          metadataJson: true,
          currentDifficulty: true,
        },
      });

      const previousMetadata = parseWeakAreaMetadata(previousWeakArea?.metadataJson);
      const nextMetadata = stringifyWeakAreaMetadata({
        ...previousMetadata,
        weakSkills: [...new Set([...(previousMetadata.weakSkills ?? []), skillFocus])],
        intervention: {
          ...(previousMetadata.intervention ?? {}),
          weakSkillDetectedAt: previousMetadata.intervention?.weakSkillDetectedAt ?? plan.createdAtIso,
          weakSkillCode: skillFocus,
          launchedAt: new Date().toISOString(),
          mode: "adaptive_recovery_orchestrator",
        },
        orchestration: {
          runId: plan.runId,
          recoveryPath: plan.recoveryPath,
          revisionCheckpoints: checkpoints,
        },
      });

      const weakArea = await prisma.weakArea.upsert({
        where: {
          studentId_subject_skillFocus: {
            studentId: student.id,
            subject,
            skillFocus,
          },
        },
        create: {
          studentId: student.id,
          subject,
          keyStage: student.studentProfile?.keyStageLevel ?? null,
          yearGroup: student.yearGroup ?? null,
          skillFocus,
          weaknessType: "knowledge_gap",
          accuracy: Math.max(20, Math.round(100 - plan.estimatedInterventionMinutes * 2)),
          attemptsCount: 1,
          currentDifficulty: 1,
          status: "active",
          metadataJson: nextMetadata,
        },
        update: {
          currentDifficulty: Math.max(1, (previousWeakArea?.currentDifficulty ?? 2) - 1),
          metadataJson: nextMetadata,
          lastDetectedAt: new Date(),
          status: "active",
        },
        select: { id: true },
      });

      effects.weakAreaId = weakArea.id;
      effects.previousWeakAreaDifficulty = previousWeakArea?.currentDifficulty ?? null;
      effects.previousWeakAreaMetadataJson = previousWeakArea?.metadataJson ?? null;
      effects.revisionScheduled = true;
    }

    if (effects.assignmentId) {
      await writeSchoolAuditLog({
        schoolId: plan.schoolId,
        actorUserId,
        action: "assignment_issued",
        entityType: "assignment",
        entityId: effects.assignmentId,
        source: "api",
        operation: "recovery_orchestrator_executor",
        correlationId: plan.runId,
        metadata: {
          runId: plan.runId,
          contentId: effects.createdContentId,
          studentId: student.id,
          targetConcept: plan.targetConcept,
          revisionCheckpoints: checkpoints,
          retry: plan.execution.executedAtIso !== null,
        },
      });
    }

    return {
      ...plan,
      execution: {
        executed: isExecutionComplete({ ...plan, execution: { ...plan.execution, executionEffects: effects } }),
        executedAtIso: new Date().toISOString(),
        startedAtIso,
        attempts: attempt,
        durationMs: Date.now() - startedAt.getTime(),
        progressPercent: computeProgressPercent(),
        partialExecution: !isExecutionComplete({ ...plan, execution: { ...plan.execution, executionEffects: effects } }) && computeProgressPercent() > 0,
        lastExecutionError: null,
        failureClassification: null,
        executionEffects: effects,
      },
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Execution failed during orchestrator runtime.";
    const classification = classifyRecoveryFailure(message);
    return {
      ...plan,
      warnings: appendUniqueWarning(plan.warnings, `Execution issue: ${message}`),
      execution: {
        ...plan.execution,
        executed: false,
        startedAtIso,
        attempts: attempt,
        durationMs: Date.now() - startedAt.getTime(),
        progressPercent: computeProgressPercent(),
        partialExecution: computeProgressPercent() > 0,
        lastExecutionError: message,
        failureClassification: classification,
        executionEffects: effects,
      },
    };
  }
}

export async function executeRecoveryOrchestrationPlan(input: {
  plan: RecoveryOrchestrationPlan;
  actorUserId: string;
}): Promise<RecoveryOrchestrationPlan> {
  return executeOrRetry(input.plan, input.actorUserId);
}

export async function retryRecoveryOrchestrationExecution(input: {
  plan: RecoveryOrchestrationPlan;
  actorUserId: string;
}): Promise<RecoveryOrchestrationPlan> {
  return executeOrRetry(input.plan, input.actorUserId);
}

export async function rollbackRecoveryOrchestrationPlan(input: {
  plan: RecoveryOrchestrationPlan;
  actorUserId: string;
}): Promise<RecoveryOrchestrationPlan> {
  const effects = input.plan.execution.executionEffects;

  if (effects.assignmentId) {
    await prisma.assignment.updateMany({
      where: { id: effects.assignmentId },
      data: { status: "archived", updatedAt: new Date() },
    });
  }

  if (effects.createdContentId) {
    await prisma.aIContentCache.updateMany({
      where: { id: effects.createdContentId },
      data: { status: "draft" },
    });
  }

  if (effects.weakAreaId) {
    await prisma.weakArea.updateMany({
      where: { id: effects.weakAreaId },
      data: {
        currentDifficulty: effects.previousWeakAreaDifficulty ?? 1,
        metadataJson: effects.previousWeakAreaMetadataJson,
      },
    });
  }

  await writeSchoolAuditLog({
    schoolId: input.plan.schoolId,
    actorUserId: input.actorUserId,
    action: "recovery_orchestration_rolled_back",
    entityType: "system",
    entityId: input.plan.runId,
    source: "api",
    operation: "recovery_orchestrator_executor",
    correlationId: input.plan.runId,
    metadata: {
      runId: input.plan.runId,
      rollbackEffects: effects,
    },
    severity: "warning",
  });

  return {
    ...input.plan,
    execution: {
      ...input.plan.execution,
      executed: false,
      lastExecutionError: null,
      failureClassification: null,
      partialExecution: false,
      progressPercent: 0,
    },
  };
}