import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { getAdminShortLearningOversight } from "@/lib/schools/admin-short-learning-oversight";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId")?.trim() || undefined;

  if (schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }
  }

  const oversight = await getAdminShortLearningOversight({ schoolId });
  if (!oversight) {
    return NextResponse.json({ error: "Unable to load Short Learning oversight." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, oversight });
}
