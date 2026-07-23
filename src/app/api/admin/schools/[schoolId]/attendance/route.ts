import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { getAdminDayAttendanceSummary } from "@/lib/schools/attendance-register";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const sessionDate = new URL(request.url).searchParams.get("sessionDate");
  const summary = await getAdminDayAttendanceSummary({ schoolId, sessionDate });
  return NextResponse.json({ ok: true, summary });
}
