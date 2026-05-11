import { NextRequest, NextResponse } from "next/server";
import type { AdminPermission } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { hasPermission, countActiveSuperAdmins } from "@/lib/rbac";
import { z } from "zod";

const approveSchema = z.object({
  reason: z.string().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;
  const { session, response } = await requireAdmin();
  if (!session) return response!;

  const adminProfile = await prisma.adminUser.findUnique({ where: { userId: session.userId } });
  if (!adminProfile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = approveSchema.parse(await req.json());

    const approval = await prisma.deleteApproval.findUnique({
      where: { id },
      include: {
        targetUser: { include: { role: true, user: true } },
        requestedBy: { include: { user: true } },
      },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "Approval request not found" },
        { status: 404 }
      );
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot ${action} an already ${approval.status} request` },
        { status: 400 }
      );
    }

    if (action === "approve") {
      // Check permission
      if (!(await hasPermission(adminProfile.id, 'DELETE_RECORDS' as AdminPermission))) {
        return NextResponse.json(
          { error: "Permission denied" },
          { status: 403 }
        );
      }

      // Cannot approve own deletion request
      if (approval.requestedByUserId === adminProfile.id) {
        return NextResponse.json(
          { error: "You cannot approve your own deletion request" },
          { status: 400 }
        );
      }

      // For Super Admin deletion, approver must also be Super Admin
      if (approval.targetUser.role?.name === "SUPER_ADMIN") {
        const approverRole = await prisma.adminUser.findUnique({
          where: { id: adminProfile.id },
          include: { role: true },
        });

        if (approverRole?.role?.name !== "SUPER_ADMIN") {
          return NextResponse.json(
            { error: "Only Super Admins can approve Super Admin deletion" },
            { status: 403 }
          );
        }

        // Check if there would be at least one Super Admin left after this
        const activeSuperAdmins = await countActiveSuperAdmins();
        if (activeSuperAdmins <= 1) {
          return NextResponse.json(
            { error: "Cannot approve deletion of the only active Super Admin" },
            { status: 400 }
          );
        }
      }

      const updated = await prisma.deleteApproval.update({
        where: { id },
        data: {
          status: "approved",
          approvedByUserId: adminProfile.id,
          approvedAt: new Date(),
          approvalIpAddress: req.headers.get("x-forwarded-for") || "unknown",
          approvalUserAgent: req.headers.get("user-agent") || "unknown",
        },
      });

      // Log to audit
      await prisma.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "APPROVE_DELETION",
          entityType: approval.entityType,
          entityId: approval.entityId,
          metadataJson: JSON.stringify({ approvalId: id }),
        },
      });

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        approvedAt: updated.approvedAt,
      });
    } else if (action === "deny") {
      // Check permission
      if (!(await hasPermission(adminProfile.id, 'DELETE_RECORDS' as AdminPermission))) {
        return NextResponse.json(
          { error: "Permission denied" },
          { status: 403 }
        );
      }

      const updated = await prisma.deleteApproval.update({
        where: { id },
        data: {
          status: "denied",
          deniedAt: new Date(),
          denialReason: body.reason,
          approvalIpAddress: req.headers.get("x-forwarded-for") || "unknown",
          approvalUserAgent: req.headers.get("user-agent") || "unknown",
        },
      });

      // Log to audit
      await prisma.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: "DENY_DELETION",
          entityType: approval.entityType,
          entityId: approval.entityId,
          metadataJson: JSON.stringify({
            approvalId: id,
            reason: body.reason,
          }),
        },
      });

      return NextResponse.json({
        id: updated.id,
        status: updated.status,
        deniedAt: updated.deniedAt,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("Error processing approval:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
