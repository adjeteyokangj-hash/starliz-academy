/**
 * GET /api/admin/misconception-analytics?studentId=...&windowDays=30
 * GET /api/admin/misconception-analytics?studentIds=a,b&windowDays=30
 */

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  buildMisconceptionCohortSummary,
  buildMisconceptionStudentSummary,
} from "@/lib/misconception-analytics";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const params = new URL(request.url).searchParams;
  const windowDays = Math.min(365, Math.max(1, parseInt(params.get("windowDays") ?? "30", 10) || 30));
  const studentId = params.get("studentId")?.trim();
  const studentIdsRaw = params.get("studentIds")?.trim();

  if (studentId) {
    const summary = await buildMisconceptionStudentSummary({ studentId, windowDays });
    return NextResponse.json({
      ok: true,
      scope: "student",
      windowDays,
      summary,
    });
  }

  const studentIds = studentIdsRaw
    ? studentIdsRaw.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 200)
    : [];

  if (studentIds.length === 0) {
    return NextResponse.json(
      { error: "studentId or studentIds is required." },
      { status: 400 },
    );
  }

  const cohort = await buildMisconceptionCohortSummary({
    studentIds,
    windowDays,
  });

  return NextResponse.json({
    ok: true,
    scope: "cohort",
    cohort,
  });
}
