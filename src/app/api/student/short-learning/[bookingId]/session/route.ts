import { NextResponse } from "next/server";
import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ensureShortLearningSessionContent,
  getShortLearningSessionSummary,
  startShortLearningContentBlock,
} from "@/lib/schools/short-learning-session-content";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";

type Params = { params: Promise<{ bookingId: string }> };

async function resolveChildId(session: { userId: string; email: string; role: string }): Promise<string | null> {
  let childId: string | null = await readChildSelectionFromCookie(session.userId);
  if (!childId && session.role === "parent") {
    const parentScope = await resolveParentScope(session);
    if (parentScope) childId = await resolveParentActiveChildId(parentScope.parentId);
  }
  return childId;
}

async function assertBookingAccess(bookingId: string, childId: string) {
  return prisma.studentLearningBooking.findFirst({
    where: {
      id: bookingId,
      schoolStudent: { childId, status: "active" },
      status: { in: ["booked", "confirmed", "attended"] },
    },
    select: { id: true, subject: true, durationMinutes: true, learningFocus: true },
  });
}

/** GET — session plan + block readiness for the dashboard / learn shell. */
export async function GET(_request: Request, { params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const childId = await resolveChildId(session);
  if (!childId) return NextResponse.json({ error: "Select a child profile first." }, { status: 400 });

  const { bookingId } = await params;
  const booking = await assertBookingAccess(bookingId, childId);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  let summary = await getShortLearningSessionSummary(bookingId);
  if (!summary) {
    try {
      await ensureShortLearningSessionContent({ bookingId });
      summary = await getShortLearningSessionSummary(bookingId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to prepare session content." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      subject: booking.subject,
      durationMinutes: booking.durationMinutes,
      learningFocus: booking.learningFocus,
    },
    session: summary,
  });
}

/** POST — ensure content, assign current/next block, return lesson href. */
export async function POST(request: Request, { params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const childId = await resolveChildId(session);
  if (!childId) return NextResponse.json({ error: "Select a child profile first." }, { status: 400 });

  const { bookingId } = await params;
  const booking = await assertBookingAccess(bookingId, childId);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    forceRegenerate?: boolean;
    blockOrder?: number;
  };

  try {
    if (body.forceRegenerate) {
      await ensureShortLearningSessionContent({ bookingId, forceRegenerate: true });
    }
    const started = await startShortLearningContentBlock({
      bookingId,
      childId,
      actorUserId: session.userId,
      blockOrder: typeof body.blockOrder === "number" ? body.blockOrder : undefined,
    });
    return NextResponse.json(started);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start Short Learning content." },
      { status: 400 },
    );
  }
}
