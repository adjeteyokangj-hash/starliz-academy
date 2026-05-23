import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolAuditPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="audit"
      title="Audit Activity Log"
      subtitle="Operational audit timeline and compliance-ready records."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Audit Activity</h2>
          <p className="mt-1 text-xs text-slate-400">School audit events, filters, and export controls.</p>
          <Link href={`/admin/schools/${schoolId}/audit?view=events`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Filter Audit Events</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Access History</h2>
          <p className="mt-1 text-xs text-slate-400">Staff access history and annual access review workflow.</p>
          <Link href={`/admin/schools/${schoolId}/audit?view=access-history`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open Access History</Link>
        </article>
      </div>
    </SchoolDashboardShell>
  );
}
