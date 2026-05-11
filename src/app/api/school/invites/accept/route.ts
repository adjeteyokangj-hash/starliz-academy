/**
 * Generic school invite acceptance
 *
 * GET  /api/school/invites/accept?token=<raw>  — preview invite (unauthenticated)
 * POST /api/school/invites/accept              — accept invite: set password, activate teacher
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, getAuthCookieName, getSessionMaxAgeSeconds } from "@/lib/auth";
import { validateSchoolInviteToken, consumeSchoolInviteToken } from "@/lib/schools/invite_tokens";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { checkRateLimit, getRequestIp } from "@/lib/api_guard";

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120).optional(),
});

// ─── GET: validate token, return preview ─────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token");

  if (!raw) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const { valid, reason, token } = await validateSchoolInviteToken(raw);

  if (!valid || !token) {
    return NextResponse.json(
      { error: reason === "EXPIRED" ? "This invite link has expired." : "Invalid or already-used invite link." },
      { status: 410 }
    );
  }

  // Resolve metadata to get schoolTeacherId
  let meta: Record<string, unknown> = {};
  try {
    meta = token.metadataJson ? JSON.parse(token.metadataJson) : {};
  } catch {
    // ignore
  }

  return NextResponse.json({
    valid: true,
    schoolName: token.school.name,
    schoolId: token.schoolId,
    targetEmail: token.targetEmail,
    inviteType: token.inviteType,
    role: token.targetRole ?? "teacher",
    expiresAt: token.expiresAt.toISOString(),
    schoolTeacherId: meta.schoolTeacherId ?? null,
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

  const { valid, reason, token } = await validateSchoolInviteToken(body.token);

  if (!valid || !token) {
    return NextResponse.json(
      { error: reason === "EXPIRED" ? "This invite link has expired." : "Invalid or already-used invite link." },
      { status: 410 }
    );
  }

  // Resolve schoolTeacherId from token metadata
  let meta: Record<string, unknown> = {};
  try {
    meta = token.metadataJson ? JSON.parse(token.metadataJson) : {};
  } catch {
    // ignore
  }

  const schoolTeacherId = typeof meta.schoolTeacherId === "string" ? meta.schoolTeacherId : null;
  const userId = typeof meta.userId === "string" ? meta.userId : null;

  if (!schoolTeacherId || !userId) {
    return NextResponse.json({ error: "Invite metadata is invalid. Please request a new invite." }, { status: 422 });
  }

  // Verify the SchoolTeacher record is still in invited state
  const schoolTeacher = await prisma.schoolTeacher.findUnique({
    where: { id: schoolTeacherId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      school: { select: { id: true, name: true } },
    },
  });

  if (!schoolTeacher) {
    return NextResponse.json({ error: "Teacher record not found. Please request a new invite." }, { status: 404 });
  }

  if (schoolTeacher.status === "active") {
    return NextResponse.json({ error: "This account is already active. Please log in." }, { status: 409 });
  }

  // Set password and activate
  const passwordHash = await hashPassword(body.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        ...(body.name ? { name: body.name } : {}),
        role: "teacher",
      },
    }),
    prisma.schoolTeacher.update({
      where: { id: schoolTeacherId },
      data: {
        status: "active",
        acceptedAt: new Date(),
      },
    }),
  ]);

  // Consume the token
  await consumeSchoolInviteToken(token.id, userId);

  await writeSchoolAuditLog({
    schoolId: token.schoolId,
    actorUserId: userId,
    action: "invite_accepted",
    entityType: "teacher",
    entityId: schoolTeacherId,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: {
      inviteType: token.inviteType,
      role: token.targetRole,
      schoolTeacherId,
    },
    severity: "info",
  });

  // Issue session
  const sessionToken = await createSessionToken({
    userId,
    email: schoolTeacher.user.email,
    role: "teacher",
  });

  const cookieName = getAuthCookieName();
  const maxAge = getSessionMaxAgeSeconds();

  const res = NextResponse.json({
    ok: true,
    schoolName: schoolTeacher.school.name,
    user: {
      id: userId,
      email: schoolTeacher.user.email,
      name: body.name ?? schoolTeacher.user.name,
      role: "teacher",
    },
    redirectTo: "/teacher",
  });

  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });

  return res;
}
