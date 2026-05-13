import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthCookieName } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;

  await prisma.user.update({
    where: { id: session.userId },
    data: { consentWithdrawnAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: session.userId,
    action: "consent.withdrawn",
    entityType: "consent",
    entityId: session.userId,
  });

  const res = NextResponse.json({ ok: true, locked: true });
  res.cookies.set(getAuthCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
