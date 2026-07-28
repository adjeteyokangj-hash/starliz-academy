import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enrolSchoolStudent } from "@/lib/schools/enrol-student";
import { createSchoolInviteToken } from "@/lib/schools/invite_tokens";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { requireSchoolPermission } from "@/lib/schools/guards";
import { sendEmail } from "@/lib/email-provider";
import { buildSchoolInviteEmail } from "@/lib/emails/school-invite";

const statusFilter = z.enum(["all", "active", "archived", "transferred"]);

const createSchema = z.object({
  schoolId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  yearGroup: z.string().trim().min(1).max(40),
  classroomId: z.string().min(1).optional().nullable(),
  externalRef: z.string().trim().max(80).optional().nullable(),
  sendSupport: z.boolean().optional(),
  safeguardingFlag: z.boolean().optional(),
  baselineNotes: z.string().trim().max(2000).optional().nullable(),
  // ChildProfile requires a parent — first guardian is required by schema.
  guardianFirstName: z.string().trim().min(1).max(80),
  guardianLastName: z.string().trim().min(1).max(80),
  guardianEmail: z.string().email(),
  relationship: z.string().trim().max(80).optional().nullable(),
  sendInvite: z.boolean().optional().default(true),
  message: z.string().trim().max(1000).optional().nullable(),
});

function consentLabel(link: {
  status: string;
  consentGivenAt: Date | null;
  consentWithdrawnAt: Date | null;
}) {
  if (link.status === "removed") return "Removed";
  if (link.status === "suspended") return "Suspended";
  if (link.status === "pending_consent") return "Pending consent";
  if (link.consentWithdrawnAt && !link.consentGivenAt) return "Suspended";
  if (link.status === "active" && !link.consentGivenAt) return "Pending consent";
  if (link.status === "active") return "Active";
  return link.status;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId is required" }, { status: 400 });

  const statusParse = statusFilter.safeParse(searchParams.get("status") ?? "all");
  if (!statusParse.success) return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });

  const { response } = await requireSchoolPermission(schoolId, "manageStudents", {
    method: "GET",
    route: "/api/school/students",
    resourceType: "student",
  });
  if (response) return response;

  const status = statusParse.data;
  const students = await prisma.schoolStudent.findMany({
    where: {
      schoolId,
      ...(status === "all" ? {} : { status }),
    },
    include: {
      child: {
        select: {
          id: true,
          name: true,
          yearGroup: true,
          age: true,
          parentId: true,
          studentProfile: { select: { dateOfBirth: true, senSupportNeeds: true } },
        },
      },
      classroom: {
        select: {
          id: true,
          name: true,
          teacher: { include: { user: { select: { name: true, email: true } } } },
        },
      },
      parentLinks: {
        where: { status: { not: "removed" } },
        include: { parent: { select: { id: true, name: true, email: true } } },
        orderBy: { invitedAt: "asc" },
      },
      _count: { select: { learningBookings: true } },
    },
    orderBy: { child: { name: "asc" } },
  });

  return NextResponse.json({
    students: students.map((s) => {
      const primary = s.parentLinks.find((l) => l.parentUserId === s.child.parentId) ?? s.parentLinks[0] ?? null;
      return {
        id: s.id,
        schoolId: s.schoolId,
        childId: s.childId,
        status: s.status,
        externalRef: s.externalRef,
        joinedAt: s.joinedAt.toISOString(),
        leftAt: s.leftAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        child: {
          id: s.child.id,
          name: s.child.name,
          preferredName: null as string | null,
          yearGroup: s.child.yearGroup,
          age: s.child.age,
          dateOfBirth: s.child.studentProfile?.dateOfBirth?.toISOString() ?? null,
          senSupportNeeds: s.child.studentProfile?.senSupportNeeds ?? null,
        },
        classroom: s.classroom
          ? {
              id: s.classroom.id,
              name: s.classroom.name,
              teacherName: s.classroom.teacher?.user.name ?? s.classroom.teacher?.user.email ?? null,
            }
          : null,
        guardianCount: s.parentLinks.length,
        primaryGuardian: primary
          ? {
              id: primary.id,
              name: primary.parent.name,
              email: primary.parent.email,
              status: primary.status,
              consentLabel: consentLabel(primary),
            }
          : null,
        guardians: s.parentLinks.map((l) => ({
          id: l.id,
          parentUserId: l.parentUserId,
          name: l.parent.name,
          email: l.parent.email,
          status: l.status,
          consentLabel: consentLabel(l),
          isPrimary: l.parentUserId === s.child.parentId,
        })),
        shortLearningBookingsCount: s._count.learningBookings,
        capabilities: {
          preferredName: false,
          relationshipField: false,
          studentWithoutGuardian: false,
        },
      };
    }),
    limitations: {
      preferredName: "Not in ChildProfile schema — full name only.",
      studentWithoutGuardian:
        "ChildProfile requires parentId; first guardian is required at create. Additional guardians can be linked later.",
    },
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { context, response } = await requireSchoolPermission(body.schoolId, "manageStudents", {
    method: "POST",
    route: "/api/school/students",
    resourceType: "student",
  });
  if (response) return response;

  const guardianName = `${body.guardianFirstName} ${body.guardianLastName}`.replace(/\s+/g, " ").trim();
  const result = await enrolSchoolStudent({
    schoolId: body.schoolId,
    firstName: body.firstName,
    lastName: body.lastName,
    yearGroup: body.yearGroup,
    classroomId: body.classroomId ?? null,
    guardianName,
    guardianEmail: body.guardianEmail,
    sendSupport: body.sendSupport,
    safeguardingFlag: body.safeguardingFlag,
    baselineNotes: body.baselineNotes,
    externalRef: body.externalRef,
    actorUserId: context.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, access: result.access }, { status: result.status });
  }

  let inviteUrl: string | null = null;
  if (body.sendInvite !== false) {
    const link = await prisma.parentSchoolLink.findUnique({
      where: {
        schoolId_parentUserId_schoolStudentId: {
          schoolId: body.schoolId,
          parentUserId: result.parentUserId,
          schoolStudentId: result.schoolStudentId,
        },
      },
      select: { id: true },
    });
    const raw = await createSchoolInviteToken({
      schoolId: body.schoolId,
      inviteType: "parent",
      targetEmail: body.guardianEmail.toLowerCase(),
      targetSchoolStudentId: result.schoolStudentId,
      createdByUserId: context.userId,
      metadata: {
        parentUserId: result.parentUserId,
        linkId: link?.id ?? null,
        schoolStudentId: result.schoolStudentId,
        childId: result.childId,
        relationship: body.relationship ?? null,
        message: body.message ?? null,
      },
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    inviteUrl = `${baseUrl}/school/invites/accept?token=${raw}`;
    const school = await prisma.school.findUnique({ where: { id: body.schoolId }, select: { name: true } });
    const emailTemplate = buildSchoolInviteEmail({
      schoolName: school?.name ?? "School",
      roleLabel: "Parent / Guardian",
      inviteUrl,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    });
    await sendEmail({
      to: body.guardianEmail.toLowerCase(),
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "invite_sent",
      entityType: "student",
      entityId: result.schoolStudentId,
      metadata: {
        mode: "parent_invited",
        targetEmail: body.guardianEmail.toLowerCase(),
        parentUserId: result.parentUserId,
        relationship: body.relationship ?? null,
      },
      severity: "info",
    });
  }

  return NextResponse.json({
    ok: true,
    schoolStudentId: result.schoolStudentId,
    childId: result.childId,
    parentUserId: result.parentUserId,
    inviteUrl,
  }, { status: 201 });
}