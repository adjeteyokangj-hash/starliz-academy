/**
 * GET /api/parent/progress-report?childId=...&range=30d
 * Privacy-safe parent progress pack (attendance + focus topics, no private notes).
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { buildParentProgressPack } from "@/lib/progress-reporting";
import type { ParentReportRange } from "@/lib/reports/parent-progress-report";

const RANGE_TO_DAYS: Record<Exclude<ParentReportRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function asRange(value: string | null): ParentReportRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") return value;
  return "30d";
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const childId = url.searchParams.get("childId")?.trim();
  const range = asRange(url.searchParams.get("range"));
  if (!childId) {
    return NextResponse.json({ error: "childId is required." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId: parentScope.parentId, archived: false },
    select: { id: true },
  });
  if (!child) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const windowDays = range === "all" ? 90 : RANGE_TO_DAYS[range];
  const pack = await buildParentProgressPack({ childId: child.id, windowDays });

  return NextResponse.json({ ok: true, range, pack });
}
