import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api_guard";

/** How long a tutor may go without a heartbeat before it is considered stale. */
const TUTOR_STALE_MINUTES = 3;

/** Per-job freshness expectations for cron health (minutes). */
const CRON_STALE_MINUTES: Record<string, number> = {
  "tutor-presence-sweep": 10,
  "short-learning-lifecycle": 20,
  "short-learning-reminders": 120,
};

const CRON_LABELS: Record<string, string> = {
  "tutor-presence-sweep": "Tutor presence sweep",
  "short-learning-lifecycle": "Short Learning lifecycle",
  "short-learning-reminders": "Short Learning reminders",
};

type IntegrationStatus = "ok" | "degraded" | "unavailable" | "misconfigured" | "unknown";

type Alert = {
  id: string;
  label: string;
  count: number | null;
  error: boolean;
  tone: "critical" | "warning" | "info";
  href: string;
};

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "P2021" || maybe.code === "P2022") return true;
  const message = String(maybe.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("not found in the current database");
}

/**
 * Count wrapper that keeps "zero" and "query failed" distinct so the dashboard
 * never paints a broken query as a healthy zero. A missing optional table is
 * treated as a truthful zero rather than an error.
 */
async function safeCount(query: () => Promise<number>): Promise<{ value: number | null; error: boolean }> {
  try {
    return { value: await query(), error: false };
  } catch (error) {
    if (isMissingTableError(error)) return { value: 0, error: false };
    console.error("ops/health count failed:", error);
    return { value: null, error: true };
  }
}

