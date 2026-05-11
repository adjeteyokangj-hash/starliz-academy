import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { prisma } from "@/lib/db";
import { generateTargetedItems } from "@/lib/autoLesson";

const requestSchema = z.object({
  studentId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const activeUser = await prisma.user.findUnique({
    where: { id: parentScope.parentId },
    select: { activeChildId: true },
  });
  const studentId = parsed.data.studentId ?? activeUser?.activeChildId;
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: { id: true, level: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const skills = await prisma.studentSkill.findMany({ where: { studentId } });
  const weakSkills = skills
    .filter((s) => s.status === "weak")
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2)
    .map((s) => s.skill);

  const ai = await generateTargetedItems({
    weakSkills: weakSkills.length ? weakSkills : ["cvc"],
    count: 5,
    difficulty: Math.max(1, Math.min(5, student.level)),
  });

  return NextResponse.json({ ai, weakSkills });
}
