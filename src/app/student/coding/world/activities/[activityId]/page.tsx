import { publishedGuidedLocation } from "@/lib/coding/world/content-references";
import { notFound, redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { activityDefinition, activityReleased } from "@/lib/coding/learning/catalogue";
import { guidedLocation, guidedHref } from "@/lib/coding/world/guided-mapping";
import ActivityLoader from "@/components/coding/ActivityLoader";
export default async function GuidedWorldActivity({ params, searchParams }: { params: Promise<{ activityId: string }>; searchParams: Promise<{ bookingId?: string; daytimePeriodId?: string }> }) {
  const { activityId } = await params, context = await searchParams;
  if (!await readSessionFromCookie()) redirect(`/auth/login?next=${encodeURIComponent(guidedHref("activity", activityId, context))}`);
  const activity = activityDefinition(activityId); if (!activity || !activityReleased(activity.id)) notFound();
  return <ActivityLoader activityId={activity.id} bookingId={context.bookingId} daytimePeriodId={context.daytimePeriodId} worldLocation={await publishedGuidedLocation(activity.id, "activity", guidedLocation(activity))} />;
}
