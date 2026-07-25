import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolSampleDataBanner from "@/components/admin/schools/SchoolSampleDataBanner";
import { getAttendanceInterventions } from "../attendance-intelligence-data";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

function badgeClass(status: string) {
  if (status === "in-progress") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "monitoring") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
}

export default async function AttendanceInterventionsPage({ params }: PageProps) {
  const { schoolId } = await params;
  const interventions = getAttendanceInterventions();

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance-activity"
      title="Attendance Interventions"
      subtitle="Recommended actions that connect attendance drift to learning support, parent contact, and safeguarding escalation prompts."
    >
      <div className="space-y-4">
        <SchoolSampleDataBanner schoolId={schoolId} surface="attendance" />
        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
          <p className="font-semibold text-white">Intervention Intelligence</p>
          <p className="mt-1">Attendance interventions stay focused on learner support signals, not operational registration workflows.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/schools/${schoolId}/attendance-activity`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Overview</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/risk-students`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Risk Students</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/anomalies`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Anomalies</Link>
          </div>
        </section>
        <section className="grid gap-3">
          {interventions.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">{item.studentName}</h2>
                  <p className="mt-1 text-slate-400">{item.focus}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeClass(item.status)}`}>{item.status}</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p><span className="text-slate-400">Owner:</span> {item.owner}</p>
                <p><span className="text-slate-400">Next review:</span> {item.nextReview}</p>
              </div>
              <p className="mt-2"><span className="text-slate-400">Recommendation:</span> {item.recommendation}</p>
              <p className="mt-1"><span className="text-slate-400">Parent contact prompt:</span> {item.parentContactPrompt}</p>
              <p className="mt-1"><span className="text-slate-400">AI support signal:</span> {item.aiSupportSignal}</p>
            </article>
          ))}
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
