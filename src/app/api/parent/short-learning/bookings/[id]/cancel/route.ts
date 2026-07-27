import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api_guard";
import { cancelStudentLearningBooking } from "@/lib/schools/short-learning-bookings";
import { enqueueShortLearningCancelConfirmation } from "@/lib/schools/short-learning-notifications";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Params) {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (session.role !== "parent") {
    return NextResponse.json({ error: "Parent access required." }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const booking = await cancelStudentLearningBooking({
      bookingId: id,
      parentUserId: session.userId,
    });
    void enqueueShortLearningCancelConfirmation(booking.id).catch(() => null);
    return NextResponse.json({
      ok: true,
      booking: {
        id: booking.id,
        status: booking.status,
        cancelledAt: booking.cancelledAt?.toISOString() ?? null,
        cancellationCategory: booking.cancellationCategory,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel booking.";
    if (message === "Booking not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    const safe =
      message.length <= 200
      && !/prisma|sql|stack|ECONN|timeout|internal/i.test(message)
        ? message
        : "Unable to cancel booking right now. Please try again.";
    return NextResponse.json({ error: safe }, { status: 400 });
  }
}
