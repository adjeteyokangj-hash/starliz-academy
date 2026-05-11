import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    const pinHash = await hashPassword(body.pin);
    await prisma.user.update({
      where: { id: session.userId },
      data: { pinHash },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid PIN request." }, { status: 400 });
  }
}
