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
      subtitle="Dedicated staff workspace for invite flow, manual add flow, and profile controls."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Staff Directory</h2>
          <p className="mt-1 text-xs text-slate-400">View profile, edit access, resend invite, suspend staff, and mark training complete.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Open Directory Actions</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Import Placeholder</h2>
          <p className="mt-1 text-xs text-slate-400">Staff CSV bulk import placeholder retained for upcoming implementation.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">View CSV Import Plan</button>
        </article>
      </div>
      <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Audit-Ready Placeholders</p>
        <ul className="mt-2 space-y-1">
          <li>Staff profile detail page</li>
          <li>Staff access history</li>
          <li>Compliance document upload placeholders</li>
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
