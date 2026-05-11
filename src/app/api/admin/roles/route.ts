import { NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission, seedDefaultRoles } from "@/lib/rbac";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Bypass permission check for admins with no role (seed/original admin)
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'MANAGE_ROLES' as AdminPermission))) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  try {
    // Auto-seed default roles if none exist
    const count = await prisma.adminRole.count();
    if (count === 0) {
      await seedDefaultRoles();
    }

    const roles = await prisma.adminRole.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: JSON.parse(r.permissions),
        isBuiltIn: r.isBuiltIn,
        userCount: 0,
      })),
    });
  } catch (err) {
    console.error("Error fetching roles:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
