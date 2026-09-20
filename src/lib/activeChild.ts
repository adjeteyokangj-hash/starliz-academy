import { prisma } from "@/lib/db";
import { readChildSelectionFromCookie } from "@/lib/auth";

type SessionLike = {
  userId: string;
  role: string;
};

export type ActiveChildResolution =
  | {
      ok: true;
      childId: string;
      parentId: string;
      source: "student_account" | "child_selection" | "parent_active";
    }
  | {
      ok: false;
      reason: "no_linked_profile" | "no_selected_child" | "unsupported_role";
    };

type ActiveChildDeps = {
  readSelectionCookie?: (userId: string) => Promise<string | null>;
  findStudentOwnedProfile?: (userId: string) => Promise<{ childId: string; parentId: string } | null>;
  findOwnedChild?: (input: {
    childId: string;
    parentId: string;
  }) => Promise<{ id: string; parentId: string } | null>;
  resolveParentActive?: (parentId: string) => Promise<string | null>;
};

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

/**
 * Resolve the ChildProfile linked to a student User account.
 * Child-selection cookies have zero authority for student sessions.
 */
export async function resolveStudentOwnedChildProfile(userId: string): Promise<{
  childId: string;
  parentId: string;
} | null> {
  const profile = await prisma.childProfile.findFirst({
    where: { userId, archived: false },
    select: { id: true, parentId: true },
  });
  if (!profile) return null;
  return { childId: profile.id, parentId: profile.parentId };
}

/**
 * Single shared active-child resolution for student pages/APIs.
 *
 * - student → ChildProfile.userId === session.userId only (never cookie override)
 * - parent → child-selection cookie (owned) then activeChildId fallback
 */
export async function resolveActiveChildForSession(
  session: SessionLike,
  deps: ActiveChildDeps = {},
): Promise<ActiveChildResolution> {
  const readSelection = deps.readSelectionCookie ?? readChildSelectionFromCookie;
  const findStudentOwned = deps.findStudentOwnedProfile ?? resolveStudentOwnedChildProfile;
  const findOwnedChild =
    deps.findOwnedChild
    ?? (async (input) => {
      const row = await prisma.childProfile.findFirst({
        where: { id: input.childId, parentId: input.parentId, archived: false },
        select: { id: true, parentId: true },
      });
      return row;
    });
  const resolveParentActive = deps.resolveParentActive ?? resolveParentActiveChildId;

  if (session.role === "student") {
    const owned = await findStudentOwned(session.userId);
    if (!owned) {
      return { ok: false, reason: "no_linked_profile" };
    }
    // Intentionally do not read or honour the child-selection cookie.
    return {
      ok: true,
      childId: owned.childId,
      parentId: owned.parentId,
      source: "student_account",
    };
  }

  if (session.role === "parent") {
    const selectedChildId = await readSelection(session.userId);
    if (selectedChildId) {
      const owned = await findOwnedChild({
        childId: selectedChildId,
        parentId: session.userId,
      });
      if (owned) {
        return {
          ok: true,
          childId: owned.id,
          parentId: owned.parentId,
          source: "child_selection",
        };
      }
    }

    const activeId = await resolveParentActive(session.userId);
    if (!activeId) {
      return { ok: false, reason: "no_selected_child" };
    }
    return {
      ok: true,
      childId: activeId,
      parentId: session.userId,
      source: "parent_active",
    };
  }

  return { ok: false, reason: "unsupported_role" };
}
