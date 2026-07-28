import { redirect } from "next/navigation";
import SchoolStudentsManagementClient from "@/components/school-admin/SchoolStudentsManagementClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolStudentsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/students");
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageStudents")) redirect("/school-admin");
  return <SchoolStudentsManagementClient schoolId={ctx.schoolId} schoolName={ctx.schoolName} />;
}