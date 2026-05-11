import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { createProvisioningJob, enqueueDefaultProvisioningSteps } from "@/lib/schools/provisioning";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

const createSchema = z.object({
  schoolId: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
  request: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;

  const schoolId = request.nextUrl.searchParams.get("schoolId")?.trim() ?? "";
  const status = request.nextUrl.searchParams.get("status")?.trim() ?? "";

  const jobs = await prisma.schoolProvisioningJob.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      stepRuns: {
        orderBy: [{ createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      stepRuns: job.stepRuns.map((step) => ({
        ...step,
        createdAt: step.createdAt.toISOString(),
        updatedAt: step.updatedAt.toISOString(),
        startedAt: step.startedAt?.toISOString() ?? null,
        finishedAt: step.finishedAt?.toISOString() ?? null,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const input = parsed.data;
  const idempotencyKey = input.idempotencyKey ?? `${input.schoolId}:${randomUUID()}`;

  const job = await createProvisioningJob({
    schoolId: input.schoolId,
    requestedByUserId: session.userId,
    idempotencyKey,
    priority: input.priority,
    request: input.request,
  });

  const stepCount = await prisma.schoolProvisioningStepRun.count({ where: { jobId: job.id } });
  if (stepCount === 0) {
    await enqueueDefaultProvisioningSteps(job.id);
  }

  await writeSchoolAuditLog({
    schoolId: input.schoolId,
    actorUserId: session.userId,
    action: "school_status_changed",
    entityType: "system",
    entityId: job.id,
    operation: "createProvisioningJob",
    source: "api",
    metadata: {
      jobId: job.id,
      priority: job.priority,
      idempotencyKey: job.idempotencyKey,
    },
    severity: "info",
  });

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    idempotencyKey: job.idempotencyKey,
  });
}
