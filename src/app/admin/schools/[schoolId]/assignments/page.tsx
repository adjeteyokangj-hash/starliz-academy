import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAssignmentsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="assignments"
      title="Assignments"
      subtitle="School assignment planning, release tracking, and lesson delivery operations."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Assignment Planner</h2>
          <p className="mt-1 text-xs text-slate-400">Plan assignment windows, class-level distribution, and teacher review workflow.</p>
          <Link href={`/admin/schools/${schoolId}/assignments/new`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Assign Lesson</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Assigned Lesson Queue</h2>
          <p className="mt-1 text-xs text-slate-400">Track pending, active, and completed assignment releases for this school.</p>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
