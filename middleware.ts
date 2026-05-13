import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "starliz_session";
const PARENT_UNLOCK_COOKIE = "starliz_parent_unlock";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/auth/forgot-password",
  "/admin/login",
  "/auth/reset-password",
  "/billing/cancel",
  "/billing/success",
  "/contact",
  "/forgot-password",
  "/login",
  "/pricing",
  "/reset-password",
  "/signup",
  "/terms",
  "/auth/login",
  "/auth/signup",
  "/privacy",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/invite/accept",
];

type DecodedSession = { userId: string; email: string; role: string };

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "microphone=(), camera=(), geolocation=()");
  return response;
}

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error("AUTH_SECRET is required. Set it in your environment before starting the app.");
  }
  return new TextEncoder().encode(raw);
}

async function getSessionPayload(request: NextRequest): Promise<DecodedSession | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: String(payload.userId ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "parent"),
    };
  } catch {
    return null;
  }
}

async function hasParentUnlock(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(PARENT_UNLOCK_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next")
    || pathname === "/api/branding"
    || pathname.startsWith("/api/auth")
    || pathname === "/api/billing/stripe/webhook"
    || pathname === "/api/webhooks/stripe-school"
    || pathname.startsWith("/icons")
    || pathname.startsWith("/screenshots")
    || pathname.includes(".")
  ) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (
    process.env.NODE_ENV === "production"
    && request.method === "POST"
    && /^\/api\/admin\/students\/[^/]+\/attempts$/.test(pathname)
  ) {
    return withSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const session = await getSessionPayload(request);
  const authenticated = session !== null;
  const adminLoginTarget = request.nextUrl.searchParams.get("next")?.startsWith("/admin") ?? false;

  if (pathname.startsWith("/admin")) {
    if (!authenticated) {
      // Allow unauthenticated access to /admin/login, redirect all other admin routes there.
      if (pathname !== "/admin/login") {
        const next = `${pathname}${request.nextUrl.search}`;
        const target = new URL(`/admin/login?next=${encodeURIComponent(next)}`, request.url);
        return withSecurityHeaders(NextResponse.redirect(target));
      }
    } else if (session.role !== "admin") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
    } else if (pathname === "/admin/login") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/admin", request.url)));
    }
  }

  if (!authenticated && !isPublic) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/login", request.url)));
  }

  if (authenticated && (pathname === "/login" || pathname === "/signup" || pathname === "/auth/login" || pathname === "/auth/signup") && !adminLoginTarget) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/profiles", request.url)));
  }

  // Teacher portal: must be authenticated (role check happens in each page/layout)
  if (pathname.startsWith("/teacher") && !authenticated) {
    return withSecurityHeaders(NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url)));
  }

  if (authenticated && pathname.startsWith("/parent") && !pathname.startsWith("/parent-pin")) {
    if (session.role !== "parent") {
      const fallback = session.role === "admin" ? "/admin" : "/student/dashboard";
      return withSecurityHeaders(NextResponse.redirect(new URL(fallback, request.url)));
    }

    const unlocked = await hasParentUnlock(request);
    if (!unlocked) {
      const next = `${pathname}${request.nextUrl.search}`;
      const pinUrl = new URL(`/parent-pin?next=${encodeURIComponent(next)}`, request.url);
      return withSecurityHeaders(NextResponse.redirect(pinUrl));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/:path*"],
};
