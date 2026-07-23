/** Map staff UI role keys to SchoolTeacher.role values. Client-safe (no server imports). */

export function mapStaffUiRoleToSchoolRole(
  uiRole: string,
): "owner" | "admin" | "teacher" | "support" | "staff_observer" | "finance" {
  const normalized = uiRole.trim().toLowerCase();
  if (normalized === "head-teacher" || normalized === "owner") return "owner";
  if (
    normalized === "deputy-head-teacher"
    || normalized === "assistant-head-teacher"
    || normalized === "school-admin"
    || normalized === "admin"
  ) {
    return "admin";
  }
  if (
    normalized === "finance-officer"
    || normalized === "school-business-manager"
    || normalized === "finance"
  ) {
    return "finance";
  }
  if (
    normalized === "designated-safeguarding-lead"
    || normalized === "deputy-safeguarding-lead"
    || normalized === "senco"
    || normalized === "teaching-assistant"
    || normalized === "intervention-tutor"
    || normalized === "attendance-officer"
    || normalized === "parent-liaison-officer"
    || normalized === "admin-officer"
    || normalized === "support"
  ) {
    return "support";
  }
  if (
    normalized === "external-specialist"
    || normalized === "it-systems-admin"
    || normalized === "staff_observer"
    || normalized === "staff-observer"
  ) {
    return "staff_observer";
  }
  return "teacher";
}
