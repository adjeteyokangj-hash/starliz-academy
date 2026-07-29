import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { DEFAULT_ROLES } from "@/lib/rbac";
import {
  auditAdminAccessDenial,
  loadAdminAuthContext,
  mutateAdminWithLastSuperAdminProtection,
} from "@/lib/admin-permissions";
import {
  toPlatformUserDto,
  toSchoolUserDto,
} from "@/lib/admin/access-scope";

const createAdminSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  roleId: z.string().min(1).optional(),
});

const updateAdminSchema = z.object({
  roleId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  title: z.string().optional(),
  isLocked: z.boolean().optional(),
  lockedReason: z.string().optional(),
});

export async function GET() {
  const { session, response } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session) return response!;

  try {
    const [admins, schoolMemberships] = await Promise.all([
      prisma.adminUser.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          role: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.schoolTeacher.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ school: { name: "asc" } }, { createdAt: "desc" }],
      }),
    ]);

    const platformUsers = admins.map((a) =>
      toPlatformUserDto({
        id: a.id,
        userId: a.userId,
        email: a.user.email,
        name: a.user.name,
        role: a.role?.name || null,
        roleId: a.roleId,
        active: a.active,
        isLocked: a.isLocked,
        title: a.title,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
      }),
    );

    const schoolUsers = schoolMemberships.map((m) =>
      toSchoolUserDto({
        membershipId: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        schoolId: m.schoolId,
        schoolName: m.school.name,
        schoolRole: m.role,
        status: m.status,
        title: m.title,
        lastActiveAt: m.lastActiveAt,
        createdAt: m.createdAt,
      }),
    );

    return NextResponse.json({
      platformUsers,
      schoolUsers,
      // Backward-compatible alias of platform users.
      admins: platformUsers,
    });
  } catch (err) {
    console.error("Error fetching admin users:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session || !context) return response!;

  try {
    const body = createAdminSchema.parse(await request.json());
    const normalizedEmail = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
    }

    const adminCount = await prisma.adminUser.count();
    const isFirstAdmin = adminCount === 0;

    let effectiveRoleId: string | undefined;
    let effectiveRoleName: string | null = null;

    if (isFirstAdmin) {
      const superAdminConfig = DEFAULT_ROLES.SUPER_ADMIN;
      const superAdminRole = await prisma.adminRole.upsert({
        where: { name: "SUPER_ADMIN" },
        update: {
          description: superAdminConfig.description,
          permissions: JSON.stringify(superAdminConfig.permissions),
          isBuiltIn: true,
        },
        create: {
          name: "SUPER_ADMIN",
          description: superAdminConfig.description,
          permissions: JSON.stringify(superAdminConfig.permissions),
          isBuiltIn: true,
        },
      });
      effectiveRoleId = superAdminRole.id;
      effectiveRoleName = superAdminRole.name;
    } else if (body.roleId) {
      const role = await prisma.adminRole.findUnique({ where: { id: body.roleId } });
      if (!role) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      if (role.name === "SUPER_ADMIN" && !context.isSuperAdmin) {
        await auditAdminAccessDenial({
          actorUserId: session.userId,
          action: "admin_role_change_rejected",
          reason: "restricted_admin_cannot_create_super_admin",
        });
        return NextResponse.json({ error: "Only Super Admins can create Super Admin accounts." }, { status: 403 });
      }
      effectiveRoleId = role.id;
      effectiveRoleName = role.name;
    } else {
      return NextResponse.json({ error: "roleId is required." }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: normalizedEmail,
        passwordHash,
        role: "admin",
      },
    });

    const created = await prisma.adminUser.create({
      data: {
        userId: user.id,
        roleId: effectiveRoleId,
        active: true,
      },
      include: {
        role: true,
        user: {
          select: { email: true, name: true },
        },
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_user_created",
      entityType: "admin_user",
      entityId: created.id,
      metadata: {
        email: user.email,
        role: effectiveRoleName,
        firstAdminBootstrap: isFirstAdmin,
      },
    });

    return NextResponse.json(
      {
        admin: {
          id: created.id,
          email: created.user.email,
          name: created.user.name,
          role: created.role?.name,
          active: created.active,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Error creating admin user:", err);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session || !context) return response!;

  try {
    const body = await req.json();
    const { adminId, ...updates } = body;

    if (!adminId || typeof adminId !== "string") {
      return NextResponse.json({ error: "adminId required" }, { status: 400 });
    }

    const validated = updateAdminSchema.parse(updates);
    const targetAdmin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!targetAdmin) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    if (validated.roleId !== undefined) {
      if (targetAdmin.userId === session.userId) {
        await auditAdminAccessDenial({
          actorUserId: session.userId,
          action: "admin_self_escalation_rejected",
          reason: "cannot_change_own_role",
          targetUserId: targetAdmin.userId,
        });
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
      }

      if (validated.roleId) {
        const nextRole = await prisma.adminRole.findUnique({ where: { id: validated.roleId } });
        if (!nextRole) {
          return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }
        if (nextRole.name === "SUPER_ADMIN" && !context.isSuperAdmin) {
          await auditAdminAccessDenial({
            actorUserId: session.userId,
            action: "admin_role_change_rejected",
            reason: "restricted_admin_cannot_assign_super_admin",
            targetUserId: targetAdmin.userId,
          });
          return NextResponse.json({ error: "Only Super Admins can assign the Super Admin role." }, { status: 403 });
        }
      }
    }

    if (targetAdmin.role?.name === "SUPER_ADMIN" && !context.isSuperAdmin && targetAdmin.userId !== session.userId) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_role_change_rejected",
        reason: "restricted_admin_cannot_modify_super_admin",
        targetUserId: targetAdmin.userId,
      });
      return NextResponse.json({ error: "Restricted Admins cannot modify Super Admins." }, { status: 403 });
    }

    const mutation = await mutateAdminWithLastSuperAdminProtection({
      actorUserId: session.userId,
      targetAdminUserId: targetAdmin.id,
      nextActive: validated.active,
      nextLocked: validated.isLocked,
      nextRoleId: validated.roleId,
      mutate: (tx) => tx.adminUser.update({
        where: { id: adminId },
        data: validated,
        include: {
          user: {
            select: { email: true, name: true },
          },
          role: true,
        },
      }),
    });
    if (!mutation.ok) {
      return NextResponse.json({ error: mutation.reason }, { status: 400 });
    }
    const updated = mutation.value;

    const action =
      validated.active === false
        ? "admin_user_disabled"
        : validated.active === true
          ? "admin_user_reactivated"
          : validated.roleId !== undefined
            ? "admin_user_role_changed"
            : "UPDATE_ADMIN_USER";

    await writeAuditLog({
      actorUserId: session.userId,
      action,
      entityType: "admin_user",
      entityId: adminId,
      metadata: {
        fields: Object.keys(validated),
        role: updated.role?.name ?? null,
        active: updated.active,
      },
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role?.name,
      active: updated.active,
      isLocked: updated.isLocked,
    });
  } catch (err) {
    console.error("Error updating admin user:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { session, response, context } = await requireAdminPermission("MANAGE_ADMINS");
  if (!session || !context) return response!;

  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("id");

    if (!targetId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const actor = await loadAdminAuthContext(session.userId);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (targetId === actor.adminUserId) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_self_escalation_rejected",
        reason: "cannot_delete_self",
      });
      return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    const totalAdmins = await prisma.adminUser.count();
    if (totalAdmins <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the only admin. There must always be at least one admin account." },
        { status: 400 },
      );
    }

    const target = await prisma.adminUser.findUnique({ where: { id: targetId }, include: { role: true } });
    if (!target) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    if (target.role?.name === "SUPER_ADMIN" && !context.isSuperAdmin) {
      await auditAdminAccessDenial({
        actorUserId: session.userId,
        action: "admin_role_change_rejected",
        reason: "restricted_admin_cannot_delete_super_admin",
        targetUserId: target.userId,
      });
      return NextResponse.json({ error: "Only Super Admins can delete Super Admins." }, { status: 403 });
    }

    const mutation = await mutateAdminWithLastSuperAdminProtection({
      actorUserId: session.userId,
      targetAdminUserId: target.id,
      nextActive: false,
      nextRoleId: null,
      mutate: (tx) => tx.adminUser.delete({ where: { id: targetId } }),
    });
    if (!mutation.ok) {
      return NextResponse.json({ error: mutation.reason }, { status: 400 });
    }

    await writeAuditLog({
      actorUserId: session.userId,
      action: "admin_user_deleted",
      entityType: "admin_user",
      entityId: targetId,
      metadata: { role: target.role?.name ?? null, userId: target.userId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting admin user:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
