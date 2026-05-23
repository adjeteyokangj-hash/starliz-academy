"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type StaffRoleOption = {
  value: string;
  label: string;
  group: "Senior Leadership Team" | "Safeguarding Team" | "Teaching Staff" | "Support Staff" | "Administration / Finance" | "External Specialists";
};

type PermissionProfileKey =
  | "full-school-admin"
  | "senior-leadership"
  | "safeguarding-access"
  | "teaching-access"
  | "class-teacher-access"
  | "teaching-assistant-access"
  | "attendance-access"
  | "parent-communication-access"
  | "finance-billing-access"
  | "reports-only"
  | "content-management"
  | "it-system-admin"
  | "restricted-access";

type PermissionProfileOption = {
  key: PermissionProfileKey;
  label: string;
};

type PermissionMap = {
  dashboard: boolean;
  students: boolean;
  staff: boolean;
  classes: boolean;
  assignLessons: boolean;
  aiContent: boolean;
  reports: boolean;
  safeguardingManage: boolean;
  safeguardingViewOnly: boolean;
  parentComms: boolean;
  attendance: boolean;
  billing: boolean;
  settings: boolean;
  exportReports: boolean;
  userAccess: boolean;
};

const STAFF_ROLE_OPTIONS: StaffRoleOption[] = [
  { value: "head-teacher", label: "Head Teacher", group: "Senior Leadership Team" },
  { value: "deputy-head-teacher", label: "Deputy Head Teacher", group: "Senior Leadership Team" },
  { value: "assistant-head-teacher", label: "Assistant Head Teacher", group: "Senior Leadership Team" },
  { value: "designated-safeguarding-lead", label: "Designated Safeguarding Lead", group: "Safeguarding Team" },
  { value: "deputy-safeguarding-lead", label: "Deputy Safeguarding Lead", group: "Safeguarding Team" },
  { value: "senco", label: "SENCO", group: "Support Staff" },
  { value: "school-business-manager", label: "School Business Manager", group: "Administration / Finance" },
  { value: "finance-officer", label: "Finance Officer", group: "Administration / Finance" },
  { value: "admin-officer", label: "Admin Officer", group: "Administration / Finance" },
  { value: "attendance-officer", label: "Attendance Officer", group: "Support Staff" },
  { value: "parent-liaison-officer", label: "Parent Liaison Officer", group: "Support Staff" },
  { value: "year-group-lead", label: "Year Group Lead", group: "Teaching Staff" },
  { value: "subject-lead", label: "Subject Lead", group: "Teaching Staff" },
  { value: "class-teacher", label: "Class Teacher", group: "Teaching Staff" },
  { value: "teaching-assistant", label: "Teaching Assistant", group: "Support Staff" },
  { value: "intervention-tutor", label: "Intervention Tutor", group: "Support Staff" },
  { value: "cover-teacher", label: "Cover Teacher", group: "Teaching Staff" },
  { value: "external-specialist", label: "External Specialist", group: "External Specialists" },
  { value: "it-systems-admin", label: "IT / Systems Admin", group: "Administration / Finance" },
];

const PERMISSION_PROFILE_OPTIONS: PermissionProfileOption[] = [
  { key: "full-school-admin", label: "Full School Admin" },
  { key: "senior-leadership", label: "Senior Leadership" },
  { key: "safeguarding-access", label: "Safeguarding Access" },
  { key: "teaching-access", label: "Teaching Access" },
  { key: "class-teacher-access", label: "Class Teacher Access" },
  { key: "teaching-assistant-access", label: "Teaching Assistant Access" },
  { key: "attendance-access", label: "Attendance Access" },
  { key: "parent-communication-access", label: "Parent Communication Access" },
  { key: "finance-billing-access", label: "Finance / Billing Access" },
  { key: "reports-only", label: "Reports Only" },
  { key: "content-management", label: "Content Management" },
  { key: "it-system-admin", label: "IT / System Admin" },
  { key: "restricted-access", label: "Restricted Access" },
];

