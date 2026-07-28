import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { writeSchoolAuditLog } from "@/lib/schools/audit";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import {
  clearStaffAbsence,
  createStaffAbsence,
  formatDateOnly,
  isStaffAbsenceReason,
  listStaffAbsencesForSchool,
  toDateOnly,
} from "@/lib/schools/staff-absence";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "manageTeachers") && !canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted to view staff absences." }, { status: 403 });
  }

  const url = new URL(request.url);
  const onOrAfterRaw = url.searchParams.get("onOrAfter");
  let onOrAfter: Date | undefined;
  if (onOrAfterRaw) {
    try {
      onOrAfter = toDateOnly(onOrAfterRaw);
    } catch {
      return NextResponse.json({ error: "onOrAfter must be YYYY-MM-DD." }, { status: 400 });
    }
  }

  const rows = await listStaffAbsencesForSchool({
    schoolId: ctx.schoolId,
    onOrAfter,
  });

  return NextResponse.json({
    ok: true,
    absences: rows.map((row) => ({
      id: row.id,
      schoolTeacherId: row.schoolTeacherId,
      teacherName: row.schoolTeacher.user.name,
      teacherEmail: row.schoolTeacher.user.email,
      startsOn: formatDateOnly(row.startsOn),
      endsOn: formatDateOnly(row.endsOn),
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
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
    return NextResponse.json({ error: "Not permitted to manage staff absences." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const schoolTeacherId =
    typeof (body as { schoolTeacherId?: unknown }).schoolTeacherId === "string"
      ? (body as { schoolTeacherId: string }).schoolTeacherId
      : "";
  const startsOn =
    typeof (body as { startsOn?: unknown }).startsOn === "string"
      ? (body as { startsOn: string }).startsOn
      : "";
  const endsOn =
    typeof (body as { endsOn?: unknown }).endsOn === "string"
      ? (body as { endsOn: string }).endsOn
      : startsOn;
  const reasonRaw =
    typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason
      : "";
  const note =
    typeof (body as { note?: unknown }).note === "string"
      ? (body as { note: string }).note
      : null;

  if (!schoolTeacherId || !startsOn) {
    return NextResponse.json({ error: "schoolTeacherId and startsOn are required." }, { status: 400 });
  }
  if (!isStaffAbsenceReason(reasonRaw)) {
    return NextResponse.json({ error: "Invalid absence reason." }, { status: 400 });
  }

  const created = await createStaffAbsence({
    schoolId: ctx.schoolId,
    schoolTeacherId,
    startsOn,
    endsOn,
    reason: reasonRaw,
    note,
    createdByUserId: session.userId,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  await writeSchoolAuditLog({
    schoolId: ctx.schoolId,
    actorUserId: session.userId,
    action: "staff_absence_created",
    entityType: "teacher",
    entityId: schoolTeacherId,
    metadata: {
      absenceId: created.absence.id,
      startsOn: formatDateOnly(created.absence.startsOn),
      endsOn: formatDateOnly(created.absence.endsOn),
      reason: created.absence.reason,
    },
    severity: "info",
  });

  return NextResponse.json({
    ok: true,
    absence: {
      id: created.absence.id,
      schoolTeacherId: created.absence.schoolTeacherId,
      startsOn: formatDateOnly(created.absence.startsOn),
      endsOn: formatDateOnly(created.absence.endsOn),
      reason: created.absence.reason,
      note: created.absence.note,
    },
  });
}

export async function DELETE(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "manageTeachers")) {
    return NextResponse.json({ error: "Not permitted to manage staff absences." }, { status: 403 });
  }

  const url = new URL(request.url);
  const absenceId = url.searchParams.get("id") ?? "";
  if (!absenceId) {
    return NextResponse.json({ error: "Absence id is required." }, { status: 400 });
  }

  const cleared = await clearStaffAbsence({ schoolId: ctx.schoolId, absenceId });
  if (!cleared.ok) {
    return NextResponse.json({ error: cleared.error }, { status: cleared.status });
  }

  await writeSchoolAuditLog({
    schoolId: ctx.schoolId,
    actorUserId: session.userId,
    action: "staff_absence_cleared",
    entityType: "teacher",
    entityId: absenceId,
    metadata: { absenceId },
    severity: "info",
  });

  return NextResponse.json({ ok: true, absenceId: cleared.absenceId });
}