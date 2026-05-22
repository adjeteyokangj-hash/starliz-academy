"use client";

import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

export default function SchoolGovernanceInsights({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);

  if (loading) {
    return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">Loading governance intelligence...</div>;
  }

  if (error || !school) {
    return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">Unable to load governance intelligence.</div>;
  }

  const activeAdmins = school.teachers.filter((teacher) => {
    const role = teacher.role.toLowerCase();
    return teacher.status === "active" && (role === "owner" || role === "admin");
  }).length;

  const elevatedRoleInvites = school.teachers.filter((teacher) => {
    const role = teacher.role.toLowerCase();
    return teacher.status === "invited" && (role === "owner" || role === "admin");
  }).length;

  const warningAuditEvents = school.activityTimeline.filter((item) => item.severity.toLowerCase() === "warning").length;
  const criticalAuditEvents = school.activityTimeline.filter((item) => item.severity.toLowerCase() === "critical").length;

  const governanceHealth = Math.max(
    0,
    Math.min(
      100,
      100 - school.safeguarding.criticalAlerts * 12 - warningAuditEvents * 3 - criticalAuditEvents * 7 - (activeAdmins === 0 ? 20 : 0),
    ),
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Governance Health</p>
          <p className="mt-1 text-2xl font-black text-white">{governanceHealth}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Risk Score</p>
          <p className="mt-1 text-2xl font-black text-amber-200">{metrics.riskScore}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Active Admins</p>
          <p className="mt-1 text-2xl font-black text-white">{activeAdmins}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Elevated Invites</p>
          <p className="mt-1 text-2xl font-black text-cyan-200">{elevatedRoleInvites}</p>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Compliance Pressure</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Open safeguarding alerts: {school.safeguarding.openAlerts}</li>
            <li>Critical safeguarding alerts: {school.safeguarding.criticalAlerts}</li>
            <li>Critical audit events: {criticalAuditEvents}</li>
          </ul>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Audit Signal Summary</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Total activity events: {school.activityTimeline.length}</li>
            <li>Warning events: {warningAuditEvents}</li>
            <li>Communication failures: {school.communicationLogs.filter((log) => log.deliveryStatus !== "delivered").length}</li>
          </ul>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Governance Actions</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Confirm owner/admin invite decisions within 48h.</li>
            <li>Escalate unresolved warning audit events.</li>
            <li>Review suspended entities and compliance blockers.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
