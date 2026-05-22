import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolSafeguardingPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="safeguarding"
      title="Safeguarding Case Register"
      subtitle="Safeguarding incidents, case register, overrides, and emergency pathways."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <h2 className="text-sm font-semibold text-rose-100">Case Register</h2>
          <p className="mt-1 text-xs text-rose-100">Case management queue placeholder for triage, escalation, and closure workflows.</p>
          <button className="mt-3 rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100">Open Case Register</button>
        </article>
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Safeguarding Override Protection</h2>
          <p className="mt-1 text-xs text-amber-100">Override protection placeholder with explicit audit and approval policy hooks.</p>
          <button className="mt-3 rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Review Override Guardrails</button>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
