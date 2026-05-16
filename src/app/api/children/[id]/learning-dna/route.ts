import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { extractLearningDnaFromProfileJson, buildParentLearningDnaSummary } from "@/lib/learning_dna";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;
  const studentProfile = await prisma.studentProfile.findFirst({
    where: {
      childId: id,
      child: { parentId: parentScope.parentId },
    },
    select: {
      childId: true,
      aiLearningProfileJson: true,
      child: { select: { name: true } },
    },
  });

  if (!studentProfile) {
    return NextResponse.json({ learningDna: null });
  }

  const snapshot = extractLearningDnaFromProfileJson(studentProfile.aiLearningProfileJson);
  if (!snapshot) {
    return NextResponse.json({ learningDna: null });
  }

  return NextResponse.json({
    learningDna: {
      childId: studentProfile.childId,
      childName: studentProfile.child.name,
      ...buildParentLearningDnaSummary(snapshot),
    },
  });
}
