import { NextRequest, NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission, countActiveSuperAdmins } from "@/lib/rbac";
import { z } from "zod";

const createDeleteApprovalSchema = z.object({
  targetUserId: z.string(),
  entityType: z.enum(["admin_user", "student", "parent", "subscription", "content", "api_key"]),
  entityId: z.string(),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check permission
  if (!(await hasPermission(adminProfile.id, 'DELETE_RECORDS' as AdminPermission))) {
    return NextResponse.json(
      { error: "Permission denied" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    const approvals = await prisma.deleteApproval.findMany({
      where: { status },
      include: {
        targetUser: {
          include: {
            user: {
              select: { email: true, name: true },
            },
          },
        },
        requestedBy: {
          include: {
            user: {
              select: { email: true, name: true },
            },
          },
        },
        approvedBy: {
          include: {
            user: {
              select: { email: true, name: true },
            },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    return NextResponse.json({
      approvals: approvals.map(a => ({
        id: a.id,
        targetUser: {
          id: a.targetUser.id,
          email: a.targetUser.user.email,
          name: a.targetUser.user.name,
        },
        requestedBy: {
          id: a.requestedBy.id,
          email: a.requestedBy.user.email,
          name: a.requestedBy.user.name,
        },
        entityType: a.entityType,
        entityId: a.entityId,
        reason: a.reason,
        status: a.status,
        requestedAt: a.requestedAt,
        approvedAt: a.approvedAt,
        expiresAt: a.expiresAt,
      })),
    });
  } catch (err) {
    console.error("Error fetching delete approvals:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = createDeleteApprovalSchema.parse(await req.json());

    const targetAdmin = await prisma.adminUser.findUnique({
      where: { id: body.targetUserId },
      include: { role: true },
    });

    if (!targetAdmin) {
      return NextResponse.json(
        { error: "Target admin user not found" },
        { status: 404 }
      );
    }

    // Check if requesting admin has permission to request deletion
    if (!(await hasPermission(adminProfile.id, 'DELETE_RECORDS' as AdminPermission))) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Special handling for Super Admin deletion
    if (targetAdmin.role?.name === "SUPER_ADMIN") {
      // Cannot delete self without approval
      if (body.targetUserId === adminProfile.id) {
        return NextResponse.json(
          { error: "Super Admins cannot self-delete without approval. A second Super Admin must approve." },
          { status: 400 }
        );
      }

      // Must be Super Admin to request deletion of another Super Admin
      const requestingAdminRole = await prisma.adminUser.findUnique({
        where: { id: adminProfile.id },
        include: { role: true },
      });

      if (requestingAdminRole?.role?.name !== "SUPER_ADMIN") {
        return NextResponse.json(
          { error: "Only Super Admins can request deletion of other Super Admins" },
          { status: 403 }
        );
      }

      // Check if there would be at least one Super Admin left
      const activeSuperAdmins = await countActiveSuperAdmins();
      if (activeSuperAdmins <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the only Super Admin. There must always be at least one." },
          { status: 400 }
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Approve within 7 days

    const approval = await prisma.deleteApproval.create({
      data: {
        targetUserId: body.targetUserId,
        requestedByUserId: adminProfile.id,
        entityType: body.entityType,
        entityId: body.entityId,
        reason: body.reason,
        status: "pending",
        expiresAt,
        requestIpAddress: req.headers.get("x-forwarded-for") || "unknown",
        requestUserAgent: req.headers.get("user-agent") || "unknown",
      },
      include: {
        targetUser: { include: { user: true } },
        requestedBy: { include: { user: true } },
      },
    });

    // Log to audit
    await prisma.auditLog.create({
      data: {
        actorUserId: session.userId,
        action: "REQUEST_DELETION",
        entityType: body.entityType,
        entityId: body.entityId,
        metadataJson: JSON.stringify({
          approvalId: approval.id,
          reason: body.reason,
        }),
      },
    });

    return NextResponse.json({
      id: approval.id,
      status: approval.status,
      requestedAt: approval.requestedAt,
      expiresAt: approval.expiresAt,
    }, { status: 201 });
  } catch (err) {
    console.error("Error creating delete approval:", err);
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
