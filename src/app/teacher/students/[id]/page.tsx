import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function TeacherStudentDetailPage({ params }: Props) {
  const { id } = await params;

  const session = await readSessionFromCookie();
  if (!session) redirect(`/auth/login?next=/teacher/students/${id}`);

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "viewStudents")) redirect("/teacher");

  const students = await getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role);
  const student = students.find((s) => s.id === id || s.childId === id);
  if (!student) notFound();

  const [weakAreas, assignments, recentAttempts] = await Promise.all([
    prisma.weakArea.findMany({
      where: { studentId: student.childId, status: "active" },
      orderBy: [{ accuracy: "asc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.assignment.findMany({
      where: { studentId: student.childId },
      include: {
        content: {
          select: {
            id: true,
            contentType: true,
            topic: true,
            skillFocus: true,
            level: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.attempt.findMany({
      where: { studentId: student.childId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        subject: true,
        skillFocus: true,
        difficulty: true,
        correct: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
      <nav className="text-sm text-foreground/50">
        <Link href="/teacher" className="hover:text-foreground">Dashboard</Link>
        {" / "}
        <Link href="/teacher/students" className="hover:text-foreground">Students</Link>
        {" / "}
        <span className="text-foreground font-medium">{student.child.name}</span>
      </nav>

      <header className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">{student.child.name}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {student.classroom?.name ?? "No classroom"}
          {student.child.yearGroup ? ` · Year ${student.child.yearGroup}` : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Level" value={student.child.level ?? 1} />
          <Metric label="XP" value={student.child.xp ?? 0} />
          <Metric label="Stars" value={student.child.stars ?? 0} />
          <Metric label="Streak" value={`${student.child.streak ?? 0}d`} />
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Weak Areas</h2>
          {canDo(ctx.role, "issueAssignment") && (
            <Link
              href={`/teacher/assignments/new?studentId=${student.childId}`}
              className="text-sm text-primary hover:underline"
            >
              Assign Practice →
            </Link>
          )}
        </div>
        {weakAreas.length === 0 ? (
          <p className="text-sm text-foreground/50">No active weak areas.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Subject</th>
                  <th className="px-4 py-2 text-left font-medium">Skill</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weakAreas.map((wa) => (
                  <tr key={wa.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 capitalize">{wa.subject}</td>
                    <td className="px-4 py-2">{wa.skillFocus}</td>
                    <td className="px-4 py-2 text-foreground/70">{wa.weaknessType}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${wa.accuracy < 40 ? "bg-destructive/10 text-destructive" : wa.accuracy < 65 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                        {wa.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Assignments</h2>
          {assignments.length === 0 ? (
            <p className="text-sm text-foreground/50">No assignments yet.</p>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li key={a.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-foreground">
                    {a.content.topic || a.content.skillFocus || "Untitled content"}
                  </p>
                  <p className="mt-1 text-xs text-foreground/60 capitalize">
                    {a.content.contentType} · Level {a.content.level} · {a.status.replace("_", " ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Attempts</h2>
          {recentAttempts.length === 0 ? (
            <p className="text-sm text-foreground/50">No attempts recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentAttempts.map((attempt) => (
                <li key={attempt.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium capitalize">{attempt.subject}</p>
                    <p className="text-xs text-foreground/60">{attempt.skillFocus} · Difficulty {attempt.difficulty}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${attempt.correct ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                    {attempt.correct ? "Correct" : "Incorrect"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
