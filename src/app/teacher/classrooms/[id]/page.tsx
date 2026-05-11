import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { requireClassroomAccess } from "@/lib/schools/guards";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomDetailPage({ params }: Props) {
  const { id: classroomId } = await params;

  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/classrooms");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");

  const guarded = await requireClassroomAccess({
    schoolId: ctx.schoolId,
    classroomId,
    method: "GET",
    route: "/teacher/classrooms/[id]",
  });
  if (guarded.response) {
    if (guarded.response.status === 404) notFound();
    redirect("/teacher/classrooms");
  }

  // Fetch display-rich classroom details once access is approved.
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    include: {
      teacher: { include: { user: { select: { name: true, email: true } } } },
      school: { select: { id: true, name: true } },
    },
  });

  if (!classroom || classroom.schoolId !== ctx.schoolId) notFound();

  const students = await getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role, classroomId);

  // Weak area summary per student
  const studentIds = students.map((s) => s.childId);
  const weakAreaCounts = await prisma.weakArea.groupBy({
    by: ["studentId"],
    where: { studentId: { in: studentIds }, status: "active" },
    _count: { id: true },
  });
  const weakCountMap = new Map(weakAreaCounts.map((w) => [w.studentId, w._count.id]));

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-foreground/50">
        <Link href="/teacher" className="hover:text-foreground">Dashboard</Link>
        {" / "}
        <Link href="/teacher/classrooms" className="hover:text-foreground">Classrooms</Link>
        {" / "}
        <span className="text-foreground font-medium">{classroom.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{classroom.name}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">
            {classroom.yearGroup ? `Year ${classroom.yearGroup}` : "No year group"}
            {classroom.academicYear ? ` · ${classroom.academicYear}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-foreground/40">
            Teacher: {classroom.teacher?.user.name ?? "Unassigned"}
          </p>
        </div>
        {canDo(ctx.role, "issueAssignment") && (
          <Link
            href={`/teacher/assignments/new?classroomId=${classroomId}`}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            + Issue Assignment
          </Link>
        )}
      </div>

      {/* Students table */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Students{" "}
          <span className="ml-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-foreground/60">
            {students.length}
          </span>
        </h2>

        {students.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-foreground/50">No students in this classroom yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Year Group</th>
                  <th className="px-4 py-3 text-right font-medium">XP</th>
                  <th className="px-4 py-3 text-right font-medium">Level</th>
                  <th className="px-4 py-3 text-right font-medium">Streak</th>
                  <th className="px-4 py-3 text-right font-medium">Weak Areas</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s) => {
                  const weakCount = weakCountMap.get(s.childId) ?? 0;
                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{s.child.name}</td>
                      <td className="px-4 py-3 text-foreground/70">{s.child.yearGroup ?? "–"}</td>
                      <td className="px-4 py-3 text-right text-foreground/70">{s.child.xp.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Lv {s.child.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70">
                        {s.child.streak > 0 ? `🔥 ${s.child.streak}` : "–"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {weakCount > 0 ? (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                            {weakCount}
                          </span>
                        ) : (
                          <span className="text-xs text-foreground/40">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/teacher/students/${s.childId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
