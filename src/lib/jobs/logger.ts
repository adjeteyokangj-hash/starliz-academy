import { prisma } from "@/lib/db";

export async function startJobLog(jobName: string) {
  return prisma.jobRunLog.create({
    data: { jobName, status: "running" },
  });
}

export async function finishJobLog(id: string, metadata?: Record<string, unknown>) {
  return prisma.jobRunLog.update({
    where: { id },
    data: {
      status: "success",
      finishedAt: new Date(),
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

export async function failJobLog(id: string, error: unknown, metadata?: Record<string, unknown>) {
  return prisma.jobRunLog.update({
    where: { id },
    data: {
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}
