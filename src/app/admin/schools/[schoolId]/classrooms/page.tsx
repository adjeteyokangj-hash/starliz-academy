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
      subtitle="Classroom ownership, coverage, and management placeholders."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Classroom Registry</h2>
          <p className="mt-1 text-xs text-slate-400">Class list, year-group assignment, and lead staff ownership.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Add Classroom</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Capacity Controls</h2>
          <p className="mt-1 text-xs text-slate-400">Capacity and staffing mismatch checks with intervention placeholders.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Run Capacity Check</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
