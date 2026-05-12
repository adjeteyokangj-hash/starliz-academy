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
};

const adminModules = [
  {
    title: "Parents",
    description: "Manage parent accounts, children, consent and activity.",
    href: "/admin/parents",
  },
  {
    title: "Students",
    description: "View child profiles, learning progress, stars, XP and weak areas.",
    href: "/admin/students",
  },
  {
    title: "Schools",
    description: "Manage schools, licences, classrooms, teacher access and student enrolments.",
    href: "/admin/schools",
  },
  {
    title: "AI Generator",
    description: "Generate, validate, repair and approve AI learning content.",
    href: "/admin/ai",
  },
  {
    title: "Content Library",
    description: "Review, edit, publish and assign spelling, maths and reading content.",
    href: "/admin/content",
  },
  {
    title: "Assignments",
    description: "Assign targeted content manually or from weak areas.",
    href: "/admin/assignments",
  },
  {
    title: "Subscriptions",
    description: "Track Stripe plans, failed payments and trial users.",
    href: "/admin/subscriptions",
  },
  {
    title: "Pricing",
    description: "Edit public plans, features, badges, Stripe price IDs and sort order.",
    href: "/admin/pricing",
  },
  {
    title: "Reports",
    description: "Review progress, weak topics and downloadable summaries.",
    href: "/admin/reports",
  },
  {
    title: "System Health",
    description: "Check OpenAI, Stripe, database, jobs, email and backups.",
    href: "/admin/system-health",
  },
  {
    title: "API Keys",
    description: "Manage provider keys and connection status safely.",
    href: "/admin/settings/integrations",
  },
  {
    title: "Audit Logs",
    description: "Track admin actions, publishing, billing and security events.",
    href: "/admin/audit-logs",
  },
  {
    title: "Production Checklist",
    description: "Confirm launch readiness before going live.",
    href: "/admin/settings/production-checklist",
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openAiStatus = stats?.apiKeyStatuses.openai ?? "not saved";

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace("/admin/login?next=/admin");
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
        if (payload) setStats(payload);
      })
      .catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load admin dashboard right now.");
      });
  }, []);

  const activityByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of stats?.recentActivity ?? []) {
      counts[item.activityType] = (counts[item.activityType] ?? 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [stats]);

  if (error) {
    return (
      <AdminSectionCard title="Dashboard unavailable">
        <p className="text-sm text-slate-400">{error}</p>
      </AdminSectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-700/70 bg-linear-to-br from-indigo-600/26 via-slate-900 to-sky-600/16 p-6 shadow-2xl shadow-slate-950/25">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-blue-200">Dashboard</p>
          <h2 className="mt-2 text-3xl font-black text-white">Platform overview</h2>
          <p className="mt-3 text-sm text-slate-300">
            Monitor parents, learners, content generation, progress signals, and operational alerts from one admin workspace.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AdminStatCard title="Total Parents" value={stats?.totalUsers ?? "..."} icon="P" tone="purple" href="/admin/parents" />
        <AdminStatCard title="Total Learners" value={stats?.totalChildren ?? "..."} icon="S" tone="blue" href="/admin/students" />
        <AdminStatCard title="Active Today" value={stats?.activeToday ?? "..."} icon="A" tone="green" detail="Unique learners" href="/admin/reports" />
        <AdminStatCard title="Average Accuracy" value={stats ? `${stats.avgAccuracy}%` : "..."} icon="%" tone="amber" href="/admin/reports" />
        <AdminStatCard title="Words Generated" value={stats?.wordsGenerated ?? "..."} icon="AI" tone="rose" href="/admin/ai" />
        <AdminStatCard title="Lessons Completed" value={stats?.lessonsCompleted ?? "..."} icon="L" tone="slate" href="/admin/content" />
        <AdminStatCard title="Need Support" value={stats?.studentsNeedingSupport ?? "..."} icon="!" tone="rose" href="/admin/students?filter=support" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard title="Subscriptions" value={stats?.subscriptions ?? "..."} icon="B" tone="blue" href="/admin/subscriptions" />
        <AdminStatCard title="Lessons" value={stats?.lessons ?? "..."} icon="L" tone="purple" href="/admin/content" />
        <AdminStatCard title="Rewards" value={stats?.rewards ?? "..."} icon="R" tone="amber" href="/admin/rewards" />
        <AdminStatCard title="Store Items" value={stats?.storeItems ?? "..."} icon="SH" tone="green" href="/admin/store" />
        <AdminStatCard title="Support Tickets" value={stats?.supportTickets ?? "..."} icon="T" tone="rose" href="/admin/support" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          title="Inbox Notifications"
          value={stats?.inboxUnread ?? "..."}
          icon="✉"
          tone="blue"
          detail={stats ? `${stats.inboxUnread} unread emails` : undefined}
          href="/admin/inbox"
        />
        <AdminStatCard
          title="Message Notifications"
          value={stats?.messagesUnread ?? "..."}
          icon="MS"
          tone="green"
          detail={stats ? `${stats.messageThreadsWithUnread} chats waiting` : undefined}
          href="/admin/messages"
        />
      </section>

      <section className="rounded-3xl border border-slate-800/80 bg-slate-900/55 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">MVP Core</p>
            <h3 className="mt-1 text-2xl font-black text-white">Admin modules</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/ai" className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500">
              Open AI Generator
            </Link>
            <Link href="/" className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800">
              Back to App
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminModules.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5 transition hover:border-blue-500/60 hover:bg-slate-950">
              <h4 className="text-lg font-black text-white">{item.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <AdminSectionCard title="Learning Activity Chart" eyebrow="Activity">
              {activityByType.length > 0 ? (
                <div className="space-y-4">
                  {activityByType.map((item) => {
                    const max = Math.max(...activityByType.map((entry) => entry.value), 1);
                    return (
                      <div key={item.label}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="capitalize text-slate-300">{item.label}</span>
                          <span className="font-bold text-white">{item.value}</span>
                        </div>
                        <progress
                          value={Math.max(12, (item.value / max) * 100)}
                          max={100}
                          className="h-3 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-linear-to-r [&::-webkit-progress-value]:from-indigo-500 [&::-webkit-progress-value]:to-sky-400 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-linear-to-r [&::-moz-progress-bar]:from-indigo-500 [&::-moz-progress-bar]:to-sky-400"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <AdminEmptyState
                  title="No learner activity yet"
                  description="Once children start spelling, maths or reading tasks, their progress will appear here."
                  actionLabel="Add Student"
                  href="/admin/students"
                />
              )}
            </AdminSectionCard>

            <AdminSectionCard title="Weakest Spelling Patterns" eyebrow="Spelling">
              {stats && stats.weakestPatterns.length > 0 ? (
                <div className="space-y-3">
                  {stats.weakestPatterns.map((item) => (
                    <div key={item.pattern} className="flex items-center justify-between rounded-xl bg-slate-950/45 px-3 py-2">
                      <span className="font-mono text-sm text-white">{item.pattern}</span>
                      <span className="text-sm font-bold text-rose-300">{item.count} errors</span>
                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  title="No spelling gaps yet"
                  description="Spelling weaknesses will appear after learners complete more word tasks."
                  actionLabel="Generate Content"
                  href="/admin/ai-generator"
                />
              )}
            </AdminSectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminSectionCard title="Maths Weaknesses" eyebrow="Maths">
              {stats?.topWeakSkillFocus.length ? (
                <div className="space-y-3">
                  {stats.topWeakSkillFocus.map((item) => (
                    <div key={item.skillFocus} className="flex items-center justify-between rounded-xl bg-slate-950/45 px-3 py-2">
                      <span className="text-sm text-white">{item.skillFocus}</span>
                      <span className="text-sm font-bold text-rose-300">{item.count} students</span>
                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  title="No weak areas yet"
                  description="Run weak-area detection after learners complete more tasks."
                  actionLabel="Detect Weak Areas"
                  href="/admin/ai-generator"
                />
              )}
            </AdminSectionCard>

            <AdminSectionCard title="Reading Progress" eyebrow="Reading">
              <AdminEmptyState
                title="No reading progress yet"
                description="Reading performance and comprehension patterns will appear here."
                actionLabel="Create Reading Task"
                href="/admin/ai-generator"
              />
            </AdminSectionCard>
          </div>
        </div>

        <aside className="space-y-6">
          <AdminSectionCard title="Learning Confidence Signals">
            <div className="space-y-3 text-sm">
              {[
                ["Learning Confidence", stats?.sessionSignalsSummary?.confidenceTrend ?? "-"],
                ["Engagement Level", stats?.sessionSignalsSummary?.engagementLevel ?? "-"],
                ["Frustration Signals", stats?.sessionSignalsSummary?.frustrationSignals ?? "-"],
                ["Dominant Mood", (stats?.sessionSignalsSummary?.dominantMood ?? "-").replace("_", " ")],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold capitalize text-white">{value}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Platform Status">
            <div className="space-y-3 text-sm">
              {[
                ["Database", "Online"],
                ["Admin access", "Protected"],
                ["Content review", "Pending workflow"],
                ["OpenAI", stats?.apiKeyStatuses.openai ?? "not saved"],
                ["Payments", stats?.apiKeyStatuses.payment ?? "not saved"],
                ["Email", stats?.apiKeyStatuses.email ?? "not saved"],
                ["Voice", stats?.apiKeyStatuses.voice ?? "not saved"],
                ["Storage", stats?.apiKeyStatuses.storage ?? "not saved"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-bold text-white">{value}</span>
                </div>
              ))}
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Recent Activity">
            {stats && stats.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl bg-slate-950/45 p-3">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-bold text-white">{item.childName}</span>
                      <span className="text-slate-500">{timeAgo(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs capitalize text-slate-400">{item.activityType} · {item.activityName}</p>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                title="No recent activity"
                description="Learner sessions will appear here as they complete tasks."
              />
            )}
          </AdminSectionCard>

          <AdminSectionCard title="Alerts">
            <div className="space-y-3 text-sm text-slate-300">
              {openAiStatus !== "connected" ? (
                <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                  OpenAI API key status is {openAiStatus}. Configure and test it in API Keys before AI generation works reliably.
                </p>
              ) : (
                <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                  OpenAI API key is connected.
                </p>
              )}
              <p className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3">Content approval workflow is ready to build in Content Library.</p>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="AI Usage / Cost Estimate">
            <div className="space-y-2">
              <p className="text-3xl font-black text-white">{stats?.generatedContent.length ?? 0}</p>
              <p className="text-sm text-slate-400">Recent generation batches tracked locally. Connect usage billing for live cost estimates.</p>
              <Link href="/admin/content-library" className="mt-3 inline-flex rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
                Review Content
              </Link>
            </div>
          </AdminSectionCard>
        </aside>
      </section>
    </div>
  );
}
