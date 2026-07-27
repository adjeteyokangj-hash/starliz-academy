"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";
import { AdminButtonLink, AdminCard, AdminPageHeader } from "@/components/admin/ui";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type Stats = {
  totalUsers: number;
  totalChildren: number;
  activeToday: number;
  avgAccuracy: number;
  lessonsCompleted: number;
  wordsGenerated: number;
  subscriptions: number | null;
  lessons: number | null;
  rewards: number | null;
  storeItems: number | null;
  supportTickets: number | null;
  inboxUnread: number;
  messageThreadsWithUnread: number;
  messagesUnread: number;
  apiKeyStatuses: Record<string, string>;
  weakestPatterns: { pattern: string; count: number }[];
  generatedContent: {
    id: string;
    contentType: string;
    level: number;
    topic: string;
    usedCount: number;
    createdAt: string;
    createdBy: string;
  }[];
  recentActivity: {
    id: string;
    childName: string;
    parentEmail: string;
    activityType: string;
    activityName: string;
    accuracy: number | null;
    correct: boolean | null;
    completed: boolean;
    createdAt: string;
  }[];
  studentsNeedingSupport: number;
  topWeakSkillFocus: { skillFocus: string; count: number }[];
  weakAreaStudents: { id: string; studentId: string; studentName: string; subject: string; skillFocus: string; accuracy: number; weaknessType: string }[];
  sessionSignalsSummary?: {
    confidenceTrend: string;
    engagementLevel: string;
    frustrationSignals: string;
    dominantMood: string;
  };
  financialDashboard?: {
    todayRevenue: number;
    monthlyRevenue: number;
    vatCollected: number;
    failedPayments: number;
    pendingSyncs: number;
    reconciliationStatus: string;
    mrr: number;
    arr: number;
    churn: number;
    taxLiabilityEstimate: number;
  } | null;
  partialData?: boolean;
};

type OpsAlert = {
  id: string;
  label: string;
  count: number | null;
  error: boolean;
  tone: "critical" | "warning" | "info";
  href: string;
};

type OpsCron = {
  job: string;
  label: string;
  status: "ok" | "stale" | "failed" | "never_run" | "misconfigured";
  lastRunAt: string | null;
  ageMinutes: number | null;
};

type OpsHealth = {
  generatedAt: string;
  integrations: {
    database: { status: string };
    openai: { status: string };
    payments: { status: string };
    email: { status: string };
  };
  crons: OpsCron[];
  alerts: OpsAlert[];
};

function formatGbp(value: number): string {
  return `GBP ${value.toFixed(2)}`;
}

const INTEGRATION_LABELS: Record<string, { label: string; tone: string }> = {
  ok: { label: "Operational", tone: "text-emerald-300" },
  degraded: { label: "Degraded", tone: "text-amber-300" },
  unavailable: { label: "Unavailable", tone: "text-red-300" },
  misconfigured: { label: "Not configured", tone: "text-amber-300" },
  unknown: { label: "Unknown", tone: "text-slate-400" },
};

const CRON_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  ok: { label: "Healthy", tone: "text-emerald-300" },
  stale: { label: "Stale", tone: "text-amber-300" },
  failed: { label: "Failed", tone: "text-red-300" },
  never_run: { label: "No runs yet", tone: "text-slate-400" },
  misconfigured: { label: "Missing secret", tone: "text-amber-300" },
};

