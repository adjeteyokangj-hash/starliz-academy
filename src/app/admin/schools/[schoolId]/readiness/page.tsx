import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolReadinessPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="readiness"
      title="Launch Readiness & Risk"
      subtitle="Readiness checklist, risk score, and intervention placeholders."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Launch Readiness Checklist</h2>
          <p className="mt-1 text-xs text-slate-400">Checklist placeholders for staff, classrooms, compliance, and safeguarding readiness.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Open Checklist</button>
        </article>
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Risk Score & Interventions</h2>
          <p className="mt-1 text-xs text-amber-100">Risk score placeholder with suggested interventions and escalation controls.</p>
          <button className="mt-3 rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Review Interventions</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
