"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";

type Stats = {
  totalUsers: number;
  totalChildren: number;
  activeToday: number;
  avgAccuracy: number;
  lessonsCompleted: number;
  wordsGenerated: number;
  subscriptions: number;
  lessons: number;
  rewards: number;
  storeItems: number;
  supportTickets: number;
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
  };
};

function formatGbp(value: number): string {
  return `GBP ${value.toFixed(2)}`;
}

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
      { title: "AI Generator", description: "Generate, validate and approve learning content.", href: "/admin/ai" },
      { title: "Content Library", description: "Publish spelling, maths and reading assets.", href: "/admin/content" },
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
      { title: "Reports", description: "Progress, weak topics and exports.", href: "/admin/reports" },
      { title: "System Health", description: "OpenAI, Stripe, database and jobs.", href: "/admin/system-health" },
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

function statusTone(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("connected") || normalized === "online" || normalized === "protected") {
    return "text-emerald-300";
  }
  if (normalized.includes("not") || normalized.includes("fail") || normalized.includes("error")) {
    return "text-amber-300";
  }
  return "text-slate-200";
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const openAiStatus = stats?.apiKeyStatuses.openai ?? "not saved";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 45_000);

    setLoading(true);
    setError(null);

    fetch("/api/admin/stats", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          const body = await response.json().catch(() => null);
          const message = body?.error ?? (response.status === 401 ? "Unauthorized" : "Forbidden: admin only");
          throw new Error(message);
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = body?.error ?? `Unable to load admin stats (${response.status}).`;
          throw new Error(message);
        }
        return response.json() as Promise<Stats>;
      })
      .then((payload) => {
        if (cancelled) return;
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
    const isForbidden = /forbidden|admin only/i.test(error);
    return (
      <AdminSectionCard title="Dashboard unavailable">
        <p className="text-sm text-slate-400">{error}</p>
        {isForbidden ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-300">
              You are signed in as a parent or non-admin account. Refresh will not fix this — switch to an admin login.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
                  window.location.assign("/admin/login?next=/admin&reason=switch");
                }}
                className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/25"
              >
                Sign out and open admin login
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.assign("/parent/profiles");
                }}
                className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Go to parent portal
              </button>
            </div>
          </div>
        ) : null}
      </AdminSectionCard>
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-950/80 px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.12),transparent_45%),radial-gradient(ellipse_at_bottom_left,rgba(15,23,42,0.9),transparent_50%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/90">StarLiz command</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Platform overview</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              A quieter view of learners, schools, content and ops — start with Schools or Students when you need to act.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/schools"
              className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/25"
            >
              Open Schools
            </Link>
            <Link
              href="/admin/ai"
              className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              AI Generator
            </Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">At a glance</h3>
          <p className="text-xs text-slate-500">{loading ? "Loading platform signals…" : "Primary platform signals"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <AdminStatCard title="Parents" value={stats?.totalUsers ?? "…"} href="/admin/parents" />
          <AdminStatCard title="Learners" value={stats?.totalChildren ?? "…"} href="/admin/students" />
          <AdminStatCard title="Active today" value={stats?.activeToday ?? "…"} detail="Unique learners" href="/admin/reports" />
          <AdminStatCard title="Avg accuracy" value={stats ? `${stats.avgAccuracy}%` : "…"} href="/admin/reports" />
          <AdminStatCard title="Need support" value={stats?.studentsNeedingSupport ?? "…"} href="/admin/students?filter=support" />
          <AdminStatCard title="Subscriptions" value={stats?.subscriptions ?? "…"} href="/admin/subscriptions" />
        </div>
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
          value={stats?.supportTickets ?? "…"}
          href="/admin/support"
        />
      </section>

      <section className="rounded-3xl border border-slate-700/60 bg-slate-950/50 p-6 sm:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
            <h3 className="mt-1 text-xl font-semibold text-white">Admin modules</h3>
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-4">
          {moduleGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-xl border border-transparent px-3 py-2.5 transition hover:border-slate-700 hover:bg-slate-900/70"
                    >
                      <span className="block text-sm font-semibold text-white">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

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
                        <span className="capitalize text-slate-300">{item.label}</span>
                        <span className="font-semibold text-white">{item.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-sky-500/80" style={{ width: `${pct}%` }} />
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
              <ul className="divide-y divide-slate-800">
                {weakSignals.map((item) => (
                  <li key={`${item.label}-${item.detail}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-slate-200">{item.label}</span>
                    <span className="text-xs font-semibold text-slate-400">{item.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <AdminEmptyState
                title="No weak areas yet"
                description="Spelling and maths gaps will surface after more learner activity."
                actionLabel="Open AI Generator"
                href="/admin/ai"
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
                <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold capitalize text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Platform status">
            <div className="space-y-2.5 text-sm">
              {[
                ["Database", "Online"],
                ["Admin access", "Protected"],
                ["OpenAI", openAiStatus],
                ["Payments", stats?.apiKeyStatuses.payment ?? "not saved"],
                ["Email", stats?.apiKeyStatuses.email ?? "not saved"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-semibold capitalize ${statusTone(value)}`}>{value}</span>
                </div>
              ))}
            </div>
            {openAiStatus !== "connected" ? (
              <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                OpenAI is {openAiStatus}. Configure it in API Keys for reliable generation.
              </p>
            ) : null}
          </AdminSectionCard>

          <AdminSectionCard title="Recent activity">
            {stats && stats.recentActivity.length > 0 ? (
              <div className="space-y-2.5">
                {stats.recentActivity.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2.5">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-semibold text-white">{item.childName}</span>
                      <span className="shrink-0 text-xs text-slate-500">{timeAgo(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-slate-500">{item.activityType} · {item.activityName}</p>
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
