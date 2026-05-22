import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import SchoolGovernanceInsights from "@/components/admin/schools/SchoolGovernanceInsights";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

export default async function SchoolGovernancePage({ params }: PageProps) {
  const { schoolId } = await params;

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="governance"
      title="Governance Workspace"
      subtitle="Compliance posture, role controls, and operational accountability."
    >
      <SchoolGovernanceInsights schoolId={schoolId} />

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
        <Link href={`/admin/schools/${schoolId}/roles`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Role Management</Link>
        <Link href={`/admin/schools/${schoolId}/audit`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">Audit</Link>
        <Link href={`/admin/schools/${schoolId}/profile`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5">School Profile</Link>
        <Link href="/admin/recovery-governance" className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-cyan-100">Recovery Governance</Link>
      </div>
    </SchoolDashboardShell>
  );
}
