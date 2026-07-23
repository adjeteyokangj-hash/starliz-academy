import { prisma } from "@/lib/db";
import { childPinView } from "@/lib/child_pin";
import { resolveParentScope } from "@/lib/parent_scope";

export type ParentProfilesPayload = {
  parent: {
    id: string;
    name: string;
    email: string;
    label: string;
  };
  children: Array<{
    id: string;
    name: string;
    yearGroup: string | null;
    avatar: string | null;
    pinEnabled: boolean;
  }>;
};

type SessionLike = {
  userId: string;
  email: string;
  role: string;
};

export async function loadParentProfilesPayload(
  session: SessionLike,
): Promise<ParentProfilesPayload | null> {
  const parentScope = await resolveParentScope(session);
  if (!parentScope) return null;

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

  if (!parent) return null;

  return {
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
  };
}
