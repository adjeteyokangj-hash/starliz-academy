import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolParentOnboardingPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="parent-onboarding"
      title="Parent Onboarding"
      subtitle="Parent onboarding operations, consent controls, and communication readiness."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Onboarding Stages</h2>
          <p className="mt-1 text-xs text-slate-400">Track invited, pending setup, and active parent states.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Open Parent Status</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Parent Consent Rules</h2>
          <p className="mt-1 text-xs text-slate-400">Safeguarding-aware consent rules and restricted communications controls.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Review Consent Controls</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
