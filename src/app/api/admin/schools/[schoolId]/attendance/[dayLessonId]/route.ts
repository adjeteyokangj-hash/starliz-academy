import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/api_guard";
import {
  loadAttendanceRegister,
  saveAttendanceRegister,
  type SaveAttendanceEntry,
} from "@/lib/schools/attendance-register";
import { isAttendanceStatus } from "@/lib/schools/attendance-status";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ schoolId: string; dayLessonId: string }> };

export async function GET(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, dayLessonId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const sessionDate = new URL(request.url).searchParams.get("sessionDate");
  const result = await loadAttendanceRegister({
    schoolDayLessonId: dayLessonId,
    sessionDate,
    expectedSchoolId: schoolId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, register: result.register });
}

export async function PUT(request: Request, context: Params) {
  const { session, response } = await requireAdminPermission("students:write");
  if (!session) return response;

  const { schoolId, dayLessonId } = await context.params;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Malformed submission." }, { status: 400 });
  }

  const modeRaw = (body as { mode?: string }).mode;
  const mode = modeRaw === "mark_all_present" || modeRaw === "register" || modeRaw === "draft"
    ? modeRaw
    : "draft";
  const sessionDate = typeof (body as { sessionDate?: unknown }).sessionDate === "string"
    ? (body as { sessionDate: string }).sessionDate
    : null;

  const rawEntries = (body as { entries?: unknown }).entries;
  const entries: SaveAttendanceEntry[] = [];
  if (mode !== "mark_all_present") {
    if (!Array.isArray(rawEntries)) {
      return NextResponse.json({ error: "Malformed attendance entries." }, { status: 400 });
    }
    for (const item of rawEntries) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "Malformed attendance entry." }, { status: 400 });
      }
      const schoolStudentId = (item as { schoolStudentId?: unknown }).schoolStudentId;
      const status = (item as { status?: unknown }).status;
      const note = (item as { note?: unknown }).note;
      if (typeof schoolStudentId !== "string" || !isAttendanceStatus(status)) {
        return NextResponse.json({ error: "Invalid attendance status or student id." }, { status: 400 });
      }
      entries.push({
        schoolStudentId,
        status,
        note: typeof note === "string" ? note : null,
      });
    }
  }

  const result = await saveAttendanceRegister({
    schoolDayLessonId: dayLessonId,
    sessionDate,
    entries,
    mode,
    actor: {
      schoolId,
      schoolTeacherId: null,
      role: "admin",
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    savedCount: result.savedCount,
    register: result.register,
  });
}
