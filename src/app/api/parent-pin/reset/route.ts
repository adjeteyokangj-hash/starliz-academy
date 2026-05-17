import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { checkRateLimit, getRequestIp, requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1122", "1212", "0123"]);

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, "Reset code must be exactly 6 digits."),
  newPin: z.string().regex(/^\d{4}$/, "New PIN must be exactly 4 digits."),
  confirmPin: z.string().regex(/^\d{4}$/, "Confirm PIN must be exactly 4 digits."),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ip = getRequestIp(request);

  // Rate limit reset attempts
  const { allowed, retryAfterSeconds } = checkRateLimit({
    key: `parent_pin_reset:${session.userId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!allowed) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "parent_pin_reset_attempt_rate_limited",
      entityType: "User",
      entityId: session.userId,
      metadata: { ip },
    });
    return NextResponse.json(
      { error: "Too many attempts. Please wait before trying again.", retryAfterSeconds },
      { status: 429 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.newPin !== body.confirmPin) {
    return NextResponse.json({ error: "PINs do not match." }, { status: 400 });
  }

  if (WEAK_PINS.has(body.newPin)) {
    return NextResponse.json(
      { error: "This PIN is too simple. Please choose a more secure PIN." },
      { status: 400 },
    );
  }

  // Look up the token
  const tokenHash = crypto.createHash("sha256").update(body.code).digest("hex");
  const token = await prisma.parentPinResetToken.findFirst({
    where: {
      userId: session.userId,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!token) {
    await writeAuditLog({
      actorUserId: session.userId,
      action: "parent_pin_reset_failed_invalid_code",
      entityType: "User",
      entityId: session.userId,
      metadata: { ip },
    });
    return NextResponse.json(
      { error: "Invalid or expired reset code. Please request a new one." },
      { status: 400 },
    );
  }

  // Mark token as used and update PIN atomically
  const pinHash = await hashPassword(body.newPin);
  await prisma.$transaction([
    prisma.parentPinResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: session.userId },
      data: {
        pinHash,
        parentPinFailedAttempts: 0,
        parentPinLockedUntil: null,
        parentPinUpdatedAt: new Date(),
      },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.userId,
    action: "parent_pin_reset_successful",
    entityType: "User",
    entityId: session.userId,
    metadata: { ip },
  });

  return NextResponse.json({ ok: true });
}
