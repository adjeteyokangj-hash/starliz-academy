/**
 * School invite management
 *
 * POST /api/school/invites   — create invite for teacher/school_admin (admin+ only)
 * PATCH /api/school/invites  — resend or revoke invite
 * GET  /api/school/invites   — list pending invites for a school
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolAdmin } from "@/lib/schools/guards";
import { createSchoolInviteToken } from "@/lib/schools/invite_tokens";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { checkRateLimit, getRequestIp } from "@/lib/api_guard";
import { sendEmail } from "@/lib/email-provider";
import {
  buildSchoolInviteEmail,
  buildSchoolInviteRevokedEmail,
} from "@/lib/emails/school-invite";

const createInviteSchema = z.object({
  schoolId: z.string().min(1),
  targetEmail: z.string().email(),
  inviteType: z.enum(["teacher", "school_admin"]),
  targetRole: z.enum(["owner", "admin", "teacher", "support", "staff_observer", "finance"]).optional(),
});

const patchInviteSchema = z.object({
  schoolId: z.string().min(1),
  inviteId: z.string().min(1),
  action: z.enum(["resend", "revoke"]),
  reason: z.string().min(1).max(500).optional(),
});

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

function roleLabel(role: string | null): string {
  const map: Record<string, string> = {
    owner: "School Owner",
    admin: "School Admin",
    teacher: "Teacher",
    support: "Support Staff",
    staff_observer: "Staff Observer",
    finance: "Finance",
  };
  return map[role ?? "teacher"] ?? role ?? "Teacher";
}

// ─── POST: create invite ──────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const rateCheck = checkRateLimit({ key: `school:invites:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: z.infer<typeof createInviteSchema>;
  try {
    body = createInviteSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { context, response } = await requireSchoolAdmin(body.schoolId, {
    method: "POST",
    route: "/api/school/invites",
    resourceType: "teacher",
  });
  if (response) return response;

  const email = body.targetEmail.toLowerCase();

  // Determine the effective role
  const effectiveRole =
    body.inviteType === "school_admin"
      ? "admin"
      : (body.targetRole ?? "teacher");

  // Find or create a placeholder user for the invitee
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const { randomBytes } = await import("crypto");
    user = await prisma.user.create({
      data: {
        id: randomBytes(12).toString("hex"),
        email,
        name: email.split("@")[0],
        role: "teacher",
        passwordHash: "", // will be set on invite acceptance
      },
    });
  }

  // Check if this user is already an active teacher in this school
  const existing = await prisma.schoolTeacher.findUnique({
    where: { schoolId_userId: { schoolId: body.schoolId, userId: user.id } },
  });

  if (existing && existing.status === "active") {
    return NextResponse.json(
      { error: "This user is already an active member of the school." },
      { status: 409 }
    );
  }

  // Create or reactivate SchoolTeacher record in invited state
  let schoolTeacher = existing;
  if (!schoolTeacher) {
    schoolTeacher = await prisma.schoolTeacher.create({
      data: {
        schoolId: body.schoolId,
        userId: user.id,
        role: effectiveRole as Parameters<typeof prisma.schoolTeacher.create>[0]["data"]["role"],
        status: "invited",
        invitedByUserId: context.userId,
        invitedAt: new Date(),
      },
    });
  } else if (schoolTeacher.status !== "active") {
    schoolTeacher = await prisma.schoolTeacher.update({
      where: { id: schoolTeacher.id },
      data: {
        role: effectiveRole as Parameters<typeof prisma.schoolTeacher.update>[0]["data"]["role"],
        status: "invited",
        invitedByUserId: context.userId,
        invitedAt: new Date(),
      },
    });
  }

  // Issue the generic invite token
  const rawToken = await createSchoolInviteToken({
    schoolId: body.schoolId,
    inviteType: body.inviteType,
    targetEmail: email,
    targetRole: effectiveRole,
    createdByUserId: context.userId,
    metadata: { schoolTeacherId: schoolTeacher.id, userId: user.id },
  });

  const baseUrl = getBaseUrl();
  const inviteUrl = `${baseUrl}/school/invites/accept?token=${rawToken}`;

  const school = await prisma.school.findUnique({
    where: { id: body.schoolId },
    select: { name: true },
  });

  const emailTemplate = buildSchoolInviteEmail({
    schoolName: school?.name ?? "School",
    roleLabel: roleLabel(effectiveRole),
    inviteUrl,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    invitedByName: null,
  });
  const emailResult = await sendEmail({
    to: email,
    subject: emailTemplate.subject,
    html: emailTemplate.html,
    text: emailTemplate.text,
  });

  await writeSchoolAuditLog({
    schoolId: body.schoolId,
    actorUserId: context.userId,
    action: "invite_sent",
    entityType: "teacher",
    entityId: schoolTeacher.id,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: {
      targetEmail: email,
      inviteType: body.inviteType,
      role: effectiveRole,
      emailDelivery: emailResult.ok ? "sent" : "failed",
      emailDeliveryReason: emailResult.ok ? null : emailResult.reason,
    },
    severity: "info",
  });

  return NextResponse.json({
    ok: true,
    inviteUrl,
    schoolTeacherId: schoolTeacher.id,
    targetEmail: email,
    role: effectiveRole,
    emailDelivery: emailResult,
  });
}

// ─── PATCH: resend/revoke invite ─────────────────────────────────────────

export async function PATCH(request: Request) {
  let body: z.infer<typeof patchInviteSchema>;
  try {
    body = patchInviteSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const { context, response } = await requireSchoolAdmin(body.schoolId, {
    method: "PATCH",
    route: "/api/school/invites",
    resourceType: "teacher",
    resourceId: body.inviteId,
  });
  if (response) return response;

  const invite = await prisma.schoolInviteToken.findUnique({
    where: { id: body.inviteId },
    include: { school: { select: { name: true } } },
  });
  if (!invite || invite.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  if (body.action === "revoke") {
    if (!invite.usedAt) {
      await prisma.schoolInviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });
    }

    const revokedEmail = buildSchoolInviteRevokedEmail({
      schoolName: invite.school.name,
      reason: body.reason ?? null,
    });

    const delivery = await sendEmail({
      to: invite.targetEmail,
      subject: revokedEmail.subject,
      html: revokedEmail.html,
      text: revokedEmail.text,
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "invite_expired",
      entityType: "teacher",
      entityId: invite.id,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? undefined,
      metadata: {
        mode: "revoked",
        reason: body.reason ?? null,
        targetEmail: invite.targetEmail,
        emailDelivery: delivery.ok ? "sent" : "failed",
      },
      severity: "warning",
    });

    return NextResponse.json({ ok: true, revoked: true, emailDelivery: delivery });
  }

  // resend
  const freshToken = await createSchoolInviteToken({
    schoolId: invite.schoolId,
    inviteType: invite.inviteType,
    targetEmail: invite.targetEmail,
    targetRole: invite.targetRole ?? "teacher",
    createdByUserId: context.userId,
    metadata: invite.metadataJson ? JSON.parse(invite.metadataJson) : undefined,
  });

  const inviteUrl = `${getBaseUrl()}/school/invites/accept?token=${freshToken}`;

  const resendEmail = buildSchoolInviteEmail({
    schoolName: invite.school.name,
    roleLabel: roleLabel(invite.targetRole),
    inviteUrl,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  });
  const delivery = await sendEmail({
    to: invite.targetEmail,
    subject: resendEmail.subject,
    html: resendEmail.html,
    text: resendEmail.text,
  });

  await writeSchoolAuditLog({
    schoolId: body.schoolId,
    actorUserId: context.userId,
    action: "invite_resent",
    entityType: "teacher",
    entityId: invite.id,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: {
      targetEmail: invite.targetEmail,
      inviteUrl,
      emailDelivery: delivery.ok ? "sent" : "failed",
      emailDeliveryReason: delivery.ok ? null : delivery.reason,
    },
    severity: "info",
  });

  return NextResponse.json({ ok: true, resent: true, inviteUrl, emailDelivery: delivery });
}

// ─── GET: list pending invites ────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const { response } = await requireSchoolAdmin(schoolId, {
    method: "GET",
    route: "/api/school/invites",
    resourceType: "teacher",
  });
  if (response) return response;

  const invites = await prisma.schoolInviteToken.findMany({
    where: {
      schoolId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      targetEmail: true,
      inviteType: true,
      targetRole: true,
      expiresAt: true,
      createdAt: true,
      createdByUserId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites });
}
