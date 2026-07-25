import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolSettingsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="settings"
      title="Settings"
      subtitle="School-level settings, role controls, and operational configuration."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">School Settings</h2>
          <p className="mt-1 text-xs text-slate-400">Update school profile defaults, communication preferences, and feature toggles.</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Role and Access Controls</h2>
          <p className="mt-1 text-xs text-slate-400">Manage school-level permissions and governance access boundaries.</p>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
