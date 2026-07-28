import { redirect } from "next/navigation";
import SchoolClassDetailClient from "@/components/school-admin/SchoolClassDetailClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

type Props = { params: Promise<{ classId: string }> };

export default async function SchoolAdminClassDetailPage({ params }: Props) {
  const session = await readSessionFromCookie();
  const { classId } = await params;
  if (!session) redirect(`/auth/login?next=/school-admin/day-school/classes/${classId}`);
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageClassrooms")) redirect("/school-admin");
  return (
    <SchoolClassDetailClient
      schoolId={ctx.schoolId}
      schoolName={ctx.schoolName}
      classId={classId}
    />
  );
}