function envConfigured(...keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export async function GET() {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  const now = new Date();
  const tutorStaleBefore = new Date(now.getTime() - TUTOR_STALE_MINUTES * 60 * 1000);

  // Database ping — distinguishes a reachable DB from a broken connection.
  let database: IntegrationStatus = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  const apiKeys = await prisma.apiKeyConfig
    .findMany({ select: { provider: true, status: true } })
    .catch(() => [] as Array<{ provider: string; status: string }>);
  const keyStatus = new Map(apiKeys.map((key) => [key.provider.toLowerCase(), (key.status ?? "").toLowerCase()]));

  function integrationFor(providers: string[], envKeys: string[]): IntegrationStatus {
    for (const provider of providers) {
      const status = keyStatus.get(provider);
      if (status === "connected" || status === "ok" || status === "active") return "ok";
      if (status === "error" || status === "failed" || status === "invalid") return "degraded";
    }
    if (envConfigured(...envKeys)) return "ok";
    return "misconfigured";
  }

  const openai = integrationFor(["openai"], ["OPENAI_API_KEY"]);
  const payments = integrationFor(["payment", "stripe"], ["STRIPE_SECRET_KEY", "PAYSTACK_SECRET_KEY"]);
  const email = integrationFor(["email", "resend", "smtp"], ["RESEND_API_KEY", "SMTP_HOST", "EMAIL_SERVER"]);

  // Cron health from the most recent JobRunLog per job.
  const cronJobNames = Object.keys(CRON_STALE_MINUTES);
  const crons = await Promise.all(
    cronJobNames.map(async (job) => {
      const last = await prisma.jobRunLog
        .findFirst({ where: { jobName: job }, orderBy: { startedAt: "desc" } })
        .catch(() => null);
      const staleMinutes = CRON_STALE_MINUTES[job] ?? 30;
      const lastRunAt = last?.finishedAt ?? last?.startedAt ?? null;
      const ageMinutes = lastRunAt ? Math.floor((now.getTime() - new Date(lastRunAt).getTime()) / 60000) : null;
      const stale = ageMinutes === null || ageMinutes > staleMinutes;
      const secretConfigured = Boolean(process.env.CRON_SECRET?.trim());
      let status: "ok" | "stale" | "failed" | "never_run" | "misconfigured";
      if (!secretConfigured && process.env.NODE_ENV === "production") status = "misconfigured";
      else if (!last) status = "never_run";
      else if (last.status === "failed") status = "failed";
      else if (stale) status = "stale";
      else status = "ok";
      return {
        job,
        label: CRON_LABELS[job] ?? job,
        status,
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
        lastResult: last?.status ?? null,
        ageMinutes,
        staleThresholdMinutes: staleMinutes,
      };
    }),
  );

  const [
    failedGeneration,
    awaitingReview,
    failedPayments,
    graceSubscriptions,
    urgentSafeguarding,
    staleTutors,
    orphanedParents,
    failedCrons,
    openComplaints,
  ] = await Promise.all([
    safeCount(() => prisma.shortLearningJourney.count({ where: { status: "failed" } })),
    safeCount(() =>
      prisma.shortLearningJourney.count({ where: { status: { in: ["awaiting_review", "changes_requested"] } } }),
    ),
    safeCount(() =>
      prisma.subscription.count({ where: { status: { in: ["failed_payment", "payment_failed", "past_due", "unpaid"] } } }),
    ),
    safeCount(() => prisma.subscription.count({ where: { graceEndsAt: { gt: now } } })),
    safeCount(() =>
      prisma.safeguardingIncident.count({
        where: { severity: { in: ["high", "critical"] }, status: { notIn: ["resolved", "closed"] } },
      }),
    ),
    safeCount(() =>
      prisma.tutorPresence.count({
        where: { status: { in: ["available", "busy"] }, lastHeartbeatAt: { lt: tutorStaleBefore } },
      }),
    ),
    safeCount(() => prisma.user.count({ where: { role: "parent", parentProfile: null } })),
    safeCount(() => prisma.jobRunLog.count({ where: { status: "failed", startedAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })),
    // Complaint model is additive and may not exist yet; missing table => truthful zero.
    safeCount(() =>
      (prisma as unknown as { complaint?: { count: (a: unknown) => Promise<number> } }).complaint
        ? (prisma as unknown as { complaint: { count: (a: unknown) => Promise<number> } }).complaint.count({
            where: { status: { notIn: ["resolved", "closed"] } },
          })
        : Promise.resolve(0),
    ),
  ]);

  const alerts: Alert[] = [
    {
      id: "sl_generation_failed",
      label: "Failed Short Learning generation",
      count: failedGeneration.value,
      error: failedGeneration.error,
      tone: "critical",
      href: "/admin/short-learning/journeys?status=failed",
    },
    {
      id: "sl_awaiting_review",
      label: "Journeys awaiting review",
      count: awaitingReview.value,
      error: awaitingReview.error,
      tone: "warning",
      href: "/admin/short-learning/journeys?status=awaiting_review",
    },
    {
      id: "failed_payments",
      label: "Failed payments",
      count: failedPayments.value,
      error: failedPayments.error,
      tone: "critical",
      href: "/admin/subscriptions",
    },
    {
      id: "grace_subscriptions",
      label: "Grace-period subscriptions",
      count: graceSubscriptions.value,
      error: graceSubscriptions.error,
      tone: "warning",
      href: "/admin/subscriptions",
    },
    {
      id: "urgent_safeguarding",
      label: "Urgent safeguarding cases",
      count: urgentSafeguarding.value,
      error: urgentSafeguarding.error,
      tone: "critical",
      href: "/admin/schools",
    },
    {
      id: "open_complaints",
      label: "Open complaints",
      count: openComplaints.value,
      error: openComplaints.error,
      tone: "warning",
      href: "/admin/complaints",
    },
    {
      id: "stale_tutors",
      label: "Stale / offline tutors",
      count: staleTutors.value,
      error: staleTutors.error,
      tone: "warning",
      href: "/admin/short-learning",
    },
    {
      id: "orphaned_parents",
      label: "Orphaned parent records",
      count: orphanedParents.value,
      error: orphanedParents.error,
      tone: "info",
      href: "/admin/parents",
    },
    {
      id: "failed_crons",
      label: "Failed cron runs (24h)",
      count: failedCrons.value,
      error: failedCrons.error,
      tone: "warning",
      href: "/admin/settings/system-health",
    },
  ];

  return NextResponse.json({
    generatedAt: now.toISOString(),
    integrations: {
      database: { status: database },
      openai: { status: openai },
      payments: { status: payments },
      email: { status: email },
    },
    crons,
    alerts,
  });
}
