import Link from "next/link";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

type StaffCategory =
  | "Senior Leadership Team"
  | "Safeguarding Team"
  | "Teaching Staff"
  | "Support Staff"
  | "Administration / Finance"
  | "External Specialists";

type AccessReviewStatus = "Review due" | "Reviewed" | "High-risk access" | "Suspended" | "Invite pending";

type StaffDirectoryRow = {
  id: string;
  name: string;
  role: string;
  permissionProfile: string;
  accessLevel: "High" | "Standard" | "Restricted";
  safeguardingAccess: "Manage" | "View alerts" | "None";
  lastLogin: string;
  inviteStatus: "Accepted" | "Pending" | "Revoked";
  category: StaffCategory;
  accessReviewStatus: AccessReviewStatus;
};

const STAFF_ROWS: StaffDirectoryRow[] = [
  {
    id: "stf-001",
    name: "A. Morgan",
    role: "Head Teacher",
    permissionProfile: "Senior Leadership",
    accessLevel: "High",
    safeguardingAccess: "Manage",
    lastLogin: "Today, 08:21",
    inviteStatus: "Accepted",
    category: "Senior Leadership Team",
    accessReviewStatus: "Reviewed",
  },
  {
    id: "stf-002",
    name: "K. James",
    role: "Designated Safeguarding Lead",
    permissionProfile: "Safeguarding Access",
    accessLevel: "High",
    safeguardingAccess: "Manage",
    lastLogin: "Yesterday, 16:42",
    inviteStatus: "Accepted",
    category: "Safeguarding Team",
    accessReviewStatus: "Review due",
  },
  {
    id: "stf-003",
    name: "R. Hall",
    role: "Class Teacher",
    permissionProfile: "Class Teacher Access",
    accessLevel: "Standard",
    safeguardingAccess: "View alerts",
    lastLogin: "Today, 07:58",
    inviteStatus: "Accepted",
    category: "Teaching Staff",
    accessReviewStatus: "Reviewed",
  },
  {
    id: "stf-004",
    name: "L. Ward",
    role: "Teaching Assistant",
    permissionProfile: "Teaching Assistant Access",
    accessLevel: "Restricted",
    safeguardingAccess: "None",
    lastLogin: "3 days ago",
    inviteStatus: "Accepted",
    category: "Support Staff",
    accessReviewStatus: "Review due",
  },
  {
    id: "stf-005",
    name: "M. Cole",
    role: "Finance Officer",
    permissionProfile: "Finance / Billing Access",
    accessLevel: "Standard",
    safeguardingAccess: "None",
    lastLogin: "14 days ago",
    inviteStatus: "Accepted",
    category: "Administration / Finance",
    accessReviewStatus: "High-risk access",
  },
  {
    id: "stf-006",
    name: "P. Singh",
    role: "External Specialist",
    permissionProfile: "Restricted Access",
    accessLevel: "Restricted",
    safeguardingAccess: "None",
    lastLogin: "Never",
    inviteStatus: "Pending",
    category: "External Specialists",
    accessReviewStatus: "Invite pending",
  },
];

const CATEGORIES: StaffCategory[] = [
  "Senior Leadership Team",
  "Safeguarding Team",
  "Teaching Staff",
  "Support Staff",
  "Administration / Finance",
  "External Specialists",
];

function accessBadgeClass(level: StaffDirectoryRow["accessLevel"]): string {
  if (level === "High") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (level === "Standard") return "border-sky-500/40 bg-sky-500/10 text-sky-100";
  return "border-slate-500/40 bg-slate-500/10 text-slate-200";
}

function safeguardingClass(value: StaffDirectoryRow["safeguardingAccess"]): string {
  if (value === "Manage") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (value === "View alerts") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-slate-500/40 bg-slate-500/10 text-slate-200";
}

function reviewStatusClass(status: AccessReviewStatus): string {
  if (status === "Reviewed") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  if (status === "Review due") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (status === "High-risk access") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (status === "Suspended") return "border-slate-500/40 bg-slate-500/10 text-slate-200";
  return "border-sky-500/40 bg-sky-500/10 text-sky-100";
}

export default async function SchoolStaffDirectoryPage({ params }: PageProps) {
  const { schoolId } = await params;

  const permissionWarnings = [
    "Safeguarding access without DSL/Head role",
    "Finance access combined with safeguarding access",
    "Admin access without recent login",
    "Invite pending too long",
  ];

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Staff Directory Actions"
      subtitle="Review role and permission assignments with access governance controls."
    >
      <div className="space-y-4">
        <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">This user’s access is controlled by their school role and permission profile.</p>

        <section className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-100">
          <p className="font-semibold">Permission warnings</p>
          <ul className="mt-2 space-y-1">
            {permissionWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>

        {CATEGORIES.map((category) => {
          const rows = STAFF_ROWS.filter((item) => item.category === category);
          return (
            <section key={category} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              <h2 className="text-sm font-semibold text-white">{category}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs text-slate-200">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Role</th>
                      <th className="px-2 py-2">Permission profile</th>
                      <th className="px-2 py-2">Access level</th>
                      <th className="px-2 py-2">Safeguarding access</th>
                      <th className="px-2 py-2">Access review status</th>
                      <th className="px-2 py-2">Last login</th>
                      <th className="px-2 py-2">Invite status</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-800/70">
                        <td className="px-2 py-2 font-semibold text-white">{row.name}</td>
                        <td className="px-2 py-2">{row.role}</td>
                        <td className="px-2 py-2">{row.permissionProfile}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 ${accessBadgeClass(row.accessLevel)}`}>{row.accessLevel}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 ${safeguardingClass(row.safeguardingAccess)}`}>{row.safeguardingAccess}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 ${reviewStatusClass(row.accessReviewStatus)}`}>{row.accessReviewStatus}</span>
                        </td>
                        <td className="px-2 py-2">{row.lastLogin}</td>
                        <td className="px-2 py-2">{row.inviteStatus}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link href={`/admin/schools/${schoolId}/staff/new?edit=${row.id}`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]">Edit role</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/new?permissions=${row.id}`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]">Change permissions</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=revoke&staffId=${row.id}`} className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100">Revoke access</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=resend-invite&staffId=${row.id}`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]">Resend invite</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=mark-reviewed&staffId=${row.id}`} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">Mark access reviewed</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=request-approval&staffId=${row.id}`} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">Request approval</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=suspend&staffId=${row.id}`} className="rounded border border-slate-500/40 bg-slate-500/10 px-2 py-1 text-[11px] text-slate-200">Suspend access</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?action=reinstate&staffId=${row.id}`} className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-100">Reinstate access</Link>
                            <Link href={`/admin/schools/${schoolId}/staff/directory?view=history&staffId=${row.id}`} className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-[11px]">View access history</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <section className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">Audit trail</p>
          <p className="mt-1">Every role and permission change should be recorded with who changed it, when, and why.</p>
        </section>
      </div>
    </SchoolDashboardShell>
  );
}
