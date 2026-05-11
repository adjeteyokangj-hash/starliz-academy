/**
 * Teacher invite acceptance endpoint.
 *
 * GET  /api/auth/teacher-invite?token=<raw>  — validate token, return school/teacher info
 * POST /api/auth/teacher-invite              — accept invite: set password, activate teacher
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, getAuthCookieName, getSessionMaxAgeSeconds } from "@/lib/auth";
import { validateInviteToken, consumeInviteToken } from "@/lib/schools/invite";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { checkRateLimit, getRequestIp } from "@/lib/api_guard";

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120).optional(),
});

// ─── GET: validate token + return invite preview ──────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token");

  if (!raw) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { valid, reason, token } = await validateInviteToken(raw);

  if (!valid || !token) {
    return NextResponse.json(
      { error: reason === "EXPIRED" ? "This invite link has expired." : "Invalid or already-used invite link." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    valid: true,
    schoolName: token.schoolTeacher.school.name,
    teacherEmail: token.schoolTeacher.user.email,
    teacherName: token.schoolTeacher.user.name,
    role: token.schoolTeacher.role,
    expiresAt: token.expiresAt.toISOString(),
  });
}

// ─── POST: accept invite ──────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const rateCheck = checkRateLimit({ key: `invite:accept:${ip}`, limit: 10, windowMs: 60_000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: z.infer<typeof acceptSchema>;
  try {
    body = acceptSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { valid, reason, token } = await validateInviteToken(body.token);

  if (!valid || !token) {
    return NextResponse.json(
      { error: reason === "EXPIRED" ? "This invite link has expired." : "Invalid or already-used invite link." },
      { status: 410 }
    );
  }

  const { schoolTeacher } = token;
  const userId = schoolTeacher.userId;
  const schoolId = schoolTeacher.schoolId;

  // Update user password (and optionally name)
  const passwordHash = await hashPassword(body.password);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      ...(body.name ? { name: body.name } : {}),
      role: "teacher",
    },
  });

  // Activate SchoolTeacher record
  await prisma.schoolTeacher.update({
    where: { id: schoolTeacher.id },
    data: {
      status: "active",
      acceptedAt: new Date(),
    },
  });

  // Consume token
  await consumeInviteToken(token.id);

  // Audit trail
  await writeSchoolAuditLog({
    schoolId,
    actorUserId: userId,
    action: "invite_accepted",
    entityType: "teacher",
    entityId: schoolTeacher.id,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: {
      schoolTeacherRole: schoolTeacher.role,
      schoolTeacherId: schoolTeacher.id,
    },
    severity: "info",
  });

  // Issue session cookie
  const sessionToken = await createSessionToken({
    userId,
    email: schoolTeacher.user.email,
    role: "teacher",
  });

  const response = NextResponse.json({
    ok: true,
    schoolName: schoolTeacher.school.name,
    user: {
      id: userId,
      email: schoolTeacher.user.email,
      name: body.name ?? schoolTeacher.user.name,
      role: "teacher",
    },
  });

  response.cookies.set(getAuthCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSessionMaxAgeSeconds(),
  });

  return response;
}
