import { redirect } from "next/navigation";
import DaySchoolLessonReviewClient from "@/components/school-admin/DaySchoolLessonReviewClient";
import { readSessionFromCookie } from "@/lib/auth";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolLessonReviewPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/lesson-review");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");

  return <DaySchoolLessonReviewClient schoolId={ctx.schoolId} />;
}
