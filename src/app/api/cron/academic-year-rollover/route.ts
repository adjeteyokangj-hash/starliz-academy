/**
 * Academic-year rollover cron
 *
 * POST /api/cron/academic-year-rollover
 *
 * Applies school academic-year promotion for configs that are:
 *  - status = ready
 *  - promotionDate <= today (UTC date)
 *
 * Schools left in `waiting` are never auto-applied (manual delay).
 * Protected by CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { applyDueAcademicYearRollovers } from "@/lib/schools/academic-year-rollover";

function hasCronAccess(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-cron-secret") === secret
  );
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await applyDueAcademicYearRollovers();
  return NextResponse.json({ ok: true, ...result });
}
