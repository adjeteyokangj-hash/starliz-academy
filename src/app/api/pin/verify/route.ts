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
      select: { pinHash: true },
    });

    if (!user?.pinHash) {
      return NextResponse.json({ valid: false, error: "PIN not set." }, { status: 404 });
    }

    const valid = await verifyPassword(body.pin, user.pinHash);
    if (!valid) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

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