const PROFILE_PERMISSIONS: Record<PermissionProfileKey, PermissionMap> = {
  "full-school-admin": {
    dashboard: true, students: true, staff: true, classes: true, assignLessons: true, aiContent: true, reports: true,
    safeguardingManage: true, safeguardingViewOnly: true, parentComms: true, attendance: true, billing: true,
    settings: true, exportReports: true, userAccess: true,
  },
  "senior-leadership": {
    dashboard: true, students: true, staff: true, classes: true, assignLessons: true, aiContent: true, reports: true,
    safeguardingManage: false, safeguardingViewOnly: true, parentComms: true, attendance: true, billing: false,
    settings: true, exportReports: true, userAccess: true,
  },
  "safeguarding-access": {
    dashboard: true, students: true, staff: false, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: true, safeguardingViewOnly: true, parentComms: false, attendance: true, billing: false,
    settings: false, exportReports: true, userAccess: false,
  },
  "teaching-access": {
    dashboard: true, students: true, staff: false, classes: true, assignLessons: true, aiContent: true, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: false, exportReports: false, userAccess: false,
  },
  "class-teacher-access": {
    dashboard: true, students: true, staff: false, classes: true, assignLessons: true, aiContent: true, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: true, attendance: true, billing: false,
    settings: false, exportReports: false, userAccess: false,
  },
  "teaching-assistant-access": {
    dashboard: true, students: true, staff: false, classes: false, assignLessons: false, aiContent: false, reports: false,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: false, exportReports: false, userAccess: false,
  },
  "attendance-access": {
    dashboard: true, students: true, staff: false, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: false, safeguardingViewOnly: true, parentComms: true, attendance: true, billing: false,
    settings: false, exportReports: true, userAccess: false,
  },
  "parent-communication-access": {
    dashboard: true, students: true, staff: false, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: true, attendance: false, billing: false,
    settings: false, exportReports: true, userAccess: false,
  },
  "finance-billing-access": {
    dashboard: true, students: false, staff: false, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: true,
    settings: false, exportReports: true, userAccess: false,
  },
  "reports-only": {
    dashboard: true, students: false, staff: false, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: false, exportReports: true, userAccess: false,
  },
  "content-management": {
    dashboard: true, students: true, staff: false, classes: true, assignLessons: true, aiContent: true, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: false, exportReports: true, userAccess: false,
  },
  "it-system-admin": {
    dashboard: true, students: false, staff: true, classes: false, assignLessons: false, aiContent: false, reports: true,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: true, exportReports: true, userAccess: true,
  },
  "restricted-access": {
    dashboard: true, students: false, staff: false, classes: false, assignLessons: false, aiContent: false, reports: false,
    safeguardingManage: false, safeguardingViewOnly: false, parentComms: false, attendance: false, billing: false,
    settings: false, exportReports: false, userAccess: false,
  },
};

