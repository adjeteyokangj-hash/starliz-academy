import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolProfilePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="profile"
      title="School Profile & Settings"
      subtitle="School-level profile, status, and settings placeholders for ops workflows."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">School Profile</h2>
          <p className="mt-1 text-xs text-slate-400">Name, status, contact profile, and school metadata controls.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Edit Profile</button>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-white">Billing & Licence</h2>
          <p className="mt-1 text-xs text-slate-400">Licence status, seat limits, renewal windows, and billing settings.</p>
          <button className="mt-3 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">Manage Licence</button>
        </article>
      </div>
      <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
        <p className="font-semibold text-slate-100">Settings Links</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/admin/schools/${schoolId}/roles`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Role & Permission Management</Link>
          <Link href={`/admin/schools/${schoolId}/readiness`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Launch Readiness Checklist</Link>
        </div>
      </div>
    </SchoolDashboardShell>
  );
}