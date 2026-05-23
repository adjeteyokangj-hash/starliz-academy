import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolCompliancePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="compliance"
      title="Compliance"
      subtitle="Policy compliance, evidence checkpoints, and audit readiness for this school."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Compliance Checklist</h2>
          <p className="mt-1 text-xs text-slate-400">Track school policy obligations, safeguarding evidence, and overdue controls.</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Audit Trail</h2>
          <p className="mt-1 text-xs text-slate-400">Review governance actions and compliance-linked activity logs for school leadership.</p>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
