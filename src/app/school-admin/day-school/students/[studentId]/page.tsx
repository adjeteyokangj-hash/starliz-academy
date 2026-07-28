import { redirect } from "next/navigation";
import SchoolStudentDetailClient from "@/components/school-admin/SchoolStudentDetailClient";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo } from "@/lib/schools/permissions";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

type Props = { params: Promise<{ studentId: string }> };

export default async function SchoolAdminStudentDetailPage({ params }: Props) {
  const { studentId } = await params;
  const session = await readSessionFromCookie();
  if (!session) redirect(`/auth/login?next=/school-admin/day-school/students/${studentId}`);
  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");
  if (!canDo(ctx.role, "manageStudents")) redirect("/school-admin");
  return (
    <SchoolStudentDetailClient schoolId={ctx.schoolId} schoolName={ctx.schoolName} studentId={studentId} />
  );
}