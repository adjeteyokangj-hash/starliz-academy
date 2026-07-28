import { redirect } from "next/navigation";
import SchoolStudentFormClient from "@/components/school-admin/SchoolStudentFormClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminCreateStudentPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/students/new");
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageStudents")) redirect("/school-admin");
  return <SchoolStudentFormClient schoolId={ctx.schoolId} schoolName={ctx.schoolName} mode="create" />;
}