import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, requireAdmin } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { extractLearningDnaFromProfileJson, buildParentLearningDnaSummary } from "@/lib/learning_dna";
import { writeAuditLog } from "@/lib/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Try admin auth first
  const adminCheck = await requireAdmin();
  if (adminCheck.session) {
    // Admin access granted
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { childId: id },
      select: {
        childId: true,
        aiLearningProfileJson: true,
        child: { select: { name: true, parentId: true } },
      },
    });

    if (!studentProfile) {
      await writeAuditLog({
        actorUserId: adminCheck.session.userId,
        action: "learning_dna_access_denied",
        entityType: "child",
        entityId: id,
        metadata: { reason: "not_found", source: "admin" },
      });
      return NextResponse.json({ error: "Child profile not found." }, { status: 404 });
    }

    await writeAuditLog({
      actorUserId: adminCheck.session.userId,
      action: "learning_dna_access",
      entityType: "child",
      entityId: id,
      metadata: { source: "admin" },
    });

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

  // Try parent auth
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "learning_dna_access_denied",
      entityType: "child",
      entityId: id,
      metadata: { reason: "not_parent", source: "session" },
    });
    return NextResponse.json(
      { error: "Forbidden: You do not have access to this child's Learning DNA." },
      { status: 403 }
    );
  }

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
    await writeAuditLog({
      actorUserId: session.userId,
      action: "learning_dna_access_denied",
      entityType: "child",
      entityId: id,
      metadata: { reason: "child_not_owned_by_parent", source: "parent", parentId: parentScope.parentId },
    });
    return NextResponse.json(
      { error: "Forbidden: This child is not associated with your account." },
      { status: 403 }
    );
  }

  await writeAuditLog({
    actorUserId: session.userId,
    action: "learning_dna_access",
    entityType: "child",
    entityId: id,
    metadata: { source: "parent", parentId: parentScope.parentId },
  });

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
