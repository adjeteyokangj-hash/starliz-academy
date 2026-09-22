import { notFound, redirect } from "next/navigation";
import ShortLearningLearnSession from "@/components/student/ShortLearningLearnSession";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveChildForSession } from "@/lib/activeChild";
import { resolveShortLearningSchoolStudentIdsForChild } from "@/lib/schools/short-learning-bookings";

type Params = { params: Promise<{ bookingId: string }> };

export default async function StudentShortLearningLearnPage({ params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/short-learning");

  const resolved = await resolveActiveChildForSession(session);
  const childId = resolved.ok ? resolved.childId : null;
  if (!childId) {
    if (session.role === "student") redirect("/student/dashboard");
    redirect("/parent/dashboard");
  }

  const { bookingId } = await params;
  const schoolStudentIds = await resolveShortLearningSchoolStudentIdsForChild(childId);
  const booking = schoolStudentIds.length
    ? await prisma.studentLearningBooking.findFirst({
        where: {
          id: bookingId,
          schoolStudentId: { in: schoolStudentIds },
          status: { in: ["booked", "confirmed", "attended"] },
        },
        include: { school: { select: { name: true } } },
      })
    : null;
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
