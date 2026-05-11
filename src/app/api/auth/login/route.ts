import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionToken, getAccessTokenMaxAgeSeconds, getAuthCookieName, getRefreshCookieName, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getRequestIp } from "@/lib/api_guard";
import { evaluateUserSchoolLoginAccess } from "@/lib/schools/licensing";
import { writeSchoolAuditLog, writeSchoolLoginHistory } from "@/lib/schools/audit";
import { buildDeviceFingerprint, detectSuspiciousLogin, issueRefreshToken } from "@/lib/auth_sessions";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request);
    const rateCheck = checkRateLimit({ key: `auth:login:${ip}`, limit: 10, windowMs: 60_000 });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateCheck.retryAfterSeconds) },
        },
      );
    }

    const body = bodySchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      const teacherLink = await prisma.schoolTeacher.findFirst({
        where: { userId: user.id },
        select: { schoolId: true, role: true },
      });
      if (teacherLink) {
        await writeSchoolLoginHistory({
          schoolId: teacherLink.schoolId,
          userId: user.id,
          role: teacherLink.role,
          success: false,
          failReason: "wrong_password",
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") ?? undefined,
        });
      }
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const userAgent = request.headers.get("user-agent") ?? undefined;

    if (user.role !== "admin") {
      const schoolAccess = await evaluateUserSchoolLoginAccess(user.id);
      if (!schoolAccess.allowed) {
        // Record blocked login
        if (schoolAccess.schoolId) {
          const teacherLink = await prisma.schoolTeacher.findFirst({
            where: { userId: user.id, schoolId: schoolAccess.schoolId },
            select: { role: true },
          });
          await writeSchoolLoginHistory({
            schoolId: schoolAccess.schoolId,
            userId: user.id,
            role: teacherLink?.role ?? "teacher",
            success: false,
            failReason: schoolAccess.reason ?? "licence_blocked",
            ipAddress: ip,
            userAgent,
          });
        }
        return NextResponse.json(
          {
            error: "School licence does not currently allow sign in for this account.",
            licence: {
              reason: schoolAccess.reason,
              schoolId: schoolAccess.schoolId,
              schoolName: schoolAccess.schoolName,
              status: schoolAccess.status,
              trialEndsAt: schoolAccess.trialEndsAt ?? null,
              currentPeriodEnd: schoolAccess.currentPeriodEnd ?? null,
            },
          },
          { status: 403 },
        );
      }

      // Record successful school login
      const teacherLink = await prisma.schoolTeacher.findFirst({
        where: { userId: user.id, status: "active" },
        select: { schoolId: true, role: true },
      });
      if (teacherLink) {
        const suspicious = await detectSuspiciousLogin({
          userId: user.id,
          ipAddress: ip,
          userAgent,
        });

        await writeSchoolLoginHistory({
          schoolId: teacherLink.schoolId,
          userId: user.id,
          role: teacherLink.role,
          success: true,
          ipAddress: ip,
          userAgent,
        });

        if (suspicious.suspicious) {
          await writeSchoolAuditLog({
            schoolId: teacherLink.schoolId,
            actorUserId: user.id,
            action: "login_blocked",
            entityType: "system",
            metadata: {
              mode: "suspicious_detected",
              reason: suspicious.reason,
              failureCount: suspicious.failureCount,
              previousSuccessAt: suspicious.previousSuccessAt,
              ipAddress: ip,
            },
            severity: "warning",
          });
        }
      }
    }

    const fingerprint = buildDeviceFingerprint({ ip, userAgent });

    if (!process.env.AUTH_SECRET) {
      return NextResponse.json(
        { error: "Server auth is not configured. Set AUTH_SECRET in deployment environment." },
        { status: 500 },
      );
    }

    // Short-lived access token + rotating refresh token
    const token = await createSessionToken(
      { userId: user.id, email: user.email, role: user.role },
      getAccessTokenMaxAgeSeconds()
    );
    let refresh: Awaited<ReturnType<typeof issueRefreshToken>> | null = null;
    try {
      refresh = await issueRefreshToken({
        userId: user.id,
        fingerprint,
        ipAddress: ip,
        userAgent,
      });
    } catch (error) {
      // Keep login available even if refresh-token persistence is temporarily broken.
      console.error("Failed to issue refresh token; continuing with access token only", error);
    }

    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    response.cookies.set(getAuthCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAccessTokenMaxAgeSeconds(),
    });
    if (refresh) {
      response.cookies.set(getRefreshCookieName(), refresh.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "unknown_error";
    if (message.includes("AUTH_SECRET is required")) {
      return NextResponse.json(
        { error: "Server auth is not configured. Set AUTH_SECRET in deployment environment." },
        { status: 500 },
      );
    }

    console.error("Auth login failed", error);
    return NextResponse.json({ error: "Login is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
