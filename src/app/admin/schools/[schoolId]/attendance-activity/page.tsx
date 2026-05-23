import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import Link from "next/link";
import { getAttendanceOverview, getAttendanceStudentSignals } from "./attendance-intelligence-data";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAttendanceActivityPage({ params }: PageProps) {
  const { schoolId } = await params;
  const overview = getAttendanceOverview();
  const priorityStudents = getAttendanceStudentSignals().slice(0, 3);

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance-activity"
      title="Attendance Intelligence"
      subtitle="Attendance intelligence for safeguarding risk, interventions, learning engagement, parent engagement, and AI support signals."
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-100">
          <p className="font-semibold">Reduced Scope</p>
          <p className="mt-1">Attendance stays education-intelligence focused. This area does not implement full timetable systems, room scheduling, payroll links, registration infrastructure, or government census workflows.</p>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Attendance Summary</p>
            <p className="mt-2 text-2xl font-black text-white">{overview.averageAttendance}%</p>
            <p className="mt-1 text-xs text-slate-400">Average attendance across monitored intelligence cohort.</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Engagement Score</p>
            <p className="mt-2 text-2xl font-black text-white">{overview.averageEngagement}</p>
            <p className="mt-1 text-xs text-slate-400">Attendance linked to learning engagement and class insight scoring.</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Risk Students</p>
            <p className="mt-2 text-2xl font-black text-amber-200">{overview.highRiskCount}</p>
            <p className="mt-1 text-xs text-slate-400">High-priority learners needing attendance intelligence action.</p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Safeguarding Links</p>
            <p className="mt-2 text-2xl font-black text-rose-200">{overview.safeguardingLinkedCount}</p>
            <p className="mt-1 text-xs text-slate-400">Attendance concerns already feeding safeguarding review.</p>
          </article>
        </section>

        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Attendance Overview</h2>
            <p className="mt-1 text-xs text-slate-400">Summary dashboard with persistent absence, engagement, safeguarding, and intervention signals.</p>
            <Link href={`/admin/schools/${schoolId}/attendance-activity`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Current Overview</Link>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Attendance Risk Students</h2>
            <p className="mt-1 text-xs text-slate-400">Risk flags, AI concern indicators, parent prompts, and safeguarding escalation prompts.</p>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/risk-students`} className="mt-3 inline-flex rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20">Open Risk Students</Link>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Attendance Anomalies</h2>
            <p className="mt-1 text-xs text-slate-400">Persistent absence and anomaly detection that feeds intervention and safeguarding queues.</p>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/anomalies`} className="mt-3 inline-flex rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20">Open Anomalies</Link>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold text-white">Attendance Interventions</h2>
            <p className="mt-1 text-xs text-slate-400">Intervention recommendations linked to parent communication and AI support signals.</p>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/interventions`} className="mt-3 inline-flex rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20">Open Interventions</Link>
          </article>
        </section>

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Priority Signals Feeding Intelligence</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {priorityStudents.map((student) => (
              <article key={student.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-xs text-slate-200">
                <p className="font-semibold text-white">{student.studentName}</p>
                <p className="mt-1 text-slate-400">Risk {student.attendanceRiskScore} · Attendance {student.attendancePct}% · Engagement {student.engagementScore}</p>
                <p className="mt-2"><span className="text-slate-400">AI concern:</span> {student.aiConcernIndicator}</p>
                <p className="mt-1"><span className="text-slate-400">Parent prompt:</span> {student.parentContactPrompt}</p>
                <p className="mt-1"><span className="text-slate-400">Safeguarding prompt:</span> {student.safeguardingEscalationPrompt}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-xs text-cyan-100">
          <p className="font-semibold">Intelligence Feeds</p>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            <li>Student intelligence</li>
            <li>Safeguarding</li>
            <li>AI intervention engine</li>
            <li>Parent communication</li>
            <li>Class insight scoring</li>
          </ul>
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
