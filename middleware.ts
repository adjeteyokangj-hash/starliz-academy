import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "starliz_session";
const REFRESH_COOKIE_NAME = "starliz_refresh";
const PARENT_UNLOCK_COOKIE = "starliz_parent_unlock";
const CHILD_SELECTION_COOKIE = "starliz_child_selection";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/api/pricing",
  "/auth/forgot-password",
  "/admin/login",
  "/auth/reset-password",
  "/billing/cancel",
  "/billing/success",
  "/contact",
  "/features",
  "/forgot-password",
  "/login",
  "/pricing",
  "/reset-password",
  "/signup",
  "/policies",
  "/terms",
  "/auth/login",
  "/auth/signup",
  "/privacy",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/invite/accept",
  // Country-specific public landing pages
  "/uk",
  "/ghana",
  "/nigeria",
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
    const { payload } = await jwtVerify(token, getSecret());
    return String(payload.scope ?? "") === "parent-unlock";
  } catch {
    return false;
  }
}

async function hasChildSelection(request: NextRequest, expectedUserId: string): Promise<boolean> {
  const token = request.cookies.get(CHILD_SELECTION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (
      String(payload.scope ?? "") === "child-selection"
      && String(payload.userId ?? "") === expectedUserId
      && String(payload.childId ?? "").trim().length > 0
    );
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPrefetch = request.headers.get("purpose") === "prefetch" || request.headers.has("next-router-prefetch");
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
  const isDocumentNavigation = request.headers.get("sec-fetch-mode") === "navigate" || acceptsHtml;

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
  const hasRefreshToken = Boolean(request.cookies.get(REFRESH_COOKIE_NAME)?.value);
  const shouldAttemptRefresh = hasRefreshToken && request.method === "GET" && isDocumentNavigation && !isPrefetch;
  const adminLoginTarget = request.nextUrl.searchParams.get("next")?.startsWith("/admin") ?? false;
  const shouldClearParentUnlock = Boolean(
    authenticated
      && session?.role === "parent"
      && request.cookies.get(PARENT_UNLOCK_COOKIE)?.value
      && (pathname.startsWith("/parent/profiles") || !pathname.startsWith("/parent"))
  );

  const finalize = (response: NextResponse): NextResponse => {
    if (shouldClearParentUnlock) {
      response.cookies.set(PARENT_UNLOCK_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
    }
    return withSecurityHeaders(response);
  };

  if (pathname.startsWith("/admin")) {
    if (!authenticated) {
      // Allow unauthenticated access to /admin/login, redirect all other admin routes there.
      if (pathname !== "/admin/login") {
        const next = `${pathname}${request.nextUrl.search}`;
        if (shouldAttemptRefresh) {
          const refreshTarget = new URL(`/api/auth/refresh?next=${encodeURIComponent(next)}`, request.url);
          return finalize(NextResponse.redirect(refreshTarget));
        }
        const target = new URL(`/admin/login?next=${encodeURIComponent(next)}`, request.url);
        return finalize(NextResponse.redirect(target));
      }
    } else if (session.role !== "admin") {
      return finalize(NextResponse.redirect(new URL("/dashboard", request.url)));
    } else if (pathname === "/admin/login") {
      return finalize(NextResponse.redirect(new URL("/admin", request.url)));
    }
  }

  if (!authenticated && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return finalize(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (shouldAttemptRefresh) {
      const next = `${pathname}${request.nextUrl.search}`;
      const refreshTarget = new URL(`/api/auth/refresh?next=${encodeURIComponent(next)}`, request.url);
      return finalize(NextResponse.redirect(refreshTarget));
    }
    return finalize(NextResponse.redirect(new URL("/auth/login", request.url)));
  }

  if (authenticated && (pathname === "/login" || pathname === "/signup" || pathname === "/auth/login" || pathname === "/auth/signup") && !adminLoginTarget) {
    if (session.role === "admin") {
      return finalize(NextResponse.redirect(new URL("/admin", request.url)));
    }
    if (session.role === "student") {
      return finalize(NextResponse.redirect(new URL("/student/dashboard", request.url)));
    }
    return finalize(NextResponse.redirect(new URL("/parent/profiles", request.url)));
  }

  if (authenticated && session.role === "student") {
    if (pathname === "/my-profile") {
      return finalize(NextResponse.redirect(new URL("/student/profile", request.url)));
    }

    if (pathname.startsWith("/parent/profile")) {
      return finalize(NextResponse.redirect(new URL("/student/profile", request.url)));
    }

    if (pathname.startsWith("/parent") || pathname.startsWith("/parent-pin")) {
      return finalize(NextResponse.redirect(new URL("/student/dashboard", request.url)));
    }

    if (pathname.startsWith("/billing") || pathname.startsWith("/subscription")) {
      return finalize(NextResponse.redirect(new URL("/student/dashboard", request.url)));
    }
  }

  if (authenticated && pathname.startsWith("/student/profile") && session.role !== "student") {
    const fallback = session.role === "admin" ? "/admin" : "/my-profile";
    return finalize(NextResponse.redirect(new URL(fallback, request.url)));
  }

  if (authenticated && pathname === "/my-profile") {
    if (session.role === "parent") {
      return finalize(NextResponse.redirect(new URL("/parent/profile", request.url)));
    }
    if (session.role === "admin") {
      return finalize(NextResponse.redirect(new URL("/admin", request.url)));
    }
  }

  // Teacher portal: must be authenticated (role check happens in each page/layout)
  if (pathname.startsWith("/teacher") && !authenticated) {
    return finalize(NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url)));
  }

  const parentProtectedRoute =
    pathname === "/parent"
    || (pathname.startsWith("/parent/") && !pathname.startsWith("/parent/profiles"));

  if (authenticated && parentProtectedRoute) {
    if (session.role !== "parent") {
      const fallback = session.role === "admin" ? "/admin" : "/student/dashboard";
      return finalize(NextResponse.redirect(new URL(fallback, request.url)));
    }

    const unlocked = await hasParentUnlock(request);
    if (!unlocked) {
      const next = `${pathname}${request.nextUrl.search}`;
      const profilesUrl = new URL(`/parent/profiles?intent=parent&next=${encodeURIComponent(next)}`, request.url);
      return finalize(NextResponse.redirect(profilesUrl));
    }

    if (pathname === "/parent") {
      return finalize(NextResponse.redirect(new URL("/parent/dashboard", request.url)));
    }
  }

  if (authenticated && session.role === "parent" && (pathname === "/dashboard" || pathname.startsWith("/student"))) {
    const selectedChild = await hasChildSelection(request, session.userId);
    if (!selectedChild) {
      const profilesUrl = new URL("/parent/profiles?intent=child", request.url);
      return finalize(NextResponse.redirect(profilesUrl));
    }
  }

  // Billing and subscription routes require parent role
  if (
    authenticated &&
    (pathname.startsWith("/billing") || pathname.startsWith("/subscription")) &&
    session.role !== "parent" &&
    session.role !== "admin"
  ) {
    return finalize(NextResponse.redirect(new URL("/student/dashboard", request.url)));
  }

  return finalize(NextResponse.next());
}

export const config = {
  matcher: ["/:path*"],
};
