import { notFound, redirect } from "next/navigation";
import CodingLessonWorkspace from "@/components/coding/CodingLessonWorkspace";
import { readSessionFromCookie } from "@/lib/auth";
import { codingLessonById } from "@/lib/coding/catalog";

type Params = {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ bookingId?: string; daytimePeriodId?: string }>;
};

export default async function StudentCodingLessonPage({ params, searchParams }: Params) {
  const session = await readSessionFromCookie();
  const { lessonId } = await params;
  if (!session) redirect(`/auth/login?next=/student/coding/${lessonId}`);
  if (!codingLessonById(lessonId)) notFound();
  const query = await searchParams;
  return (
    <CodingLessonWorkspace
      lessonId={lessonId}
      bookingId={query.bookingId}
      daytimePeriodId={query.daytimePeriodId}
    />
  );
}
