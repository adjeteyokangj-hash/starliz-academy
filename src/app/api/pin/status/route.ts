import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readParentUnlockFromCookie } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const [user, unlocked] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { pinHash: true } }),
    readParentUnlockFromCookie(session.userId),
  ]);

  return NextResponse.json({
    hasPin: Boolean(user?.pinHash),
    unlocked,
  });
}
