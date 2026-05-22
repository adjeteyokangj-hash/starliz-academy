import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolCommunicationsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="communications"
      title="Communication History"
      subtitle="Communication logs, delivery outcomes, and communication workflow placeholders."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Communication History</h2>
          <p className="mt-1 text-xs text-slate-400">School-specific communication history and status timeline placeholder.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Open Delivery Timeline</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Parent Contact Permissions</h2>
          <p className="mt-1 text-xs text-slate-400">Permission and consent controls for parent communication workflows.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Review Permissions</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
