import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import {
  SHORT_LEARNING_CHECKBOX,
  SHORT_LEARNING_PROMISE,
  createStudentLearningBooking,
  listParentBookableShortLearningStudents,
  parentHasShortLearningEntitlement,
} from "@/lib/schools/short-learning-bookings";
import { enqueueShortLearningBookingConfirmation } from "@/lib/schools/short-learning-notifications";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent" && session.role !== "admin") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const [bookings, bookable, entitled] = await Promise.all([
    prisma.studentLearningBooking.findMany({
      where: { parentUserId: session.userId },
      include: {
        schoolStudent: { include: { child: { select: { name: true } }, school: { select: { id: true, name: true } } } },
      },
      orderBy: { startsAt: "desc" },
      take: 100,
    }),
    listParentBookableShortLearningStudents(session.userId),
    parentHasShortLearningEntitlement(session.userId),
  ]);

  return NextResponse.json({
    ok: true,
    entitled,
    promise: SHORT_LEARNING_PROMISE,
    honestyCheckbox: SHORT_LEARNING_CHECKBOX,
    childCount: bookable.childCount,
    emptyReason: entitled ? bookable.emptyReason : null,
    students: bookable.students.map((student) => ({
      schoolId: student.schoolId,
      schoolName: student.schoolName,
      schoolStudentId: student.schoolStudentId,
      studentName: student.studentName,
      childId: student.childId,
      source: student.source,
    })),
    bookings: bookings.map((row) => {
      let selectionMeta: Record<string, unknown> | null = null;
      try {
        selectionMeta = row.metadataJson ? JSON.parse(row.metadataJson) as Record<string, unknown> : null;
      } catch {
        selectionMeta = null;
      }
      return {
        id: row.id,
        schoolId: row.schoolId,
        schoolStudentId: row.schoolStudentId,
        schoolName: row.schoolStudent.school.name,
        studentName: row.schoolStudent.child.name,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        durationMinutes: row.durationMinutes,
        subject: row.subject,
        status: row.status,
        learningFocus: row.learningFocus,
        subjectSelectionMode: selectionMeta?.subjectSelectionMode ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const schoolId = typeof (body as { schoolId?: unknown }).schoolId === "string"
    ? (body as { schoolId: string }).schoolId
    : null;
  const schoolStudentId = typeof (body as { schoolStudentId?: unknown }).schoolStudentId === "string"
    ? (body as { schoolStudentId: string }).schoolStudentId
    : null;
  const startsAtRaw = typeof (body as { startsAt?: unknown }).startsAt === "string"
    ? (body as { startsAt: string }).startsAt
    : null;
  const durationMinutes = Number((body as { durationMinutes?: unknown }).durationMinutes ?? 90);
  const subjectRaw = typeof (body as { subject?: unknown }).subject === "string"
    ? (body as { subject: string }).subject
    : "";
  const learningFocus = typeof (body as { learningFocus?: unknown }).learningFocus === "string"
    ? (body as { learningFocus: string }).learningFocus
    : null;
  const parentNote = typeof (body as { parentNote?: unknown }).parentNote === "string"
    ? (body as { parentNote: string }).parentNote
    : null;
  const honestyAcknowledged = Boolean((body as { honestyAcknowledged?: unknown }).honestyAcknowledged);

  if (!schoolId || !schoolStudentId || !startsAtRaw) {
    return NextResponse.json(
      { error: "schoolId, schoolStudentId, and startsAt are required." },
      { status: 400 },
    );
  }

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Invalid startsAt." }, { status: 400 });
  }

  try {
    const booking = await createStudentLearningBooking({
      schoolId,
      schoolStudentId,
      parentUserId: session.userId,
      startsAt,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 90,
      subject: subjectRaw,
      learningFocus,
      parentNote,
      honestyAcknowledged,
    });
    void enqueueShortLearningBookingConfirmation(booking.id).catch(() => null);
    let selectionMeta: Record<string, unknown> | null = null;
    try {
      selectionMeta = booking.metadataJson ? JSON.parse(booking.metadataJson) as Record<string, unknown> : null;
    } catch {
      selectionMeta = null;
    }
    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
        subject: booking.subject,
        learningFocus: booking.learningFocus,
        durationMinutes: booking.durationMinutes,
        subjectSelectionMode: selectionMeta?.subjectSelectionMode ?? null,
        selectionReason: selectionMeta?.selectionReason ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create booking.";
    const safe =
      message.length <= 200
      && !/prisma|sql|stack|ECONN|timeout|internal/i.test(message)
        ? message
        : "Unable to create booking right now. Please try again.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
