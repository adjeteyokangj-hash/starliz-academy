import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStudentsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="students"
      title="Student Enrolment & Import"
      subtitle="Student enrolment operations and import placeholders."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Enrolment Workspace</h2>
          <p className="mt-1 text-xs text-slate-400">Enrol students, assign classrooms, and verify onboarding state.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Enrol Student</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Import Placeholder</h2>
          <p className="mt-1 text-xs text-slate-400">Student import by CSV is prepared as a placeholder route.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Open CSV Placeholder</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
