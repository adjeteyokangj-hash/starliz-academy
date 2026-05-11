/**
 * Parent-school relationship API.
 *
 * POST /api/school/parent-links
 *
 * Actions:
 *   linkParent         — Link a parent user to a school student (school admin or owner only)
 *   updatePermissions  — Update communication permissions for a parent-school link
 *   recordConsent      — Record parent consent given/withdrawn
 *   removeLink         — Remove parent from school student record
 *
 * All writes are school-scoped: the acting teacher must belong to the school.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSchoolAdmin } from "@/lib/schools/guards";
import { withSchoolId } from "@/lib/schools/tenant";
import { writeSchoolAuditLog } from "@/lib/schools/audit";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("linkParent"),
    schoolId: z.string().min(1),
    payload: z.object({
      parentEmail: z.string().email(),
      schoolStudentId: z.string().min(1),
      canReceiveReports: z.boolean().default(true),
      canMessageTeachers: z.boolean().default(true),
    }),
  }),
  z.object({
    action: z.literal("updatePermissions"),
    schoolId: z.string().min(1),
    payload: z.object({
      linkId: z.string().min(1),
      canReceiveReports: z.boolean().optional(),
      canMessageTeachers: z.boolean().optional(),
    }),
  }),
  z.object({
    action: z.literal("recordConsent"),
    schoolId: z.string().min(1),
    payload: z.object({
      linkId: z.string().min(1),
      consented: z.boolean(),
    }),
  }),
  z.object({
    action: z.literal("removeLink"),
    schoolId: z.string().min(1),
    payload: z.object({
      linkId: z.string().min(1),
    }),
  }),
]);

export async function POST(request: Request) {
  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await request.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { context, response } = await requireSchoolAdmin(body.schoolId, {
    method: "POST",
    route: "/api/school/parent-links",
    resourceType: "parent_link",
  });
  if (response) return response;

  switch (body.action) {
    case "linkParent": {
      const parent = await prisma.user.findUnique({
        where: { email: body.payload.parentEmail.toLowerCase() },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "No parent account found with that email." }, { status: 404 });
      }

      // Verify school student belongs to this school
      const schoolStudent = await prisma.schoolStudent.findUnique({
        where: { id: body.payload.schoolStudentId },
        select: { id: true, schoolId: true },
      });
      if (!schoolStudent || schoolStudent.schoolId !== body.schoolId) {
        return NextResponse.json({ error: "Student not found in this school." }, { status: 404 });
      }

      const link = await prisma.parentSchoolLink.upsert({
        where: {
          schoolId_parentUserId_schoolStudentId: {
            schoolId: body.schoolId,
            parentUserId: parent.id,
            schoolStudentId: body.payload.schoolStudentId,
          },
        },
        create: {
          schoolId: body.schoolId,
          parentUserId: parent.id,
          schoolStudentId: body.payload.schoolStudentId,
          canReceiveReports: body.payload.canReceiveReports,
          canMessageTeachers: body.payload.canMessageTeachers,
          status: "pending_consent",
          invitedAt: new Date(),
        },
        update: {
          canReceiveReports: body.payload.canReceiveReports,
          canMessageTeachers: body.payload.canMessageTeachers,
          status: "active",
        },
      });

      await writeSchoolAuditLog({
        schoolId: body.schoolId,
        actorUserId: context.userId,
        action: "student_enrolled",
        entityType: "student",
        entityId: body.payload.schoolStudentId,
        metadata: { parentLinked: parent.id, linkId: link.id },
        severity: "info",
      });

      return NextResponse.json({ ok: true, link });
    }

    case "updatePermissions": {
      const link = await prisma.parentSchoolLink.findUnique({
        where: { id: body.payload.linkId },
        select: { id: true, schoolId: true },
      });
      if (!link || link.schoolId !== body.schoolId) {
        return NextResponse.json({ error: "Link not found." }, { status: 404 });
      }

      const updated = await prisma.parentSchoolLink.update({
        where: { id: body.payload.linkId },
        data: {
          ...(body.payload.canReceiveReports !== undefined
            ? { canReceiveReports: body.payload.canReceiveReports }
            : {}),
          ...(body.payload.canMessageTeachers !== undefined
            ? { canMessageTeachers: body.payload.canMessageTeachers }
            : {}),
        },
      });

      return NextResponse.json({ ok: true, link: updated });
    }

    case "recordConsent": {
      const link = await prisma.parentSchoolLink.findUnique({
        where: { id: body.payload.linkId },
        select: { id: true, schoolId: true },
      });
      if (!link || link.schoolId !== body.schoolId) {
        return NextResponse.json({ error: "Link not found." }, { status: 404 });
      }

      const updated = await prisma.parentSchoolLink.update({
        where: { id: body.payload.linkId },
        data: {
          consentGivenAt: body.payload.consented ? new Date() : null,
          consentWithdrawnAt: !body.payload.consented ? new Date() : null,
          status: body.payload.consented ? "active" : "suspended",
        },
      });

      return NextResponse.json({ ok: true, link: updated });
    }

    case "removeLink": {
      const link = await prisma.parentSchoolLink.findUnique({
        where: { id: body.payload.linkId },
        select: { id: true, schoolId: true },
      });
      if (!link || link.schoolId !== body.schoolId) {
        return NextResponse.json({ error: "Link not found." }, { status: 404 });
      }

      await prisma.parentSchoolLink.update({
        where: { id: body.payload.linkId },
        data: { status: "removed" },
      });

      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }
}

// ─── GET: list parent links for a school ─────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  }

  const { response } = await requireSchoolAdmin(schoolId, {
    method: "GET",
    route: "/api/school/parent-links",
    resourceType: "parent_link",
  });
  if (response) return response;

  const links = await prisma.parentSchoolLink.findMany({
    where: withSchoolId(schoolId, { status: { not: "removed" } }),
    include: {
      parent: { select: { id: true, name: true, email: true } },
      schoolStudent: {
        include: {
          child: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { invitedAt: "desc" },
  });

  return NextResponse.json({ links });
}
