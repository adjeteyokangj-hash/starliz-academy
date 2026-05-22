import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolInterventionInsights from "@/components/admin/schools/SchoolInterventionInsights";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolInterventionsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="interventions"
      title="Intervention Command"
      subtitle="Recovery plans, active support pathways, and escalation outcomes."
    >
      <SchoolInterventionInsights schoolId={schoolId} />

      <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Escalation Paths</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/admin/schools/${schoolId}/safeguarding`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Safeguarding</Link>
          <Link href={`/admin/schools/${schoolId}/communications`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Communications</Link>
          <Link href={`/admin/schools/${schoolId}/audit`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Audit Trail</Link>
        </div>
      </div>
    </SchoolDashboardShell>
  );
}
