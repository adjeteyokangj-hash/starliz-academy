import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { isWeeklyHomeworkPhase1BEnabled } from "@/lib/homework-phase1b/config";
import { getHomeworkStatusSummaryForStudent } from "@/lib/homework-phase1b/service";

export async function GET(request: Request) {
  const { session, response } = await requireAdminPermission("reports:view");
  if (!session) return response;

  const featureEnabled = isWeeklyHomeworkPhase1BEnabled();
  if (!featureEnabled) {
    return NextResponse.json({ featureEnabled, students: [] });
  }

  const params = new URL(request.url).searchParams;
  const studentId = params.get("studentId")?.trim();

  const students = await prisma.childProfile.findMany({
    where: {
      archived: false,
      ...(studentId ? { id: studentId } : {}),
    },
    select: {
      id: true,
      name: true,
      parentId: true,
    },
    orderBy: { createdAt: "desc" },
    take: studentId ? 1 : 200,
  });

  const summaries = await Promise.all(
    students.map(async (student) => ({
      studentId: student.id,
      studentName: student.name,
      parentId: student.parentId,
      homework: await getHomeworkStatusSummaryForStudent(student.id),
    })),
  );

  return NextResponse.json({
    featureEnabled,
    students: summaries,
  });
}
