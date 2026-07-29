import dns from "node:dns/promises";
import net from "node:net";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalised = ip.toLowerCase();
  if (normalised === "::1" || normalised === "::") return true;
  if (normalised.startsWith("fc") || normalised.startsWith("fd")) return true; // ULA
  if (normalised.startsWith("fe80")) return true; // link-local
  // IPv4-mapped IPv6
  if (normalised.includes(".")) {
    const mapped = normalised.split(":").pop() ?? "";
    if (net.isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function requireHttpsInProduction(url: URL): void {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTPS URLs are allowed in production.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("Only HTTP(S) URLs are allowed.");
  }
}

async function resolveAndAssertSafeHost(hostname: string): Promise<string[]> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("Hostname is required.");
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new UnsafeUrlError("Hostname is not allowed.");
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new UnsafeUrlError("Hostname is not allowed.");
  }

  // Literal IP in hostname
  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new UnsafeUrlError("Private or link-local addresses are not allowed.");
    }
    return [host];
  }

  let addresses: string[];
  try {
    const results = await dns.lookup(host, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new UnsafeUrlError("Could not resolve hostname.");
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError("Could not resolve hostname.");
  }

  for (const addr of addresses) {
    if (isPrivateOrBlockedIp(addr)) {
      throw new UnsafeUrlError("Resolved address is private or blocked.");
    }
  }

  return addresses;
}

/**
 * Validate that a URL is safe to request from the server (SSRF guard).
 * Resolves DNS and rejects private / metadata targets.
 */
export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }

  requireHttpsInProduction(url);

  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }

  await resolveAndAssertSafeHost(url.hostname);
  return url;
}

export type FetchSafeOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** Injected for tests */
  fetchImpl?: typeof fetch;
  redirect?: RequestRedirect;
};

export type FetchSafeResult = {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText: string;
  finalUrl: string;
};

/**
 * Fetch an external URL with SSRF protections:
 * HTTPS-only in production, DNS revalidation, private-net block, redirect revalidation,
 * response size limit, and strict timeout.
 */
export async function fetchSafeExternal(
  rawUrl: string,
  options: FetchSafeOptions = {},
): Promise<FetchSafeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const fetchImpl = options.fetchImpl ?? fetch;

  let currentUrl = await assertSafeExternalUrl(rawUrl);
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(currentUrl.toString(), {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body ?? undefined,
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new UnsafeUrlError("Redirect without Location header.");
        }
        redirects += 1;
        if (redirects > MAX_REDIRECTS) {
          throw new UnsafeUrlError("Too many redirects.");
        }
        const next = new URL(location, currentUrl);
        currentUrl = await assertSafeExternalUrl(next.toString());
        continue;
      }

      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.byteLength;
            if (total > maxBytes) {
              try {
                await reader.cancel();
              } catch {
                /* ignore */
              }
              throw new UnsafeUrlError("Response exceeds size limit.");
            }
            chunks.push(value);
          }
        }
      }

      const bodyText = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        bodyText: bodyText.slice(0, maxBytes),
        finalUrl: currentUrl.toString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
