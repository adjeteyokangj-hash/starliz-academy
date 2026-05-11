import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { runDailyJobs } from "@/lib/jobs";

export async function GET() {
  const { session, response } = await requireAdminPermission("jobs:view");
  if (!session) return response;

  const logs = await prisma.jobRunLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 40,
  });

  return NextResponse.json({
    logs: logs.map((log) => ({
      ...log,
      startedAt: log.startedAt.toISOString(),
      finishedAt: log.finishedAt?.toISOString() ?? null,
      metadata: log.metadataJson ? JSON.parse(log.metadataJson) : null,
      metadataJson: undefined,
    })),
  });
}

export async function POST() {
  const { session, response } = await requireAdminPermission("jobs:run");
  if (!session) return response;

  const result = await runDailyJobs();
  return NextResponse.json(result);
}
