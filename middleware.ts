import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePlatformAdminGate } from "@/lib/admin-auth-gate";
import { resolveLaunchScopeRedirect } from "@/lib/launch-scope";

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
  "/short-learning",
  "/reset-password",
  "/signup",
  "/policies",
  "/terms",
  "/auth/login",
  "/auth/signup",
  "/privacy",
  "/faq",
  "/cookies",
  "/safeguarding-policy",
  "/data-retention",
  "/ai-use",
  "/knowledge-centre",
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
    || pathname.startsWith("/api/cron")
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
  // Soft App Router navigations (RSC) often omit sec-fetch-mode=navigate; still refresh
  // when a refresh cookie exists so active users are not bounced to login.
  const isSoftNavigation = request.headers.has("rsc") || request.headers.has("next-router-state-tree");
  const shouldAttemptRefresh =
    hasRefreshToken
    && request.method === "GET"
    && !isPrefetch
    && !pathname.startsWith("/api/")
    && (isDocumentNavigation || isSoftNavigation);
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

  // Platform admin gate (Next.js request interceptor): hard-redirect before any admin UI.
  const adminGate = resolvePlatformAdminGate({
    pathname,
    search: request.nextUrl.search,
    session: authenticated ? { role: session!.role } : null,
  });
  if (adminGate.action === "redirect") {
    return finalize(NextResponse.redirect(new URL(adminGate.to, request.url), adminGate.status));
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
    if (session.role === "teacher") {
      return finalize(NextResponse.redirect(new URL("/teacher", request.url)));
    }
    return finalize(NextResponse.redirect(new URL("/parent/profiles", request.url)));
  }

  const launchScopeRedirect = resolveLaunchScopeRedirect({
    pathname,
    authenticated,
    role: session?.role,
  });
  if (launchScopeRedirect) {
    return finalize(NextResponse.redirect(new URL(launchScopeRedirect, request.url)));
  }

  if (authenticated && session.role === "teacher") {
    if (
      pathname === "/profiles"
      || pathname === "/dashboard"
      || pathname.startsWith("/student")
      || pathname.startsWith("/parent")
    ) {
      return finalize(NextResponse.redirect(new URL("/teacher", request.url)));
    }
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

  // Teacher / school-admin portal: must be authenticated (role check happens in each page/layout)
  if ((pathname.startsWith("/teacher") || pathname.startsWith("/school-admin")) && !authenticated) {
    return finalize(NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(pathname)}`, request.url)));
  }

  if (authenticated && pathname.startsWith("/school-admin") && session.role !== "teacher" && session.role !== "admin") {
    const fallback =
      session.role === "parent" ? "/parent/profiles"
      : session.role === "student" ? "/student/dashboard"
      : "/";
    return finalize(NextResponse.redirect(new URL(fallback, request.url)));
  }

  const parentProtectedRoute =
    pathname === "/parent"
    || (pathname.startsWith("/parent/") && !pathname.startsWith("/parent/profiles"));

  if (authenticated && parentProtectedRoute) {
    if (session.role !== "parent") {
      const fallback =
        session.role === "admin" ? "/admin"
        : session.role === "teacher" ? "/teacher"
        : "/student/dashboard";
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-admin-login", pathname === "/admin/login" || pathname.startsWith("/admin/login/") ? "1" : "0");
  return finalize(NextResponse.next({ request: { headers: requestHeaders } }));
}

// Next.js AST-extracts only a literal `config` export for matchers (not a re-export).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
