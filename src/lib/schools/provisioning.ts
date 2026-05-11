import { prisma } from "@/lib/db";

export type ProvisioningStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "retry_scheduled"
  | "cancelled"
  | "timed_out";

const DEFAULT_STEP_KEYS = [
  "workspace",
  "governance",
  "roles",
  "invites",
  "audit",
] as const;

type CreateProvisioningJobInput = {
  schoolId: string;
  requestedByUserId?: string;
  idempotencyKey: string;
  priority?: "low" | "normal" | "high" | "critical";
  request?: Record<string, unknown>;
};

export async function createProvisioningJob(input: CreateProvisioningJobInput) {
  return prisma.schoolProvisioningJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {
      requestJson: input.request ? JSON.stringify(input.request) : undefined,
      priority: input.priority ?? "normal",
      status: "queued",
      errorJson: null,
      nextRetryAt: null,
    },
    create: {
      schoolId: input.schoolId,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
      priority: input.priority ?? "normal",
      requestJson: input.request ? JSON.stringify(input.request) : undefined,
      status: "queued",
    },
  });
}

export async function enqueueDefaultProvisioningSteps(jobId: string) {
  await prisma.$transaction(
    DEFAULT_STEP_KEYS.map((stepKey, index) =>
      prisma.schoolProvisioningStepRun.create({
        data: {
          jobId,
          stepKey,
          status: index === 0 ? "pending" : "pending",
          attempt: 1,
        },
      }),
    ),
  );
}

export async function getProvisioningJob(jobId: string) {
  return prisma.schoolProvisioningJob.findUnique({
    where: { id: jobId },
    include: {
      stepRuns: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });
}

function shouldRetry(status: ProvisioningStatus, attemptCount: number, maxAttempts: number): boolean {
  if (status !== "failed") return false;
  return attemptCount < maxAttempts;
}

export async function processQueuedProvisioningJobs(limit = 5): Promise<number> {
  const candidates = await prisma.schoolProvisioningJob.findMany({
    where: {
      OR: [
        { status: "queued" },
        {
          status: "retry_scheduled",
          nextRetryAt: { lte: new Date() },
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 20)),
    include: {
      stepRuns: { orderBy: [{ createdAt: "asc" }] },
    },
  });

  let processed = 0;

  for (const job of candidates) {
    processed += 1;

    if (job.stepRuns.length === 0) {
      await enqueueDefaultProvisioningSteps(job.id);
    }

    await prisma.schoolProvisioningJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        startedAt: job.startedAt ?? new Date(),
        attemptCount: job.attemptCount + 1,
      },
    });

    const steps = await prisma.schoolProvisioningStepRun.findMany({
      where: { jobId: job.id },
      orderBy: [{ createdAt: "asc" }],
    });

    let failed = false;

    for (const step of steps) {
      if (step.status === "completed") continue;

      const stepStartedAt = new Date();
      await prisma.schoolProvisioningStepRun.update({
        where: { id: step.id },
        data: {
          status: "running",
          startedAt: stepStartedAt,
        },
      });

      try {
        await prisma.schoolProvisioningStepRun.update({
          where: { id: step.id },
          data: {
            status: "completed",
            finishedAt: new Date(),
            durationMs: Math.max(0, Date.now() - stepStartedAt.getTime()),
            outputJson: JSON.stringify({ ok: true, stepKey: step.stepKey }),
          },
        });
      } catch (error) {
        failed = true;
        await prisma.schoolProvisioningStepRun.update({
          where: { id: step.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            durationMs: Math.max(0, Date.now() - stepStartedAt.getTime()),
            errorJson: JSON.stringify({
              message: error instanceof Error ? error.message : String(error),
            }),
          },
        });
        break;
      }
    }

    const latest = await prisma.schoolProvisioningJob.findUnique({ where: { id: job.id } });
    if (!latest) continue;

    if (!failed) {
      await prisma.schoolProvisioningJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          errorJson: null,
          resultJson: JSON.stringify({
            completedSteps: steps.length,
          }),
        },
      });
      continue;
    }

    if (shouldRetry("failed", latest.attemptCount, latest.maxAttempts)) {
      const delayMinutes = Math.min(60, 2 ** latest.attemptCount);
      const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      await prisma.schoolProvisioningJob.update({
        where: { id: job.id },
        data: {
          status: "retry_scheduled",
          nextRetryAt: retryAt,
          finishedAt: new Date(),
        },
      });
    } else {
      await prisma.schoolProvisioningJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
        },
      });
    }
  }

  return processed;
}
