import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { seedDefaultRoles } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import {
  auditAdminAccessDenial,
  validateRolePermissionList,
} from "@/lib/admin-permissions";

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_ROLES");
  if (!session) return response!;

  try {
    const count = await prisma.adminRole.count();
    if (count === 0) {
      await seedDefaultRoles();
    }

    const roles = await prisma.adminRole.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
      },
    });

    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: JSON.parse(r.permissions),
        isBuiltIn: r.isBuiltIn,
        userCount: r._count.users,
      })),
    });
  } catch (err) {
    console.error("Error fetching roles:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Restrict role mutation to existing roles; built-in permission sets are validated server-side. */
export async function PATCH(request: Request) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ROLES");
  if (!session || !context) return response!;

  if (!context.isSuperAdmin) {
    await auditAdminAccessDenial({
      actorUserId: session.userId,
      action: "admin_role_change_rejected",
      reason: "only_super_admin_can_mutate_roles",
    });
    return NextResponse.json({ error: "Only Super Admins can modify platform Admin roles." }, { status: 403 });
  }

  try {
    const body = updateRoleSchema.parse(await request.json());
    const role = await prisma.adminRole.findUnique({ where: { id: body.roleId } });
    if (!role) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    if (role.isBuiltIn && role.name === "SUPER_ADMIN" && body.permissions) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_role_change_rejected",
        reason: "cannot_mutate_super_admin_permissions",
        metadata: { roleId: role.id },
      });
      return NextResponse.json({ error: "The Super Admin permission set cannot be modified." }, { status: 400 });
    }

    const data: { description?: string; permissions?: string } = {};
    if (body.description !== undefined) data.description = body.description;
    if (body.permissions) {
      const validated = validateRolePermissionList(body.permissions);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      data.permissions = JSON.stringify(validated.permissions);
    }

    const updated = await prisma.adminRole.update({
      where: { id: role.id },
      data,
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_user_role_changed",
      entityType: "admin_role",
      entityId: updated.id,
      metadata: {
        roleName: updated.name,
        fields: Object.keys(data),
      },
    });

    return NextResponse.json({
      role: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        permissions: JSON.parse(updated.permissions),
        isBuiltIn: updated.isBuiltIn,
      },
    });
  } catch (err) {
    console.error("Error updating role:", err);
    return NextResponse.json({ error: "Invalid role update." }, { status: 400 });
  }
}
