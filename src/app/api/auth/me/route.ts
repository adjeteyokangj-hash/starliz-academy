import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";

export async function GET() {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      activeChildId: true,
      consentAcceptedAt: true,
      consentVersion: true,
      consentWithdrawnAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user });
}
