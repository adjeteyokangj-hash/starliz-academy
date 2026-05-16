import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";

const statusSchema = z.object({
  status: z.enum(["assigned", "in_progress", "completed"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { id } = await params;
  try {
    const body = statusSchema.parse(await request.json());
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: { student: { select: { parentId: true } } },
    });
    if (!assignment || assignment.student.parentId !== session.userId) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: { status: body.status },
    });
    return NextResponse.json({ assignment: updated });
  } catch {
    return NextResponse.json({ error: "Invalid assignment update." }, { status: 400 });
  }
}
