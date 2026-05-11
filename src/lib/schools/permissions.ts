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
  viewClassrooms: ["owner", "admin", "finance", "teacher", "support", "staff_observer"],
  viewStudents: ["owner", "admin", "finance", "teacher", "support"],
  issueAssignment: ["owner", "admin", "teacher"],
  viewProgress: ["owner", "admin", "teacher", "support", "staff_observer"],
  viewWeakAreas: ["owner", "admin", "teacher", "support"],
  viewReports: ["owner", "admin", "finance", "teacher", "support"],
  inviteTeacher: ["owner", "admin"],
  manageTeachers: ["owner", "admin"],
  manageClassrooms: ["owner", "admin"],
  manageLicence: ["owner", "admin"],
  viewBilling: ["owner", "admin", "finance"],
  manageBilling: ["owner", "finance"],
  viewAuditLog: ["owner", "admin", "support"],
  manageSafeguarding: ["owner", "admin", "support"],
  manageSchoolSettings: ["owner", "admin"],
};

export function canDo(role: SchoolRole, permission: SchoolPermission): boolean {
  return PERMISSION_MATRIX[permission]?.includes(role) ?? false;
}
