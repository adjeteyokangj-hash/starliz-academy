import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolSampleDataBanner from "@/components/admin/schools/SchoolSampleDataBanner";
import { getAttendanceStudentSignals } from "../attendance-intelligence-data";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

function badgeClass(score: number) {
  if (score >= 80) return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (score >= 65) return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-sky-500/40 bg-sky-500/10 text-sky-100";
}

export default async function AttendanceRiskStudentsPage({ params }: PageProps) {
  const { schoolId } = await params;
  const students = [...(await getAttendanceStudentSignals(schoolId))].sort((left, right) => right.attendanceRiskScore - left.attendanceRiskScore);

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance-activity"
      title="Attendance Risk Students"
      subtitle="Attendance risk scoring focused on safeguarding, engagement, parent contact, and AI support signals."
    >
      <div className="space-y-4">
        <SchoolSampleDataBanner schoolId={schoolId} surface="attendance" />
        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
          <p className="font-semibold text-white">Intelligence Focus</p>
          <p className="mt-1">This page highlights students who need learning intelligence action, not timetable or registration processing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/schools/${schoolId}/attendance-activity`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Overview</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/anomalies`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Anomalies</Link>
            <Link href={`/admin/schools/${schoolId}/attendance-activity/interventions`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Interventions</Link>
          </div>
        </section>
        <section className="grid gap-3">
          {students.length === 0 ? (
            <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-50">
              <p className="font-semibold">No live risk signals</p>
              <p className="mt-1 text-amber-100/90">
                Sample risk students are hidden when this school has enrolments, so demo data is not shown as real attendance.
              </p>
            </article>
          ) : null}
          {students.map((student) => (
            <article key={student.id} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">{student.studentName}</h2>
                  <p className="mt-1 text-slate-400">Attendance {student.attendancePct}% · Engagement {student.engagementScore}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeClass(student.attendanceRiskScore)}`}>Risk {student.attendanceRiskScore}</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <p><span className="text-slate-400">Risk flags:</span> {student.riskFlags.join(", ")}</p>
                <p><span className="text-slate-400">Safeguarding linked:</span> {student.safeguardingLinked ? "Yes" : "No"}</p>
                <p><span className="text-slate-400">AI concern:</span> {student.aiConcernIndicator}</p>
                <p><span className="text-slate-400">Class insight impact:</span> {student.classInsightImpact}</p>
              </div>
              <p className="mt-2"><span className="text-slate-400">Parent contact prompt:</span> {student.parentContactPrompt}</p>
              <p className="mt-1"><span className="text-slate-400">Intervention recommendation:</span> {student.interventionRecommendation}</p>
              <p className="mt-1"><span className="text-slate-400">Safeguarding escalation prompt:</span> {student.safeguardingEscalationPrompt}</p>
            </article>
          ))}
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
