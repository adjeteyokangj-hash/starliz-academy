import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { getProvisioningJob } from "@/lib/schools/provisioning";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

const actionSchema = z.object({
  action: z.enum(["retry", "cancel"]),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;

  const { jobId } = await params;
  const job = await getProvisioningJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
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
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { session, response } = await requireAdminPermission("MANAGE_SETTINGS");
  if (!session) return response;

  const { jobId } = await params;
  const job = await prisma.schoolProvisioningJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { action } = parsed.data;

  if (action === "retry") {
    await prisma.schoolProvisioningJob.update({
      where: { id: jobId },
      data: {
        status: "retry_scheduled",
        nextRetryAt: new Date(),
        errorJson: null,
      },
    });
    await writeSchoolAuditLog({
      schoolId: job.schoolId,
      actorUserId: session.userId,
      action: "school_status_changed",
      entityType: "provisioning_job",
      entityId: job.id,
      source: "api",
      operation: "retry",
      metadata: { jobId: job.id, previousStatus: job.status },
      severity: "warning",
    });
    return NextResponse.json({ ok: true, action: "retry" });
  }

  if (action === "cancel") {
    await prisma.schoolProvisioningJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
      },
    });
    await writeSchoolAuditLog({
      schoolId: job.schoolId,
      actorUserId: session.userId,
      action: "school_status_changed",
      entityType: "provisioning_job",
      entityId: job.id,
      source: "api",
      operation: "cancel",
      metadata: { jobId: job.id, previousStatus: job.status },
      severity: "warning",
    });
    return NextResponse.json({ ok: true, action: "cancel" });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
