'use client';

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";

type PortalSection =
  | "dashboard"
  | "children"
  | "billing"
  | "progress"
  | "tutor-history"
  | "rewards"
  | "consent"
  | "messages"
  | "notifications"
  | "support"
  | "security";

type AccountPayload = {
  account: {
    id: string;
    name: string;
    email: string;
    linkedChildrenCount: number;
    subscriptionStatus: string;
    subscriptionState: string;
    childLimit: number;
    renewalDate: string | null;
  };
  activeChild: { id: string; name: string; avatar: string | null } | null;
  notifications: {
    emailWeeklyReport: boolean;
    assignmentAlerts: boolean;
    productUpdates: boolean;
  };
};

type ChildListResponse = {
  children: Array<{ id: string; name: string; avatar: string | null; archived?: boolean }>;
  activeChildId: string | null;
};

type SubscriptionPayload = {
  subscription: {
    planName: string;
    badge: string;
    status: string;
    childLimit: number;
    childrenUsed: number;
    upgradeRequired: boolean;
    reason: string | null;
    renewalDate: string | null;
    trialEndsAt: string | null;
  };
  plans: Array<{
    key: string;
    name: string;
    childLimit: number;
    description: string;
    features: string[];
    monthlyPricePence: number;
    yearlyPricePence: number | null;
  }>;
};

type ConsentPayload = {
  accepted: boolean;
  version: string | null;
  acceptedAt: string | null;
  withdrawnAt: string | null;
};

type SupportTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
};

type MessageThread = {
  id: string;
  channel: "text" | "whatsapp";
  contactLabel: string | null;
  contactAddress: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
};

type ChildDetail = {
  child: {
    id: string;
    name: string;
    avatar: string | null;
    age: number | null;
    level: string | null;
    archived: boolean;
  };
  progressRecords: Array<{ id: string; skill: string; level: string; score: number; updatedAt: string }>;
  walletSummary: { balance: number; earned: number; spent: number };
  recentLevelDecisions: Array<{ id: string; reason: string | null; createdAt: string }>;
  purchaseHistory: Array<{ 
    id: string; 
    itemName: string; 
    cost: number; 
    createdAt: string;
    approvalStatus?: "pending" | "approved" | "rejected";
    reviewNote?: string;
  }>;
};

type InsightsPayload = {
  strengths: Array<{ topic: string; accuracy: number; attempts: number }>;
  weaknesses: Array<{ topic: string; accuracy: number; attempts: number }>;
  averageAccuracy: number;
  totalAttempts: number;
  learningMode: string | null;
  activity: Array<{ date: string; count: number }>;
  lastActivityAt: string | null;
};

const sections: Array<{ id: PortalSection; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "children", label: "Children" },
  { id: "billing", label: "Billing" },
  { id: "progress", label: "Progress" },
  { id: "tutor-history", label: "Tutor history" },
  { id: "rewards", label: "Rewards" },
  { id: "consent", label: "Consent" },
  { id: "messages", label: "Messages" },
  { id: "notifications", label: "Notifications" },
  { id: "support", label: "Support" },
  { id: "security", label: "Security" },
];

function currency(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
}

