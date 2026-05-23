import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolBillingLicencePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="billing-licence"
      title="Billing / Licence"
      subtitle="Licence utilisation, subscription status, and renewal governance for this school."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Licence Utilisation</h2>
          <p className="mt-1 text-xs text-slate-400">Monitor seats used, limits, and over-allocation risk before renewal windows.</p>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Billing Cycle</h2>
          <p className="mt-1 text-xs text-slate-400">Track subscription state, payment health, and key dates for leadership reporting.</p>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
