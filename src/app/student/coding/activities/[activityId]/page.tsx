import { notFound } from "next/navigation";
import { activityReleased } from "@/lib/coding/learning/catalogue";
import ActivityLoader from "@/components/coding/ActivityLoader";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { developmentCurriculumQa } from "@/lib/coding/learning/development-qa";

export default async function CodingActivityPage({ params, searchParams }: {
  params: Promise<{ activityId: string }>; searchParams: Promise<{ bookingId?: string; daytimePeriodId?: string }>;
}) {
  const { activityId } = await params;
  const { bookingId, daytimePeriodId } = await searchParams;
  if (!activityReleased(activityId)) {
    if (process.env.NODE_ENV !== "development") notFound();
    const { child } = await requireCodingLearner({ bookingId });
    if (!child || !await developmentCurriculumQa(child.id)) notFound();
  }
  return <ActivityLoader activityId={activityId} bookingId={bookingId} daytimePeriodId={daytimePeriodId} />;
}
