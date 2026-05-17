import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createParentUnlockToken,
  getParentUnlockCookieName,
  getParentUnlockMaxAgeSeconds,
  verifyPassword,
} from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        pinHash: true,
        parentPinFailedAttempts: true,
        parentPinLockedUntil: true,
      },
    });

    if (!user?.pinHash) {
      return NextResponse.json({ valid: false, error: "PIN not set." }, { status: 404 });
    }

    // Check lockout
    if (user.parentPinLockedUntil && user.parentPinLockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil(
        (user.parentPinLockedUntil.getTime() - Date.now()) / 1000,
      );
      await writeAuditLog({
        actorUserId: session.userId,
        action: "parent_pin_unlock_attempted_while_locked",
        entityType: "User",
        entityId: session.userId,
      });
      return NextResponse.json(
        {
          valid: false,
          locked: true,
          retryAfterSeconds,
          error: "Too many incorrect attempts. Please wait before trying again.",
        },
        { status: 429 },
      );
    }

    const valid = await verifyPassword(body.pin, user.pinHash);

    if (!valid) {
      const newCount = (user.parentPinFailedAttempts ?? 0) + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null;

      await prisma.user.update({
        where: { id: session.userId },
        data: {
          parentPinFailedAttempts: newCount,
          ...(shouldLock ? { parentPinLockedUntil: lockedUntil } : {}),
        },
      });

      if (shouldLock) {
        await writeAuditLog({
          actorUserId: session.userId,
          action: "parent_pin_temporary_lockout_triggered",
          entityType: "User",
          entityId: session.userId,
          metadata: { failedAttempts: newCount, lockedUntilMs: lockedUntil?.getTime() },
        });
        return NextResponse.json(
          {
            valid: false,
            locked: true,
            retryAfterSeconds: LOCKOUT_MINUTES * 60,
            error: "Too many incorrect attempts. Please wait before trying again.",
          },
          { status: 429 },
        );
      }

      await writeAuditLog({
        actorUserId: session.userId,
        action: "parent_pin_failed_attempt",
        entityType: "User",
        entityId: session.userId,
        metadata: { failedAttempts: newCount },
      });

      return NextResponse.json({ valid: false }, { status: 401 });
    }

    // Success — reset failed attempts
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        parentPinFailedAttempts: 0,
        parentPinLockedUntil: null,
      },
    });

    const token = await createParentUnlockToken(session.userId);
    const reply = NextResponse.json({ valid: true });
    reply.cookies.set(getParentUnlockCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getParentUnlockMaxAgeSeconds(),
    });
    return reply;
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid PIN request." }, { status: 400 });
  }
}
