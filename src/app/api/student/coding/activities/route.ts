import { NextResponse } from "next/server";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { codingActivityProgress } from "@/lib/coding/learning/workspace-store";

export async function GET(request: Request) {
  const { child, response } = await requireCodingLearner({ bookingId: new URL(request.url).searchParams.get("bookingId") });
  if (!child) return response;
  return NextResponse.json({ activities: await codingActivityProgress(child.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