const moduleGroups = [
  {
    label: "People & schools",
    items: [
      { title: "Schools", description: "Licences, classrooms, tutors and enrolments.", href: "/admin/schools" },
      { title: "Parents", description: "Accounts, children, consent and activity.", href: "/admin/parents" },
      { title: "Students", description: "Profiles, progress, stars and weak areas.", href: "/admin/students" },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "AI Generator", description: "Generate, validate and approve learning content.", href: "/admin/ai-generator" },
      { title: "Content Library", description: "Publish spelling, maths and reading assets.", href: "/admin/content-library" },
      { title: "Assignments", description: "Assign targeted work from weak areas.", href: "/admin/assignments" },
      { title: "Dictionary", description: "Child-friendly word bank for Coach and lessons.", href: "/admin/dictionary" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { title: "Subscriptions", description: "Plans, failed payments and trials.", href: "/admin/subscriptions" },
      { title: "Pricing", description: "Public plans, badges and Stripe price IDs.", href: "/admin/pricing" },
      { title: "TrueNumeris", description: "VAT, invoices and financial sync.", href: "/admin/integrations/truenumeris" },
      { title: "Trial Leads", description: "Trial activity, expiry and conversion.", href: "/admin/trial-leads" },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Short Learning", description: "Cross-school AI-led session bookings, shifts and coverage gaps.", href: "/admin/short-learning" },
      { title: "Complaints", description: "Operational complaints with working-day SLA tracking.", href: "/admin/complaints" },
      { title: "Reports", description: "Progress, weak topics and exports.", href: "/admin/reports" },
      { title: "System Health", description: "OpenAI, Stripe, database and jobs.", href: "/admin/settings/system-health" },
      { title: "API Keys", description: "Provider keys and connection status.", href: "/admin/settings/integrations" },
      { title: "Audit Logs", description: "Admin, billing and security events.", href: "/admin/audit-logs" },
      { title: "Production Checklist", description: "Launch readiness before go-live.", href: "/admin/settings/production-checklist" },
    ],
  },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 45_000);

    fetchWithRefreshRetry("/api/admin/stats", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          // Hard navigation — never paint an Unauthorized dashboard card.
          if (!cancelled) {
            window.location.replace("/admin/login?next=/admin&reason=switch");
          }
          return null;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = body?.error ?? `Unable to load admin stats (${response.status}).`;
          throw new Error(message);
        }
        return response.json() as Promise<Stats>;
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        setStats(payload);
        setLoading(false);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        const timedOut = controller.signal.aborted && controller.signal.reason === "timeout";
        if (timedOut) {
          setError("Dashboard stats timed out. Try again, or sign out and sign in as admin.");
        } else if ((caughtError as { name?: string })?.name === "AbortError") {
          return;
        } else {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load admin dashboard right now.");
        }
        setLoading(false);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      cancelled = true;
      controller.abort("unmount");
      window.clearTimeout(timeout);
    };
  }, [router]);

  useEffect(() => {
    if (!error) return;
    if (!/unauthorized|session expired|sign in|forbidden|admin only/i.test(error)) return;
    window.location.replace("/admin/login?next=/admin&reason=switch");
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetchWithRefreshRetry("/api/admin/ops/health", { credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        return res.json() as Promise<OpsHealth>;
      })
      .then((payload) => {
        if (cancelled) return;
        setHealth(payload);
        setHealthError(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Never paint fake healthy state — surface that health is unavailable.
        setHealthError(true);
      });
    return () => {
      cancelled = true;
      controller.abort("unmount");
    };
  }, []);

  const activityByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of stats?.recentActivity ?? []) {
      counts[item.activityType] = (counts[item.activityType] ?? 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [stats]);

  const weakSignals = useMemo(() => {
    const spelling = (stats?.weakestPatterns ?? []).slice(0, 3).map((item) => ({
      label: item.pattern,
      detail: `${item.count} errors`,
    }));
    const maths = (stats?.topWeakSkillFocus ?? []).slice(0, 3).map((item) => ({
      label: item.skillFocus,
      detail: `${item.count} students`,
    }));
    return [...spelling, ...maths].slice(0, 5);
  }, [stats]);

  if (error) {
    const isUnauthorized = /unauthorized|session expired|sign in/i.test(error);
    const isForbidden = /forbidden|admin only/i.test(error);
    const needsAdminLogin = isUnauthorized || isForbidden;
    if (needsAdminLogin) {
      // Never render an Unauthorized card — stay blank while hard-redirect runs.
      return null;
    }
    return (
      <AdminSectionCard title="Dashboard unavailable">
        <p className="admin-body">{error}</p>
      </AdminSectionCard>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Operations console"
        title="Platform overview"
        subtitle="A quieter view of learners, schools, content and ops — start with Schools or Students when you need to act."
        actions={
          <>
            <AdminButtonLink href="/admin/schools">Open Schools</AdminButtonLink>
            <AdminButtonLink href="/admin/ai-generator" variant="secondary">AI Generator</AdminButtonLink>
          </>
        }
      />

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="admin-section-title">At a glance</h3>
          <p className="admin-body text-xs">{loading ? "Loading platform signals…" : "Primary platform signals"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <AdminStatCard title="Parents" value={stats?.totalUsers ?? "…"} href="/admin/parents" tone="purple" />
          <AdminStatCard title="Learners" value={stats?.totalChildren ?? "…"} href="/admin/students" tone="blue" />
          <AdminStatCard title="Active today" value={stats?.activeToday ?? "…"} detail="Unique learners" href="/admin/reports" />
          <AdminStatCard title="Avg accuracy" value={stats ? `${stats.avgAccuracy}%` : "…"} href="/admin/reports" tone="green" />
          <AdminStatCard title="Need support" value={stats?.studentsNeedingSupport ?? "…"} href="/admin/students?filter=support" tone="amber" />
          <AdminStatCard title="Subscriptions" value={stats?.subscriptions ?? (stats ? "Unavailable" : "…")} href="/admin/subscriptions" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="admin-section-title">Operational alerts</h3>
          <p className="admin-body text-xs">
            {healthError
              ? "Health checks unavailable"
              : !health
                ? "Checking platform health…"
                : "Live server signals"}
          </p>
        </div>
        {healthError ? (
          <div className="rounded-[var(--admin-radius)] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Operational health checks are unavailable right now. Treat platform status as unknown, not healthy.
          </div>
        ) : !health ? (
          <div className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-4 py-3 text-sm text-[var(--admin-muted)]">
            Loading operational alerts…
          </div>
        ) : health.alerts.filter((a) => a.error || (a.count ?? 0) > 0).length === 0 ? (
          <div className="rounded-[var(--admin-radius)] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            No operational alerts. All monitored signals are clear.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {health.alerts
              .filter((a) => a.error || (a.count ?? 0) > 0)
              .map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className={`block rounded-[var(--admin-radius)] border px-4 py-3 transition hover:opacity-90 ${
                    alert.error
                      ? "border-amber-500/30 bg-amber-500/10"
                      : alert.tone === "critical"
                        ? "border-red-500/30 bg-red-500/10"
                        : alert.tone === "warning"
                          ? "border-amber-500/25 bg-amber-500/10"
                          : "border-[var(--admin-border)] bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--admin-text)]">{alert.label}</span>
                    <span
                      className={`text-lg font-black ${
                        alert.error
                          ? "text-amber-200"
                          : alert.tone === "critical"
                            ? "text-red-200"
                            : "text-amber-200"
                      }`}
                    >
                      {alert.error ? "Unavailable" : alert.count}
                    </span>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <AdminStatCard
          title="Today revenue"
          value={stats?.financialDashboard ? formatGbp(stats.financialDashboard.todayRevenue) : "…"}
          href="/admin/integrations/truenumeris"
        />
        <AdminStatCard
          title="Monthly revenue"
          value={stats?.financialDashboard ? formatGbp(stats.financialDashboard.monthlyRevenue) : "…"}
          href="/admin/integrations/truenumeris"
        />
        <AdminStatCard
          title="Inbox"
          value={stats?.inboxUnread ?? "…"}
          detail={stats ? `${stats.messagesUnread} chat messages` : undefined}
          href="/admin/inbox"
        />
        <AdminStatCard
          title="Support tickets"
          value={stats?.supportTickets ?? (stats ? "Unavailable" : "…")}
          href="/admin/support"
        />
      </section>

      {stats?.partialData ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[var(--admin-radius)] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          Some dashboard signals could not be loaded. Unavailable values are shown explicitly — they are not zeros.
        </div>
      ) : null}

      <AdminCard padding="lg">
        <div className="mb-6">
          <p className="admin-meta">Workspace</p>
          <h3 className="admin-section-title mt-1">Admin modules</h3>
        </div>
        <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-4">
          {moduleGroups.map((group) => (
            <div key={group.label}>
              <p className="admin-meta mb-3">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-[var(--admin-radius)] border border-transparent px-3 py-2.5 transition hover:border-[var(--admin-border)] hover:bg-white/[0.03]"
                    >
                      <span className="block text-sm font-semibold text-[var(--admin-text)]">{item.title}</span>
                      <span className="admin-body mt-0.5 block text-xs">{item.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </AdminCard>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-5">
          <AdminSectionCard title="Learning activity" eyebrow="Signals">
            {activityByType.length > 0 ? (
              <div className="space-y-4">
                {activityByType.map((item) => {
                  const max = Math.max(...activityByType.map((entry) => entry.value), 1);
                  const pct = Math.max(8, (item.value / max) * 100);
                  return (
                    <div key={item.label}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <span className="capitalize text-[var(--admin-muted)]">{item.label}</span>
                        <span className="font-semibold text-[var(--admin-text)]">{item.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--admin-rail)" }}>
                        <div className="h-full rounded-full bg-[var(--admin-primary)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <AdminEmptyState
                title="No learner activity yet"
                description="Progress appears here once children start lessons."
                actionLabel="Open Students"
                href="/admin/students"
              />
            )}
          </AdminSectionCard>

          <AdminSectionCard title="Attention areas" eyebrow="Learning">
            {weakSignals.length > 0 ? (
              <ul className="divide-y divide-[var(--admin-border)]">
                {weakSignals.map((item) => (
                  <li key={`${item.label}-${item.detail}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-[var(--admin-text)]">{item.label}</span>
                    <span className="text-xs font-semibold text-[var(--admin-muted)]">{item.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <AdminEmptyState
                title="No weak areas yet"
                description="Spelling and maths gaps will surface after more learner activity."
                actionLabel="Open AI Generator"
                href="/admin/ai-generator"
              />
            )}
          </AdminSectionCard>
        </div>

        <aside className="space-y-5">
          <AdminSectionCard title="Confidence">
            <div className="space-y-3 text-sm">
              {[
                ["Learning confidence", stats?.sessionSignalsSummary?.confidenceTrend ?? "—"],
                ["Engagement", stats?.sessionSignalsSummary?.engagementLevel ?? "—"],
                ["Frustration", stats?.sessionSignalsSummary?.frustrationSignals ?? "—"],
                ["Mood", (stats?.sessionSignalsSummary?.dominantMood ?? "—").replace("_", " ")],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] pb-2.5 last:border-0 last:pb-0">
                  <span className="text-[var(--admin-muted)]">{label}</span>
                  <span className="font-semibold capitalize text-[var(--admin-text)]">{value}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Platform status">
            {healthError ? (
              <p className="rounded-[var(--admin-radius)] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Platform status is unavailable. Do not assume services are healthy.
              </p>
            ) : !health ? (
              <p className="text-sm text-[var(--admin-muted)]">Checking platform status…</p>
            ) : (
              <div className="space-y-2.5 text-sm">
                {[
                  ["Database", health.integrations.database.status],
                  ["OpenAI", health.integrations.openai.status],
                  ["Payments", health.integrations.payments.status],
                  ["Email", health.integrations.email.status],
                ].map(([label, status]) => {
                  const meta = INTEGRATION_LABELS[status] ?? INTEGRATION_LABELS.unknown;
                  return (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-[var(--admin-muted)]">{label}</span>
                      <span className={`font-semibold ${meta.tone}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminSectionCard>

          <AdminSectionCard title="Cron & jobs">
            {healthError ? (
              <p className="text-sm text-amber-200">Cron health unavailable.</p>
            ) : !health ? (
              <p className="text-sm text-[var(--admin-muted)]">Checking cron health…</p>
            ) : (
              <div className="space-y-2.5 text-sm">
                {health.crons.map((cron) => {
                  const meta = CRON_STATUS_LABELS[cron.status] ?? CRON_STATUS_LABELS.never_run;
                  return (
                    <div key={cron.job} className="flex items-center justify-between gap-3">
                      <span className="text-[var(--admin-muted)]">{cron.label}</span>
                      <span className={`font-semibold ${meta.tone}`}>
                        {meta.label}
                        {cron.ageMinutes !== null ? ` · ${cron.ageMinutes}m` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminSectionCard>

          <AdminSectionCard title="Recent activity">
            {stats && stats.recentActivity.length > 0 ? (
              <div className="space-y-2.5">
                {stats.recentActivity.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] px-3 py-2.5"
                    style={{ background: "var(--admin-rail)" }}
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold text-[var(--admin-text)]">{item.childName}</span>
                      <span className="shrink-0 text-xs text-[var(--admin-muted)]">{timeAgo(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-[var(--admin-muted)]">{item.activityType} · {item.activityName}</p>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState title="No recent activity" description="Learner sessions will appear here as they complete tasks." />
            )}
          </AdminSectionCard>
        </aside>
      </section>
    </div>
  );
}
