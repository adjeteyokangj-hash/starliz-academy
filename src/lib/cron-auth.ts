/**
 * Shared auth for /api/cron/* handlers.
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on GET.
 * Manual/ops callers may use the same Bearer header or `x-cron-secret`.
 */
export function hasCronAccess(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (
    request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-cron-secret") === secret
  );
}
