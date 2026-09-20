import { notFound, redirect } from "next/navigation";
import ShortLearningLearnSession from "@/components/student/ShortLearningLearnSession";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveChildForSession } from "@/lib/activeChild";

type Params = { params: Promise<{ bookingId: string }> };

export default async function StudentShortLearningLearnPage({ params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/short-learning");

  const resolved = await resolveActiveChildForSession(session);
  const childId = resolved.ok ? resolved.childId : null;
  if (!childId) {
    if (session.role === "student") redirect("/student/dashboard");
    redirect("/parent/profiles?intent=child&next=/student/short-learning");
  }

  const { bookingId } = await params;
  const booking = await prisma.studentLearningBooking.findFirst({
    where: {
      id: bookingId,
      schoolStudent: { childId, status: "active" },
      status: { in: ["booked", "confirmed", "attended"] },
    },
    include: { school: { select: { name: true } } },
  });
  if (!booking) notFound();

  return (
    <ShortLearningLearnSession
      bookingId={booking.id}
      subject={booking.subject}
      schoolName={booking.school.name}
      startsAtIso={booking.startsAt.toISOString()}
      endsAtIso={booking.endsAt.toISOString()}
      durationMinutes={booking.durationMinutes}
      learningFocus={booking.learningFocus}
    />
  );
}
