import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolClassroomsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="classrooms"
      title="Classroom Management"
      subtitle="Classroom ownership, staffing, and capacity management."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Classroom Registry</h2>
          <p className="mt-1 text-xs text-slate-400">Class list, year-group assignment, and lead staff ownership.</p>
          <Link href={`/admin/schools/${schoolId}/classrooms/new`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Add Classroom</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Attendance Intelligence</h2>
          <p className="mt-1 text-xs text-slate-400">Review attendance-linked learning risk, intervention readiness, and class insight signals without expanding into MIS-heavy workflow.</p>
          <Link href={`/admin/schools/${schoolId}/attendance-activity`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open Attendance Intelligence</Link>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
