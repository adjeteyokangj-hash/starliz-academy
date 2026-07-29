type SessionRole = "admin" | "parent" | "student" | "teacher" | string;

type AdminLaunchTag = "beta" | "coming_soon";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isLaunchScopeStrictEnabled(): boolean {
  return envFlag("LAUNCH_SCOPE_STRICT", true);
}

export function isSchoolPortalLaunchEnabled(): boolean {
  return envFlag("LAUNCH_ENABLE_SCHOOL_PORTAL", envFlag("NEXT_PUBLIC_LAUNCH_ENABLE_SCHOOL_PORTAL", false));
}

export function isRoadmapPublicEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_LAUNCH_ENABLE_ROADMAP", false);
}

export function isPublicTrialCtaEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_LAUNCH_ENABLE_PUBLIC_TRIAL_CTA", false);
}

export function isStudentCertificateCenterEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_LAUNCH_ENABLE_STUDENT_CERTIFICATES", false);
}

export function resolveLaunchScopeRedirect(input: {
  pathname: string;
  authenticated: boolean;
  role?: SessionRole | null;
}): string | null {
  if (!isLaunchScopeStrictEnabled()) return null;

  const pathname = input.pathname;
  const role = input.role ?? null;

  // Stable unavailable page must never re-enter school-portal redirect rules.
  if (pathname === "/school-portal-unavailable" || pathname.startsWith("/school-portal-unavailable/")) {
    return null;
  }

  const schoolPortalRoute =
    pathname.startsWith("/teacher")
    || pathname.startsWith("/school")
    || pathname.startsWith("/school-admin");

  if (schoolPortalRoute && !isSchoolPortalLaunchEnabled()) {
    if (!input.authenticated) return "/auth/login";
    if (role === "admin") return null;
    if (role === "parent") return "/parent/dashboard";
    // Teachers must NOT be sent to /student/dashboard (middleware would bounce them back → loop).
    if (role === "teacher") return "/school-portal-unavailable";
    return "/student/dashboard";
  }

  return null;
}

/** Stable destination when School Portal is disabled for a teacher account. */
export const SCHOOL_PORTAL_UNAVAILABLE_PATH = "/school-portal-unavailable";

/**
 * Teacher bounce away from learner/parent surfaces.
 * When School Portal is off, bounce to the unavailable page — never /teacher (avoids loops).
 */
export function resolveTeacherPortalBounce(input: {
  pathname: string;
  role?: SessionRole | null;
}): string | null {
  if (input.role !== "teacher") return null;
  const pathname = input.pathname;
  if (pathname === SCHOOL_PORTAL_UNAVAILABLE_PATH || pathname.startsWith(`${SCHOOL_PORTAL_UNAVAILABLE_PATH}/`)) {
    return null;
  }
  const shouldBounce =
    pathname === "/profiles"
    || pathname === "/dashboard"
    || pathname.startsWith("/student")
    || pathname.startsWith("/parent");
  if (!shouldBounce) return null;
  if (!isSchoolPortalLaunchEnabled()) return SCHOOL_PORTAL_UNAVAILABLE_PATH;
  return "/teacher";
}

const ADMIN_BETA_TAGS: Record<string, AdminLaunchTag> = {
  "/admin/knowledge-graph": "beta",
  "/admin/recovery-governance": "beta",
  "/admin/ai-generator": "beta",
  "/admin/trial-leads": "beta",
  "/admin/voice-media": "beta",
  "/admin/integrations/truenumeris": "beta",
};

export function getAdminLaunchTag(href: string): AdminLaunchTag | null {
  return ADMIN_BETA_TAGS[href] ?? null;
}
