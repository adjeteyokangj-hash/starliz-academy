import { redirect } from "next/navigation";
import SchoolClassFormClient from "@/components/school-admin/SchoolClassFormClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

type Props = { params: Promise<{ classId: string }> };

export default async function SchoolAdminEditClassPage({ params }: Props) {
  const session = await readSessionFromCookie();
  const { classId } = await params;
  if (!session) redirect(`/auth/login?next=/school-admin/day-school/classes/${classId}/edit`);
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageClassrooms")) redirect("/school-admin");
  return (
    <SchoolClassFormClient
      schoolId={ctx.schoolId}
      schoolName={ctx.schoolName}
      mode="edit"
      classId={classId}
    />
  );
}