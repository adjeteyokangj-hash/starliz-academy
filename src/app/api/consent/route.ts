import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";

const schema = z.object({
  accepted: z.boolean(),
  version: z.string().min(1),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { consentVersion: true, consentAcceptedAt: true, consentWithdrawnAt: true },
  });

  return NextResponse.json({
    accepted: !!user?.consentAcceptedAt,
    version: user?.consentVersion ?? null,
    acceptedAt: user?.consentAcceptedAt ?? null,
    withdrawnAt: user?.consentWithdrawnAt ?? null,
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = schema.parse(await request.json());
    if (!body.accepted) {
      return NextResponse.json({ error: "Consent must be accepted." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        consentVersion: body.version,
        consentAcceptedAt: new Date(),
        consentWithdrawnAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid consent payload." }, { status: 400 });
  }
}
