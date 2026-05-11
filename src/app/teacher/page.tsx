import { redirect } from "next/navigation";
import Link from "next/link";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getSchoolSeatUsage } from "@/lib/schools/licensing";
import { getAccessibleClassrooms, getAccessibleStudents, getSchoolWeakAreas } from "@/lib/schools/scoping";

export default async function TeacherDashboardPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");

  const [seatUsage, classrooms, students, weakAreas] = await Promise.all([
    canDo(ctx.role, "viewBilling") ? getSchoolSeatUsage(ctx.schoolId) : null,
    getAccessibleClassrooms(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    canDo(ctx.role, "viewWeakAreas") ? getSchoolWeakAreas(ctx.schoolId, ctx.schoolTeacherId, ctx.role) : null,
  ]);

  const criticalWeakAreas = weakAreas?.filter((w) => w.accuracy < 40) ?? [];

  const roleLabel: Record<string, string> = {
    owner: "School Owner",
    admin: "School Admin",
    teacher: "Teacher",
    support: "Support Staff",
    staff_observer: "Staff Observer",
    finance: "Finance",
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{ctx.schoolName}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {roleLabel[ctx.role] ?? ctx.role} Dashboard
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <StatCard label="Classrooms" value={classrooms.length} href="/teacher/classrooms" />
        <StatCard label="Students" value={students.length} href="/teacher/students" />
        <StatCard
          label="Weak Areas"
          value={weakAreas?.length ?? "–"}
          href="/teacher/progress"
          alert={criticalWeakAreas.length > 0}
        />
        {seatUsage?.licence && (
          <StatCard
            label="Seats"
            value={`${seatUsage.seatsUsed} / ${seatUsage.seatsAllowed === 0 ? "∞" : seatUsage.seatsAllowed}`}
            href="/teacher/settings"
          />
        )}
      </div>

      {/* Classrooms overview */}
      {canDo(ctx.role, "viewClassrooms") && classrooms.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Your Classrooms</h2>
            <Link href="/teacher/classrooms" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classrooms.slice(0, 6).map((classroom) => (
              <Link
                key={classroom.id}
                href={`/teacher/classrooms/${classroom.id}`}
                className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md hover:border-primary/40"
              >
                <p className="font-semibold text-foreground group-hover:text-primary">{classroom.name}</p>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {classroom.yearGroup ?? "No year group"} ·{" "}
                  {classroom._count.students} student{classroom._count.students !== 1 ? "s" : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Critical weak areas */}
      {canDo(ctx.role, "viewWeakAreas") && criticalWeakAreas.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              ⚠️ Interventions Needed{" "}
              <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                {criticalWeakAreas.length}
              </span>
            </h2>
            <Link href="/teacher/progress" className="text-sm text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Student</th>
                  <th className="px-4 py-2 text-left font-medium">Subject</th>
                  <th className="px-4 py-2 text-left font-medium">Skill</th>
                  <th className="px-4 py-2 text-right font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {criticalWeakAreas.slice(0, 8).map((wa) => (
                  <tr key={wa.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-foreground">{wa.student.name}</td>
                    <td className="px-4 py-2 text-foreground/70 capitalize">{wa.subject}</td>
                    <td className="px-4 py-2 text-foreground/70">{wa.skillFocus}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        {wa.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Quick actions */}
      {canDo(ctx.role, "issueAssignment") && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/teacher/assignments/new"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              + Issue Assignment
            </Link>
            <Link
              href="/teacher/progress"
              className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
            >
              View Progress
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: string | number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md hover:border-primary/40"
    >
      <p className="text-xs text-foreground/50 mb-1">{label}</p>
      <p
        className={`text-2xl font-bold ${alert ? "text-destructive" : "text-foreground"} group-hover:text-primary transition-colors`}
      >
        {value}
      </p>
    </Link>
  );
}
