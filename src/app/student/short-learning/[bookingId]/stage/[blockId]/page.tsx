import { notFound, redirect } from "next/navigation";
import ShortLearningStageScreen from "@/components/student/ShortLearningStageScreen";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveActiveChildForSession } from "@/lib/activeChild";
import { isStructuralShortLearningBlockType } from "@/lib/schools/short-learning-classroom";
import { resolveShortLearningSchoolStudentIdsForChild } from "@/lib/schools/short-learning-bookings";

type Params = { params: Promise<{ bookingId: string; blockId: string }> };

export default async function ShortLearningStagePage({ params }: Params) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/short-learning");

  const resolved = await resolveActiveChildForSession(session);
  const childId = resolved.ok ? resolved.childId : null;
  if (!childId) {
    if (session.role === "student") redirect("/student/dashboard");
    redirect("/parent/dashboard");
  }

  const { bookingId, blockId } = await params;
  const schoolStudentIds = await resolveShortLearningSchoolStudentIdsForChild(childId);
  const booking = schoolStudentIds.length
    ? await prisma.studentLearningBooking.findFirst({
        where: {
          id: bookingId,
          schoolStudentId: { in: schoolStudentIds },
          status: { in: ["booked", "confirmed", "attended"] },
        },
        include: {
          school: { select: { name: true } },
          shortLearningSession: {
            include: { blocks: { orderBy: { order: "asc" } } },
          },
        },
      })
    : null;
  if (!booking?.shortLearningSession) notFound();

  const block = booking.shortLearningSession.blocks.find((item) => item.id === blockId);
  if (!block || !isStructuralShortLearningBlockType(block.blockType)) notFound();

  const completedTitles = booking.shortLearningSession.blocks
    .filter((item) => item.status === "completed" || item.id === block.id)
    .map((item) => item.title);

  return (
    <ShortLearningStageScreen
      bookingId={booking.id}
      sessionId={booking.shortLearningSession.id}
      blockId={block.id}
      blockType={block.blockType}
      title={block.title}
      estimatedMinutes={block.estimatedMinutes}
      learningObjective={block.learningObjective}
      subject={booking.subject}
      schoolName={booking.school.name}
      durationMinutes={booking.durationMinutes}
      endsAtIso={booking.endsAt.toISOString()}
      learningFocus={booking.learningFocus}
      completedTitles={completedTitles}
    />
  );
}
