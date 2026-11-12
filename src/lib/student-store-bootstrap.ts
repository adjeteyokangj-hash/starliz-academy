/**
 * Student bootstrap routing after Parent Login redesign.
 * Students must never be sent to the parent profile-picker (/profiles).
 */

export type StudentBootstrapDecision =
  | { action: "ready" }
  | { action: "replace"; path: "/student/dashboard" };

/** An unavailable or malformed session response cannot establish a parent role. */
export async function verifiedBootstrapRole(response: { ok: boolean; json(): Promise<{ user?: { role?: string } }> }) {
  if (!response.ok) throw new Error("Session verification is unavailable.");
  const role = (await response.json()).user?.role;
  if (!role || !["parent", "student", "teacher", "admin"].includes(role)) throw new Error("Session role could not be verified.");
  return role;
}

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
