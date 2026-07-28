import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { changeStudentLearningBooking } from "@/lib/schools/short-learning-bookings";
import { formatBookingRef } from "@/lib/schools/short-learning-booking-audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent" && session.role !== "admin") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const booking = await prisma.studentLearningBooking.findFirst({
    where: { id, parentUserId: session.userId },
    include: {
      schoolStudent: {
        include: {
          child: { select: { name: true } },
          school: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    booking: {
      id: booking.id,
      bookingRef: formatBookingRef(booking.id),
      schoolId: booking.schoolId,
      schoolStudentId: booking.schoolStudentId,
      schoolName: booking.schoolStudent.school.name,
      studentName: booking.schoolStudent.child.name,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
      subject: booking.subject,
      status: booking.status,
      learningFocus: booking.learningFocus,
    },
  });
}

export async function PATCH(request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const startsAtRaw = typeof (body as { startsAt?: unknown }).startsAt === "string"
    ? (body as { startsAt: string }).startsAt
    : undefined;
  const durationMinutesRaw = (body as { durationMinutes?: unknown }).durationMinutes;
  const durationMinutes = durationMinutesRaw == null ? undefined : Number(durationMinutesRaw);
  const subject = typeof (body as { subject?: unknown }).subject === "string"
    ? (body as { subject: string }).subject
    : undefined;
  const learningFocus = typeof (body as { learningFocus?: unknown }).learningFocus === "string"
    ? (body as { learningFocus: string }).learningFocus
    : (body as { learningFocus?: unknown }).learningFocus === null
      ? null
      : undefined;

  if (startsAtRaw === undefined && durationMinutes === undefined && subject === undefined && learningFocus === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of startsAt, durationMinutes, subject, or learningFocus." },
      { status: 400 },
    );
  }

  const startsAt = startsAtRaw ? new Date(startsAtRaw) : undefined;
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Invalid startsAt." }, { status: 400 });
  }
  if (durationMinutes !== undefined && !Number.isFinite(durationMinutes)) {
    return NextResponse.json({ error: "Invalid durationMinutes." }, { status: 400 });
  }

  try {
    const booking = await changeStudentLearningBooking({
      bookingId: id,
      parentUserId: session.userId,
      startsAt,
      durationMinutes,
      subject,
      learningFocus,
    });
    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        durationMinutes: booking.durationMinutes,
        subject: booking.subject,
        status: booking.status,
        learningFocus: booking.learningFocus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to change booking.";
    if (message === "Booking not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    const safe =
      message.length <= 200
      && !/prisma|sql|stack|ECONN|timeout|internal/i.test(message)
        ? message
        : "Unable to change booking right now. Please try again.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}