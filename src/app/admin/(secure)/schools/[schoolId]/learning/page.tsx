import Link from "next/link";
import AdminSecondaryModuleBanner from "@/components/admin/schools/AdminSecondaryModuleBanner";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolLearningInsights from "@/components/admin/schools/SchoolLearningInsights";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolLearningPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="learning"
      title="Learning Intelligence"
      subtitle="Curriculum, vocabulary graph coverage, and learning performance by pathway."
    >
      <AdminSecondaryModuleBanner schoolId={schoolId} />
      <SchoolLearningInsights schoolId={schoolId} />

      <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Related Workspaces</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/admin/schools/${schoolId}/dashboard`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Overview</Link>
          <Link href={`/admin/schools/${schoolId}/students`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Students</Link>
          <Link href={`/admin/schools/${schoolId}/readiness`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Readiness</Link>
        </div>
      </div>
    </SchoolDashboardShell>
  );
}