function toTitleCase(value: string): string {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function SchoolStaffNewPage() {
  const params = useParams<{ schoolId: string }>();
  const searchParams = useSearchParams();
  const schoolId = params.schoolId;

  const roleFromQuery = searchParams.get("role")?.toLowerCase() === "teacher" ? "class-teacher" : "class-teacher";

  const [selectedRole, setSelectedRole] = useState(roleFromQuery);
  const [selectedProfile, setSelectedProfile] = useState<PermissionProfileKey>("class-teacher-access");
  const [saved, setSaved] = useState(false);

  const selectedPermissions = PROFILE_PERMISSIONS[selectedProfile];

  const safeguardingWarnings = useMemo(() => {
    const warnings: string[] = [];
    const roleLabel = selectedRole;

    const safeguardingAuthorisedRole = [
      "head-teacher",
      "designated-safeguarding-lead",
      "deputy-safeguarding-lead",
    ].includes(roleLabel);

    const safeguardingAuthorisedProfile = selectedProfile === "full-school-admin" || selectedProfile === "safeguarding-access";

    if (selectedPermissions.safeguardingManage && !(safeguardingAuthorisedRole || safeguardingAuthorisedProfile)) {
      warnings.push("Safeguarding management should be limited to Head Teacher, DSL, Deputy DSL, School Admin, or authorised safeguarding profile.");
    }

    if (selectedRole === "teaching-assistant" && selectedPermissions.safeguardingManage) {
      warnings.push("Teaching Assistants should not access full safeguarding records by default.");
    }

    if (selectedProfile === "finance-billing-access" && (selectedPermissions.safeguardingManage || selectedPermissions.safeguardingViewOnly)) {
      warnings.push("Finance users should not access safeguarding or student sensitive notes by default.");
    }

    if (selectedRole === "parent-liaison-officer" && (selectedPermissions.billing || selectedPermissions.safeguardingManage)) {
      warnings.push("Parent Liaison can manage parent communication but should not manage billing or safeguarding case notes by default.");
    }

    if (["class-teacher", "subject-lead", "year-group-lead", "cover-teacher"].includes(selectedRole) && selectedPermissions.safeguardingViewOnly) {
      warnings.push("Teaching roles should only view safeguarding alerts when explicitly authorised.");
    }

    return warnings;
  }, [selectedPermissions, selectedProfile, selectedRole]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="staff"
      title="Create Staff Profile"
      subtitle="Add a staff member with school role, permission profile, and safeguarding controls."
    >
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            Full name
            <input required name="name" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Work email
            <input required type="email" name="email" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
          </label>

          <label className="text-xs text-slate-300 md:col-span-2">
            School role
            <select
              required
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {STAFF_ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>{role.label} ({role.group})</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-300 md:col-span-2">
            Permission profile
            <select
              required
              value={selectedProfile}
              onChange={(event) => setSelectedProfile(event.target.value as PermissionProfileKey)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {PERMISSION_PROFILE_OPTIONS.map((profile) => (
                <option key={profile.key} value={profile.key}>{profile.label}</option>
              ))}
            </select>
          </label>
        </div>

        <section className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-3">
          <p className="text-xs font-semibold text-slate-100">Permission Preview</p>
          <p className="mt-1 text-xs text-slate-400">Selected role: {toTitleCase(selectedRole)} | Profile: {PERMISSION_PROFILE_OPTIONS.find((item) => item.key === selectedProfile)?.label}</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3 text-xs text-slate-200">
            <p>View school dashboard: {selectedPermissions.dashboard ? "Yes" : "No"}</p>
            <p>Manage students: {selectedPermissions.students ? "Yes" : "No"}</p>
            <p>Manage staff: {selectedPermissions.staff ? "Yes" : "No"}</p>
            <p>Manage classes: {selectedPermissions.classes ? "Yes" : "No"}</p>
            <p>Assign lessons: {selectedPermissions.assignLessons ? "Yes" : "No"}</p>
            <p>Generate AI content: {selectedPermissions.aiContent ? "Yes" : "No"}</p>
            <p>View learning reports: {selectedPermissions.reports ? "Yes" : "No"}</p>
            <p>Manage safeguarding incidents: {selectedPermissions.safeguardingManage ? "Yes" : "No"}</p>
            <p>View safeguarding only: {selectedPermissions.safeguardingViewOnly ? "Yes" : "No"}</p>
            <p>Manage parent communication: {selectedPermissions.parentComms ? "Yes" : "No"}</p>
            <p>Manage attendance: {selectedPermissions.attendance ? "Yes" : "No"}</p>
            <p>Manage billing/licence: {selectedPermissions.billing ? "Yes" : "No"}</p>
            <p>Manage school settings: {selectedPermissions.settings ? "Yes" : "No"}</p>
            <p>Export reports: {selectedPermissions.exportReports ? "Yes" : "No"}</p>
            <p>Manage user access: {selectedPermissions.userAccess ? "Yes" : "No"}</p>
          </div>
        </section>

        <section className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-semibold">Safeguarding restrictions</p>
          <ul className="mt-2 space-y-1">
            <li>Only Head Teacher, DSL, Deputy DSL, School Admin, or authorised safeguarding profile can manage safeguarding incidents.</li>
            <li>Teachers can only view safeguarding alerts when authorised.</li>
            <li>Teaching Assistants should not access full safeguarding records by default.</li>
            <li>Finance users should not access safeguarding or student sensitive notes by default.</li>
            <li>Parent Liaison can manage parent communication but not billing or safeguarding case notes by default.</li>
          </ul>
          {safeguardingWarnings.length > 0 ? (
            <ul className="mt-2 space-y-1 text-rose-100">
              {safeguardingWarnings.map((warning) => <li key={warning}>Warning: {warning}</li>)}
            </ul>
          ) : null}
        </section>

        <p className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">This user’s access is controlled by their school role and permission profile.</p>

        {saved ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Staff profile captured and ready for invite.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20">Create Staff Profile</button>
          <Link href={`/admin/schools/${schoolId}/staff`} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">Cancel</Link>
        </div>
      </form>
    </SchoolDashboardShell>
  );
}