function formatLastActivity(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function sectionLabel(section: PortalSection) {
  return sections.find((item) => item.id === section)?.label ?? "Dashboard";
}

export default function ParentPortalShell({ section }: { section: PortalSection }) {
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [children, setChildren] = useState<ChildListResponse | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionPayload | null>(null);
  const [consent, setConsent] = useState<ConsentPayload | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [notificationsDraft, setNotificationsDraft] = useState({
    emailWeeklyReport: true,
    assignmentAlerts: true,
    productUpdates: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [accountRes, childrenRes, subscriptionRes, consentRes, ticketsRes, messagesRes] = await Promise.all([
        fetch("/api/account", { credentials: "include" }),
        fetch("/api/children", { credentials: "include" }),
        fetch("/api/subscription", { credentials: "include" }),
        fetch("/api/consent", { credentials: "include" }),
        fetch("/api/parent/support", { credentials: "include" }),
        fetch("/api/parent/messages", { credentials: "include" }),
      ]);

      if (cancelled) return;

      if (accountRes.ok) {
        const payload = (await accountRes.json()) as AccountPayload;
        setAccount(payload);
        setNameDraft(payload.account.name);
        setNotificationsDraft(payload.notifications);
        setSelectedChildId(payload.activeChild?.id ?? null);
      }

      if (childrenRes.ok) {
        setChildren((await childrenRes.json()) as ChildListResponse);
      }

      if (subscriptionRes.ok) {
        setSubscription((await subscriptionRes.json()) as SubscriptionPayload);
      }

      if (consentRes.ok) {
        setConsent((await consentRes.json()) as ConsentPayload);
      }

      if (ticketsRes.ok) {
        const payload = (await ticketsRes.json()) as { tickets: SupportTicket[] };
        setTickets(payload.tickets ?? []);
      }

      if (messagesRes.ok) {
        const payload = (await messagesRes.json()) as { threads: MessageThread[] };
        setThreads(payload.threads ?? []);
      }

      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedChildId) return;

    let cancelled = false;

    async function loadChild() {
      const [childRes, insightsRes] = await Promise.all([
        fetch(`/api/children/${selectedChildId}/data`, { credentials: "include" }),
        fetch("/api/parent/insights", { credentials: "include" }),
      ]);
      
      if (cancelled) return;
      
      if (childRes.ok) {
        setChildDetail((await childRes.json()) as ChildDetail);
      }
      
      if (insightsRes.ok) {
        setInsights((await insightsRes.json()) as InsightsPayload);
      }
    }

    void loadChild();

    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  const activeChild = useMemo(() => {
    if (!children?.children?.length) return null;
    return children.children.find((child) => child.id === selectedChildId) ?? children.children[0] ?? null;
  }, [children, selectedChildId]);

  async function saveAccountPatch(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) return;
      const refreshed = await fetch("/api/account", { credentials: "include" });
      if (refreshed.ok) setAccount((await refreshed.json()) as AccountPayload);
    } finally {
      setSaving(false);
    }
  }

  async function downloadProgressReport() {
    if (!selectedChildId) return;
    setReportDownloading(true);
    try {
      const response = await fetch(
        `/api/parent/reports/export?childId=${encodeURIComponent(selectedChildId)}&range=30d&format=pdf`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        window.alert(payload?.error ?? "Unable to generate report.");
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const nameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = nameMatch?.[1] ?? `starliz-progress-report-${selectedChildId}.pdf`;

      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } finally {
      setReportDownloading(false);
    }
  }

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportSubject.trim() || !supportBody.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/parent/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject: supportSubject, message: supportBody }),
      });
      setSupportSubject("");
      setSupportBody("");
      const refreshed = await fetch("/api/parent/support", { credentials: "include" });
      if (refreshed.ok) {
        const payload = (await refreshed.json()) as { tickets: SupportTicket[] };
        setTickets(payload.tickets ?? []);
      }
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = sectionLabel(section);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_35%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.4em] text-cyan-300">Parent portal</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">{sectionTitle}</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                A single place for children, billing, progress, consent, support, and account settings.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Children" value={account?.account.linkedChildrenCount ?? 0} />
              <StatCard label="Subscription" value={account?.account.subscriptionStatus ?? "loading"} />
              <StatCard label="Consent" value={consent?.accepted ? "Accepted" : "Pending"} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            {sections.map((item) => (
              <Link
                key={item.id}
                href={item.id === "dashboard" ? "/parent/dashboard" : `/parent/${item.id}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${item.id === section ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:px-8 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-6">
          {loading ? (
            <Panel title="Loading portal" description="Fetching your account, children, and school support data."></Panel>
          ) : null}

          {section === "dashboard" ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="Active child" description="Switch between children and review the latest activity.">
                  <ChildPicker profiles={children?.children ?? []} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
                  {activeChild ? (
                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      <p>Current child: <span className="font-semibold text-white">{activeChild.name}</span></p>
                      {insights?.lastActivityAt && (
                        <p>Last active: <span className="font-semibold text-cyan-400">{formatLastActivity(insights.lastActivityAt)}</span></p>
                      )}
                    </div>
                  ) : null}
                </Panel>
                <Panel title="Plan and billing" description="Check renewal status and available child limit.">
                  <div className="space-y-3 text-sm text-slate-300">
                    <p>Plan: <span className="font-semibold text-white">{subscription?.subscription.planName ?? account?.account.subscriptionStatus ?? "Loading"}</span></p>
                    <p>Children used: <span className="font-semibold text-white">{subscription?.subscription.childrenUsed ?? 0}/{subscription?.subscription.childLimit ?? account?.account.childLimit ?? 0}</span></p>
                    <p>Renewal: <span className="font-semibold text-white">{subscription?.subscription.renewalDate ? new Date(subscription.subscription.renewalDate).toLocaleDateString() : "No renewal set"}</span></p>
                  </div>
                </Panel>
              </div>
              
              {selectedChildId && insights ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title="Focus areas" description={`Top ${Math.min(5, insights.weaknesses.length)} areas to work on`}>
                    {insights.weaknesses.length > 0 ? (
                      <div className="space-y-2">
                        {insights.weaknesses.slice(0, 5).map((weakness) => (
                          <div key={weakness.topic} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                            <span className="text-slate-300">{weakness.topic}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-red-500" style={{ width: `${weakness.accuracy}%` }}></div>
                              </div>
                              <span className="w-12 text-right font-semibold text-red-400">{weakness.accuracy}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="No weak areas detected—great job!" />
                    )}
                  </Panel>
                  
                  <Panel title="Strengths" description={`Top ${Math.min(5, insights.strengths.length)} areas of strength`}>
                    {insights.strengths.length > 0 ? (
                      <div className="space-y-2">
                        {insights.strengths.slice(0, 5).map((strength) => (
                          <div key={strength.topic} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                            <span className="text-slate-300">{strength.topic}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-green-500" style={{ width: `${strength.accuracy}%` }}></div>
                              </div>
                              <span className="w-12 text-right font-semibold text-green-400">{strength.accuracy}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState text="No strength data yet." />
                    )}
                  </Panel>
                </div>
              ) : null}
              
              {selectedChildId && insights ? (
                <Panel title="Learning summary" description="Overall progress and activity metrics">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Average accuracy" value={`${insights.averageAccuracy}%`} />
                    <Metric label="Total attempts" value={String(insights.totalAttempts)} />
                    <Metric label="Learning mode" value={insights.learningMode ?? "Standard"} />
                  </div>
                  <div className="mt-4">
                    <Button type="button" onClick={() => void downloadProgressReport()} disabled={reportDownloading}>
                      {reportDownloading ? "Preparing Report..." : "Download Progress Report"}
                    </Button>
                  </div>
                </Panel>
              ) : null}
              
              {selectedChildId && insights && insights.activity.length > 0 ? (
                <Panel title="30-day activity" description="Daily learning attempts over the past month">
                  <div className="space-y-3">
                    <div className="flex h-40 items-end gap-1">
                      {insights.activity.map((day) => {
                        const maxCount = Math.max(...insights.activity.map((d) => d.count), 1);
                        const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                        return (
                          <div key={day.date} className="flex-1" title={`${day.date}: ${day.count} attempts`}>
                            <div
                              className="w-full bg-gradient-to-t from-cyan-500 to-cyan-300 rounded-t-sm transition hover:opacity-80"
                              style={{ height: `${height}%`, minHeight: day.count > 0 ? "4px" : "0px" }}
                            ></div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{insights.activity[0]?.date}</span>
                      <span>{insights.activity[insights.activity.length - 1]?.date}</span>
                    </div>
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {section === "children" ? (
            <Panel title="Children" description="Manage child profiles and choose the active profile.">
              <ChildPicker profiles={children?.children ?? []} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(children?.children ?? []).map((child) => (
                  <article key={child.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="font-semibold text-white">{child.name}</p>
                    <p className="text-sm text-slate-400">{child.archived ? "Archived" : "Active"}</p>
                  </article>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === "billing" ? (
            <Panel title="Billing" description="Review your plan and upgrade path.">
              <div className="grid gap-3 md:grid-cols-2">
                <Metric label="Status" value={subscription?.subscription.status ?? account?.account.subscriptionState ?? "active"} />
                <Metric label="Upgrade" value={subscription?.subscription.upgradeRequired ? "Required" : "Not required"} />
                <Metric label="Reason" value={subscription?.subscription.reason ?? "Within plan limits"} />
                <Metric label="Trial ends" value={subscription?.subscription.trialEndsAt ? new Date(subscription.subscription.trialEndsAt).toLocaleDateString() : "N/A"} />
              </div>
              <div className="mt-4 space-y-2">
                {(subscription?.plans ?? []).map((plan) => (
                  <div key={plan.key} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{plan.name}</p>
                      <p>{currency(plan.monthlyPricePence)}/mo</p>
                    </div>
                    <p className="mt-1">{plan.description}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === "progress" ? (
            <>
              <Panel title="Progress" description="See the selected child's recent learning records.">
                <div className="mb-4">
                  <Button type="button" onClick={() => void downloadProgressReport()} disabled={!selectedChildId || reportDownloading}>
                    {reportDownloading ? "Preparing Report..." : "Download Progress Report"}
                  </Button>
                </div>
                {childDetail ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {childDetail.progressRecords.slice(0, 6).map((record) => (
                      <Metric key={record.id} label={record.skill} value={`${record.level} • ${record.score}%`} />
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Choose a child to load recent progress." />
                )}
              </Panel>

              {childDetail && childDetail.progressRecords.length > 0 ? (
                <Panel title="Subject-skill breakdown" description="All skills organized by subject with accuracy scores">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Subject</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Skill</th>
                          <th className="px-4 py-2 text-left font-semibold text-slate-300">Level</th>
                          <th className="px-4 py-2 text-right font-semibold text-slate-300">Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {childDetail.progressRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 text-slate-400">{record.skill.split("_")[0] ?? "General"}</td>
                            <td className="px-4 py-3 text-slate-300">{record.skill}</td>
                            <td className="px-4 py-3 text-slate-300">{record.level}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={record.score >= 80 ? "text-green-400 font-semibold" : record.score >= 60 ? "text-yellow-400" : "text-red-400"}>
                                {record.score}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {section === "tutor-history" ? (
            <Panel title="Tutor history" description="Recent level decisions and learning adjustments.">
              <div className="space-y-3">
                {(childDetail?.recentLevelDecisions ?? []).map((decision) => (
                  <div key={decision.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <p className="text-white">{decision.reason ?? "Auto level decision"}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(decision.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === "rewards" ? (
            <>
              <Panel title="Rewards" description="Wallet balance and purchases for the selected child.">
                {childDetail ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Balance" value={currency(childDetail.walletSummary.balance)} />
                    <Metric label="Earned" value={currency(childDetail.walletSummary.earned)} />
                    <Metric label="Spent" value={currency(childDetail.walletSummary.spent)} />
                  </div>
                ) : (
                  <EmptyState text="Select a child to see rewards and wallet history." />
                )}
              </Panel>

              {childDetail && childDetail.purchaseHistory.some((p) => p.approvalStatus === "pending") ? (
                <Panel title="Pending approvals" description="Purchases awaiting admin review">
                  <div className="space-y-3">
                    {childDetail.purchaseHistory
                      .filter((p) => p.approvalStatus === "pending")
                      .map((purchase) => (
                        <div key={purchase.id} className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{purchase.itemName}</p>
                              <p className="mt-1 text-xs text-slate-400">{new Date(purchase.createdAt).toLocaleString()}</p>
                            </div>
                            <p className="font-semibold text-yellow-400">{currency(purchase.cost)}</p>
                          </div>
                          {purchase.reviewNote ? (
                            <p className="mt-2 text-xs text-yellow-300">Admin note: {purchase.reviewNote}</p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {section === "consent" ? (
            <Panel title="Consent" description="Track parental consent status and version history.">
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Status" value={consent?.accepted ? "Accepted" : "Pending"} />
                <Metric label="Version" value={consent?.version ?? "Unknown"} />
                <Metric label="Accepted at" value={consent?.acceptedAt ? new Date(consent.acceptedAt).toLocaleString() : "N/A"} />
              </div>
              <form
                className="mt-4 flex flex-wrap gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSaving(true);
                  try {
                    await fetch("/api/consent", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ accepted: true }),
                    });
                    const refreshed = await fetch("/api/consent", { credentials: "include" });
                    if (refreshed.ok) setConsent((await refreshed.json()) as ConsentPayload);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Button type="submit" disabled={saving}>{consent?.accepted ? "Refresh consent" : "Accept consent"}</Button>
              </form>
            </Panel>
          ) : null}

          {section === "messages" ? (
            <Panel title="Messages" description="Parent message threads connected to your account.">
              <div className="space-y-3">
                {threads.map((thread) => (
                  <div key={thread.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{thread.contactLabel ?? thread.contactAddress}</p>
                      <p>{thread.unreadCount} unread</p>
                    </div>
                    <p className="mt-2">{thread.lastMessage}</p>
                  </div>
                ))}
                {!threads.length ? <EmptyState text="No conversation threads yet. Support tickets still work from the support tab." /> : null}
              </div>
            </Panel>
          ) : null}

          {section === "notifications" ? (
            <Panel title="Notifications" description="Control weekly reports and alert preferences.">
              <form
                className="space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await saveAccountPatch({ notifications: notificationsDraft });
                }}
              >
                <ToggleRow label="Weekly report" checked={notificationsDraft.emailWeeklyReport} onChange={(checked) => setNotificationsDraft((value) => ({ ...value, emailWeeklyReport: checked }))} />
                <ToggleRow label="Assignment alerts" checked={notificationsDraft.assignmentAlerts} onChange={(checked) => setNotificationsDraft((value) => ({ ...value, assignmentAlerts: checked }))} />
                <ToggleRow label="Product updates" checked={notificationsDraft.productUpdates} onChange={(checked) => setNotificationsDraft((value) => ({ ...value, productUpdates: checked }))} />
                <Button type="submit" disabled={saving}>Save notifications</Button>
              </form>
            </Panel>
          ) : null}

          {section === "support" ? (
            <Panel title="Support" description="Submit a ticket or review the latest ones.">
              <form className="space-y-3" onSubmit={submitSupport}>
                <input className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Subject" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} />
                <textarea className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Describe the issue" value={supportBody} onChange={(event) => setSupportBody(event.target.value)} />
                <Button type="submit" disabled={saving}>Send support ticket</Button>
              </form>
              <div className="mt-6 space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{ticket.subject}</p>
                      <p>{ticket.status}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Priority: {ticket.priority}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {section === "security" ? (
            <Panel title="Security" description="Update your profile name and password.">
              <form className="space-y-3" onSubmit={async (event) => {
                event.preventDefault();
                await saveAccountPatch({ name: nameDraft });
              }}>
                <input className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
                <Button type="submit" disabled={saving}>Save name</Button>
              </form>
              <form
                className="mt-6 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const currentPassword = String(form.get("currentPassword") ?? "");
                  const newPassword = String(form.get("newPassword") ?? "");
                  if (!currentPassword || !newPassword) return;
                  await fetch("/api/account/password", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ currentPassword, newPassword }),
                  });
                  event.currentTarget.reset();
                }}
              >
                <input name="currentPassword" type="password" autoComplete="current-password" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="Current password" />
                <input name="newPassword" type="password" autoComplete="new-password" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="New password" />
                <Button type="submit" disabled={saving}>Update password</Button>
              </form>
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Panel title="Quick facts" description="Current account and portal snapshot.">
            <div className="space-y-3 text-sm text-slate-300">
              <p>Name: <span className="font-semibold text-white">{account?.account.name ?? "Loading"}</span></p>
              <p>Email: <span className="font-semibold text-white">{account?.account.email ?? "Loading"}</span></p>
              <p>Children: <span className="font-semibold text-white">{account?.account.linkedChildrenCount ?? 0}</span></p>
              <p>Active child: <span className="font-semibold text-white">{activeChild?.name ?? account?.activeChild?.name ?? "None"}</span></p>
            </div>
          </Panel>

          <Panel title="Navigation" description="Jump directly to the remaining portal areas.">
            <div className="grid gap-2">
              {sections.map((item) => (
                <Link key={item.id} href={item.id === "dashboard" ? "/parent/dashboard" : `/parent/${item.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
                  {item.label}
                </Link>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/30">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ChildPicker({ profiles, selectedChildId, setSelectedChildId }: { profiles: ChildListResponse["children"]; selectedChildId: string | null; setSelectedChildId: (value: string) => void; }) {
  if (!profiles.length) {
    return <EmptyState text="No child profiles are linked yet." />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {profiles.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => setSelectedChildId(child.id)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${selectedChildId === child.id ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-white/10 bg-slate-900 text-slate-300 hover:bg-white/10 hover:text-white"}`}
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void; }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">{text}</p>;
}