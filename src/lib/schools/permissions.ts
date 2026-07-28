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
  | "manageStudents"
  | "issueAssignment"
  | "viewProgress"
  | "viewWeakAreas"
  | "viewReports"
  | "viewHumanSupport"
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
  manageStudents: ["owner", "admin"],
  issueAssignment: ["owner", "admin", "teacher"],
  viewProgress: ["owner", "admin", "teacher"],
  viewWeakAreas: ["owner", "admin", "teacher"],
  viewReports: ["owner", "admin", "finance", "teacher"],
  viewHumanSupport: ["owner", "admin", "teacher", "support"],
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
  support: "Tutor / Support",
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

/** Only School Owners may invite/assign another owner or transfer ownership. */
export function canManageSchoolOwnership(role: SchoolRole | string): boolean {
  return role === "owner";
}

/**
 * Roles a school staff member may assign via invites / role changes.
 * School Admin may manage day-to-day roles only — not Owner or School Admin.
 */
export function assignableSchoolRoles(actorRole: SchoolRole | string): SchoolRole[] {
  if (actorRole === "owner") {
    return ["owner", "admin", "teacher", "support", "staff_observer", "finance"];
  }
  if (actorRole === "admin") {
    return ["teacher", "support", "staff_observer", "finance"];
  }
  return [];
}

export function canAssignSchoolRole(actorRole: SchoolRole | string, targetRole: SchoolRole | string): boolean {
  return assignableSchoolRoles(actorRole).includes(targetRole as SchoolRole);
}

/**
 * Whether the actor may suspend/reactivate/archive/change-role the target membership.
 * Owners are never manageable here. School Admins cannot act on other School Admins.
 */
export function canManageTargetStaffMember(
  actorRole: SchoolRole | string,
  targetRole: SchoolRole | string,
): boolean {
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "admin";
  return false;
}
