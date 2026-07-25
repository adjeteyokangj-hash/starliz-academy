import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolReportsInsights from "@/components/admin/schools/SchoolReportsInsights";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolReportsPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="reports"
      title="School Reports"
      subtitle="Operational exports and intelligence summaries for leadership and support teams."
    >
      <SchoolReportsInsights schoolId={schoolId} />

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <Link href={`/admin/schools/${schoolId}/communications`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Communications Logs</Link>
        <Link href={`/admin/schools/${schoolId}/audit`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Audit Events</Link>
        <Link href={`/admin/schools/${schoolId}/dashboard`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Back to Overview</Link>
      </div>
    </SchoolDashboardShell>
  );
}
