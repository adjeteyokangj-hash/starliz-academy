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
  const schoolPortalRoute = pathname.startsWith("/teacher") || pathname.startsWith("/school");

  if (schoolPortalRoute && !isSchoolPortalLaunchEnabled()) {
    if (!input.authenticated) return "/auth/login";
    if (role === "admin") return null;
    if (role === "parent") return "/parent/dashboard";
    return "/student/dashboard";
  }

  return null;
}

const ADMIN_BETA_TAGS: Record<string, AdminLaunchTag> = {
  "/admin/knowledge-graph": "beta",
  "/admin/recovery-governance": "beta",
  "/admin/ai": "beta",
  "/admin/trial-leads": "beta",
  "/admin/voice-media": "beta",
  "/admin/integrations/truenumeris": "beta",
};

export function getAdminLaunchTag(href: string): AdminLaunchTag | null {
  return ADMIN_BETA_TAGS[href] ?? null;
}
