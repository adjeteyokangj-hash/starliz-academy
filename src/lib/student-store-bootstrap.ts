/**
 * Student bootstrap routing after Parent Login redesign.
 * Students must never be sent to the parent profile-picker (/profiles).
 */

export type StudentBootstrapDecision =
  | { action: "ready" }
  | { action: "replace"; path: "/student/dashboard" };

/**
 * Decide what StoreBootstrap should do for an authenticated student session.
 * Parent consent and profile-picker routes are parent-only; students go to their dashboard.
 */
export function decideStudentStoreBootstrap(pathname: string): StudentBootstrapDecision {
  const path = pathname || "/";
  if (
    path.startsWith("/profiles")
    || path.startsWith("/parent/profiles")
    || path === "/consent"
    || path.startsWith("/consent/")
    || path.startsWith("/parent-pin")
  ) {
    return { action: "replace", path: "/student/dashboard" };
  }
  return { action: "ready" };
}
