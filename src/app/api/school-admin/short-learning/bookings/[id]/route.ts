import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { prisma } from "@/lib/db";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import {
  BOOKING_AUDIT_ACTIONS,
  BOOKING_ENTITY_TYPE,
  formatBookingRef,
  parseBookingChangeEvent,
} from "@/lib/schools/short-learning-booking-audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ error: "School admin access required." }, { status: 403 });
  }
  if (!canDo(ctx.role, "viewStudents") && !canDo(ctx.role, "viewDashboard")) {
    return NextResponse.json({ error: "Not permitted to view bookings." }, { status: 403 });
  }

  const { id } = await context.params;
  const booking = await prisma.studentLearningBooking.findFirst({
    where: { id, schoolId: ctx.schoolId },
    include: {
      schoolStudent: {
        include: {
          child: { select: { id: true, name: true, yearGroup: true } },
          classroom: { select: { id: true, name: true, yearGroup: true } },
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const parent = await prisma.user.findUnique({
    where: { id: booking.parentUserId },
    select: { id: true, name: true, email: true },
  });

  const historyRows = await prisma.schoolAuditLog.findMany({
    where: {
      schoolId: ctx.schoolId,
      entityType: BOOKING_ENTITY_TYPE,
      entityId: booking.id,
      action: { in: [...BOOKING_AUDIT_ACTIONS] },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const history = historyRows.map((row) => parseBookingChangeEvent(row));

  return NextResponse.json({
    ok: true,
    schoolId: ctx.schoolId,
    booking: {
      id: booking.id,
      bookingRef: formatBookingRef(booking.id),
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
      subject: booking.subject,
      status: booking.status,
      learningFocus: booking.learningFocus,
      parentNote: booking.parentNote,
      source: booking.source,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      cancellationCategory: booking.cancellationCategory,
      student: {
        schoolStudentId: booking.schoolStudentId,
        name: booking.schoolStudent.child.name,
        yearGroup:
          booking.schoolStudent.child.yearGroup
          ?? booking.schoolStudent.classroom?.yearGroup
          ?? null,
        classroomName: booking.schoolStudent.classroom?.name ?? null,
      },
      parent: {
        id: parent?.id ?? booking.parentUserId,
        name: parent?.name ?? null,
        email: parent?.email ?? null,
      },
      history,
    },
  });
}