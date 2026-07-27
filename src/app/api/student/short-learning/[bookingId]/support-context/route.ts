import { NextResponse } from "next/server";
import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveShortLearningSupportContext } from "@/lib/schools/short-learning-support-context";
import { countShiftEligibleTutorCapacity, isShortLearningBookingActive } from "@/lib/schools/support-eligibility";
import { studentHumanSupportDisplay } from "@/lib/schools/daytime-lesson-ui";

type Params = { params: Promise<{ bookingId: string }> };

async function resolveChildId(session: { userId: string; email: string; role: string }) {
  let childId: string | null = await readChildSelectionFromCookie(session.userId);
  if (!childId && session.role === "parent") {
    const parentScope = await resolveParentScope(session);
    if (parentScope) childId = await resolveParentActiveChildId(parentScope.parentId);
  }
  return childId;
}

/** GET — Short Learning support chrome: human-support summary within booking window. */
export async function GET(request: Request, { params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const childId = await resolveChildId(session);
  if (!childId) return NextResponse.json({ error: "Select a child profile first." }, { status: 400 });

  const { bookingId } = await params;
  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId")?.trim() ?? "";
  const contentId = url.searchParams.get("contentId")?.trim() ?? "";

  const booking = await prisma.studentLearningBooking.findFirst({
    where: {
      id: bookingId,
      schoolStudent: { childId, status: "active" },
      status: { in: ["booked", "confirmed", "attended"] },
    },
    include: {
      shortLearningSession: {
        include: { blocks: { orderBy: { order: "asc" }, take: 12 } },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const active = isShortLearningBookingActive({
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
  });

  const capacity = await countShiftEligibleTutorCapacity({ schoolId: booking.schoolId });
  const openSession = await prisma.humanSupportSession.findFirst({
    where: {
      schoolId: booking.schoolId,
      childId,
      status: "active",
      periodId: { startsWith: `sl:${bookingId}:` },
    },
    select: { id: true },
  });
  const waiting = await prisma.humanSupportQueueEntry.findFirst({
    where: {
      schoolId: booking.schoolId,
      childId,
      status: { in: ["waiting", "assigned"] },
      periodId: { startsWith: `sl:${bookingId}:` },
    },
    select: { id: true, status: true },
  });

  const humanSupport = studentHumanSupportDisplay({
    onlineTutorCount: capacity.onlineTutorCount,
    availableTutorCount: capacity.availableTutorCount,
    busyTutorCount: Math.max(0, capacity.onlineTutorCount - capacity.availableTutorCount),
    studentQueued: Boolean(waiting),
    studentSessionActive: Boolean(openSession),
  });

  let supportContext = null;
  if (active && assignmentId && contentId) {
    const resolved = await resolveShortLearningSupportContext({
      studentId: childId,
      bookingId,
      assignmentId,
      contentId,
    });
    if (resolved.ok) {
      supportContext = {
        bookingId: resolved.context.bookingId,
        sessionId: resolved.context.sessionId,
        blockId: resolved.context.blockId,
        subject: resolved.context.subject,
        yearGroup: resolved.context.yearGroup,
        learningObjective: resolved.context.learningObjective,
        bookingStartsAt: resolved.context.bookingStartsAt.toISOString(),
        bookingEndsAt: resolved.context.bookingEndsAt.toISOString(),
        supportMode: resolved.context.supportMode,
      };
    }
  }

  return NextResponse.json({
    supportMode: "SHORT_LEARNING",
    bookingActive: active,
    booking: {
      id: booking.id,
      subject: booking.subject,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      durationMinutes: booking.durationMinutes,
    },
    session: booking.shortLearningSession
      ? {
          id: booking.shortLearningSession.id,
          status: booking.shortLearningSession.status,
          yearGroup: booking.shortLearningSession.yearGroup,
        }
      : null,
    humanSupport: {
      ...humanSupport,
      summary: humanSupport.state,
    },
    wording: {
      aiAvailable: "AI support is available throughout.",
      humanMayBeOffered: "Human support may be offered when available.",
      notGuaranteed: "Human support is not guaranteed.",
      notPrivate: "This is not a private one-to-one tutor booking.",
    },
    supportContext,
  });
}
