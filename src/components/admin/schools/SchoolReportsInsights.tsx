"use client";

import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

export default function SchoolReportsInsights({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);

  if (loading) {
    return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">Loading reporting intelligence...</div>;
  }

  if (error || !school) {
    return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">Unable to load reporting intelligence.</div>;
  }

  const operationalHealth = Math.max(0, Math.min(100, Math.round((metrics.engagementScore + (100 - metrics.riskScore) + metrics.classroomCoveragePct) / 3)));
  const unresolvedIncidents = school.safeguardingIncidents.filter((incident) => {
    const status = incident.status.toLowerCase();
    return status === "open" || status === "under_review" || status === "escalated";
  }).length;

  const reportRows = [
    { label: "Operational Health", value: `${operationalHealth}` },
    { label: "Active Students", value: `${metrics.activeStudents}` },
    { label: "Active Teachers", value: `${metrics.activeTeachers}` },
    { label: "Classroom Coverage", value: `${metrics.classroomCoveragePct}%` },
    { label: "Communication Delivery", value: `${metrics.deliveredCommsPct}%` },
    { label: "Unresolved Incidents", value: `${unresolvedIncidents}` },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reportRows.map((row) => (
          <article key={row.label} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{row.label}</p>
            <p className="mt-1 text-2xl font-black text-white">{row.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Leadership Summary</h2>
          <p className="mt-2 text-xs text-slate-300">
            School operational health is {operationalHealth >= 75 ? "strong" : operationalHealth >= 50 ? "steady" : "at risk"}.
            Risk score is {metrics.riskScore} with intervention load at {metrics.interventionLoad}.
            Communication reliability is {metrics.deliveredCommsPct}%.
          </p>
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Export Pack Readiness</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Leadership report inputs: ready</li>
            <li>Safeguarding summary inputs: {unresolvedIncidents > 0 ? "attention needed" : "ready"}</li>
            <li>Parent insight pack inputs: {metrics.deliveredCommsPct >= 80 ? "ready" : "partial"}</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
