import Link from "next/link";
import { redirect } from "next/navigation";
import SessionKeepAlive from "@/components/auth/SessionKeepAlive";
import TeacherNav from "@/components/teacher/TeacherNav";
import { readSessionFromCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) {
    const pending = await prisma.schoolTeacher.findFirst({
      where: { userId: session.userId, status: "invited" },
      include: { school: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (pending) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-xl font-semibold text-foreground">School invite pending</h1>
            <p className="text-sm text-muted-foreground">
              Your account is invited to {pending.school.name}, but the invite has not been
              accepted yet. Ask a school admin to resend the invite, or contact support if you
              expected access already.
            </p>
            <Link href="/auth/login" className="text-sm text-primary underline">
              Back to login
            </Link>
          </div>
        </div>
      );
    }

    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SessionKeepAlive loginPath="/auth/login" />
      <TeacherNav schoolName={ctx.schoolName} role={ctx.role} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
