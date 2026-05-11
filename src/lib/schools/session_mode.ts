export type PortalMode =
  | "parent_portal"
  | "student_portal"
  | "teacher_portal"
  | "school_admin_portal"
  | "platform_admin_portal";

/**
 * Resolves operational auth/session context by path + role.
 * This prepares explicit portal-mode behavior without changing token format yet.
 */
export function resolvePortalMode(input: {
  pathname: string;
  role?: string;
}): PortalMode {
  const pathname = input.pathname;
  const role = (input.role ?? "").toLowerCase();

  if (pathname.startsWith("/teacher")) {
    return role === "owner" || role === "admin" || role === "finance"
      ? "school_admin_portal"
      : "teacher_portal";
  }

  if (pathname.startsWith("/admin")) return "platform_admin_portal";
  if (pathname.startsWith("/student") || pathname.startsWith("/games")) return "student_portal";

  return "parent_portal";
}
