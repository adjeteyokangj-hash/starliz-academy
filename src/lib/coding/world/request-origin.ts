/** Browsers bind Host to their destination. Next may normalise request.url to
 * localhost behind its development server, so compare the actual Host too.
 * Forwarded-host headers are deliberately not trusted here. */
export function worldRequestIsSameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin=request.headers.get('origin');
  if (!origin) return true;
  const url=new URL(request.url);
  const host=request.headers.get('host');
  if(!host) return origin===url.origin;
  if(/[\s/@\\?#]/.test(host)) return false;
  try { return origin===new URL(`${url.protocol}//${host}`).origin; } catch { return false; }
}
