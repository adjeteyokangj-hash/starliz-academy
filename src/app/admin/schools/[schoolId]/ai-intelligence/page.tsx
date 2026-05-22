import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolAiIntelligenceInsights from "@/components/admin/schools/SchoolAiIntelligenceInsights";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAiIntelligencePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="ai-intelligence"
      title="AI Intelligence"
      subtitle="Prediction signals, risk forecasting, and narrative recommendations."
    >
      <SchoolAiIntelligenceInsights schoolId={schoolId} />

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <Link href={`/admin/schools/${schoolId}/readiness`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Readiness</Link>
        <Link href={`/admin/schools/${schoolId}/interventions`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Interventions</Link>
        <Link href={`/admin/schools/${schoolId}/dashboard`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Overview</Link>
      </div>
    </SchoolDashboardShell>
  );
}
