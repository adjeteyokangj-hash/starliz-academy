import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolStaffPage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Staff Provisioning"
      subtitle="Create staff profiles, assign school roles, and manage access controls."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Staff Directory</h2>
          <p className="mt-1 text-xs text-slate-400">Review staff directory actions, update roles, and manage access reviews.</p>
          <Link href={`/admin/schools/${schoolId}/staff/directory`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Open Directory Actions</Link>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Staff CSV Import</h2>
          <p className="mt-1 text-xs text-slate-400">Import and validate staff profiles by CSV before invite dispatch.</p>
          <Link href={`/admin/schools/${schoolId}/staff/import`} className="mt-3 inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">View CSV Import Plan</Link>
        </article>
      </div>
      <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Operational Controls</p>
        <ul className="mt-2 space-y-1">
          <li>Staff profile detail page</li>
          <li>Staff access history</li>
          <li>Compliance document uploads</li>
          <li>Staff deactivation/reactivation</li>
          <li>Permission conflict warnings</li>
          <li>Annual access review date</li>
          <li>Training expiry alerts</li>
          <li>Manual add audit entry</li>
          <li>Invite audit entry</li>
        </ul>
      </div>
    </SchoolDashboardShell>
  );
}
