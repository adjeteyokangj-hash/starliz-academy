import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { getStudentSkillProfile } from "@/lib/skillEngine";
import { SKILL_MAP } from "@/lib/skills";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { studentId } = await params;
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Verify this student belongs to this parent
  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId },
    select: { id: true },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const skills = await getStudentSkillProfile(studentId);

  // Group by status
  const grouped = {
    weak: skills.filter((s) => s.status === "weak"),
    improving: skills.filter((s) => s.status === "improving"),
    mastered: skills.filter((s) => s.status === "mastered"),
  };

  return NextResponse.json({ skills, grouped, skillMap: SKILL_MAP });
}
