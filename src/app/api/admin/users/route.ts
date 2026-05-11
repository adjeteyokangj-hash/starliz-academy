import { NextRequest, NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const createAdminSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  roleId: z.string().optional(),
});

const updateAdminSchema = z.object({
  roleId: z.string().optional(),
  active: z.boolean().optional(),
  title: z.string().optional(),
  isLocked: z.boolean().optional(),
  lockedReason: z.string().optional(),
});

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Bypass permission check for admins with no role (seed/original admin)
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'MANAGE_ADMINS' as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const admins = await prisma.adminUser.findMany({
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
    });

    return NextResponse.json({
      admins: admins.map(a => ({
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
      })),
    });
  } catch (err) {
    console.error("Error fetching admin users:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Bypass permission check for admins with no role (seed/original admin)
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'MANAGE_ADMINS' as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = createAdminSchema.parse(await request.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
    }

    // Verify role exists if provided
    const role = body.roleId ? await prisma.adminRole.findUnique({ where: { id: body.roleId } }) : null;
    if (body.roleId && !role) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        role: "admin",
      },
    });

    const adminProfile = await prisma.adminUser.create({
      data: {
        userId: user.id,
        ...(body.roleId ? { roleId: body.roleId } : {}),
        active: true,
      },
      include: {
        role: true,
        user: {
          select: { email: true, name: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "CREATE_ADMIN_USER",
        entityType: "admin_user",
        entityId: adminProfile.id,
        metadataJson: JSON.stringify({ email: user.email, role: role?.name ?? null }),
      },
    });

    return NextResponse.json({
      admin: {
        id: adminProfile.id,
        email: adminProfile.user.email,
        name: adminProfile.user.name,
        role: adminProfile.role?.name,
        active: adminProfile.active,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("Error creating admin user:", err);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Bypass permission check for admins with no role (seed/original admin)
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'MANAGE_ADMINS' as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { adminId, ...updates } = body;

    if (!adminId) {
      return NextResponse.json(
        { error: "adminId required" },
        { status: 400 }
      );
    }

    const validated = updateAdminSchema.parse(updates);

    // Prevent self-deletion of Super Admin if it's the last one
    const targetAdmin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { role: true },
    });

    if (!targetAdmin) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    // If deactivating and target is the only Super Admin, deny
    if (
      validated.active === false &&
      targetAdmin.role?.name === "SUPER_ADMIN"
    ) {
      const activeSuperAdmins = await prisma.adminUser.count({
        where: { roleId: targetAdmin.roleId, active: true, isLocked: false },
      });

      if (activeSuperAdmins <= 1) {
        return NextResponse.json(
          { error: "Cannot deactivate the last Super Admin" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.adminUser.update({
      where: { id: adminId },
      data: validated,
      include: {
        user: {
          select: { email: true, name: true },
        },
        role: true,
      },
    });

    // Log to audit
    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "UPDATE_ADMIN_USER",
        entityType: "admin_user",
        entityId: adminId,
        metadataJson: JSON.stringify(validated),
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'MANAGE_ADMINS' as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("id");

    if (!targetId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    if (targetId === adminProfile.id) {
      return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    // Always keep at least one admin
    const totalAdmins = await prisma.adminUser.count();
    if (totalAdmins <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the only admin. There must always be at least one admin account." },
        { status: 400 }
      );
    }

    const target = await prisma.adminUser.findUnique({ where: { id: targetId }, include: { role: true } });
    if (!target) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "DELETE_ADMIN_USER",
        entityType: "admin_user",
        entityId: targetId,
        metadataJson: JSON.stringify({ role: target.role?.name }),
      },
    });

    await prisma.adminUser.delete({ where: { id: targetId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting admin user:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
