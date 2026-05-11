import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import TeacherNav from "@/components/teacher/TeacherNav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-background">
      <TeacherNav schoolName={ctx.schoolName} role={ctx.role} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
