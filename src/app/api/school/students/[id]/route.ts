import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { createSchoolInviteToken } from "@/lib/schools/invite_tokens";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { sendEmail } from "@/lib/email-provider";
import { buildSchoolInviteEmail } from "@/lib/emails/school-invite";
import {
  earlyPromoteStudent,
  listStudentYearChanges,
  recordManualYearChange,
  setStudentHoldBack,
} from "@/lib/schools/academic-year-rollover";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  schoolId: z.string().min(1),
  action: z.enum([
    "update",
    "archive",
    "reactivate",
    "transfer",
    "assignClass",
    "removeClass",
    "inviteGuardian",
    "linkGuardian",
    "suspendGuardian",
    "reactivateGuardian",
    "removeGuardian",
    "setPrimaryGuardian",
    "recordConsent",
    "resendGuardianInvite",
    "setHoldBack",
    "earlyPromote",
  ]),
  name: z.string().trim().min(1).max(120).optional(),
  yearGroup: z.string().trim().max(40).optional().nullable(),
  externalRef: z.string().trim().max(80).optional().nullable(),
  classroomId: z.string().min(1).optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  holdBackFromPromotion: z.boolean().optional(),
  guardianEmail: z.string().email().optional(),
  guardianFirstName: z.string().trim().max(80).optional(),
  guardianLastName: z.string().trim().max(80).optional(),
  relationship: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
  linkId: z.string().min(1).optional(),
  inviteId: z.string().min(1).optional(),
  consented: z.boolean().optional(),
});

function consentLabel(link: {
  status: string;
  consentGivenAt: Date | null;
  consentWithdrawnAt: Date | null;
}) {
  if (link.status === "removed") return "Removed";
  if (link.status === "suspended") return "Suspended";
  if (link.status === "pending_consent") return "Pending consent";
  if (link.status === "active" && !link.consentGivenAt) return "Pending consent";
  if (link.status === "active") return "Active";
  return link.status;
}

async function loadStudent(id: string, schoolId: string) {
  return prisma.schoolStudent.findFirst({
    where: { id, schoolId },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          yearGroup: true,
          age: true,
          parentId: true,
          studentProfile: { select: { dateOfBirth: true, senSupportNeeds: true, keyStageLevel: true } },
        },
      },
      classroom: {
        select: {
          id: true,
          name: true,
          yearGroup: true,
          teacher: { include: { user: { select: { name: true, email: true } } } },
        },
      },
      parentLinks: {
        where: { status: { not: "removed" } },
        include: {
          parent: {
            select: {
              id: true,
              name: true,
              email: true,
              parentProfile: { select: { phone: true, parentRole: true } },
            },
          },
        },
        orderBy: { invitedAt: "asc" },
      },
      learningBookings: {
        select: { id: true, status: true, startsAt: true },
        orderBy: { startsAt: "desc" },
        take: 5,
      },
    },
  });
}

