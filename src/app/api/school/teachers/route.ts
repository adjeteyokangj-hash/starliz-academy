import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email-provider";
import {
  createPasswordResetToken,
  getPasswordResetExpiry,
  PASSWORD_RESET_TTL_MINUTES,
} from "@/lib/password-reset";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import {
  canAssignSchoolRole,
  canManageSchoolOwnership,
  canManageTargetStaffMember,
} from "@/lib/schools/permissions";

const statusFilterSchema = z.enum(["all", "active", "invited", "suspended", "archived"]);
const roleSchema = z.enum(["admin", "teacher", "support", "staff_observer", "finance"]);

const patchSchema = z
  .object({
    schoolId: z.string().min(1),
    teacherId: z.string().min(1),
    action: z.enum(["suspend", "reactivate", "changeRole", "archive", "resetPassword"]),
    role: roleSchema.optional(),
  })
  .refine((value) => value.action !== "changeRole" || Boolean(value.role), {
    message: "role is required for changeRole action",
    path: ["role"],
  });

function schoolAppOrigin() {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

function buildStaffResetEmail(resetUrl: string, staffName: string | null, schoolName: string) {
  const name = staffName ?? "there";
  return {
    subject: `Reset your ${schoolName} staff password`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h1 style="font-size:24px">Reset your StarLiz Academy password</h1>
        <p>Hello ${name},</p>
        <p>A school administrator at <strong>${schoolName}</strong> requested a password reset for your staff account.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
            Reset password
          </a>
        </p>
        <p>This secure link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not expect this email, contact your school administrator.</p>
      </div>
    `,
    text: [
      "Reset your StarLiz Academy password",
      "",
      `Hello ${name},`,
      `A school administrator at ${schoolName} requested a password reset for your staff account.`,
      `Open this secure link to choose a new password: ${resetUrl}`,
      "",
      `This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`,
      "If you did not expect this email, contact your school administrator.",
    ].join("\n"),
  };
}

const teacherInclude = {
  user: { select: { id: true, name: true, email: true } },
  classrooms: { select: { id: true, name: true } },
  tutorPresence: { select: { status: true, lastHeartbeatAt: true } },
  tutorSupportShifts: {
    where: {
      startsAt: { gte: new Date(0) },
      status: { not: "cancelled" as const },
    },
    select: { id: true, startsAt: true, endsAt: true, status: true },
    take: 50,
    orderBy: { startsAt: "asc" as const },
  },
} satisfies Prisma.SchoolTeacherInclude;

type TeacherRecord = Prisma.SchoolTeacherGetPayload<{ include: typeof teacherInclude }>;

function serializeTeacher(teacher: TeacherRecord, actorUserId: string) {
  const now = Date.now();
  const upcomingShifts = (teacher.tutorSupportShifts ?? []).filter(
    (shift) => new Date(shift.startsAt).getTime() >= now && shift.status !== "cancelled",
  );
  return {
    id: teacher.id,
    schoolId: teacher.schoolId,
    userId: teacher.userId,
    role: teacher.role,
    status: teacher.status,
    title: teacher.title,
    invitedAt: teacher.invitedAt?.toISOString() ?? null,
    acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
    lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
    createdAt: teacher.createdAt.toISOString(),
    updatedAt: teacher.updatedAt.toISOString(),
    isCurrentActor: teacher.userId === actorUserId,
    user: teacher.user,
    classrooms: teacher.classrooms,
    shortLearning: {
      eligible:
        teacher.role === "support" ||
        teacher.role === "teacher" ||
        teacher.role === "owner" ||
        teacher.role === "admin",
      upcomingShiftsCount: upcomingShifts.length,
      presenceStatus: teacher.tutorPresence?.status ?? null,
      lastHeartbeatAt: teacher.tutorPresence?.lastHeartbeatAt?.toISOString() ?? null,
    },
    safeguardingAccess: teacher.role === "owner" || teacher.role === "admin",
  };
}

function liveTeacherInclude() {
  return {
    ...teacherInclude,
    tutorSupportShifts: {
      where: {
        startsAt: { gte: new Date() },
        status: { not: "cancelled" as const },
      },
      select: { id: true, startsAt: true, endsAt: true, status: true },
      take: 20,
      orderBy: { startsAt: "asc" as const },
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const statusFilterResult = statusFilterSchema.safeParse(searchParams.get("status") ?? "all");
  if (!statusFilterResult.success) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const { context, response } = await requireSchoolPermission(schoolId, "manageTeachers", {
    method: "GET",
    route: "/api/school/teachers",
    resourceType: "teacher",
  });
  if (response) return response;

  const statusFilter = statusFilterResult.data;
  const teachers = await prisma.schoolTeacher.findMany({
    where: {
      schoolId,
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
    },
    include: liveTeacherInclude(),
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    teachers: teachers.map((teacher) => serializeTeacher(teacher, context.userId)),
  });
}

export async function PATCH(request: Request) {
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { context, response } = await requireSchoolPermission(body.schoolId, "manageTeachers", {
    method: "PATCH",
    route: "/api/school/teachers",
    resourceType: "teacher",
    resourceId: body.teacherId,
  });
  if (response) return response;

  const include = liveTeacherInclude();
  const teacher = await prisma.schoolTeacher.findUnique({
    where: { id: body.teacherId },
    include,
  });

  if (!teacher || teacher.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
  }

  if (teacher.role === "owner") {
    return NextResponse.json({ error: "Owner role cannot be modified from this endpoint." }, { status: 403 });
  }

  if (teacher.userId === context.userId) {
    return NextResponse.json({ error: "You cannot modify your own teacher account here." }, { status: 403 });
  }

  if (!canManageTargetStaffMember(context.role, teacher.role)) {
    return NextResponse.json(
      { error: "You do not have permission to manage this staff member." },
      { status: 403 },
    );
  }

  if (body.action === "changeRole") {
    if (!body.role) {
      return NextResponse.json({ error: "role is required" }, { status: 400 });
    }

    if (!canAssignSchoolRole(context.role, body.role)) {
      return NextResponse.json(
        {
          error: canManageSchoolOwnership(context.role)
            ? "You cannot assign that role."
            : "Only the School Owner can invite or assign School Admin / School Owner.",
        },
        { status: 403 },
      );
    }

    const updated = await prisma.schoolTeacher.update({
      where: { id: teacher.id },
      data: { role: body.role },
      include,
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "school_status_changed",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        mode: "role_change",
        fromRole: teacher.role,
        toRole: body.role,
        teacherEmail: teacher.user.email,
      },
      severity: "info",
    });

    return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
  }

  if (body.action === "suspend") {
    const updated = await prisma.schoolTeacher.update({
      where: { id: teacher.id },
      data: { status: "suspended" },
      include,
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "teacher_suspended",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        previousStatus: teacher.status,
        nextStatus: "suspended",
        teacherEmail: teacher.user.email,
      },
      severity: "warning",
    });

    return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
  }

  if (body.action === "archive") {
    const updated = await prisma.schoolTeacher.update({
      where: { id: teacher.id },
      data: { status: "archived" },
      include,
    });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "teacher_archived",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        previousStatus: teacher.status,
        nextStatus: "archived",
        teacherEmail: teacher.user.email,
      },
      severity: "warning",
    });

    return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
  }

  if (body.action === "resetPassword") {
    if (teacher.status === "archived") {
      return NextResponse.json(
        { error: "Reactivate this staff member before sending a password reset." },
        { status: 400 },
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: body.schoolId },
      select: { name: true },
    });
    const { token, tokenHash } = createPasswordResetToken();
    const resetUrl = `${schoolAppOrigin()}/auth/reset-password?token=${encodeURIComponent(token)}`;

    await prisma.user.update({
      where: { id: teacher.userId },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: getPasswordResetExpiry(),
      },
    });

    const emailContent = buildStaffResetEmail(
      resetUrl,
      teacher.user.name,
      school?.name ?? "your school",
    );
    const sent = await sendEmail({
      to: teacher.user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sent.ok) {
      console.error("[school/teachers/resetPassword] Email failed:", {
        reason: sent.reason,
        email: teacher.user.email,
      });
    }

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "teacher_password_reset",
      entityType: "teacher",
      entityId: teacher.id,
      metadata: {
        mode: "email_link",
        teacherEmail: teacher.user.email,
        teacherUserId: teacher.userId,
        emailSent: sent.ok,
        emailReason: sent.ok ? null : sent.reason,
      },
      severity: "warning",
    });

    return NextResponse.json({
      ok: true,
      emailSent: sent.ok,
      // Returned for manual copy when email delivery is unavailable (same trust boundary as invite links).
      resetUrl: sent.ok ? null : resetUrl,
      message: sent.ok
        ? `Password reset link sent to ${teacher.user.email}`
        : `Reset link prepared for ${teacher.user.email}, but email could not be sent. Copy the link to share securely.`,
    });
  }

  const updated = await prisma.schoolTeacher.update({
    where: { id: teacher.id },
    data: {
      status: "active",
      ...(teacher.acceptedAt ? {} : { acceptedAt: new Date() }),
    },
    include,
  });

  await writeSchoolAuditLog({
    schoolId: body.schoolId,
    actorUserId: context.userId,
    action: "teacher_activated",
    entityType: "teacher",
    entityId: teacher.id,
    metadata: {
      previousStatus: teacher.status,
      nextStatus: "active",
      teacherEmail: teacher.user.email,
    },
    severity: "info",
  });

  return NextResponse.json({ item: serializeTeacher(updated, context.userId) });
}
