import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { runWeeklyHomeworkFridayGeneration } from "@/lib/homework-phase1f/service";

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("jobs:run");
  if (!session) return response;

  const body = await request.json().catch(() => null) as {
    dryRun?: boolean;
    studentId?: string;
    nowIso?: string;
  } | null;

  const now = typeof body?.nowIso === "string" ? new Date(body.nowIso) : new Date();
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: "Invalid nowIso." }, { status: 400 });
  }

  const summary = await runWeeklyHomeworkFridayGeneration({
    now,
    dryRun: body?.dryRun === true,
    studentId: typeof body?.studentId === "string" ? body.studentId.trim() : undefined,
  });

  return NextResponse.json({ ok: true, summary });
}
