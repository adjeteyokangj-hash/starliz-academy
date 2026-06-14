import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const { id } = await params;

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      select: { id: true, studentId: true, status: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    if (assignment.status !== "archived") {
      await prisma.assignment.update({
        where: { id },
        data: { status: "archived" },
      });

      await invalidateAcademicIntelligenceSnapshot({
        studentId: assignment.studentId,
        reason: "admin_assignment_update",
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, message: "Assignment removed." }, { status: 200 });
  } catch (error) {
    console.error("Error archiving assignment:", error);
    return NextResponse.json({ error: "Failed to remove assignment." }, { status: 500 });
  }
}
