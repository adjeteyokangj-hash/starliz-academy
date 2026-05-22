export type SchoolRole =
  | "owner"
  | "admin"
  | "teacher"
  | "support"
  | "staff_observer"
  | "finance";

export type SchoolPermission =
  | "viewDashboard"
  | "viewClassrooms"
  | "viewStudents"
  | "issueAssignment"
  | "viewProgress"
  | "viewWeakAreas"
  | "viewReports"
  | "inviteTeacher"
  | "manageTeachers"
  | "manageClassrooms"
  | "manageLicence"
  | "viewBilling"
  | "manageBilling"
  | "viewAuditLog"
  | "manageSafeguarding"
  | "manageSchoolSettings";

const PERMISSION_MATRIX: Record<SchoolPermission, SchoolRole[]> = {
  viewDashboard: ["owner", "admin", "finance", "teacher", "support", "staff_observer"],
  viewClassrooms: ["owner", "admin", "teacher", "support", "staff_observer"],
  viewStudents: ["owner", "admin", "teacher", "support"],
  issueAssignment: ["owner", "admin", "teacher"],
  viewProgress: ["owner", "admin", "teacher"],
  viewWeakAreas: ["owner", "admin", "teacher"],
  viewReports: ["owner", "admin", "finance", "teacher"],
  inviteTeacher: ["owner", "admin"],
  manageTeachers: ["owner", "admin"],
  manageClassrooms: ["owner", "admin"],
  manageLicence: ["owner", "admin", "finance"],
  viewBilling: ["owner", "admin", "finance"],
  manageBilling: ["owner", "admin", "finance"],
  viewAuditLog: ["owner", "admin", "support"],
  manageSafeguarding: ["owner", "admin"],
  manageSchoolSettings: ["owner", "admin"],
};

const ROLE_LABELS: Record<SchoolRole, string> = {
  owner: "School Owner",
  admin: "School Admin",
  teacher: "Teacher",
  support: "Support Staff",
  staff_observer: "Staff Observer",
  finance: "Finance",
};

export function canDo(role: SchoolRole, permission: SchoolPermission): boolean {
  return PERMISSION_MATRIX[permission]?.includes(role) ?? false;
}

export function getSchoolRoleLabel(role: SchoolRole | string): string {
  return ROLE_LABELS[role as SchoolRole] ?? role;
}

export function requiresOwnerInviteConfirmation(role: SchoolRole | string): boolean {
  return role === "owner";
}
