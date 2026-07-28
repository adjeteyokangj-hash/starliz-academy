import { redirect } from "next/navigation";
import DaySchoolAttendanceClient from "@/components/school-admin/DaySchoolAttendanceClient";
import { readSessionFromCookie } from "@/lib/auth";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolAttendancePage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/attendance");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");

  return <DaySchoolAttendanceClient />;
}
