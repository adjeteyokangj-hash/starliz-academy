import { NextResponse } from "next/server";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { readinessOverview } from "@/lib/coding/learning/readiness";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") }); if (!child) return response;
  return NextResponse.json(await readinessOverview(child.id), { headers: { "Cache-Control": "private, no-store" } });
}
