import { redirect } from "next/navigation";
import SchoolClassesManagementClient from "@/components/school-admin/SchoolClassesManagementClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminDaySchoolClassesPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/classes");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageClassrooms")) redirect("/school-admin");

  return (
    <SchoolClassesManagementClient schoolId={ctx.schoolId} schoolName={ctx.schoolName} />
  );
}