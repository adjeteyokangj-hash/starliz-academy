import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { authorisedReadinessPlan, readinessBenchmark } from "@/lib/coding/learning/readiness";
import { LearningError } from "@/lib/coding/learning/state-machine";
import ActivityLoader from "@/components/coding/ActivityLoader";
export default async function PracticalReadinessPage({ params, searchParams }: { params: Promise<{ planId: string; activityId: string }>; searchParams: Promise<{ bookingId?: string; daytimePeriodId?: string }> }) {
  const { planId, activityId } = await params, { bookingId, daytimePeriodId } = await searchParams;
  const { child } = await requireCodingLearner({ bookingId }); if (!child) notFound();
  let plan; try { plan = await authorisedReadinessPlan(child.id, planId); } catch (error) { if (error instanceof LearningError && error.status === 404) notFound(); throw error; }
  const activity = readinessBenchmark(plan, activityId); if (!activity) notFound();
  return <><aside className="mx-auto max-w-[1600px] px-4 pt-5 text-sm leading-6"><p><strong>{plan.title}</strong> · Practical entry evidence for Year {plan.entryYear}. This bridge preserves your earlier lesson and course history.</p><Link className="inline-flex min-h-11 items-center font-semibold text-sky-900 underline" href="/student/coding#practical-readiness">Return to practical bridges</Link></aside><ActivityLoader activityId={activity.id} endpoint={`/api/student/coding/readiness/${encodeURIComponent(plan.id)}/${encodeURIComponent(activity.id)}`} bookingId={bookingId} daytimePeriodId={daytimePeriodId} /></>;
}
