import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function PUT(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    const currentParentProfile = await prisma.parentProfile.findUnique({
      where: { userId: session.userId },
      select: { deviceTrackingJson: true },
    });

    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });

    let deviceTrackingData: Record<string, unknown> = {};
    if (currentParentProfile?.deviceTrackingJson) {
      try {
        const parsed = JSON.parse(currentParentProfile.deviceTrackingJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          deviceTrackingData = parsed as Record<string, unknown>;
        }
      } catch {
        deviceTrackingData = {};
      }
    }

    const security =
      deviceTrackingData.security && typeof deviceTrackingData.security === "object" && !Array.isArray(deviceTrackingData.security)
        ? (deviceTrackingData.security as Record<string, unknown>)
        : {};

    const nextTracking = {
      ...deviceTrackingData,
      security: {
        ...security,
        lastPasswordChangedAt: new Date().toISOString(),
      },
    };

    await prisma.parentProfile.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        phone: "Not set",
        deviceTrackingJson: JSON.stringify(nextTracking),
      },
      update: {
        deviceTrackingJson: JSON.stringify(nextTracking),
      },
    });

    await writeAuditLog({
      actorUserId: session.userId,
      action: "parent.password.updated",
      entityType: "parent_account",
      entityId: session.userId,
      metadata: { at: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid password payload." }, { status: 400 });
  }
}
