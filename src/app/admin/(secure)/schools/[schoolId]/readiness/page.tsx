import Link from "next/link";
import AdminSecondaryModuleBanner from "@/components/admin/schools/AdminSecondaryModuleBanner";
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
      subtitle="Readiness checklist, risk score, and intervention actions."
    >
      <AdminSecondaryModuleBanner schoolId={schoolId} />
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Launch Readiness Checklist</h2>
          <p className="mt-1 text-xs text-slate-400">Checklist for staff, classrooms, compliance, and safeguarding readiness.</p>
          <Link href={`/admin/schools/${schoolId}/readiness?view=checklist`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open Checklist</Link>
        </article>
        <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Risk Score & Interventions</h2>
          <p className="mt-1 text-xs text-amber-100">Risk score with suggested interventions and escalation controls.</p>
          <Link href={`/admin/schools/${schoolId}/interventions`} className="mt-3 inline-flex rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20">Review Interventions</Link>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
