import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  auditAdminAccessDenial,
  loadAdminAuthContext,
  mutateAdminWithLastSuperAdminProtection,
} from "@/lib/admin-permissions";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
});

/**
 * Platform Admin account mutations only.
 * `id` is the User.id of an admin account — not an arbitrary parent/student.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session || !context) return response;

  const { id } = await params;

  try {
    const body = updateSchema.parse(await request.json());
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        adminProfile: { select: { id: true, role: { select: { name: true } } } },
      },
    });

    if (!target || target.role !== "admin" || !target.adminProfile) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_access_denied",
        reason: "target_not_platform_admin",
        targetUserId: id,
      });
      return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
    }

    if (target.adminProfile.role?.name === "SUPER_ADMIN" && !context.isSuperAdmin && target.id !== session.userId) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_role_change_rejected",
        reason: "restricted_admin_cannot_modify_super_admin",
        targetUserId: target.id,
      });
      return NextResponse.json({ error: "Restricted Admins cannot modify Super Admins." }, { status: 403 });
    }

    // Password change on another Super Admin requires Super Admin actor.
    if (body.password && target.adminProfile.role?.name === "SUPER_ADMIN" && !context.isSuperAdmin) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_permission_denied",
        reason: "restricted_admin_cannot_reset_super_admin_password",
        targetUserId: target.id,
      });
      return NextResponse.json({ error: "Only Super Admins can reset Super Admin passwords." }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.email) data.email = body.email.toLowerCase();
    if (body.password) data.passwordHash = await hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_user_updated",
      entityType: "admin_user",
      entityId: target.adminProfile.id,
      metadata: {
        userId: id,
        fields: Object.keys(body).filter((key) => key !== "password"),
        passwordChanged: Boolean(body.password),
      },
    });

    return NextResponse.json({ admin: user });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session || !context) return response;

  const { id } = await params;
  const actor = await loadAdminAuthContext(session.userId);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (id === session.userId) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_self_escalation_rejected",
      reason: "cannot_delete_self",
      targetUserId: id,
    });
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      adminProfile: { select: { id: true, role: { select: { name: true } } } },
    },
  });

  if (!target || target.role !== "admin" || !target.adminProfile) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_access_denied",
      reason: "target_not_platform_admin",
      targetUserId: id,
    });
    return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
  }

  if (target.adminProfile.role?.name === "SUPER_ADMIN" && !context.isSuperAdmin) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_role_change_rejected",
      reason: "restricted_admin_cannot_delete_super_admin",
      targetUserId: id,
    });
    return NextResponse.json({ error: "Only Super Admins can delete Super Admins." }, { status: 403 });
  }

  const totalAdmins = await prisma.adminUser.count();
  if (totalAdmins <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the only admin. There must always be at least one admin account." },
      { status: 400 },
    );
  }

  const mutation = await mutateAdminWithLastSuperAdminProtection({
    actorUserId: session.userId,
    targetAdminUserId: target.adminProfile.id,
    nextActive: false,
    nextRoleId: null,
    mutate: async (tx) => {
      await tx.adminUser.delete({ where: { id: target.adminProfile!.id } });
      await tx.user.delete({ where: { id } });
      return true;
    },
  });
  if (!mutation.ok) {
    return NextResponse.json({ error: mutation.reason }, { status: 400 });
  }

  await writeAuditLog({
    actorUserId: session.userId,
    action: "admin_user_deleted",
    entityType: "admin_user",
    entityId: target.adminProfile.id,
    metadata: { userId: id, role: target.adminProfile.role?.name ?? null },
  });

  return NextResponse.json({ ok: true });
}
