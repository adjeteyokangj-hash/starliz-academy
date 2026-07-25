import { redirect } from "next/navigation";
import SessionKeepAlive from "@/components/auth/SessionKeepAlive";
import SchoolAdminNav from "@/components/school-admin/SchoolAdminNav";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { isSchoolAdminRole } from "@/lib/schools/portal-routing";

export default async function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/school-admin");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx || !isSchoolAdminRole(ctx.role)) {
    redirect("/teacher");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SessionKeepAlive loginPath="/auth/login" />
      <SchoolAdminNav schoolName={ctx.schoolName} role={ctx.role} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
