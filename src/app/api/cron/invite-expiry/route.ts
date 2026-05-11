import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import {
  buildSchoolInviteExpiredEmail,
  buildSchoolInviteExpiryReminderEmail,
} from "@/lib/emails/school-invite";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { createSchoolInviteToken } from "@/lib/schools/invite_tokens";

function hasCronAccess(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function POST(request: Request) {
  if (!hasCronAccess(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const withinLastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Soon to expire reminder
  const reminderCandidates = await prisma.schoolInviteToken.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: now, lte: in24h },
    },
    include: { school: { select: { id: true, name: true } } },
    take: 300,
  });

  let reminderSent = 0;
  for (const invite of reminderCandidates) {
    const already = await prisma.schoolAuditLog.findFirst({
      where: {
        schoolId: invite.schoolId,
        action: "invite_expired",
        metadataJson: { contains: `\"reminderFor\":\"${invite.id}\"` },
      },
      select: { id: true },
    });
    if (already) continue;

    let metadata: Record<string, unknown> | undefined;
    try {
      metadata = invite.metadataJson ? JSON.parse(invite.metadataJson) : undefined;
    } catch {
      metadata = undefined;
    }

    const freshRawToken = await createSchoolInviteToken({
      schoolId: invite.schoolId,
      inviteType: invite.inviteType,
      targetEmail: invite.targetEmail,
      targetRole: invite.targetRole ?? "teacher",
      metadata,
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const mail = buildSchoolInviteExpiryReminderEmail({
      schoolName: invite.school.name,
      inviteUrl: `${baseUrl}/school/invites/accept?token=${freshRawToken}`,
      expiresAt: invite.expiresAt,
    });
    const sent = await sendEmail({
      to: invite.targetEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    await writeSchoolAuditLog({
      schoolId: invite.schoolId,
      action: "invite_expired",
      entityType: "teacher",
      entityId: invite.id,
      metadata: {
        mode: "expiry_reminder",
        reminderFor: invite.id,
        targetEmail: invite.targetEmail,
        emailDelivery: sent.ok ? "sent" : "failed",
      },
      severity: "info",
    });

    if (sent.ok) reminderSent += 1;
  }

  // Expired invite notification
  const expiredCandidates = await prisma.schoolInviteToken.findMany({
    where: {
      usedAt: null,
      expiresAt: { lte: now, gte: withinLastDay },
    },
    include: { school: { select: { id: true, name: true } } },
    take: 300,
  });

  let expirySent = 0;
  for (const invite of expiredCandidates) {
    const already = await prisma.schoolAuditLog.findFirst({
      where: {
        schoolId: invite.schoolId,
        action: "invite_expired",
        metadataJson: { contains: `\"expiredFor\":\"${invite.id}\"` },
      },
      select: { id: true },
    });
    if (already) continue;

    const mail = buildSchoolInviteExpiredEmail({ schoolName: invite.school.name });
    const sent = await sendEmail({
      to: invite.targetEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    await writeSchoolAuditLog({
      schoolId: invite.schoolId,
      action: "invite_expired",
      entityType: "teacher",
      entityId: invite.id,
      metadata: {
        mode: "expired_notice",
        expiredFor: invite.id,
        targetEmail: invite.targetEmail,
        emailDelivery: sent.ok ? "sent" : "failed",
      },
      severity: "warning",
    });

    if (sent.ok) expirySent += 1;
  }

  return NextResponse.json({
    ok: true,
    reminderCandidates: reminderCandidates.length,
    reminderSent,
    expiredCandidates: expiredCandidates.length,
    expirySent,
  });
}
