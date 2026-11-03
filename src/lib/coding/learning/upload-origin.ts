/** NextURL canonicalises loopback IPs to localhost. Keep the browser's actual
 * origin distinct: only the exact loopback Host and port may recover that
 * development-only normalisation. Never trust forwarded-host headers. */
export function sameCodingUploadOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (process.env.NODE_ENV === "development" && target.hostname === "localhost" && host) {
    try {
      const transport = new URL(`${target.protocol}//${host}`);
      return ["localhost", "127.0.0.1", "[::1]"].includes(transport.hostname)
        && transport.host === host && transport.port === target.port
        && !transport.username && !transport.password && transport.pathname === "/"
        && !transport.search && !transport.hash && origin === transport.origin;
    } catch { return false; }
  }
  return origin === target.origin;
}
