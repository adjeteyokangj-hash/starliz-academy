import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { childPinView } from "@/lib/child_pin";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const [parent, children] = await Promise.all([
    prisma.user.findUnique({
      where: { id: parentScope.parentId },
      select: { id: true, name: true, email: true },
    }),
    prisma.childProfile.findMany({
      where: { parentId: parentScope.parentId, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, yearGroup: true, avatar: true, coachingMemoryJson: true },
    }),
  ]);

  if (!parent) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  return NextResponse.json({
    parent: {
      id: parent.id,
      name: parent.name ?? "Parent",
      email: parent.email,
      label: "Parent",
    },
    children: children.map((child) => ({
      ...childPinView(child),
      avatar: child.avatar,
    })),
  });
}
