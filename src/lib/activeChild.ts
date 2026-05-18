import { prisma } from "@/lib/db";

/**
 * Resolves a parent's active child id and repairs stale pointers by falling back
 * to the most recently updated non-archived child.
 */
export async function resolveParentActiveChildId(parentId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: parentId },
    select: { activeChildId: true },
  });

  const currentId = user?.activeChildId ?? null;
  if (currentId) {
    const activeChild = await prisma.childProfile.findFirst({
      where: { id: currentId, parentId, archived: false },
      select: { id: true },
    });
    if (activeChild) return activeChild.id;
  }

  const fallbackChild = await prisma.childProfile.findFirst({
    where: { parentId, archived: false },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  const fallbackId = fallbackChild?.id ?? null;
  if (fallbackId !== currentId) {
    await prisma.user.update({
      where: { id: parentId },
      data: { activeChildId: fallbackId },
    });
  }

  return fallbackId;
}