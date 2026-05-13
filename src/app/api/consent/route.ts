import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  accepted: z.boolean(),
  version: z.string().min(1),
});

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const [user, history] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { consentVersion: true, consentAcceptedAt: true, consentWithdrawnAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: "consent",
        actorUserId: session.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    accepted: !!user?.consentAcceptedAt,
    version: user?.consentVersion ?? null,
    acceptedAt: user?.consentAcceptedAt ?? null,
    withdrawnAt: user?.consentWithdrawnAt ?? null,
    auditHistory: history.map((entry) => ({
      id: entry.id,
      status: entry.action.includes("withdraw") ? "withdrawn" : "accepted",
      version: (() => {
        if (!entry.metadataJson) return user?.consentVersion ?? "v1";
        try {
          const parsed = JSON.parse(entry.metadataJson) as { version?: string };
          return parsed.version ?? user?.consentVersion ?? "v1";
        } catch {
          return user?.consentVersion ?? "v1";
        }
      })(),
      timestamp: entry.createdAt.toISOString(),
    })),
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
