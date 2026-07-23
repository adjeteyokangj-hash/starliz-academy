import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { hashPassword } from "@/lib/auth";
import { canAddSchoolStudent } from "@/lib/schools/licensing";
import { createInviteToken, resendInviteToken } from "@/lib/schools/invite";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { enrolSchoolStudent } from "@/lib/schools/enrol-student";
import { bootstrapDaytimeSchool } from "@/lib/schools/bootstrap-daytime-school";
import { assignSchoolLesson } from "@/lib/schools/assign-school-lesson";
import { updateSchoolDayLesson } from "@/lib/schools/update-school-day-lesson";
import { ensureSchoolYearClasses } from "@/lib/schools/ensure-year-classes";
import {
  buildSchoolsAdminListPayload,
  loadSecurityGateContext,
  type SecurityGatePayload,
} from "@/lib/schools/school-admin-payload";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

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
    action: z.literal("ensureYearClasses"),
    payload: z.object({
      schoolId: z.string().min(1),
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
      ownerInviteConfirmed: z.boolean().optional(),
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
    action: z.literal("enrolStudent"),
    payload: z.object({
      schoolId: z.string().min(1),
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      yearGroup: z.string().trim().min(1).max(40),
      classroomId: z.string().min(1).optional().nullable(),
      guardianName: z.string().trim().min(1).max(120),
      guardianEmail: z.string().trim().email(),
      sendSupport: z.boolean().optional(),
      safeguardingFlag: z.boolean().optional(),
      baselineNotes: z.string().trim().max(4000).optional().nullable(),
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
  z.object({
    action: z.literal("bootstrapDaytimeSchool"),
    payload: z.object({
      schoolId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal("assignSchoolLesson"),
    payload: z.object({
      schoolId: z.string().min(1),
      subject: z.string().trim().min(1).max(80),
      keyStage: z.string().trim().max(20).optional().nullable(),
      yearGroup: z.string().trim().min(1).max(40),
      classroomId: z.string().min(1).optional().nullable(),
      teacherId: z.string().min(1).optional().nullable(),
      skillFocus: z.string().trim().min(1).max(160),
      lessonType: z.string().trim().min(1).max(40),
      title: z.string().trim().max(160).optional().nullable(),
      dayOfWeek: z.number().int().min(1).max(5).optional().nullable(),
      periodIndex: z.number().int().min(1).max(12).optional().nullable(),
      startsAt: z.string().trim().max(8).optional().nullable(),
      endsAt: z.string().trim().max(8).optional().nullable(),
      room: z.string().trim().max(80).optional().nullable(),
      dueDate: z.string().optional().nullable(),
    }),
  }),
  z.object({
    action: z.literal("updateSchoolDayLesson"),
    payload: z.object({
      schoolId: z.string().min(1),
      dayLessonId: z.string().min(1),
      teacherId: z.string().min(1).optional().nullable(),
      room: z.string().trim().max(80).optional().nullable(),
      startsAt: z.string().trim().max(8).optional(),
      endsAt: z.string().trim().max(8).optional(),
      subject: z.string().trim().max(80).optional(),
      title: z.string().trim().max(160).optional(),
      lessonId: z.string().min(1).optional().nullable(),
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

async function buildPayload() {
  return buildSchoolsAdminListPayload();
}

export async function GET() {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const payload = await buildPayload();
  return NextResponse.json(payload);
}

function isSecuritySensitiveAction(parsed: z.infer<typeof actionSchema>): boolean {
  switch (parsed.action) {
    case "inviteTeacher":
      return parsed.payload.role === "owner" || parsed.payload.role === "admin";
    case "updateSchool":
      return parsed.payload.status === "suspended";
    case "exportSchoolData":
    case "exportStudentData":
    case "requestDeleteStudentData":
      return true;
    default:
      return false;
  }
}

async function resolveBlockedActionSchoolId(parsed: z.infer<typeof actionSchema>): Promise<string | null> {
  switch (parsed.action) {
    case "inviteTeacher":
    case "updateSchool":
    case "exportSchoolData":
      return parsed.payload.schoolId;
    case "exportStudentData": {
      const link = await prisma.schoolStudent.findUnique({
        where: { id: parsed.payload.schoolStudentId },
        select: { schoolId: true },
      });
      return link?.schoolId ?? null;
    }
    case "requestDeleteStudentData": {
      const link = await prisma.schoolStudent.findUnique({
        where: { id: parsed.payload.schoolStudentId },
        select: { schoolId: true },
      });
      return link?.schoolId ?? null;
    }
    default:
      return null;
  }
}

async function writeSecurityGateBlockedAudit(input: {
  parsed: z.infer<typeof actionSchema>;
  session: { userId: string; email: string };
  securityGate: SecurityGatePayload;
  request: Request;
}): Promise<void> {
  const schoolId = await resolveBlockedActionSchoolId(input.parsed);
  if (!schoolId) return;

  const attemptedAt = new Date().toISOString();
  const route = new URL(input.request.url).pathname;

  await writeSchoolAuditLog({
    schoolId,
    actorUserId: input.session.userId,
    action: "login_blocked",
    entityType: "system",
    entityId: schoolId,
    metadata: {
      actionType: input.parsed.action,
      schoolId,
      attemptedBy: {
        userId: input.session.userId,
        email: input.session.email,
      },
      timestamp: attemptedAt,
      reason: input.securityGate.reason,
      anomalyCount: input.securityGate.authAnomalySignals,
      securityPolicyState: {
        blocked: input.securityGate.blocked,
        twoFaEnabled: input.securityGate.twoFaEnabled,
        threshold: input.securityGate.threshold,
      },
      request: {
        route,
        method: input.request.method,
      },
    },
    severity: "warning",
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  try {
    const parsed = actionSchema.parse(await request.json());
    const securityGate = await loadSecurityGateContext();

    if (isSecuritySensitiveAction(parsed) && securityGate.blocked) {
      try {
        await writeSecurityGateBlockedAudit({
          parsed,
          session: { userId: session.userId, email: session.email },
          securityGate,
          request,
        });
      } catch {
        // Best-effort logging: lock response must still be returned.
      }

      return NextResponse.json(
        {
          error: "Security step-up required: elevated failed-login risk detected. Retry after the anomaly window clears or reduce failed login volume.",
          securityGate,
        },
        { status: 423 },
      );
    }

    let inviteFallback:
      | {
        teacherId: string;
        role: string;
        email: string;
        inviteUrl: string;
      }
      | null = null;
    let enrolResult:
      | {
        schoolStudentId: string;
        childId: string;
        parentUserId: string;
      }
      | null = null;
    let bootstrapResult: Record<string, unknown> | null = null;
    let ensureYearClassesResult: Record<string, unknown> | null = null;
    let assignLessonResult: { dayLessonId: string; lessonId: string } | null = null;
    let updateDayLessonResult: { dayLessonId: string } | null = null;

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
      case "ensureYearClasses": {
        const ensured = await ensureSchoolYearClasses({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
        });
        if (!ensured.ok) {
          return NextResponse.json({ error: ensured.error }, { status: ensured.status });
        }
        ensureYearClassesResult = {
          academicYear: ensured.academicYear,
          createdCount: ensured.created.length,
          restoredCount: ensured.restored.length,
          reusedCount: ensured.reused.length,
          yearGroups: [
            ...ensured.created.map((row) => row.yearGroup),
            ...ensured.restored.map((row) => row.yearGroup),
            ...ensured.reused.map((row) => row.yearGroup),
          ],
        };
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
        if (parsed.payload.role === "owner" && !parsed.payload.ownerInviteConfirmed) {
          return NextResponse.json(
            {
              error: "Owner has executive-level governance access. Confirmation is required before sending this invite.",
            },
            { status: 400 },
          );
        }

        const email = parsed.payload.email.toLowerCase();
        const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        const userId = existingUser?.id
          ?? (
            await prisma.user.create({
              data: {
                email,
                name: parsed.payload.name || null,
                // Base app role stays "teacher"; school-level authorisation uses
                // SchoolTeacher.role for owner/admin/teacher/support/observer/finance.
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
        const inviteUrl = `${getBaseUrl()}/invite/accept?token=${inviteToken}`;

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

        inviteFallback = {
          teacherId: schoolTeacher.id,
          role: parsed.payload.role,
          email,
          inviteUrl,
        };
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
        const inviteUrl = `${getBaseUrl()}/invite/accept?token=${newToken}`;

        const teacherUser = await prisma.user.findUnique({
          where: { id: teacher.userId },
          select: { email: true },
        });

        await writeSchoolAuditLog({
          schoolId: teacher.schoolId,
          actorUserId: session.userId,
          action: "invite_resent",
          entityType: "teacher",
          entityId: teacher.id,
          metadata: { newToken },
          severity: "info",
        });

        inviteFallback = {
          teacherId: teacher.id,
          role: "teacher",
          email: teacherUser?.email ?? "",
          inviteUrl,
        };
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
        const child = await prisma.childProfile.findUnique({
          where: { id: parsed.payload.childId },
          select: { id: true, parentId: true, archived: true },
        });
        if (!child || child.archived) {
          return NextResponse.json({ error: "Platform student not found." }, { status: 404 });
        }

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

        if (parsed.payload.classroomId) {
          const classroom = await prisma.classroom.findFirst({
            where: { id: parsed.payload.classroomId, schoolId: parsed.payload.schoolId },
            select: { id: true },
          });
          if (!classroom) {
            return NextResponse.json({ error: "Classroom not found for this school." }, { status: 404 });
          }
        }

        const schoolStudent = await prisma.schoolStudent.upsert({
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
            leftAt: parsed.payload.status === "active" ? null : undefined,
          },
          select: { id: true },
        });

        await prisma.parentSchoolLink.upsert({
          where: {
            schoolId_parentUserId_schoolStudentId: {
              schoolId: parsed.payload.schoolId,
              parentUserId: child.parentId,
              schoolStudentId: schoolStudent.id,
            },
          },
          create: {
            schoolId: parsed.payload.schoolId,
            parentUserId: child.parentId,
            schoolStudentId: schoolStudent.id,
            status: "active",
            canReceiveReports: true,
            canMessageTeachers: true,
          },
          update: {
            status: "active",
          },
        });

        await writeSchoolAuditLog({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
          action: "student_enrolled",
          entityType: "student",
          entityId: schoolStudent.id,
          metadata: {
            childId: child.id,
            classroomId: parsed.payload.classroomId || null,
            status: parsed.payload.status,
            source: "assign_existing",
          },
        });
        break;
      }
      case "enrolStudent": {
        const enrolled = await enrolSchoolStudent({
          schoolId: parsed.payload.schoolId,
          firstName: parsed.payload.firstName,
          lastName: parsed.payload.lastName,
          yearGroup: parsed.payload.yearGroup,
          classroomId: parsed.payload.classroomId,
          guardianName: parsed.payload.guardianName,
          guardianEmail: parsed.payload.guardianEmail,
          sendSupport: parsed.payload.sendSupport,
          safeguardingFlag: parsed.payload.safeguardingFlag,
          baselineNotes: parsed.payload.baselineNotes,
          actorUserId: session.userId,
        });
        if (!enrolled.ok) {
          return NextResponse.json(
            { error: enrolled.error, ...(enrolled.access ? { access: enrolled.access } : {}) },
            { status: enrolled.status },
          );
        }
        enrolResult = {
          schoolStudentId: enrolled.schoolStudentId,
          childId: enrolled.childId,
          parentUserId: enrolled.parentUserId,
        };
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
      case "bootstrapDaytimeSchool": {
        const bootstrapped = await bootstrapDaytimeSchool({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
        });
        if (!bootstrapped.ok) {
          return NextResponse.json({ error: bootstrapped.error }, { status: bootstrapped.status });
        }
        bootstrapResult = {
          changed: bootstrapped.changed,
          classroomId: bootstrapped.classroomId,
          teacherIds: bootstrapped.teacherIds,
          studentIds: bootstrapped.studentIds,
          dayLessonCount: bootstrapped.dayLessonIds.length,
          lessonCount: bootstrapped.lessonIds.length,
          summary: bootstrapped.summary,
        };
        break;
      }
      case "assignSchoolLesson": {
        const assigned = await assignSchoolLesson({
          schoolId: parsed.payload.schoolId,
          actorUserId: session.userId,
          subject: parsed.payload.subject,
          keyStage: parsed.payload.keyStage,
          yearGroup: parsed.payload.yearGroup,
          classroomId: parsed.payload.classroomId,
          teacherId: parsed.payload.teacherId,
          skillFocus: parsed.payload.skillFocus,
          lessonType: parsed.payload.lessonType,
          title: parsed.payload.title,
          dayOfWeek: parsed.payload.dayOfWeek,
          periodIndex: parsed.payload.periodIndex,
          startsAt: parsed.payload.startsAt,
          endsAt: parsed.payload.endsAt,
          room: parsed.payload.room,
          dueDate: parsed.payload.dueDate,
        });
        if (!assigned.ok) {
          return NextResponse.json({ error: assigned.error }, { status: assigned.status });
        }
        assignLessonResult = {
          dayLessonId: assigned.dayLessonId,
          lessonId: assigned.lessonId,
        };
        break;
      }
      case "updateSchoolDayLesson": {
        const updated = await updateSchoolDayLesson({
          schoolId: parsed.payload.schoolId,
          dayLessonId: parsed.payload.dayLessonId,
          actorUserId: session.userId,
          teacherId: parsed.payload.teacherId,
          room: parsed.payload.room,
          startsAt: parsed.payload.startsAt,
          endsAt: parsed.payload.endsAt,
          subject: parsed.payload.subject,
          title: parsed.payload.title,
          lessonId: parsed.payload.lessonId,
        });
        if (!updated.ok) {
          return NextResponse.json({ error: updated.error }, { status: updated.status });
        }
        updateDayLessonResult = { dayLessonId: updated.dayLessonId };
        break;
      }
      default:
        return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const payload = await buildPayload();
    return NextResponse.json({
      ...payload,
      ...(inviteFallback ? { inviteFallback } : {}),
      ...(enrolResult ? { enrolResult } : {}),
      ...(bootstrapResult ? { bootstrapResult } : {}),
      ...(ensureYearClassesResult ? { ensureYearClassesResult } : {}),
      ...(assignLessonResult ? { assignLessonResult } : {}),
      ...(updateDayLessonResult ? { updateDayLessonResult } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Invalid school request." }, { status: 400 });
  }
}
