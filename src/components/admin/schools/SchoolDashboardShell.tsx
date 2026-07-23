"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { canDo, getSchoolRoleLabel, type SchoolRole } from "@/lib/schools/permissions";
import { useSchoolDashboardRecord, SchoolDashboardProvider, type SchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type TabKey =
  | "dashboard"
  | "assignments"
  | "timetable"
  | "attendance"
  | "attendance-activity"
  | "compliance"
  | "billing-licence"
  | "settings"
  | "learning"
  | "interventions"
  | "governance"
  | "ai-intelligence"
  | "reports"
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
  const invitedCount = school.teachers.filter((row: { status: string }) => row.status === "invited").length;
  const activeStaffCount = school.teachers.filter((row: { status: string }) => row.status === "active").length;
  if (activeStaffCount > 0 && invitedCount > 0) return "Invites Sent";
  if (activeStaffCount > 0) return "Active";
  if (invitedCount > 0) return "Invites Sent";
  if (school.classrooms.length > 0 || school.students.length > 0) return "Setup in Progress";
  return "Draft";
}

export default function SchoolDashboardShell({ schoolId, activeTab, title, subtitle, children }: Props) {
  return (
    <SchoolDashboardProvider schoolId={schoolId}>
      <SchoolDashboardShellInner schoolId={schoolId} activeTab={activeTab} title={title} subtitle={subtitle}>
        {children}
      </SchoolDashboardShellInner>
    </SchoolDashboardProvider>
  );
}

function SchoolDashboardShellInner({ schoolId, activeTab, title, subtitle, children }: Props) {
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId);
  const [viewAsRole, setViewAsRole] = useState<SchoolRole>("owner");

  const tabs = useMemo<TabItem[]>(() => {
    return [
      { key: "dashboard", label: "Overview", href: `/admin/schools/${schoolId}/dashboard` },
      { key: "timetable", label: "Timetable", href: `/admin/schools/${schoolId}/timetable` },
      { key: "attendance", label: "Day attendance", href: `/admin/schools/${schoolId}/attendance` },
      { key: "students", label: "Students", href: `/admin/schools/${schoolId}/students` },
      { key: "staff", label: "Teachers", href: `/admin/schools/${schoolId}/staff` },
      { key: "classrooms", label: "Classes", href: `/admin/schools/${schoolId}/classrooms` },
      { key: "assignments", label: "Assignments", href: `/admin/schools/${schoolId}/assignments` },
      { key: "attendance-activity", label: "Attendance Intelligence", href: `/admin/schools/${schoolId}/attendance-activity` },
      { key: "safeguarding", label: "Safeguarding", href: `/admin/schools/${schoolId}/safeguarding` },
      { key: "governance", label: "Governance", href: `/admin/schools/${schoolId}/governance` },
      { key: "compliance", label: "Compliance", href: `/admin/schools/${schoolId}/compliance` },
      { key: "billing-licence", label: "Billing / Licence", href: `/admin/schools/${schoolId}/billing-licence` },
      { key: "reports", label: "Reports", href: `/admin/schools/${schoolId}/reports` },
      { key: "settings", label: "Settings", href: `/admin/schools/${schoolId}/settings` },
    ];
  }, [schoolId]);

  const roleOptions = useMemo<SchoolRole[]>(
    () => ["owner", "admin", "teacher", "support", "staff_observer", "finance"],
    [],
  );

  const commandTabs = useMemo(() => {
    return tabs.filter((tab) => {
      if (tab.key === "dashboard") return canDo(viewAsRole, "viewDashboard");
      if (tab.key === "timetable") return canDo(viewAsRole, "viewClassrooms") || canDo(viewAsRole, "viewProgress") || canDo(viewAsRole, "viewDashboard");
      if (tab.key === "attendance") return canDo(viewAsRole, "viewClassrooms") || canDo(viewAsRole, "viewDashboard") || canDo(viewAsRole, "viewReports");
      if (tab.key === "students") return canDo(viewAsRole, "viewStudents");
      if (tab.key === "staff") return canDo(viewAsRole, "manageTeachers");
      if (tab.key === "classrooms") return canDo(viewAsRole, "viewClassrooms") || canDo(viewAsRole, "manageClassrooms");
      if (tab.key === "assignments") return canDo(viewAsRole, "viewProgress") || canDo(viewAsRole, "viewStudents");
      if (tab.key === "attendance-activity") return canDo(viewAsRole, "viewReports") || canDo(viewAsRole, "viewDashboard");
      if (tab.key === "safeguarding") return canDo(viewAsRole, "manageSafeguarding");
      if (tab.key === "governance") return canDo(viewAsRole, "manageSchoolSettings") || canDo(viewAsRole, "viewAuditLog");
      if (tab.key === "compliance") return canDo(viewAsRole, "viewAuditLog");
      if (tab.key === "billing-licence") return canDo(viewAsRole, "viewDashboard");
      if (tab.key === "reports") return canDo(viewAsRole, "viewReports");
      if (tab.key === "settings") return canDo(viewAsRole, "manageSchoolSettings") || canDo(viewAsRole, "viewDashboard");
      return true;
    });
  }, [tabs, viewAsRole]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-slate-100">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <Link href="/admin/schools" className="rounded-md border border-slate-600 bg-slate-950/70 px-2 py-1 font-semibold transition hover:border-slate-500 hover:text-white">
                Schools
              </Link>
              <span>&gt;</span>
              <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-slate-200">{school?.name ?? "School"}</span>
              <span>&gt;</span>
              <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 font-semibold text-sky-100">Dashboard</span>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">School Dashboard</p>
            <h1 className="mt-1 text-2xl font-black text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-300">
              View as role
              <select
                value={viewAsRole}
                onChange={(event) => setViewAsRole(event.target.value as SchoolRole)}
                className="ml-2 rounded-lg border border-slate-600 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-100"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{getSchoolRoleLabel(role)}</option>
                ))}
              </select>
            </label>
            <Link
              href="/admin/schools"
              className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Back to Schools
            </Link>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-slate-300">Loading school profile...</p> : null}
        {error ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => refresh()}
              className="rounded-md border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-50 hover:bg-rose-500/30"
            >
              Retry
            </button>
          </div>
        ) : null}

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
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-300">School Command Centre</p>
        <div className="flex flex-wrap gap-2">
          {commandTabs.map((tab) => (
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

        <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/schools/${schoolId}/students/new`} className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Add Student</Link>
          <Link href={`/admin/schools/${schoolId}/staff/new?role=teacher`} className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Add Teacher</Link>
          <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Create Class</Link>
          <Link href={`/admin/schools/${schoolId}/assignments/new`} className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Assign Lesson</Link>
          <Link href={`/admin/schools/${schoolId}/ai-intelligence`} className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Generate AI Content</Link>
          <Link href={`/admin/schools/${schoolId}/safeguarding`} className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20">Open Safeguarding</Link>
          <Link href={`/admin/schools/${schoolId}/governance`} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20">Open Governance</Link>
          <Link href={`/admin/schools/${schoolId}/reports`} className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20">View Reports</Link>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
        Role-aware view is active. Tab availability is filtered by permission matrix for the selected role profile.
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5">
        {children}
      </section>
    </main>
  );
}
