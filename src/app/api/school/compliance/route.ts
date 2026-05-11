import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolAdmin } from "@/lib/schools/guards";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("exportStudentData"),
    schoolId: z.string().min(1),
    schoolStudentId: z.string().min(1),
  }),
  z.object({
    action: z.literal("requestDeleteStudentData"),
    schoolId: z.string().min(1),
    schoolStudentId: z.string().min(1),
    reason: z.string().min(1).max(1500),
  }),
]);

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");
  const mode = url.searchParams.get("mode") ?? "retention";

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const access = await requireSchoolAdmin(schoolId, {
    method: "GET",
    route: "/api/school/compliance",
    resourceType: "compliance",
  });
  if (access.response) return access.response;

  if (mode === "retention") {
    const [attemptRows, auditRows, safeguardingRows] = await Promise.all([
      prisma.attempt.count({
        where: {
          createdAt: { gte: daysAgo(365) },
          student: {
            schoolLinks: {
              some: { schoolId },
            },
          },
        },
      }),
      prisma.schoolAuditLog.count({ where: { schoolId, createdAt: { gte: daysAgo(365) } } }),
      prisma.safeguardingIncident.count({ where: { schoolId } }),
    ]);

    return NextResponse.json({
      policies: {
        attemptsRetentionDays: 365,
        auditRetentionDays: 365 * 3,
        safeguardingRetentionDays: 365 * 7,
        legalHoldBehavior: "Do not delete safeguarding incidents marked escalated.",
      },
      datasetSnapshot: {
        attemptsLastYear: attemptRows,
        auditEventsLastYear: auditRows,
        safeguardingIncidentsTotal: safeguardingRows,
      },
    });
  }

  if (mode === "consentHistory") {
    const links = await prisma.parentSchoolLink.findMany({
      where: { schoolId },
      include: {
        parent: { select: { id: true, name: true, email: true } },
        schoolStudent: { include: { child: { select: { id: true, name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      consentHistory: links.map((link) => ({
        linkId: link.id,
        parent: link.parent,
        student: { id: link.schoolStudent.child.id, name: link.schoolStudent.child.name },
        status: link.status,
        consentGivenAt: link.consentGivenAt?.toISOString() ?? null,
        consentWithdrawnAt: link.consentWithdrawnAt?.toISOString() ?? null,
        canReceiveReports: link.canReceiveReports,
        canMessageTeachers: link.canMessageTeachers,
        invitedAt: link.invitedAt.toISOString(),
      })),
    });
  }

  if (mode === "aiTransparency") {
    const [alerts, weakAreas, aiAudit] = await Promise.all([
      prisma.schoolSafeguardingAlert.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.weakArea.findMany({
        where: {
          student: {
            schoolLinks: {
              some: { schoolId },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.schoolAuditLog.findMany({
        where: {
          schoolId,
          action: { in: ["content_moderation_flag", "safeguarding_alert"] },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      aiDecisionTransparency: {
        safeguardingAlerts: alerts.map((a) => ({
          id: a.id,
          triggeredBy: a.triggeredBy,
          category: a.category,
          severity: a.severity,
          status: a.status,
          description: a.description,
          metadataJson: a.metadataJson,
          createdAt: a.createdAt.toISOString(),
        })),
        weakAreaDetections: weakAreas.map((w) => ({
          id: w.id,
          subject: w.subject,
          skillFocus: w.skillFocus,
          weaknessType: w.weaknessType,
          accuracy: w.accuracy,
          metadataJson: w.metadataJson,
          updatedAt: w.updatedAt.toISOString(),
        })),
        aiAuditEvents: aiAudit.map((log) => ({
          id: log.id,
          action: log.action,
          metadataJson: log.metadataJson,
          createdAt: log.createdAt.toISOString(),
        })),
      },
    });
  }

  if (mode === "students") {
    const students = await prisma.schoolStudent.findMany({
      where: { schoolId },
      include: {
        child: { select: { id: true, name: true, archived: true } },
        classroom: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      students: students.map((student) => ({
        id: student.id,
        childId: student.childId,
        childName: student.child.name,
        archived: student.child.archived,
        status: student.status,
        classroom: student.classroom,
        joinedAt: student.joinedAt.toISOString(),
        updatedAt: student.updatedAt.toISOString(),
      })),
    });
  }

  return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
}

export async function POST(request: Request) {
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const access = await requireSchoolAdmin(body.schoolId, {
    method: "POST",
    route: "/api/school/compliance",
    resourceType: "compliance",
    resourceId: body.schoolStudentId,
  });
  if (access.response) return access.response;

  const link = await prisma.schoolStudent.findUnique({
    where: { id: body.schoolStudentId },
    include: {
      child: true,
      classroom: true,
    },
  });

  if (!link || link.schoolId !== body.schoolId) {
    return NextResponse.json({ error: "Student not found in this school" }, { status: 404 });
  }

  if (body.action === "exportStudentData") {
    const [attempts, assignments, weakAreas, safeguarding, parentLinks] = await Promise.all([
      prisma.attempt.findMany({ where: { studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 5000 }),
      prisma.assignment.findMany({ where: { studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 2000 }),
      prisma.weakArea.findMany({ where: { studentId: link.childId }, orderBy: { updatedAt: "desc" }, take: 2000 }),
      prisma.safeguardingIncident.findMany({ where: { schoolId: body.schoolId, studentId: link.childId }, orderBy: { createdAt: "desc" }, take: 2000 }),
      prisma.parentSchoolLink.findMany({ where: { schoolId: body.schoolId, schoolStudentId: link.id }, include: { parent: { select: { id: true, email: true, name: true } } } }),
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: access.context.userId,
        action: "gdpr_export_student_data",
        entityType: "student",
        entityId: link.id,
        metadataJson: JSON.stringify({ schoolId: body.schoolId, schoolStudentId: link.id, childId: link.childId }),
      },
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

  // requestDeleteStudentData (soft-delete workflow)
  const updated = await prisma.$transaction(async (tx) => {
    const archivedStudent = await tx.schoolStudent.update({
      where: { id: link.id },
      data: {
        status: "archived",
        leftAt: new Date(),
      },
    });

    await tx.childProfile.update({
      where: { id: link.childId },
      data: {
        archived: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: access.context.userId,
        action: "gdpr_delete_student_data_requested",
        entityType: "student",
        entityId: link.id,
        metadataJson: JSON.stringify({
          schoolId: body.schoolId,
          schoolStudentId: link.id,
          childId: link.childId,
          reason: body.reason,
          mode: "soft_delete",
        }),
      },
    });

    return archivedStudent;
  });

  return NextResponse.json({ ok: true, archived: updated });
}
