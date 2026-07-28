import CollapsibleCard from "@/components/school-admin/CollapsibleCard";
import { redirect } from "next/navigation";
import SchoolTodayTimetable from "@/components/admin/schools/SchoolTodayTimetable";
import { readSessionFromCookie } from "@/lib/auth";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolTimetablePage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/timetable");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">School timetable</h1>
        <p className="mt-1 text-sm text-foreground/60">
          School-wide Day School periods across classes, teachers, subjects, and rooms — not your personal teaching board.
        </p>
      </div>
      <CollapsibleCard title="School timetable" bodyClassName="p-4">
        <SchoolTodayTimetable schoolId={ctx.schoolId} portalMode="school-portal" />
      </CollapsibleCard>
    </div>
  );
}
