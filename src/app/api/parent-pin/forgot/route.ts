import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, getRequestIp, requireSession } from "@/lib/api_guard";
import { sendEmail } from "@/lib/email-provider";
import { buildParentPinResetEmail } from "@/lib/emails/parent-pin-reset";
import { writeAuditLog } from "@/lib/audit";

const CODE_EXPIRY_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60;
// Max 3 requests per user per 10 minutes
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

function generateCode(): string {
  // 6-digit numeric code
  return String(crypto.randomInt(100000, 999999));
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ip = getRequestIp(request);

  // Per-user rate limit
  const rateKey = `parent_pin_forgot:${session.userId}`;
  const { allowed, retryAfterSeconds } = checkRateLimit({
    key: rateKey,
    limit: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!allowed) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "parent_pin_reset_rate_limited",
      entityType: "User",
      entityId: session.userId,
      metadata: { ip },
    });
    return NextResponse.json(
      { error: "Too many reset requests. Please wait before trying again.", retryAfterSeconds },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      parentProfile: { select: { emailVerified: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require verified parent email
  if (!user.parentProfile?.emailVerified) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "parent_pin_reset_blocked_unverified_email",
      entityType: "User",
      entityId: session.userId,
      metadata: { ip },
    });
    return NextResponse.json(
      {
        error: "Your parent email address has not been verified. Please verify your email before resetting your PIN. Contact support if you need help.",
        code: "EMAIL_NOT_VERIFIED",
      },
      { status: 403 },
    );
  }

  // Check resend cooldown: is there a recent unexpired, unused token?
  const recent = await prisma.parentPinResetToken.findFirst({
    where: {
      userId: session.userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const cooldownRemaining = Math.ceil(
      (recent.createdAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000,
    );
    return NextResponse.json(
      { error: "Please wait before requesting another code.", retryAfterSeconds: cooldownRemaining },
      { status: 429 },
    );
  }

  // Invalidate all previous unused tokens for this user
  await prisma.parentPinResetToken.updateMany({
    where: { userId: session.userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Generate a 6-digit code and hash it
  const code = generateCode();
  const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  await prisma.parentPinResetToken.create({
    data: {
      userId: session.userId,
      tokenHash,
      expiresAt,
      requestIp: ip,
      userAgent,
    },
  });

  // Send email
  const emailPayload = buildParentPinResetEmail({
    resetCode: code,
    expiresInMinutes: CODE_EXPIRY_MINUTES,
  });

  const emailResult = await sendEmail({
    to: user.email,
    subject: emailPayload.subject,
    html: emailPayload.html,
    text: emailPayload.text,
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "parent_pin_reset_requested",
    entityType: "User",
    entityId: session.userId,
    metadata: { ip, emailSent: emailResult.ok },
  });

  if (!emailResult.ok) {
    return NextResponse.json(
      { error: "Failed to send reset email. Please try again or contact support." },
      { status: 500 },
    );
  }

  await writeAuditLog({
    actorUserId: session.userId,
    action: "parent_pin_reset_code_sent",
    entityType: "User",
    entityId: session.userId,
    metadata: { ip },
  });

  return NextResponse.json({ ok: true, sentTo: user.email });
}
