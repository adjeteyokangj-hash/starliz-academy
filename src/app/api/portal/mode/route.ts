import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import {
  PORTAL_MODE_COOKIE,
  SCHOOL_ADMIN_HOME,
  TEACHER_HOME,
  isSchoolAdminRole,
} from "@/lib/schools/portal-routing";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";

function normalizeMode(value: string | null | undefined): "teaching" | "school_admin" | null {
  if (value === "teaching" || value === "school_admin") return value;
  return null;
}

function setPortalModeCookie(response: NextResponse, mode: "teaching" | "school_admin") {
  response.cookies.set(PORTAL_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Link-friendly switcher: /api/portal/mode?mode=teaching → cookie + redirect */
export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(request.url);
  const mode = normalizeMode(url.searchParams.get("mode"));
  if (!mode) {
    return NextResponse.json({ error: "mode must be teaching or school_admin." }, { status: 400 });
  }

  if (mode === "school_admin") {
    // Portal mode never elevates to platform Admin — membership check only.
    if (session.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    const ctx = await getSchoolTeacherContext(session.userId);
    if (!ctx || !isSchoolAdminRole(ctx.role)) {
      return NextResponse.redirect(new URL(TEACHER_HOME, request.url));
    }
  }

  const target = mode === "teaching" ? TEACHER_HOME : SCHOOL_ADMIN_HOME;
  const res = NextResponse.redirect(new URL(target, request.url));
  setPortalModeCookie(res, mode);
  return res;
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await request.json().catch(() => null);
  const mode = normalizeMode(
    body && typeof body === "object" ? String((body as { mode?: unknown }).mode ?? "") : null,
  );
  if (!mode) {
    return NextResponse.json({ error: "mode must be teaching or school_admin." }, { status: 400 });
  }

  if (mode === "school_admin") {
    if (session.role === "admin") {
      return NextResponse.json({ error: "Platform admins use /admin." }, { status: 403 });
    }
    const ctx = await getSchoolTeacherContext(session.userId);
    if (!ctx || !isSchoolAdminRole(ctx.role)) {
      return NextResponse.json({ error: "School admin membership required." }, { status: 403 });
    }
  }

  const res = NextResponse.json({
    ok: true,
    mode,
    redirectTo: mode === "teaching" ? TEACHER_HOME : SCHOOL_ADMIN_HOME,
  });
  setPortalModeCookie(res, mode);
  return res;
}
