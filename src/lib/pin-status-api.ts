import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getParentUnlockCookieName, readParentUnlockFromCookie } from "@/lib/auth";

export async function handlePinStatusForSession(input: {
  sessionUserId: string;
  deps?: {
    findUser: (userId: string) => Promise<{ pinHash: string | null } | null>;
    readUnlock: (userId: string) => Promise<boolean>;
  };
}): Promise<NextResponse> {
  const deps = input.deps ?? {
    findUser: async (userId: string) => prisma.user.findUnique({ where: { id: userId }, select: { pinHash: true } }),
    readUnlock: readParentUnlockFromCookie,
  };

  const [user, unlockedFromCookie] = await Promise.all([
    deps.findUser(input.sessionUserId),
    deps.readUnlock(input.sessionUserId),
  ]);

  const hasPin = Boolean(user?.pinHash);
  const unlocked = hasPin ? unlockedFromCookie : false;
  const response = NextResponse.json(
    {
      hasPin,
      unlocked,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );

  // If PIN no longer exists, stale unlock cookies must not keep parent areas open.
  if (!hasPin) {
    response.cookies.set(getParentUnlockCookieName(), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}