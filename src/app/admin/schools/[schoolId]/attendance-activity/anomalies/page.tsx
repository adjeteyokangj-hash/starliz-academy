import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import { getAttendanceAnomalies } from "../attendance-intelligence-data";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

function badgeClass(severity: string) {
  if (severity === "critical") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (severity === "priority") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-sky-500/40 bg-sky-500/10 text-sky-100";
}

export default async function AttendanceAnomaliesPage({ params }: PageProps) {
  const { schoolId } = await params;
  const anomalies = getAttendanceAnomalies();

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance-activity"
      title="Attendance Anomalies"
      subtitle="Detect persistent absence patterns, engagement drift, and safeguarding-linked anomalies that matter to learning intelligence."
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
          <p className="font-semibold text-white">Reduced Scope</p>
          <p className="mt-1">Anomaly detection here feeds intervention and safeguarding queues. It is not a full registration, timetable, or census subsystem.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/schools/${schoolId}/attendance-activity`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Overview</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/risk-students`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Risk Students</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/interventions`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Interventions</Link>
          </div>
        </section>
        <section className="grid gap-3">
          {anomalies.map((anomaly) => (
            <article key={anomaly.id} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">{anomaly.title}</h2>
                  <p className="mt-1 text-slate-400">{anomaly.summary}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeClass(anomaly.severity)}`}>{anomaly.severity}</span>
              </div>
              <p className="mt-3"><span className="text-slate-400">Intelligence feed:</span> {anomaly.intelligenceFeed}</p>
              <p className="mt-1"><span className="text-slate-400">Parent prompt:</span> {anomaly.parentPrompt}</p>
              <p className="mt-1"><span className="text-slate-400">Safeguarding prompt:</span> {anomaly.safeguardingPrompt}</p>
            </article>
          ))}
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
