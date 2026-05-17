import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const { id } = await params;

    // Verify assignment exists
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      select: { id: true, studentId: true, contentId: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    // Delete the assignment
    await prisma.assignment.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true, message: "Assignment removed." }, { status: 200 });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json({ error: "Failed to delete assignment." }, { status: 500 });
  }
}
