import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { canAddSchoolStudent } from "@/lib/schools/licensing";
import { createInviteToken, resendInviteToken } from "@/lib/schools/invite";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

type SchoolPayload = {
  schools: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    type: string;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    createdAt: string;
    updatedAt: string;
    licence: {
      id: string;
      status: string;
      seatLimit: number;
      seatsUsed: number;
      seatsAvailable: number;
      provider: string;
      pricingPlanId: string | null;
      currency: string;
      billingInterval: string;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
      startsAt: string | null;
      endsAt: string | null;
      notes: string | null;
      updatedAt: string;
    } | null;
    classrooms: Array<{
      id: string;
      name: string;
      yearGroup: string | null;
      academicYear: string | null;
      status: string;
      teacherId: string | null;
      teacherName: string | null;
      studentsCount: number;
      updatedAt: string;
    }>;
    teachers: Array<{
      id: string;
      userId: string;
      email: string;
      name: string | null;
      role: string;
      status: string;
      title: string | null;
      invitedAt: string | null;
      acceptedAt: string | null;
      lastActiveAt: string | null;
      updatedAt: string;
    }>;
    students: Array<{
      id: string;
      childId: string;
      childName: string;
      parentEmail: string;
      classroomId: string | null;
      classroomName: string | null;
      status: string;
      externalRef: string | null;
      joinedAt: string;
      updatedAt: string;
    }>;
    communicationPreferences: Array<{
      linkId: string;
      parentName: string | null;
      parentEmail: string;
      studentName: string;
      optedOutAt: string | null;
      optOutReason: string | null;
      safeguardingLockedAt: string | null;
      safeguardingLockReason: string | null;
      updatedAt: string;
    }>;
    communicationLogs: Array<{
      id: string;
      subject: string;
      messageBody: string;
      deliveryStatus: string;
      deliveryReason: string | null;
      parentEmail: string;
      studentName: string;
      actorName: string | null;
      createdAt: string;
    }>;
    safeguarding: {
      openAlerts: number;
      criticalAlerts: number;
    };
    safeguardingIncidents: Array<{
      id: string;
      category: string;
      severity: string;
      status: string;
      studentName: string | null;
      escalationLevel: string | null;
      reportedBy: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    activityTimeline: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      severity: string;
      actorUserId: string | null;
      createdAt: string;
    }>;
  }>;
};

const baseSchoolSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["pilot", "active", "suspended", "archived"]).optional(),
  type: z.string().trim().min(2).max(60).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  ownerUserId: z.string().min(1).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createSchool"),
    payload: baseSchoolSchema,
  }),
  z.object({
    action: z.literal("updateSchool"),
    payload: baseSchoolSchema.extend({
      schoolId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("upsertLicence"),
    payload: z.object({
      schoolId: z.string().min(1),
      status: z.string().trim().min(2),
      seatLimit: z.number().int().min(0),
      provider: z.string().trim().min(1).default("manual"),
      pricingPlanId: z.string().min(1).optional(),
      seatPricePence: z.number().int().min(0).optional(),
      currency: z.string().trim().min(1).default("GBP"),
      billingInterval: z.enum(["month", "year", "custom"]).default("custom"),
      trialEndsAt: z.string().datetime().optional().nullable(),
      currentPeriodEnd: z.string().datetime().optional().nullable(),
      startsAt: z.string().datetime().optional().nullable(),
      endsAt: z.string().datetime().optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("createClassroom"),
    payload: z.object({
      schoolId: z.string().min(1),
      name: z.string().trim().min(1),
      yearGroup: z.string().trim().max(40).optional(),
      academicYear: z.string().trim().max(40).optional(),
      teacherId: z.string().min(1).optional().nullable(),
      status: z.string().trim().default("active"),
    }),
  }),
  z.object({
    action: z.literal("updateClassroom"),
    payload: z.object({
      classroomId: z.string().min(1),
      name: z.string().trim().min(1).optional(),
      yearGroup: z.string().trim().max(40).optional().nullable(),
      academicYear: z.string().trim().max(40).optional().nullable(),
      teacherId: z.string().min(1).optional().nullable(),
      status: z.string().trim().optional(),
    }),
  }),
  z.object({
    action: z.literal("inviteTeacher"),
    payload: z.object({
      schoolId: z.string().min(1),
      email: z.string().trim().email(),
      name: z.string().trim().max(120).optional(),
      role: z.enum(["owner", "admin", "teacher", "support", "staff_observer", "finance"]).default("teacher"),
      title: z.string().trim().max(80).optional(),
    }),
  }),
  z.object({
    action: z.literal("resendInvite"),
    payload: z.object({
      teacherId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("revokeInvite"),
    payload: z.object({
      teacherId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("updateTeacher"),
    payload: z.object({
      teacherId: z.string().min(1),
      role: z.enum(["owner", "admin", "teacher", "support", "staff_observer", "finance"]).optional(),
      status: z.enum(["invited", "active", "suspended", "archived"]).optional(),
      title: z.string().trim().max(80).optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("assignStudent"),
    payload: z.object({
      schoolId: z.string().min(1),
      childId: z.string().min(1),
      classroomId: z.string().min(1).optional().nullable(),
      externalRef: z.string().trim().max(120).optional().nullable(),
      status: z.enum(["active", "archived", "transferred"]).default("active"),
    }),
  }),
  z.object({
    action: z.literal("updateStudentAssignment"),
    payload: z.object({
      schoolStudentId: z.string().min(1),
      classroomId: z.string().min(1).optional().nullable(),
      externalRef: z.string().trim().max(120).optional().nullable(),
      status: z.enum(["active", "archived", "transferred"]).optional(),
    }),
  }),
  z.object({
    action: z.literal("exportStudentData"),
    payload: z.object({
      schoolStudentId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("exportSchoolData"),
    payload: z.object({
      schoolId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("requestDeleteStudentData"),
    payload: z.object({
      schoolStudentId: z.string().min(1),
      reason: z.string().trim().min(1).max(1500),
    }),
  }),
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 90) || "school";
}

async function uniqueSlug(name: string, provided?: string): Promise<string> {
  const base = slugify(provided && provided.length > 0 ? provided : name);
  let candidate = base;
  let counter = 1;
  while (await prisma.school.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

async function buildPayload(): Promise<SchoolPayload> {
  const schools = await prisma.school.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      licence: true,
      classrooms: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          teacher: {
            include: {
              user: { select: { name: true } },
            },
          },
          _count: { select: { students: { where: { status: "active" } } } },
        },
      },
      teachers: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
      students: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          child: {
            select: {
              id: true,
              name: true,
              parent: { select: { email: true } },
            },
          },
          classroom: { select: { id: true, name: true } },
        },
      },
      parentLinks: {
        orderBy: [{ updatedAt: "desc" }],
        include: {
          parent: { select: { id: true, name: true, email: true } },
          schoolStudent: {
            include: {
              child: { select: { id: true, name: true } },
            },
          },
          communicationPreference: true,
        },
      },
      communicationLogs: {
        orderBy: [{ createdAt: "desc" }],
        take: 25,
        include: {
          actor: { select: { id: true, name: true, email: true } },
          parentSchoolLink: {
            include: {
              parent: { select: { id: true, name: true, email: true } },
              schoolStudent: {
                include: {
                  child: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      safeguardingAlerts: {
        where: { status: { in: ["open", "under_review", "escalated"] } },
        select: {
          severity: true,
        },
      },
      safeguardingIncidents: {
        orderBy: [{ updatedAt: "desc" }],
        take: 25,
        include: {
          student: { select: { name: true } },
          reportedBy: { select: { name: true, email: true } },
        },
      },
      auditLogs: {
        orderBy: [{ createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          severity: true,
          actorUserId: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    schools: schools.map((school) => {
      const seatsUsed = school.students.filter((row) => row.status === "active").length;
      const seatLimit = school.licence?.seatLimit ?? 0;
      return {
        id: school.id,
        name: school.name,
        slug: school.slug,
        status: school.status,
        type: school.type,
        contactEmail: school.contactEmail,
        contactPhone: school.contactPhone,
        notes: school.notes,
        ownerUserId: school.ownerUserId,
        ownerName: school.owner?.name ?? null,
        ownerEmail: school.owner?.email ?? null,
        createdAt: school.createdAt.toISOString(),
        updatedAt: school.updatedAt.toISOString(),
        licence: school.licence
          ? {
            id: school.licence.id,
            status: school.licence.status,
            seatLimit,
            seatsUsed,
            seatsAvailable: seatLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, seatLimit - seatsUsed),
            provider: school.licence.provider,
            pricingPlanId: school.licence.pricingPlanId,
            currency: school.licence.currency,
            billingInterval: school.licence.billingInterval,
            trialEndsAt: school.licence.trialEndsAt?.toISOString() ?? null,
            currentPeriodEnd: school.licence.currentPeriodEnd?.toISOString() ?? null,
            startsAt: school.licence.startsAt?.toISOString() ?? null,
            endsAt: school.licence.endsAt?.toISOString() ?? null,
            notes: school.licence.notes,
            updatedAt: school.licence.updatedAt.toISOString(),
          }
          : null,
        classrooms: school.classrooms.map((classroom) => ({
          id: classroom.id,
          name: classroom.name,
          yearGroup: classroom.yearGroup,
          academicYear: classroom.academicYear,
          status: classroom.status,
          teacherId: classroom.teacherId,
          teacherName: classroom.teacher?.user.name ?? null,
          studentsCount: classroom._count.students,
          updatedAt: classroom.updatedAt.toISOString(),
        })),
        teachers: school.teachers.map((teacher) => ({
          id: teacher.id,
          userId: teacher.user.id,
          email: teacher.user.email,
          name: teacher.user.name,
          role: teacher.role,
          status: teacher.status,
          title: teacher.title,
          invitedAt: teacher.invitedAt?.toISOString() ?? null,
          acceptedAt: teacher.acceptedAt?.toISOString() ?? null,
          lastActiveAt: teacher.lastActiveAt?.toISOString() ?? null,
          updatedAt: teacher.updatedAt.toISOString(),
        })),
        students: school.students.map((student) => ({
          id: student.id,
          childId: student.child.id,
          childName: student.child.name,
          parentEmail: student.child.parent.email,
          classroomId: student.classroomId,
          classroomName: student.classroom?.name ?? null,
          status: student.status,
          externalRef: student.externalRef,
          joinedAt: student.joinedAt.toISOString(),
          updatedAt: student.updatedAt.toISOString(),
        })),
        communicationPreferences: school.parentLinks.map((link) => ({
          linkId: link.id,
          parentName: link.parent.name,
          parentEmail: link.parent.email,
          studentName: link.schoolStudent.child.name,
          optedOutAt: link.communicationPreference?.optedOutAt?.toISOString() ?? null,
          optOutReason: link.communicationPreference?.optOutReason ?? null,
          safeguardingLockedAt: link.communicationPreference?.safeguardingLockedAt?.toISOString() ?? null,
          safeguardingLockReason: link.communicationPreference?.safeguardingLockReason ?? null,
          updatedAt: link.updatedAt.toISOString(),
        })),
        communicationLogs: school.communicationLogs.map((log) => ({
          id: log.id,
          subject: log.subject,
          messageBody: log.messageBody,
          deliveryStatus: log.deliveryStatus,
          deliveryReason: log.deliveryReason,
          parentEmail: log.parentSchoolLink.parent.email,
          studentName: log.parentSchoolLink.schoolStudent.child.name,
          actorName: log.actor?.name ?? log.actor?.email ?? null,
          createdAt: log.createdAt.toISOString(),
        })),
        safeguarding: {
          openAlerts: school.safeguardingAlerts.length,
          criticalAlerts: school.safeguardingAlerts.filter((alert) => alert.severity === "critical").length,
        },
        safeguardingIncidents: school.safeguardingIncidents.map((incident) => ({
          id: incident.id,
          category: incident.category,
          severity: incident.severity,
          status: incident.status,
          studentName: incident.student?.name ?? null,
          escalationLevel: incident.escalationLevel ?? null,
          reportedBy: incident.reportedBy?.name ?? incident.reportedBy?.email ?? null,
          createdAt: incident.createdAt.toISOString(),
          updatedAt: incident.updatedAt.toISOString(),
        })),
        activityTimeline: school.auditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId ?? null,
          severity: log.severity,
          actorUserId: log.actorUserId ?? null,
          createdAt: log.createdAt.toISOString(),
        })),
      };
    }),
  };
}

export async function GET() {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const payload = await buildPayload();
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const parsed = actionSchema.parse(await request.json());

    switch (parsed.action) {
      case "createSchool": {
        const slug = await uniqueSlug(parsed.payload.name, parsed.payload.slug);
        await prisma.school.create({
          data: {
            name: parsed.payload.name,
            slug,
            status: parsed.payload.status,
            type: parsed.payload.type ?? "school",
            contactEmail: parsed.payload.contactEmail || null,
            contactPhone: parsed.payload.contactPhone || null,
            notes: parsed.payload.notes || null,
            ownerUserId: parsed.payload.ownerUserId || null,
          },
        });
        break;
      }
      case "updateSchool": {
        const current = await prisma.school.findUnique({
          where: { id: parsed.payload.schoolId },
          select: { slug: true, status: true },
        });
        if (!current) {
          return NextResponse.json({ error: "School not found." }, { status: 404 });
        }

        const nextSlug = parsed.payload.slug
          ? await uniqueSlug(parsed.payload.name, parsed.payload.slug)
          : current.slug;

        await prisma.school.update({
          where: { id: parsed.payload.schoolId },
          data: {
            name: parsed.payload.name,
            slug: nextSlug,
            status: parsed.payload.status,
            type: parsed.payload.type,
            contactEmail: parsed.payload.contactEmail || null,
            contactPhone: parsed.payload.contactPhone || null,
            notes: parsed.payload.notes || null,
            ownerUserId: parsed.payload.ownerUserId || null,
          },
        });

        if (parsed.payload.status && parsed.payload.status !== current.status) {
          await writeSchoolAuditLog({
            schoolId: parsed.payload.schoolId,
            actorUserId: session.userId,
            action: parsed.payload.status === "suspended" ? "school_suspended" : "school_status_changed",
            entityType: "school",
            entityId: parsed.payload.schoolId,
            metadata: { previousStatus: current.status, nextStatus: parsed.payload.status },
            severity: parsed.payload.status === "suspended" ? "warning" : "info",
          });
        }
        break;
      }
      case "upsertLicence": {
        await prisma.schoolLicence.upsert({
          where: { schoolId: parsed.payload.schoolId },
          create: {
            schoolId: parsed.payload.schoolId,
            status: parsed.payload.status,
            seatLimit: parsed.payload.seatLimit,
            provider: parsed.payload.provider,
            pricingPlanId: parsed.payload.pricingPlanId,
            seatPricePence: parsed.payload.seatPricePence,
            currency: parsed.payload.currency,
            billingInterval: parsed.payload.billingInterval,
            trialEndsAt: parsed.payload.trialEndsAt ? new Date(parsed.payload.trialEndsAt) : null,
            currentPeriodEnd: parsed.payload.currentPeriodEnd ? new Date(parsed.payload.currentPeriodEnd) : null,
            startsAt: parsed.payload.startsAt ? new Date(parsed.payload.startsAt) : null,
            endsAt: parsed.payload.endsAt ? new Date(parsed.payload.endsAt) : null,
            notes: parsed.payload.notes || null,
          },
          update: {
            status: parsed.payload.status,
            seatLimit: parsed.payload.seatLimit,
            provider: parsed.payload.provider,
            pricingPlanId: parsed.payload.pricingPlanId,
            seatPricePence: parsed.payload.seatPricePence,
            currency: parsed.payload.currency,
            billingInterval: parsed.payload.billingInterval,
            trialEndsAt: parsed.payload.trialEndsAt ? new Date(parsed.payload.trialEndsAt) : null,
            currentPeriodEnd: parsed.payload.currentPeriodEnd ? new Date(parsed.payload.currentPeriodEnd) : null,
            startsAt: parsed.payload.startsAt ? new Date(parsed.payload.startsAt) : null,
            endsAt: parsed.payload.endsAt ? new Date(parsed.payload.endsAt) : null,
            notes: parsed.payload.notes || null,
          },
        });

        await writeSchoolAuditLog({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
          action: "licence_updated",
          entityType: "licence",
          entityId: parsed.payload.schoolId,
          metadata: {
            status: parsed.payload.status,
            seatLimit: parsed.payload.seatLimit,
            billingInterval: parsed.payload.billingInterval,
          },
          severity: "info",
        });
        break;
      }
      case "createClassroom": {
        await prisma.classroom.create({
          data: {
            schoolId: parsed.payload.schoolId,
            name: parsed.payload.name,
            yearGroup: parsed.payload.yearGroup || null,
            academicYear: parsed.payload.academicYear || null,
            teacherId: parsed.payload.teacherId || null,
            status: parsed.payload.status,
          },
        });
        break;
      }
      case "updateClassroom": {
        await prisma.classroom.update({
          where: { id: parsed.payload.classroomId },
          data: {
            ...(parsed.payload.name !== undefined ? { name: parsed.payload.name } : {}),
            ...(parsed.payload.yearGroup !== undefined ? { yearGroup: parsed.payload.yearGroup } : {}),
            ...(parsed.payload.academicYear !== undefined ? { academicYear: parsed.payload.academicYear } : {}),
            ...(parsed.payload.teacherId !== undefined ? { teacherId: parsed.payload.teacherId } : {}),
            ...(parsed.payload.status !== undefined ? { status: parsed.payload.status } : {}),
          },
        });
        break;
      }
      case "inviteTeacher": {
        const email = parsed.payload.email.toLowerCase();
        const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        const userId = existingUser?.id
          ?? (
            await prisma.user.create({
              data: {
                email,
                name: parsed.payload.name || null,
                role: "teacher",
                passwordHash: await hashPassword(randomBytes(18).toString("base64url")),
              },
              select: { id: true },
            })
          ).id;

        const schoolTeacher = await prisma.schoolTeacher.upsert({
          where: {
            schoolId_userId: {
              schoolId: parsed.payload.schoolId,
              userId,
            },
          },
          create: {
            schoolId: parsed.payload.schoolId,
            userId,
            role: parsed.payload.role,
            title: parsed.payload.title || null,
            status: "invited",
            invitedByUserId: session.userId,
            invitedAt: new Date(),
          },
          update: {
            role: parsed.payload.role,
            title: parsed.payload.title || null,
            status: "invited",
            invitedByUserId: session.userId,
            invitedAt: new Date(),
          },
        });

        // Generate secure invite token
        const inviteToken = await createInviteToken(schoolTeacher.id);

        // Audit trail
        await writeSchoolAuditLog({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
          action: "invite_sent",
          entityType: "teacher",
          entityId: schoolTeacher.id,
          metadata: { role: parsed.payload.role, email, inviteToken },
          severity: "info",
        });
        break;
      }
      case "resendInvite": {
        const teacher = await prisma.schoolTeacher.findUnique({
          where: { id: parsed.payload.teacherId },
          select: { id: true, schoolId: true, userId: true, status: true },
        });
        if (!teacher) {
          return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
        }
        if (teacher.status === "active") {
          return NextResponse.json({ error: "Teacher is already active." }, { status: 409 });
        }

        const newToken = await resendInviteToken(teacher.id);

        await writeSchoolAuditLog({
          schoolId: teacher.schoolId,
          actorUserId: session.userId,
          action: "invite_resent",
          entityType: "teacher",
          entityId: teacher.id,
          metadata: { newToken },
          severity: "info",
        });
        break;
      }
      case "revokeInvite": {
        const teacher = await prisma.schoolTeacher.findUnique({
          where: { id: parsed.payload.teacherId },
          select: { id: true, schoolId: true, status: true },
        });
        if (!teacher) {
          return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.schoolTeacher.update({
            where: { id: teacher.id },
            data: { status: "archived" },
          });
          await tx.teacherInviteToken.updateMany({
            where: { schoolTeacherId: teacher.id, usedAt: null },
            data: { usedAt: new Date() },
          });
        });

        await writeSchoolAuditLog({
          schoolId: teacher.schoolId,
          actorUserId: session.userId,
          action: "invite_expired",
          entityType: "teacher",
          entityId: teacher.id,
          metadata: { mode: "revoked_by_admin" },
          severity: "warning",
        });
        break;
      }
      case "updateTeacher": {
        await prisma.schoolTeacher.update({
          where: { id: parsed.payload.teacherId },
          data: {
            ...(parsed.payload.role !== undefined ? { role: parsed.payload.role } : {}),
            ...(parsed.payload.status !== undefined
              ? {
                status: parsed.payload.status,
                acceptedAt: parsed.payload.status === "active" ? new Date() : undefined,
              }
              : {}),
            ...(parsed.payload.title !== undefined ? { title: parsed.payload.title || null } : {}),
          },
        });
        break;
      }
      case "exportStudentData": {
        const link = await prisma.schoolStudent.findUnique({
          where: { id: parsed.payload.schoolStudentId },
          include: {
            child: true,
            classroom: true,
          },
        });
        if (!link) {
          return NextResponse.json({ error: "Student not found in this school." }, { status: 404 });
        }

        const [attempts, assignments, weakAreas, safeguarding, parentLinks] = await Promise.all([
          prisma.attempt.findMany({ where: { studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 5000 }),
          prisma.assignment.findMany({ where: { studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 2000 }),
          prisma.weakArea.findMany({ where: { studentId: link.childId }, orderBy: { updatedAt: "desc" }, take: 2000 }),
          prisma.safeguardingIncident.findMany({ where: { schoolId: link.schoolId, studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 2000 }),
          prisma.parentSchoolLink.findMany({ where: { schoolId: link.schoolId, schoolStudentId: link.id }, include: { parent: { select: { id: true, email: true, name: true } } } }),
        ]);

        await prisma.auditLog.create({
          data: {
            actorUserId: session.userId,
            action: "gdpr_export_student_data",
            entityType: "student",
            entityId: link.id,
            metadataJson: JSON.stringify({ schoolId: link.schoolId, schoolStudentId: link.id, childId: link.childId, scope: "admin_console" }),
          },
        });

        await writeSchoolAuditLog({
          schoolId: link.schoolId,
          actorUserId: session.userId,
          action: "student_exported",
          entityType: "student",
          entityId: link.id,
          metadata: { childId: link.childId },
          severity: "info",
        });

        return NextResponse.json({
          exportedAt: new Date().toISOString(),
          student: {
            schoolStudentId: link.id,
            childId: link.childId,
            childName: link.child.name,
            status: link.status,
            classroom: link.classroom ? { id: link.classroom.id, name: link.classroom.name } : null,
          },
          attempts,
          assignments,
          weakAreas,
          safeguarding,
          parentLinks,
        });
      }
      case "exportSchoolData": {
        const school = await prisma.school.findUnique({
          where: { id: parsed.payload.schoolId },
          include: {
            licence: true,
            classrooms: true,
            teachers: {
              include: {
                user: { select: { id: true, email: true, name: true } },
              },
            },
            students: {
              include: {
                child: { select: { id: true, name: true } },
                classroom: { select: { id: true, name: true } },
              },
            },
            safeguardingIncidents: {
              orderBy: { updatedAt: "desc" },
              take: 200,
            },
            auditLogs: {
              orderBy: { createdAt: "desc" },
              take: 200,
            },
          },
        });

        if (!school) {
          return NextResponse.json({ error: "School not found." }, { status: 404 });
        }

        await writeSchoolAuditLog({
          schoolId: school.id,
          actorUserId: session.userId,
          action: "school_exported",
          entityType: "school",
          entityId: school.id,
          metadata: { scope: "admin_console" },
          severity: "info",
        });

        return NextResponse.json({
          exportedAt: new Date().toISOString(),
          school,
        });
      }
      case "requestDeleteStudentData": {
        const link = await prisma.schoolStudent.findUnique({
          where: { id: parsed.payload.schoolStudentId },
          select: { id: true, schoolId: true, childId: true },
        });
        if (!link) {
          return NextResponse.json({ error: "Student not found in this school." }, { status: 404 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.schoolStudent.update({
            where: { id: link.id },
            data: {
              status: "archived",
              leftAt: new Date(),
            },
          });

          await tx.childProfile.update({
            where: { id: link.childId },
            data: { archived: true },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: session.userId,
              action: "gdpr_delete_student_data_requested",
              entityType: "student",
              entityId: link.id,
              metadataJson: JSON.stringify({
                schoolId: link.schoolId,
                schoolStudentId: link.id,
                childId: link.childId,
                reason: parsed.payload.reason,
                mode: "soft_delete",
                scope: "admin_console",
              }),
            },
          });
        });

        await writeSchoolAuditLog({
          schoolId: link.schoolId,
          actorUserId: session.userId,
          action: "compliance_delete_requested",
          entityType: "student",
          entityId: link.id,
          metadata: { childId: link.childId, reason: parsed.payload.reason },
          severity: "warning",
        });
        break;
      }
      case "assignStudent": {
        const existing = await prisma.schoolStudent.findUnique({
          where: {
            schoolId_childId: {
              schoolId: parsed.payload.schoolId,
              childId: parsed.payload.childId,
            },
          },
          select: { id: true, status: true },
        });

        const activating = parsed.payload.status === "active" && existing?.status !== "active";
        if (!existing || activating) {
          const seatDecision = await canAddSchoolStudent(parsed.payload.schoolId);
          if (!seatDecision.allowed) {
            return NextResponse.json(
              {
                error: "School licence does not allow adding this student.",
                access: seatDecision,
              },
              { status: 402 },
            );
          }
        }

        await prisma.schoolStudent.upsert({
          where: {
            schoolId_childId: {
              schoolId: parsed.payload.schoolId,
              childId: parsed.payload.childId,
            },
          },
          create: {
            schoolId: parsed.payload.schoolId,
            childId: parsed.payload.childId,
            classroomId: parsed.payload.classroomId || null,
            externalRef: parsed.payload.externalRef || null,
            status: parsed.payload.status,
          },
          update: {
            classroomId: parsed.payload.classroomId || null,
            externalRef: parsed.payload.externalRef || null,
            status: parsed.payload.status,
            joinedAt: parsed.payload.status === "active" ? new Date() : undefined,
          },
        });
        break;
      }
      case "updateStudentAssignment": {
        const existing = await prisma.schoolStudent.findUnique({
          where: { id: parsed.payload.schoolStudentId },
          select: { schoolId: true, status: true },
        });
        if (!existing) {
          return NextResponse.json({ error: "Student-school link not found." }, { status: 404 });
        }

        const activating = parsed.payload.status === "active" && existing.status !== "active";
        if (activating) {
          const seatDecision = await canAddSchoolStudent(existing.schoolId);
          if (!seatDecision.allowed) {
            return NextResponse.json(
              {
                error: "School licence does not allow adding this student.",
                access: seatDecision,
              },
              { status: 402 },
            );
          }
        }

        await prisma.schoolStudent.update({
          where: { id: parsed.payload.schoolStudentId },
          data: {
            ...(parsed.payload.classroomId !== undefined ? { classroomId: parsed.payload.classroomId || null } : {}),
            ...(parsed.payload.externalRef !== undefined ? { externalRef: parsed.payload.externalRef || null } : {}),
            ...(parsed.payload.status !== undefined ? { status: parsed.payload.status } : {}),
          },
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const payload = await buildPayload();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Invalid school request." }, { status: 400 });
  }
}
