import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

type Context = { params: Promise<{ id: string }> };

type ResetDeps = {
  findParent: (parentId: string) => Promise<{ id: string; email: string } | null>;
  clearParentPin: (parentId: string) => Promise<void>;
  writeAudit: (payload: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
};

export async function handleAdminResetParentPin(input: {
  adminUserId: string;
  adminEmail: string;
  parentId: string;
  deps?: ResetDeps;
}): Promise<NextResponse> {
  const deps = input.deps ?? {
    findParent: async (parentId: string) => prisma.user.findFirst({
      where: { id: parentId, role: "parent" },
      select: { id: true, email: true },
    }),
    clearParentPin: async (parentId: string) => {
      await prisma.user.update({
        where: { id: parentId },
        data: {
          pinHash: null,
          parentPinFailedAttempts: 0,
          parentPinLockedUntil: null,
          parentPinUpdatedAt: new Date(),
        },
      });
    },
    writeAudit: async (payload) => writeAuditLog(payload),
  };

  const parent = await deps.findParent(input.parentId);

  if (!parent) {
    return NextResponse.json({ error: "Parent account not found" }, { status: 404 });
  }

  await deps.clearParentPin(parent.id);

  await deps.writeAudit({
    actorUserId: input.adminUserId,
    action: "parent_pin_reset",
    entityType: "User",
    entityId: parent.id,
    metadata: {
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      parentUserId: parent.id,
      parentEmail: parent.email,
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Parent PIN has been reset. The parent must create a new PIN.",
  });
}

export async function POST(_request: Request, context: Context) {
  const { session, response } = await requireAdminPermission("parents:write");
  if (!session) return response;

  try {
    const { id } = await context.params;
    return handleAdminResetParentPin({
      adminUserId: session.userId,
      adminEmail: session.email,
      parentId: id,
    });
  } catch {
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}

export async function handleAdminResetParentPinPost(input: {
  session: { userId: string; email: string } | null;
  parentId: string;
  deps: ResetDeps;
}): Promise<NextResponse> {
  if (!input.session) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  return handleAdminResetParentPin({
    adminUserId: input.session.userId,
    adminEmail: input.session.email,
    parentId: input.parentId,
    deps: input.deps,
  });
}
