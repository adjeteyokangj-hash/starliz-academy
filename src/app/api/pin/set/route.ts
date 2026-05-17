import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireSession } from "@/lib/api_guard";

const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "1122", "1212", "0123"]);

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());

    if (WEAK_PINS.has(body.pin)) {
      return NextResponse.json(
        { error: "This PIN is too simple. Please choose a more secure PIN." },
        { status: 400 },
      );
    }

    const pinHash = await hashPassword(body.pin);
    await prisma.user.update({
      where: { id: session.userId },
      data: { pinHash, parentPinUpdatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid PIN request." }, { status: 400 });
  }
}
