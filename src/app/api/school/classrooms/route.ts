import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { isAssignableClassroomTeacher } from "@/lib/schools/classroom-eligibility";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { requireSchoolPermission } from "@/lib/schools/guards";

const statusFilterSchema = z.enum(["all", "active", "archived"]);

const createSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  yearGroup: z.string().trim().max(40).optional().nullable(),
  academicYear: z.string().trim().max(40).optional().nullable(),
  teacherId: z.string().min(1).optional().nullable(),
  status: z.enum(["active", "archived"]).optional().default("active"),
});

const includeList = {
  teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
  _count: { select: { students: { where: { status: "active" as const } }, dayLessons: true } },
};

function serializeClassroom(classroom: {
  id: string; schoolId: string; name: string; yearGroup: string | null; academicYear: string | null;
  status: string; teacherId: string | null; createdAt: Date; updatedAt: Date;
  teacher: { id: string; role: string; status: string; user: { id: string; name: string | null; email: string } } | null;
  _count: { students: number; dayLessons: number };
}) {
  return {
    id: classroom.id,
    schoolId: classroom.schoolId,
    name: classroom.name,
    yearGroup: classroom.yearGroup,
    keyStage: classroom.yearGroup ? keyStageForYearGroup(classroom.yearGroup) : null,
    academicYear: classroom.academicYear,
    status: classroom.status,
    teacherId: classroom.teacherId,
    teacher: classroom.teacher
      ? { id: classroom.teacher.id, role: classroom.teacher.role, status: classroom.teacher.status, user: classroom.teacher.user }
      : null,
    additionalTeachers: [] as Array<never>,
    studentCount: classroom._count.students,
    timetablePeriodCount: classroom._count.dayLessons,
    capacity: null as number | null,
    createdAt: classroom.createdAt.toISOString(),
    updatedAt: classroom.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId");
  if (!schoolId) return NextResponse.json({ error: "schoolId is required" }, { status: 400 });
  const statusParse = statusFilterSchema.safeParse(searchParams.get("status") ?? "all");
  if (!statusParse.success) return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  const { response } = await requireSchoolPermission(schoolId, "manageClassrooms", {
    method: "GET", route: "/api/school/classrooms", resourceType: "classroom",
  });
  if (response) return response;
  const status = statusParse.data;
  const classrooms = await prisma.classroom.findMany({
    where: { schoolId, ...(status === "all" ? {} : { status }) },
    include: includeList,
    orderBy: [{ academicYear: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({
    classrooms: classrooms.map(serializeClassroom),
    capabilities: { additionalTeachers: false, capacity: false, archive: true },
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof createSchema>;
  try { body = createSchema.parse(await request.json()); }
  catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { context, response } = await requireSchoolPermission(body.schoolId, "manageClassrooms", {
    method: "POST", route: "/api/school/classrooms", resourceType: "classroom",
  });
  if (response) return response;
  const yearRaw = body.yearGroup?.trim() || null;
  if (body.teacherId) {
    const teacher = await prisma.schoolTeacher.findUnique({ where: { id: body.teacherId } });
    if (!teacher || !isAssignableClassroomTeacher(teacher, body.schoolId)) {
      return NextResponse.json({ error: "Primary teacher must be an active teaching staff member of this school." }, { status: 400 });
    }
  }
  try {
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: body.schoolId,
        name: body.name.trim(),
        yearGroup: yearRaw,
        academicYear: body.academicYear?.trim() || null,
        teacherId: body.teacherId || null,
        status: body.status ?? "active",
      },
      include: includeList,
    });
    await writeSchoolAuditLog({
      schoolId: body.schoolId,
      actorUserId: context.userId,
      action: "classroom_created",
      entityType: "classroom",
      entityId: classroom.id,
      severity: "info",
      metadata: {
        name: classroom.name,
        yearGroup: classroom.yearGroup,
        academicYear: classroom.academicYear,
        teacherId: classroom.teacherId,
        status: classroom.status,
      },
    });
    return NextResponse.json({ item: serializeClassroom(classroom) }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "A class with this name already exists for that academic year." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create class." }, { status: 500 });
  }
}
