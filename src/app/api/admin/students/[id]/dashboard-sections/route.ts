import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import {
  STUDENT_DASHBOARD_SECTION_KEYS,
  mergeStudentDashboardSettings,
  parseStudentDashboardSettings,
  serializeStudentDashboardSettings,
} from "@/lib/student-dashboard-sections";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const sectionShape = Object.fromEntries(
  STUDENT_DASHBOARD_SECTION_KEYS.map((key) => [key, z.boolean().optional()]),
) as Record<(typeof STUDENT_DASHBOARD_SECTION_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

const patchSchema = z.object({
  ...sectionShape,
  sections: z.object(sectionShape).optional(),
  masteredReview: z.object({
    replaceAfterDays: z.number().optional(),
    maxSubjectSessions: z.number().optional(),
  }).optional(),
  masteredReviewReplaceAfterDays: z.number().optional(),
  masteredReviewMaxSessions: z.number().optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const studentId = id?.trim() ?? "";
  if (!studentId) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, archived: false },
    select: {
      id: true,
      name: true,
      studentProfile: { select: { dashboardSectionsJson: true } },
    },
  });
  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const settings = parseStudentDashboardSettings(child.studentProfile?.dashboardSectionsJson);
  return NextResponse.json({
    studentId: child.id,
    studentName: child.name,
    sections: settings.sections,
    masteredReview: settings.masteredReview,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { id } = await context.params;
  const studentId = id?.trim() ?? "";
  if (!studentId) {
    return NextResponse.json({ error: "Student id is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload." }, { status: 400 });
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: studentId, archived: false },
    select: {
      id: true,
      name: true,
      studentProfile: { select: { id: true, dashboardSectionsJson: true } },
    },
  });
  if (!child) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const current = parseStudentDashboardSettings(child.studentProfile?.dashboardSectionsJson);
  const sectionPatch = {
    ...(parsed.data.sections ?? {}),
    ...Object.fromEntries(
      STUDENT_DASHBOARD_SECTION_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(parsed.data, key))
        .map((key) => [key, parsed.data[key]]),
    ),
  };
  const masteredPatch = {
    ...(parsed.data.masteredReview ?? {}),
    ...(parsed.data.masteredReviewReplaceAfterDays !== undefined
      ? { replaceAfterDays: parsed.data.masteredReviewReplaceAfterDays }
      : {}),
    ...(parsed.data.masteredReviewMaxSessions !== undefined
      ? { maxSubjectSessions: parsed.data.masteredReviewMaxSessions }
      : {}),
  };
  const next = mergeStudentDashboardSettings(current, {
    sections: sectionPatch,
    masteredReview: Object.keys(masteredPatch).length > 0 ? masteredPatch : undefined,
  });
  const serialized = serializeStudentDashboardSettings(next);

  if (child.studentProfile) {
    await prisma.studentProfile.update({
      where: { id: child.studentProfile.id },
      data: { dashboardSectionsJson: serialized },
    });
  } else {
    await prisma.studentProfile.create({
      data: {
        childId: child.id,
        dashboardSectionsJson: serialized,
      },
    });
  }

  void writeAuditLog({
    actorUserId: session.userId,
    action: "student_dashboard_sections_updated",
    entityType: "ChildProfile",
    entityId: child.id,
    metadata: { settings: next, studentName: child.name },
  });

  return NextResponse.json({
    ok: true,
    studentId: child.id,
    sections: next.sections,
    masteredReview: next.masteredReview,
  });
}