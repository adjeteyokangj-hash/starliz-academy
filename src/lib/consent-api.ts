import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { getAiUseDisclosureSummary } from "@/lib/privacy/ai-disclosure";

export type ConsentGetDeps = {
  requireSession: typeof requireSession;
  getUserConsent: (userId: string) => Promise<{ consentVersion: string | null; consentAcceptedAt: Date | null; consentWithdrawnAt: Date | null } | null>;
  getConsentHistory: (userId: string) => Promise<Array<{ id: string; action: string; metadataJson: string | null; createdAt: Date }>>;
};

export async function handleConsentGet(
  deps: ConsentGetDeps = {
    requireSession,
    getUserConsent: async (userId) => {
      return await prisma.user.findUnique({
        where: { id: userId },
        select: { consentVersion: true, consentAcceptedAt: true, consentWithdrawnAt: true },
      });
    },
    getConsentHistory: async (userId) => {
      return await prisma.auditLog.findMany({
        where: {
          entityType: "consent",
          actorUserId: userId,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    },
  },
) {
  const { session, response } = await deps.requireSession();
  if (!session) return response;

  const [user, history] = await Promise.all([
    deps.getUserConsent(session.userId),
    deps.getConsentHistory(session.userId),
  ]);

  return NextResponse.json({
    accepted: !!user?.consentAcceptedAt,
    version: user?.consentVersion ?? null,
    acceptedAt: user?.consentAcceptedAt ?? null,
    withdrawnAt: user?.consentWithdrawnAt ?? null,
    aiDisclosure: getAiUseDisclosureSummary(),
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