function serialize(student: NonNullable<Awaited<ReturnType<typeof loadStudent>>>) {
  return {
    id: student.id,
    schoolId: student.schoolId,
    status: student.status,
    externalRef: student.externalRef,
    holdBackFromPromotion: student.holdBackFromPromotion,
    joinedAt: student.joinedAt.toISOString(),
    leftAt: student.leftAt?.toISOString() ?? null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
    child: {
      id: student.child.id,
      name: student.child.name,
      preferredName: null as string | null,
      yearGroup: student.child.yearGroup,
      age: student.child.age,
      parentId: student.child.parentId,
      dateOfBirth: student.child.studentProfile?.dateOfBirth?.toISOString() ?? null,
      senSupportNeeds: student.child.studentProfile?.senSupportNeeds ?? null,
      keyStage: student.child.studentProfile?.keyStageLevel ?? null,
    },
    classroom: student.classroom
      ? {
          id: student.classroom.id,
          name: student.classroom.name,
          yearGroup: student.classroom.yearGroup,
          teacherName: student.classroom.teacher?.user.name ?? student.classroom.teacher?.user.email ?? null,
        }
      : null,
    guardians: student.parentLinks.map((l) => ({
      id: l.id,
      parentUserId: l.parentUserId,
      name: l.parent.name,
      email: l.parent.email,
      phone: l.parent.parentProfile?.phone || null,
      relationship: l.parent.parentProfile?.parentRole || null,
      status: l.status,
      consentLabel: consentLabel(l),
      consentGivenAt: l.consentGivenAt?.toISOString() ?? null,
      invitedAt: l.invitedAt.toISOString(),
      isPrimary: l.parentUserId === student.child.parentId,
      canReceiveReports: l.canReceiveReports,
      canMessageTeachers: l.canMessageTeachers,
    })),
    recentBookings: student.learningBookings.map((b) => ({
      id: b.id,
      status: b.status,
      startsAt: b.startsAt.toISOString(),
    })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId is required" }, { status: 400 });

  const { response } = await requireSchoolPermission(schoolId, "manageStudents", {
    method: "GET",
    route: "/api/school/students/[id]",
    resourceType: "student",
    resourceId: id,
  });
  if (response) return response;

  const student = await loadStudent(id, schoolId);
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  const [classrooms, pendingInvites, auditLogs, yearChanges] = await Promise.all([
    prisma.classroom.findMany({
      where: { schoolId, status: "active" },
      select: { id: true, name: true, yearGroup: true },
      orderBy: { name: "asc" },
    }),
    prisma.schoolInviteToken.findMany({
      where: {
        schoolId,
        inviteType: "parent",
        targetSchoolStudentId: id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, targetEmail: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.schoolAuditLog.findMany({
      where: { schoolId, entityType: "student", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listStudentYearChanges({ schoolId, childId: student.childId, take: 20 }),
  ]);

  return NextResponse.json({
    item: serialize(student),
    classrooms,
    yearChanges: yearChanges.map((r) => ({
      id: r.id,
      fromYearGroup: r.fromYearGroup,
      toYearGroup: r.toYearGroup,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
    pendingInvites: pendingInvites.map((i) => ({
      id: i.id,
      targetEmail: i.targetEmail,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      status: "pending",
    })),
    auditLogs: auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      createdAt: l.createdAt.toISOString(),
      metadata: l.metadataJson ? JSON.parse(l.metadataJson) : null,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { context: access, response } = await requireSchoolPermission(body.schoolId, "manageStudents", {
    method: "PATCH",
    route: "/api/school/students/[id]",
    resourceType: "student",
    resourceId: id,
  });
  if (response) return response;

  const student = await prisma.schoolStudent.findFirst({
    where: { id, schoolId: body.schoolId },
    include: {
      child: { select: { id: true, parentId: true, name: true, yearGroup: true } },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  if (body.action === "setHoldBack") {
    if (typeof body.holdBackFromPromotion !== "boolean") {
      return NextResponse.json({ error: "holdBackFromPromotion is required." }, { status: 400 });
    }
    const result = await setStudentHoldBack({
      schoolId: body.schoolId,
      schoolStudentId: id,
      holdBack: body.holdBackFromPromotion,
      actorUserId: access.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, holdBackFromPromotion: body.holdBackFromPromotion });
  }

  if (body.action === "earlyPromote") {
    const result = await earlyPromoteStudent({
      schoolId: body.schoolId,
      schoolStudentId: id,
      actorUserId: access.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, from: result.from, to: result.to });
  }

  if (body.action === "archive" || body.action === "transfer") {
    const nextStatus = body.action === "archive" ? "archived" : "transferred";
    await prisma.schoolStudent.update({
      where: { id },
      data: { status: nextStatus, leftAt: new Date() },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: body.action === "archive" ? "student_archived" : "student_transferred",
      entityType: "student",
      entityId: id,
      severity: "warning",
      metadata: { previousStatus: student.status, nextStatus, classroomId: student.classroomId },
    });
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  if (body.action === "reactivate") {
    await prisma.schoolStudent.update({
      where: { id },
      data: { status: "active", leftAt: null },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_updated",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "student_reactivated", previousStatus: student.status },
    });
    return NextResponse.json({ ok: true, status: "active" });
  }

  if (body.action === "assignClass" || body.action === "removeClass") {
    const classroomId = body.action === "removeClass" ? null : (body.classroomId ?? null);
    if (classroomId) {
      const room = await prisma.classroom.findFirst({ where: { id: classroomId, schoolId: body.schoolId } });
      if (!room) return NextResponse.json({ error: "Class not found in this school." }, { status: 404 });
    }
    if (classroomId && student.classroomId === classroomId) {
      return NextResponse.json({ error: "Student is already assigned to this class." }, { status: 409 });
    }
    await prisma.schoolStudent.update({ where: { id }, data: { classroomId } });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_transferred",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: {
        mode: classroomId ? "student_class_assigned" : "student_class_removed",
        fromClassroomId: student.classroomId,
        toClassroomId: classroomId,
      },
    });
    return NextResponse.json({ ok: true, classroomId });
  }

  if (body.action === "update") {
    if (body.name) {
      await prisma.childProfile.update({ where: { id: student.childId }, data: { name: body.name } });
    }
    if (body.yearGroup !== undefined) {
      const nextYear = body.yearGroup?.trim() || null;
      const fromYear = student.child.yearGroup ?? null;
      await prisma.childProfile.update({
        where: { id: student.childId },
        data: { yearGroup: nextYear },
      });
      if (nextYear && nextYear !== fromYear) {
        await recordManualYearChange({
          schoolId: body.schoolId,
          childId: student.childId,
          schoolStudentId: id,
          fromYearGroup: fromYear,
          toYearGroup: nextYear,
          actorUserId: access.userId,
        });
      }
    }
    if (body.holdBackFromPromotion !== undefined) {
      await setStudentHoldBack({
        schoolId: body.schoolId,
        schoolStudentId: id,
        holdBack: body.holdBackFromPromotion,
        actorUserId: access.userId,
      });
    }
    if (body.externalRef !== undefined) {
      await prisma.schoolStudent.update({
        where: { id },
        data: { externalRef: body.externalRef?.trim() || null },
      });
    }
    if (body.dateOfBirth !== undefined) {
      await prisma.studentProfile.upsert({
        where: { childId: student.childId },
        create: {
          childId: student.childId,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        },
        update: { dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null },
      });
    }
    if (body.classroomId !== undefined) {
      if (body.classroomId) {
        const room = await prisma.classroom.findFirst({ where: { id: body.classroomId, schoolId: body.schoolId } });
        if (!room) return NextResponse.json({ error: "Class not found in this school." }, { status: 404 });
      }
      await prisma.schoolStudent.update({ where: { id }, data: { classroomId: body.classroomId } });
    }
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_updated",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "fields_updated" },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "inviteGuardian" || body.action === "linkGuardian") {
    if (!body.guardianEmail) return NextResponse.json({ error: "guardianEmail is required" }, { status: 400 });
    const email = body.guardianEmail.toLowerCase();
    let parent = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } });
    if (parent && parent.role !== "parent") {
      return NextResponse.json({ error: "That email belongs to a non-parent account." }, { status: 400 });
    }
    if (!parent) {
      const guardianName = `${body.guardianFirstName ?? ""} ${body.guardianLastName ?? ""}`.trim() || email.split("@")[0];
      parent = await prisma.user.create({
        data: {
          email,
          name: guardianName,
          role: "parent",
          passwordHash: await hashPassword(randomBytes(18).toString("base64url")),
          parentProfile: {
            create: {
              phone: "",
              parentRole: body.relationship?.trim() || "parent",
              status: "active",
              numberOfChildren: 1,
            },
          },
        },
        select: { id: true, role: true, name: true },
      });
    } else if (body.relationship) {
      await prisma.parentProfile.upsert({
        where: { userId: parent.id },
        create: {
          userId: parent.id,
          phone: "",
          parentRole: body.relationship,
          status: "active",
          numberOfChildren: 1,
        },
        update: { parentRole: body.relationship },
      });
    }

    const existingLink = await prisma.parentSchoolLink.findUnique({
      where: {
        schoolId_parentUserId_schoolStudentId: {
          schoolId: body.schoolId,
          parentUserId: parent.id,
          schoolStudentId: id,
        },
      },
    });
    if (existingLink && existingLink.status !== "removed") {
      return NextResponse.json({ error: "This guardian is already linked to this student." }, { status: 409 });
    }

    const link = await prisma.parentSchoolLink.upsert({
      where: {
        schoolId_parentUserId_schoolStudentId: {
          schoolId: body.schoolId,
          parentUserId: parent.id,
          schoolStudentId: id,
        },
      },
      create: {
        schoolId: body.schoolId,
        parentUserId: parent.id,
        schoolStudentId: id,
        status: "pending_consent",
        invitedAt: new Date(),
        canReceiveReports: true,
        canMessageTeachers: true,
      },
      update: {
        status: "pending_consent",
        invitedAt: new Date(),
      },
    });

    const raw = await createSchoolInviteToken({
      schoolId: body.schoolId,
      inviteType: "parent",
      targetEmail: email,
      targetSchoolStudentId: id,
      createdByUserId: access.userId,
      metadata: {
        parentUserId: parent.id,
        linkId: link.id,
        schoolStudentId: id,
        relationship: body.relationship ?? null,
        message: body.message ?? null,
      },
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/school/invites/accept?token=${raw}`;
    const school = await prisma.school.findUnique({ where: { id: body.schoolId }, select: { name: true } });
    const emailTemplate = buildSchoolInviteEmail({
      schoolName: school?.name ?? "School",
      roleLabel: "Parent / Guardian",
      inviteUrl,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    await sendEmail({ to: email, subject: emailTemplate.subject, html: emailTemplate.html, text: emailTemplate.text });

    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "invite_sent",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "parent_invited", parentUserId: parent.id, linkId: link.id, targetEmail: email },
    });

    return NextResponse.json({ ok: true, linkId: link.id, inviteUrl });
  }

  if (body.action === "suspendGuardian" || body.action === "reactivateGuardian" || body.action === "removeGuardian") {
    if (!body.linkId) return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    const link = await prisma.parentSchoolLink.findFirst({ where: { id: body.linkId, schoolId: body.schoolId, schoolStudentId: id } });
    if (!link) return NextResponse.json({ error: "Guardian link not found." }, { status: 404 });
    const next =
      body.action === "suspendGuardian" ? "suspended" : body.action === "removeGuardian" ? "removed" : "pending_consent";
    await prisma.parentSchoolLink.update({ where: { id: link.id }, data: { status: next } });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_updated",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: {
        mode:
          body.action === "suspendGuardian"
            ? "parent_link_suspended"
            : body.action === "removeGuardian"
              ? "parent_unlinked"
              : "parent_link_reactivated",
        linkId: link.id,
      },
    });
    return NextResponse.json({ ok: true, status: next });
  }

  if (body.action === "setPrimaryGuardian") {
    if (!body.linkId) return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    const link = await prisma.parentSchoolLink.findFirst({
      where: { id: body.linkId, schoolId: body.schoolId, schoolStudentId: id, status: { not: "removed" } },
    });
    if (!link) return NextResponse.json({ error: "Guardian link not found." }, { status: 404 });
    await prisma.childProfile.update({ where: { id: student.childId }, data: { parentId: link.parentUserId } });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_updated",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "primary_guardian_changed", parentUserId: link.parentUserId, linkId: link.id },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "recordConsent") {
    if (!body.linkId || body.consented === undefined) {
      return NextResponse.json({ error: "linkId and consented are required" }, { status: 400 });
    }
    const link = await prisma.parentSchoolLink.findFirst({ where: { id: body.linkId, schoolId: body.schoolId, schoolStudentId: id } });
    if (!link) return NextResponse.json({ error: "Guardian link not found." }, { status: 404 });
    await prisma.parentSchoolLink.update({
      where: { id: link.id },
      data: {
        consentGivenAt: body.consented ? new Date() : null,
        consentWithdrawnAt: body.consented ? null : new Date(),
        status: body.consented ? "active" : "suspended",
      },
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "student_updated",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "parent_consent_recorded", consented: body.consented, linkId: link.id },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resendGuardianInvite") {
    const email = body.guardianEmail?.toLowerCase();
    if (!email && !body.inviteId) {
      return NextResponse.json({ error: "guardianEmail or inviteId is required" }, { status: 400 });
    }
    let targetEmail = email;
    let meta: Record<string, unknown> = { schoolStudentId: id };
    if (body.inviteId) {
      const invite = await prisma.schoolInviteToken.findFirst({
        where: { id: body.inviteId, schoolId: body.schoolId, inviteType: "parent", targetSchoolStudentId: id },
      });
      if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
      targetEmail = invite.targetEmail;
      meta = invite.metadataJson ? JSON.parse(invite.metadataJson) : meta;
    }
    const raw = await createSchoolInviteToken({
      schoolId: body.schoolId,
      inviteType: "parent",
      targetEmail: targetEmail!,
      targetSchoolStudentId: id,
      createdByUserId: access.userId,
      metadata: meta,
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/school/invites/accept?token=${raw}`;
    const school = await prisma.school.findUnique({ where: { id: body.schoolId }, select: { name: true } });
    const emailTemplate = buildSchoolInviteEmail({
      schoolName: school?.name ?? "School",
      roleLabel: "Parent / Guardian",
      inviteUrl,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    await sendEmail({ to: targetEmail!, subject: emailTemplate.subject, html: emailTemplate.html, text: emailTemplate.text });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: access.userId,
      action: "invite_resent",
      entityType: "student",
      entityId: id,
      severity: "info",
      metadata: { mode: "parent_invite_resent", targetEmail },
    });
    return NextResponse.json({ ok: true, inviteUrl });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}