import { NextRequest, NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check permission - skip if no role assigned (legacy accounts)
  if (adminProfile.roleId && !(await hasPermission(adminProfile.id, 'VIEW_AUDIT_LOGS' as AdminPermission))) {
    return NextResponse.json(
      { error: "Permission denied" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const action = searchParams.get("action");
    const entityType = searchParams.get("entityType");

    const where: { action?: string; entityType?: string } = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map(log => ({
        id: log.id,
        actor: log.actor
          ? {
              email: log.actor.email,
              name: log.actor.name,
            }
          : null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadataJson ? JSON.parse(log.metadataJson) : null,
        timestamp: log.createdAt,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
