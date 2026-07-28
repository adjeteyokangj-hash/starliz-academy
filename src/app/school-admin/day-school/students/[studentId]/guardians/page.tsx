import { redirect } from "next/navigation";

type Props = { params: Promise<{ studentId: string }> };

/** Guardians are managed on the student detail page; keep a deep-link alias. */
export default async function SchoolAdminStudentGuardiansPage({ params }: Props) {
  const { studentId } = await params;
  redirect(`/school-admin/day-school/students/${studentId}#guardians`);
}