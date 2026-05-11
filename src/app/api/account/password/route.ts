import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function PUT(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid password payload." }, { status: 400 });
  }
}
