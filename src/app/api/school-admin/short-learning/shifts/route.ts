import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import { createTutorSupportShift } from "@/lib/schools/tutor-support-shifts";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "manageTeachers") && !canDo(ctx.role, "viewHumanSupport")) {
    return NextResponse.json({ error: "Not permitted to manage tutor shifts." }, { status: 403 });
  }

  const [shifts, tutors] = await Promise.all([
    prisma.tutorSupportShift.findMany({
      where: { schoolId: ctx.schoolId },
      include: {
        schoolTeacher: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
      orderBy: { startsAt: "desc" },
      take: 100,
    }),
    prisma.schoolTeacher.findMany({
      where: {
        schoolId: ctx.schoolId,
        status: "active",
        role: { in: ["teacher", "support", "owner", "admin"] },
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    shifts: shifts.map((row) => ({
      id: row.id,
      schoolTeacherId: row.schoolTeacherId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      published: row.published,
      notes: row.notes,
      tutorName: row.schoolTeacher.user.name || row.schoolTeacher.user.email,
    })),
    tutors: tutors.map((row) => ({
      id: row.id,
      name: row.user.name || row.user.email,
      role: row.role,
    })),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "manageTeachers")) {
    return NextResponse.json({ error: "Not permitted to create tutor shifts." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const schoolTeacherId =
    body && typeof body === "object" && typeof (body as { schoolTeacherId?: unknown }).schoolTeacherId === "string"
      ? (body as { schoolTeacherId: string }).schoolTeacherId
      : null;
  const startsAtRaw =
    body && typeof body === "object" && typeof (body as { startsAt?: unknown }).startsAt === "string"
      ? (body as { startsAt: string }).startsAt
      : null;
  const endsAtRaw =
    body && typeof body === "object" && typeof (body as { endsAt?: unknown }).endsAt === "string"
      ? (body as { endsAt: string }).endsAt
      : null;
  const notes =
    body && typeof body === "object" && typeof (body as { notes?: unknown }).notes === "string"
      ? (body as { notes: string }).notes
      : null;
  const published =
    body && typeof body === "object" && typeof (body as { published?: unknown }).published === "boolean"
      ? (body as { published: boolean }).published
      : true;

  if (!schoolTeacherId || !startsAtRaw || !endsAtRaw) {
    return NextResponse.json({ error: "schoolTeacherId, startsAt, and endsAt are required." }, { status: 400 });
  }

  const tutor = await prisma.schoolTeacher.findFirst({
    where: { id: schoolTeacherId, schoolId: ctx.schoolId, status: "active" },
    select: { id: true },
  });
  if (!tutor) {
    return NextResponse.json({ error: "Tutor not found in this school." }, { status: 404 });
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "Invalid startsAt or endsAt." }, { status: 400 });
  }

  try {
    const shift = await createTutorSupportShift({
      schoolId: ctx.schoolId,
      schoolTeacherId,
      startsAt,
      endsAt,
      notes,
      published,
      createdByTeacherId: ctx.schoolTeacherId,
    });
    return NextResponse.json({
      ok: true,
      shift: {
        id: shift.id,
        schoolTeacherId: shift.schoolTeacherId,
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        status: shift.status,
        published: shift.published,
        notes: shift.notes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create shift.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
