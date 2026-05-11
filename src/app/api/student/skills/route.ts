import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { activeChildId: true },
  });
  const studentId = activeUser?.activeChildId;
  if (!studentId) {
    return NextResponse.json({ skills: [] });
  }

  const skills = await prisma.studentSkill.findMany({
    where: { studentId },
    orderBy: { accuracy: "asc" },
  });

  return NextResponse.json(skills);
}
