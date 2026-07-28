/**
 * Platform-admin route gate (Next.js App Router).
 * Shared by the root request interceptor (`proxy.ts`) and focused unit tests.
 */

/** Keep in sync with SCHOOL_ADMIN_HOME — do not import portal-routing (pulls Prisma into edge). */
const SCHOOL_ADMIN_HOME = "/school-admin";

export type AdminGateSession = {
  role: string;
} | null;

export type AdminGateDecision =
  | { action: "allow" }
  | { action: "redirect"; to: string; status: 307 };

function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

function isPlatformAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Safe internal next path for post-login return (admin routes only). */
export function safeAdminNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/admin")) return null;
  if (value.startsWith("//")) return null;
  if (isAdminLoginPath(value)) return "/admin";
  return value;
}

export function buildAdminLoginUrl(pathname: string, search = "", reason?: "switch"): string {
  const next = `${pathname}${search}`;
  const params = new URLSearchParams();
  params.set("next", next.startsWith("/admin") ? next : "/admin");
  if (reason) params.set("reason", reason);
  return `/admin/login?${params.toString()}`;
}

/**
 * Where authenticated non-platform-admins go when they hit /admin*.
 * School staff (User.role === "teacher", including school owners) go to the
 * school portal — never to an admin "role switch" login.
 */
export function nonPlatformAdminFallbackPath(role: string | null | undefined): string {
  if (role === "teacher") return SCHOOL_ADMIN_HOME;
  if (role === "parent") return "/parent/profiles";
  if (role === "student") return "/student/dashboard";
  return "/";
}

/**
 * Decide whether a request to an /admin* path may proceed.
 * Non-admin paths return allow (caller should ignore).
 */
export function resolvePlatformAdminGate(input: {
  pathname: string;
  search?: string;
  session: AdminGateSession;
}): AdminGateDecision {
  const { pathname, session } = input;
  const search = input.search ?? "";

  if (!isPlatformAdminPath(pathname)) {
    return { action: "allow" };
  }

  if (isAdminLoginPath(pathname)) {
    if (session?.role === "admin") {
      const next = safeAdminNextPath(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("next"));
      return { action: "redirect", to: next ?? "/admin", status: 307 };
    }
    // Authenticated school/parent/student users must not enter the admin login
    // "switch" flow — send them to their own portal instead.
    if (session) {
      return {
        action: "redirect",
        to: nonPlatformAdminFallbackPath(session.role),
        status: 307,
      };
    }
    return { action: "allow" };
  }

  if (!session) {
    return {
      action: "redirect",
      to: buildAdminLoginUrl(pathname, search),
      status: 307,
    };
  }

  if (session.role !== "admin") {
    return {
      action: "redirect",
      to: nonPlatformAdminFallbackPath(session.role),
      status: 307,
    };
  }

  return { action: "allow" };
}

/** True when an anonymous redirect must not render any Unauthorized UI. */
export function adminGateBlocksUnauthorizedUi(decision: AdminGateDecision): boolean {
  return decision.action === "redirect" && decision.to.startsWith("/admin/login");
}
