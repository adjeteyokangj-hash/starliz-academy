"use client";

import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

export default function SchoolLearningInsights({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);

  if (loading) {
    return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">Loading learning intelligence...</div>;
  }

  if (error || !school) {
    return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">Unable to load learning intelligence.</div>;
  }

  const activeClassrooms = school.classrooms.filter((classroom) => classroom.status === "active").length;
  const overloadedClassrooms = school.classrooms.filter((classroom) => classroom.studentsCount > 30).length;
  const recentCriticalIncidents = school.safeguardingIncidents.filter((incident) => {
    const recentMs = Date.now() - new Date(incident.updatedAt).getTime();
    return incident.severity.toLowerCase() === "critical" && recentMs <= 1000 * 60 * 60 * 24 * 30;
  }).length;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Engagement Score</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.engagementScore}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Risk Score</p>
          <p className="mt-1 text-2xl font-black text-amber-200">{metrics.riskScore}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Student Teacher Ratio</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.studentTeacherRatio}:1</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Classroom Coverage</p>
          <p className="mt-1 text-2xl font-black text-emerald-200">{metrics.classroomCoveragePct}%</p>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Learning Load Signals</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Active classrooms: {activeClassrooms}</li>
            <li>Overloaded classrooms (&gt;30): {overloadedClassrooms}</li>
            <li>Students without classroom: {metrics.studentsWithoutClassroom}</li>
          </ul>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Communication & Learning</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Delivered communication rate: {metrics.deliveredCommsPct}%</li>
            <li>Recent comm events: {school.communicationLogs.length}</li>
            <li>Activity events tracked: {school.activityTimeline.length}</li>
          </ul>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Safeguarding Effect on Learning</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Open alerts: {school.safeguarding.openAlerts}</li>
            <li>Critical alerts: {school.safeguarding.criticalAlerts}</li>
            <li>Critical incidents (30d): {recentCriticalIncidents}</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
