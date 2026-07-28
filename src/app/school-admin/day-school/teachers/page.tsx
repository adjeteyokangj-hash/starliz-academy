import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";
import SchoolStaffManagementClient from "@/components/school-admin/SchoolStaffManagementClient";

export default async function SchoolAdminDaySchoolTeachersPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin/day-school/teachers");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageTeachers")) {
    redirect("/school-admin");
  }

  return (
    <SchoolStaffManagementClient
      schoolId={ctx.schoolId}
      schoolName={ctx.schoolName}
      actorRole={ctx.role}
    />
  );
}
