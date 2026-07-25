"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { canDo, getSchoolRoleLabel, type SchoolRole } from "@/lib/schools/permissions";
import { useSchoolDashboardRecord, type SchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";
import { AdminButtonLink, AdminCard, AdminPageHeader, AdminSelect } from "@/components/admin/ui";

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
  | "support"
  | "short-learning"
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
  if (normalized === "archived" || normalized === "cancelled") return "border-[var(--admin-border)] bg-white/5 text-[var(--admin-muted)]";
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
      { key: "support", label: "Support", href: `/admin/schools/${schoolId}/support` },
      { key: "short-learning", label: "Short Learning", href: `/admin/schools/${schoolId}/short-learning` },
      { key: "audit", label: "Audit", href: `/admin/schools/${schoolId}/audit` },
      { key: "communications", label: "Communications", href: `/admin/schools/${schoolId}/communications` },
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
      if (tab.key === "support") return canDo(viewAsRole, "viewHumanSupport");
      if (tab.key === "short-learning") return canDo(viewAsRole, "viewDashboard") || canDo(viewAsRole, "viewHumanSupport");
      if (tab.key === "audit") return canDo(viewAsRole, "viewAuditLog");
      if (tab.key === "communications") return canDo(viewAsRole, "viewDashboard") || canDo(viewAsRole, "manageSchoolSettings");
      if (tab.key === "governance") return canDo(viewAsRole, "manageSchoolSettings") || canDo(viewAsRole, "viewAuditLog");
      if (tab.key === "compliance") return canDo(viewAsRole, "viewAuditLog");
      if (tab.key === "billing-licence") return canDo(viewAsRole, "viewDashboard");
      if (tab.key === "reports") return canDo(viewAsRole, "viewReports");
      if (tab.key === "settings") return canDo(viewAsRole, "manageSchoolSettings") || canDo(viewAsRole, "viewDashboard");
      return false;
    });
  }, [tabs, viewAsRole]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AdminCard padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">
              <Link
                href="/admin/schools"
                className="rounded-md border border-[var(--admin-border)] px-2 py-1 font-semibold transition hover:border-[var(--admin-primary)]/40 hover:text-[var(--admin-text)]"
                style={{ background: "var(--admin-rail)" }}
              >
                Schools
              </Link>
              <span>›</span>
              <span className="rounded-md border border-[var(--admin-border)] px-2 py-1" style={{ background: "var(--admin-rail)" }}>
                {school?.name ?? "School"}
              </span>
              <span>›</span>
              <span className="rounded-md border border-[var(--admin-primary)]/40 bg-[var(--admin-primary-muted)] px-2 py-1 font-semibold text-[var(--admin-primary-hover)]">
                Dashboard
              </span>
            </div>
            <AdminPageHeader
              className="mb-0 mt-4"
              eyebrow="School Management"
              title={title}
              subtitle={subtitle}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-[var(--admin-muted)]">
              View as role
              <AdminSelect
                value={viewAsRole}
                onChange={(event) => setViewAsRole(event.target.value as SchoolRole)}
                className="ml-2 inline-block w-auto py-1.5 text-xs"
                aria-label="View as role"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{getSchoolRoleLabel(role)}</option>
                ))}
              </AdminSelect>
            </label>
            <AdminButtonLink href="/admin/schools" variant="secondary" size="sm">
              Back to Schools
            </AdminButtonLink>
          </div>
        </div>

        {loading ? <p className="admin-body mt-4">Loading school profile...</p> : null}
        {error ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--admin-radius)] border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
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
              {[
                { label: "School", body: <><p className="mt-1 text-sm font-semibold text-[var(--admin-text)]">{school.name}</p><p className="text-xs text-[var(--admin-muted)]">{school.slug}</p></> },
                { label: "Status", body: <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(school.status)}`}>{school.status}</span> },
                { label: "Licence", body: <><span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(school.licence?.status ?? "pilot")}`}>{school.licence?.status ?? "pilot"}</span><p className="mt-1 text-xs text-[var(--admin-muted)]">{school.licence?.provider ?? "manual"} · {school.licence?.billingInterval ?? "custom"}</p></> },
                { label: "Teachers", body: <p className="mt-1 text-xl font-bold text-[var(--admin-text)]">{school.teachers.filter((row) => row.status === "active").length}</p> },
                { label: "Students", body: <p className="mt-1 text-xl font-bold text-[var(--admin-text)]">{school.students.filter((row) => row.status === "active").length}</p> },
                { label: "Safeguarding Alerts", body: <><p className="mt-1 text-xl font-bold text-rose-200">{school.safeguarding.openAlerts}</p><p className="text-xs text-[var(--admin-muted)]">Critical: {school.safeguarding.criticalAlerts}</p></> },
              ].map((card) => (
                <article
                  key={card.label}
                  className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3"
                  style={{ background: "var(--admin-rail)" }}
                >
                  <p className="admin-meta">{card.label}</p>
                  {card.body}
                </article>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ["Onboarding Status", onboardingStatus(school)],
                ["Seats", `${school.licence?.seatsUsed ?? 0} / ${school.licence?.seatLimit || "∞"}`],
                ["Billing Window End", shortDate(school.licence?.currentPeriodEnd ?? null)],
              ].map(([label, value]) => (
                <article
                  key={label}
                  className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3 text-xs text-[var(--admin-muted)]"
                  style={{ background: "var(--admin-rail)" }}
                >
                  <p className="font-semibold text-[var(--admin-text)]">{label}</p>
                  <p className="mt-1">{value}</p>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </AdminCard>

      <AdminCard padding="sm">
        <p className="admin-meta mb-2 px-1">School Command Centre</p>
        <div className="flex flex-wrap gap-2">
          {commandTabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={[
                "rounded-[var(--admin-radius)] border px-3 py-1.5 text-xs font-semibold transition",
                activeTab === tab.key
                  ? "border-[var(--admin-primary)]/50 bg-[var(--admin-primary-muted)] text-[var(--admin-text)]"
                  : "border-[var(--admin-border)] text-[var(--admin-muted)] hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-text)]",
              ].join(" ")}
              style={activeTab === tab.key ? undefined : { background: "var(--admin-rail)" }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <p className="admin-meta mb-2 mt-4 px-1">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          <AdminButtonLink href={`/admin/schools/${schoolId}/students/new`} variant="secondary" size="sm">Add Student</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/staff/new?role=teacher`} variant="secondary" size="sm">Add Teacher</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/classrooms/new`} variant="secondary" size="sm">Create Class</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/assignments/new`} variant="secondary" size="sm">Assign Lesson</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/timetable#generate-lesson-content`} variant="secondary" size="sm">Generate lesson content</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/safeguarding`} variant="danger" size="sm">Open Safeguarding</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/governance`} variant="secondary" size="sm">Open Governance</AdminButtonLink>
          <AdminButtonLink href={`/admin/schools/${schoolId}/reports`} size="sm">View Reports</AdminButtonLink>
        </div>
      </AdminCard>

      <div className="rounded-[var(--admin-radius)] border border-[var(--admin-primary)]/25 bg-[var(--admin-primary-muted)] px-3 py-2 text-xs text-[var(--admin-text)]">
        Role-aware view is active. Tab availability is filtered by permission matrix for the selected role profile.
      </div>

      <AdminCard padding="lg">{children}</AdminCard>
    </div>
  );
}
