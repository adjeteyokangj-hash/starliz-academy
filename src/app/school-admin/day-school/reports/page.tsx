import { redirect } from "next/navigation";
import DaySchoolReportsLanding from "@/components/school-admin/DaySchoolReportsLanding";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolReportsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/reports");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "viewReports") && !canDo(ctx.role, "viewProgress")) {
    redirect("/school-admin");
  }

  return <DaySchoolReportsLanding schoolId={ctx.schoolId} schoolName={ctx.schoolName} />;
}
