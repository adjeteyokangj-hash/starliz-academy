/**
 * Paths that use generated StarLiz API keys (Bearer), not browser sessions.
 */
export function isExternalApiRoute(pathname: string): boolean {
  return pathname === "/api/external" || pathname.startsWith("/api/external/");
}

/** Session-cookie APIs that must never be treated as external-key routes. */
export function isBrowserSessionApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/admin")
    || pathname.startsWith("/api/student")
    || pathname.startsWith("/api/teacher")
  );
}
