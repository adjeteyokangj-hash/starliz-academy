import { publishedGuidedLocation } from "@/lib/coding/world/content-references";
import { notFound, redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { codingLessonById } from "@/lib/coding/catalog";
import CodingLessonWorkspace from "@/components/coding/CodingLessonWorkspace";
import { guidedHref } from "@/lib/coding/world/guided-mapping";
export default async function GuidedWorldLesson({ params, searchParams }: { params: Promise<{ lessonId: string }>; searchParams: Promise<{ bookingId?: string; daytimePeriodId?: string }> }) {
  const { lessonId } = await params, context = await searchParams;
  if (!await readSessionFromCookie()) redirect(`/auth/login?next=${encodeURIComponent(guidedHref("lesson", lessonId, context))}`);
  const lesson = codingLessonById(lessonId); if (!lesson?.published) notFound();
  return <CodingLessonWorkspace lessonId={lessonId} bookingId={context.bookingId} daytimePeriodId={context.daytimePeriodId} worldLocation={await publishedGuidedLocation(lessonId, "lesson", "robot")} />;
}
