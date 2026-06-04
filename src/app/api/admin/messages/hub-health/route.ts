import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";
import { buildCommunicationHubHealth } from "@/lib/notifications/communication-hub";
import type { CommunicationHubHealthCounts } from "@/lib/notifications/communication-hub";

type Deps = {
  requireAdmin: typeof requireAdmin;
  collectCounts: () => Promise<CommunicationHubHealthCounts>;
};

export type AdminCommunicationHubHealthPayload = {
  status: "healthy" | "warning" | "informational";
  score: number;
  warnings: string[];
  summary: string;
  boundary: "draft_review_required";
  counts: CommunicationHubHealthCounts;
  generatedAt: string;
};

async function defaultCollectCounts(): Promise<CommunicationHubHealthCounts> {
  const [openThreads, unreadInboundMessages, pendingNotificationEvents, failedNotificationDeliveries, pendingEscalations] = await Promise.all([
    prisma.parentMessageThread.count(),
    prisma.parentMessageThread.aggregate({ _sum: { unreadCount: true } }).then((result) => Number(result._sum.unreadCount ?? 0)),
    prisma.notificationEvent.count({ where: { status: "pending" } }),
    prisma.notificationDelivery.count({ where: { status: "failed" } }),
    prisma.auditLog.count({ where: { action: "communication_escalation_flagged" } }),
  ]);

  return {
    openThreads,
    unreadInboundMessages,
    pendingNotificationEvents,
    failedNotificationDeliveries,
    pendingEscalations,
  };
}

export async function handleAdminCommunicationHubHealthGet(
  request: Request,
  deps: Deps = {
    requireAdmin,
    collectCounts: defaultCollectCounts,
  },
) {
  void request;
  const { session, response } = await deps.requireAdmin();
  if (!session) return response;

  const counts = await deps.collectCounts();
  const health = buildCommunicationHubHealth(counts);

  const payload: AdminCommunicationHubHealthPayload = {
    ...health,
    counts,
  };

  return NextResponse.json(payload);
}

export async function GET(request: Request) {
  return handleAdminCommunicationHubHealthGet(request);
}
