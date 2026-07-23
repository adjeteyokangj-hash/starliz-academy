"use client";

import SchoolSampleDataBanner from "@/components/admin/schools/SchoolSampleDataBanner";
import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

function trendLabel(value: number): string {
  if (value >= 75) return "Improving";
  if (value >= 50) return "Stable";
  return "Declining";
}

export default function SchoolAiIntelligenceInsights({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);

  if (loading) {
    return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-300">Loading AI intelligence...</div>;
  }

  if (error || !school) {
    return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">Unable to load AI intelligence.</div>;
  }

  const interventionPressure = Math.min(100, Math.round(metrics.interventionLoad * 6));
  const safeguardingPressure = Math.min(100, school.safeguarding.criticalAlerts * 20 + school.safeguarding.openAlerts * 8);
  const commReliability = metrics.deliveredCommsPct;

  const nextCycleRisk = Math.max(
    0,
    Math.min(
      100,
      Math.round(metrics.riskScore * 0.55 + interventionPressure * 0.25 + (100 - commReliability) * 0.2),
    ),
  );

  const confidence = Math.max(20, 100 - Math.round((nextCycleRisk + safeguardingPressure) / 2));

  return (
    <div className="space-y-3">
      <SchoolSampleDataBanner schoolId={schoolId} surface="ai" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Predicted Next-Cycle Risk</p>
          <p className="mt-1 text-2xl font-black text-amber-200">{nextCycleRisk}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">AI Confidence</p>
          <p className="mt-1 text-2xl font-black text-cyan-200">{confidence}%</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Engagement Trend</p>
          <p className="mt-1 text-2xl font-black text-white">{trendLabel(metrics.engagementScore)}</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Intervention Pressure</p>
          <p className="mt-1 text-2xl font-black text-rose-200">{interventionPressure}</p>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">AI Operational Narrative</h2>
          <p className="mt-2 text-xs text-slate-300">
            Risk is currently {nextCycleRisk >= 65 ? "elevated" : nextCycleRisk >= 40 ? "moderate" : "contained"}.
            The strongest contributors are safeguarding pressure ({safeguardingPressure}) and intervention load ({interventionPressure}).
            Communication reliability at {commReliability}% is {commReliability >= 80 ? "supporting stability" : "increasing recovery risk"}.
          </p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Recommended AI Actions</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            <li>Prioritise remediation packs for cohorts linked to open alerts.</li>
            <li>Increase parent communication cadence for unresolved support cases.</li>
            <li>Schedule classroom assignment cleanup before next reporting cycle.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
