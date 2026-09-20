import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createParentUnlockToken,
  getParentUnlockCookieName,
  getParentUnlockMaxAgeSeconds,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { decideParentPinSetRequest, isWeakParentPin, type ParentPinSetBody } from "@/lib/parent-pin";

const schema = z.object({
  pin: z.string().optional(),
  currentPin: z.string().optional(),
  newPin: z.string().optional(),
});

export async function handlePinSetForSession(input: {
  sessionUserId: string;
  body: ParentPinSetBody;
  deps?: {
    findUser: (userId: string) => Promise<{ pinHash: string | null } | null>;
    updateUserPin: (userId: string, pinHash: string) => Promise<void>;
    verifyCurrentPin: (plain: string, hash: string) => Promise<boolean>;
    hashPin: (plain: string) => Promise<string>;
    createUnlockToken?: (userId: string) => Promise<string>;
  };
}): Promise<NextResponse> {
  const deps = input.deps ?? {
    findUser: async (userId: string) => prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } }),
    updateUserPin: async (userId: string, pinHash: string) => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          pinHash,
          parentPinUpdatedAt: new Date(),
          parentPinFailedAttempts: 0,
          parentPinLockedUntil: null,
        },
      });
    },
    verifyCurrentPin: verifyPassword,
    hashPin: hashPassword,
    createUnlockToken: createParentUnlockToken,
  };

  const user = await deps.findUser(input.sessionUserId);

  const decision = decideParentPinSetRequest({
    hasExistingPin: Boolean(user?.pinHash),
    body: input.body,
  });

  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  if (isWeakParentPin(decision.nextPin)) {
    return NextResponse.json(
      { error: "This PIN is too simple. Please choose a more secure PIN." },
      { status: 400 },
    );
  }

  if (decision.mode === "change") {
    const hasExistingHash = user?.pinHash;
    if (!hasExistingHash) {
      return NextResponse.json({ error: "Parent PIN has not been set yet." }, { status: 400 });
    }

    const currentMatches = await deps.verifyCurrentPin(decision.currentPin, hasExistingHash);
    if (!currentMatches) {
      return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 403 });
    }
  }

  const pinHash = await deps.hashPin(decision.nextPin);
  await deps.updateUserPin(input.sessionUserId, pinHash);

  const reply = NextResponse.json({ ok: true, mode: decision.mode });
  try {
    if (deps.createUnlockToken) {
      const token = await deps.createUnlockToken(input.sessionUserId);
      reply.cookies.set(getParentUnlockCookieName(), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getParentUnlockMaxAgeSeconds(),
      });
    }
  } catch {
    // PIN is stored even if the unlock cookie cannot be issued.
  }
  return reply;
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    return handlePinSetForSession({ sessionUserId: session.userId, body });
  } catch {
    return NextResponse.json({ error: "Invalid PIN request." }, { status: 400 });
  }
}
