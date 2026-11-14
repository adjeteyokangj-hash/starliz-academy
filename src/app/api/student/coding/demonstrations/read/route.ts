import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api_guard";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { readActivityBody } from "@/lib/coding/learning/request";
import { demonstrationReadSchema, privateDemonstrationResponse } from "@/lib/coding/learning/demonstration-response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const body = demonstrationReadSchema.parse(await readActivityBody(request));
    if (body.studentId !== undefined) return NextResponse.json({ error: "Use your own learner account." }, { status: 400, headers });
    const { child, response } = await requireCodingLearner({ bookingId: body.bookingId }); if (!child) return response;
    if (!checkRateLimit({ key: `coding-demo-read:${child.id}`, limit: 30, windowMs: 60000 }).allowed) return NextResponse.json({ error: "Pause before opening another clip." }, { status: 429, headers });
    return await privateDemonstrationResponse(child.id, body);
  } catch { return NextResponse.json({ error: "This private recording is not available to your account." }, { status: 404, headers }); }
}
