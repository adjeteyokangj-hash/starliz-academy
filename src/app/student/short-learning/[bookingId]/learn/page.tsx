import { notFound, redirect } from "next/navigation";
import ShortLearningLearnSession from "@/components/student/ShortLearningLearnSession";
import { readChildSelectionFromCookie, readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { resolveParentScope } from "@/lib/parent_scope";

type Params = { params: Promise<{ bookingId: string }> };

export default async function StudentShortLearningLearnPage({ params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/short-learning");

  let childId: string | null = await readChildSelectionFromCookie(session.userId);
  if (!childId && session.role === "parent") {
    const parentScope = await resolveParentScope(session);
    if (parentScope) childId = await resolveParentActiveChildId(parentScope.parentId);
  }
  if (!childId) {
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
