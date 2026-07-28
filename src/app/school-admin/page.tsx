import { redirect } from "next/navigation";
import SchoolOpsDashboardClient from "@/components/school-admin/SchoolOpsDashboardClient";
import { readSessionFromCookie } from "@/lib/auth";
import { requireSchoolAdminContext } from "@/lib/schools/portal-routing";

export default async function SchoolAdminHomePage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin");

  const ctx = await requireSchoolAdminContext(session.userId);
  if (!ctx) redirect("/teacher");

  return (
    <SchoolOpsDashboardClient
      schoolName={ctx.schoolName}
      actorRole={ctx.role}
    />
  );
}