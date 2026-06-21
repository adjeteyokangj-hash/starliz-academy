import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { handleConsentGet } from "@/lib/consent-api";

const schema = z.object({
  accepted: z.boolean(),
  version: z.string().min(1),
});

export async function GET() {
  return handleConsentGet();
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

    await writeAuditLog({
      actorUserId: session.userId,
      action: "consent.accepted",
      entityType: "consent",
      entityId: session.userId,
      metadata: { version: body.version },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid consent payload." }, { status: 400 });
  }
}
