"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";

type SchoolDashboardRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  notes: string | null;
  licence: {
    status: string;
    seatLimit: number;
    seatsUsed: number;
    billingInterval: string;
    provider: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
  } | null;
  teachers: Array<{ id: string; status: string }>;
  students: Array<{ id: string; status: string }>;
  classrooms: Array<{ id: string; status: string }>;
  safeguarding: { openAlerts: number; criticalAlerts: number };
  communicationLogs: Array<{ id: string }>;
  activityTimeline: Array<{ id: string; createdAt: string }>;
};

type TabKey =
  | "dashboard"
  | "profile"
  | "staff"
  | "students"
  | "classrooms"
  | "parent-onboarding"
  | "safeguarding"
  | "communications"
  | "audit"
  | "readiness"
  | "roles"
  | "identity-access"
  | "developer-docs";

type TabItem = {
  key: TabKey;
  label: string;
  href: string;
};

type Props = {
  schoolId: string;
  activeTab: TabKey;
  title: string;
  subtitle: string;
  children: ReactNode;
};

function badgeClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "active") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (normalized === "pilot" || normalized === "trialing") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (normalized === "suspended" || normalized === "past_due") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (normalized === "archived" || normalized === "cancelled") return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function onboardingStatus(school: SchoolDashboardRecord): string {
  const invitedCount = school.teachers.filter((row) => row.status === "invited").length;
  const activeStaffCount = school.teachers.filter((row) => row.status === "active").length;
  if (activeStaffCount > 0 && invitedCount > 0) return "Invites Sent";
  if (activeStaffCount > 0) return "Active";
  if (invitedCount > 0) return "Invites Sent";
  if (school.classrooms.length > 0 || school.students.length > 0) return "Setup in Progress";
  return "Draft";
}

export default function SchoolDashboardShell({ schoolId, activeTab, title, subtitle, children }: Props) {
  const [school, setSchool] = useState<SchoolDashboardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tabs = useMemo<TabItem[]>(() => {
    return [
      { key: "dashboard", label: "Overview", href: `/admin/schools/${schoolId}/dashboard` },
      { key: "profile", label: "Profile", href: `/admin/schools/${schoolId}/profile` },
      { key: "staff", label: "Staff", href: `/admin/schools/${schoolId}/staff` },
      { key: "students", label: "Students", href: `/admin/schools/${schoolId}/students` },
      { key: "classrooms", label: "Classrooms", href: `/admin/schools/${schoolId}/classrooms` },
      { key: "parent-onboarding", label: "Parent Onboarding", href: `/admin/schools/${schoolId}/parent-onboarding` },
      { key: "safeguarding", label: "Safeguarding", href: `/admin/schools/${schoolId}/safeguarding` },
      { key: "communications", label: "Communications", href: `/admin/schools/${schoolId}/communications` },
      { key: "audit", label: "Audit", href: `/admin/schools/${schoolId}/audit` },
      { key: "readiness", label: "Readiness", href: `/admin/schools/${schoolId}/readiness` },
      { key: "roles", label: "Roles", href: `/admin/schools/${schoolId}/roles` },
      { key: "identity-access", label: "Identity Access", href: `/admin/schools/${schoolId}/identity-access` },
      { key: "developer-docs", label: "Developer Docs", href: `/admin/schools/${schoolId}/developer-docs` },
    ];
  }, [schoolId]);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/schools", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          setError("Unable to load school dashboard data.");
          return;
        }

        const payload = (await response.json()) as { schools?: SchoolDashboardRecord[] };
        const target = (payload.schools ?? []).find((row) => row.id === schoolId) ?? null;

        if (!active) return;

        if (!target) {
          setError("School not found.");
          setSchool(null);
          return;
        }

        setSchool(target);
      } catch {
        if (!active) return;
        setError("Unable to load school dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [schoolId]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-slate-100">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">School Dashboard</p>
            <h1 className="mt-1 text-2xl font-black text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
          </div>
          <Link
            href="/admin/schools"
            className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            Back to Schools & Governance
          </Link>
        </div>

        {loading ? <p className="mt-4 text-sm text-slate-300">Loading school profile...</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}

        {school ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">School</p>
                <p className="mt-1 text-sm font-semibold text-white">{school.name}</p>
                <p className="text-xs text-slate-400">{school.slug}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Status</p>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(school.status)}`}>
                  {school.status}
                </span>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Licence</p>
                <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(school.licence?.status ?? "pilot")}`}>
                  {school.licence?.status ?? "pilot"}
                </span>
                <p className="mt-1 text-xs text-slate-400">{school.licence?.provider ?? "manual"} · {school.licence?.billingInterval ?? "custom"}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Teachers</p>
                <p className="mt-1 text-xl font-black text-white">{school.teachers.filter((row) => row.status === "active").length}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Students</p>
                <p className="mt-1 text-xl font-black text-white">{school.students.filter((row) => row.status === "active").length}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Safeguarding Alerts</p>
                <p className="mt-1 text-xl font-black text-rose-200">{school.safeguarding.openAlerts}</p>
                <p className="text-xs text-slate-400">Critical: {school.safeguarding.criticalAlerts}</p>
              </article>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">Onboarding Status</p>
                <p className="mt-1">{onboardingStatus(school)}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">Seats</p>
                <p className="mt-1">{school.licence?.seatsUsed ?? 0} / {school.licence?.seatLimit || "∞"}</p>
              </article>
              <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">Billing Window End</p>
                <p className="mt-1">{shortDate(school.licence?.currentPeriodEnd ?? null)}</p>
              </article>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                activeTab === tab.key
                  ? "border-sky-400/60 bg-sky-500/15 text-sky-100"
                  : "border-slate-600 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
        Dashboard tabs are UI placeholders for routing and structure. Backend wiring for advanced workflows is pending.
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        {children}
      </section>
    </main>
  );
}
