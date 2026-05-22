import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolRolesPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="roles"
      title="Role & Permission Management"
      subtitle="Role matrix, permission conflict checks, and governance access placeholders."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Role Matrix</h2>
          <p className="mt-1 text-xs text-slate-400">Owner, admin, teacher, support, observer, and finance scope placeholder.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Review Role Matrix</button>
        </article>
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Permission Conflict Warnings</h2>
          <p className="mt-1 text-xs text-amber-100">Conflict detection placeholders for overlapping sensitive permissions.</p>
          <button className="mt-3 rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Run Permission Check</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
