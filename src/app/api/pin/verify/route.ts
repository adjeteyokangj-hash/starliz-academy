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

export async function handlePinVerifyForSession(input: {
  sessionUserId: string;
  pin: string;
  deps?: {
    findUser: (userId: string) => Promise<{
      id: string;
      pinHash: string | null;
      parentPinFailedAttempts: number | null;
      parentPinLockedUntil: Date | null;
    } | null>;
    verifyPin: (pin: string, hash: string) => Promise<boolean>;
    updateUser: (userId: string, data: {
      parentPinFailedAttempts?: number;
      parentPinLockedUntil?: Date | null;
    }) => Promise<void>;
    writeAudit: (payload: {
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    }) => Promise<void>;
    createUnlockToken: (userId: string) => Promise<string>;
  };
}): Promise<NextResponse> {
  const deps = input.deps ?? {
    findUser: async (userId: string) => prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        pinHash: true,
        parentPinFailedAttempts: true,
        parentPinLockedUntil: true,
      },
    }),
    verifyPin: verifyPassword,
    updateUser: async (userId: string, data) => {
      await prisma.user.update({
        where: { id: userId },
        data,
      });
    },
    writeAudit: async (payload) => writeAuditLog(payload),
    createUnlockToken: createParentUnlockToken,
  };

  const user = await deps.findUser(input.sessionUserId);

  if (!user?.pinHash) {
    const noPinResponse = NextResponse.json(
      {
        valid: false,
        code: "pin_setup_required",
        error: "Parent PIN has been reset. Please create a new PIN.",
      },
      { status: 409 },
    );
    noPinResponse.cookies.set(getParentUnlockCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return noPinResponse;
  }

  // Check lockout
  if (user.parentPinLockedUntil && user.parentPinLockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil(
      (user.parentPinLockedUntil.getTime() - Date.now()) / 1000,
    );
    await deps.writeAudit({
      actorUserId: input.sessionUserId,
      action: "parent_pin_unlock_attempted_while_locked",
      entityType: "User",
      entityId: input.sessionUserId,
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

  const valid = await deps.verifyPin(input.pin, user.pinHash);

  if (!valid) {
    const newCount = (user.parentPinFailedAttempts ?? 0) + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

    await deps.updateUser(input.sessionUserId, {
      parentPinFailedAttempts: newCount,
      ...(shouldLock ? { parentPinLockedUntil: lockedUntil } : {}),
    });

    if (shouldLock) {
      await deps.writeAudit({
        actorUserId: input.sessionUserId,
        action: "parent_pin_temporary_lockout_triggered",
        entityType: "User",
        entityId: input.sessionUserId,
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

    await deps.writeAudit({
      actorUserId: input.sessionUserId,
      action: "parent_pin_failed_attempt",
      entityType: "User",
      entityId: input.sessionUserId,
      metadata: { failedAttempts: newCount },
    });

    return NextResponse.json({ valid: false }, { status: 401 });
  }

  // Success — reset failed attempts
  await deps.updateUser(input.sessionUserId, {
    parentPinFailedAttempts: 0,
    parentPinLockedUntil: null,
  });

  const token = await deps.createUnlockToken(input.sessionUserId);
  const reply = NextResponse.json({ valid: true });
  reply.cookies.set(getParentUnlockCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getParentUnlockMaxAgeSeconds(),
  });
  return reply;
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    return handlePinVerifyForSession({
      sessionUserId: session.userId,
      pin: body.pin,
    });
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid PIN request." }, { status: 400 });
  }
}
