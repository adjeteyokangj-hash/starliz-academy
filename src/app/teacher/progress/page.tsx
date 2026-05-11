import { redirect } from "next/navigation";
import Link from "next/link";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getSchoolWeakAreas, getAccessibleStudents } from "@/lib/schools/scoping";

export default async function TeacherProgressPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/progress");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "viewProgress")) redirect("/teacher");

  const [weakAreas, students] = await Promise.all([
    getSchoolWeakAreas(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
  ]);

  // Group weak areas by subject
  const bySubject = new Map<string, typeof weakAreas>();
  for (const wa of weakAreas) {
    const key = wa.subject;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(wa);
  }

  const criticalCount = weakAreas.filter((w) => w.accuracy < 40).length;
  const improvingCount = weakAreas.filter((w) => w.accuracy >= 40 && w.accuracy < 65).length;

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Progress &amp; Weak Areas</h1>
        <p className="mt-0.5 text-sm text-foreground/60">
          {students.length} students · {weakAreas.length} active weak areas
        </p>
      </div>

      {/* Summary pills */}
      <div className="mb-8 flex flex-wrap gap-3">
        <span className="rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
          🔴 {criticalCount} critical (&lt;40%)
        </span>
        <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          🟡 {improvingCount} needs attention (40–65%)
        </span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          📊 {bySubject.size} subject{bySubject.size !== 1 ? "s" : ""} affected
        </span>
      </div>

      {weakAreas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-foreground/50">No active weak areas detected. Great work!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(bySubject.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([subject, areas]) => (
              <section key={subject}>
                <h2 className="mb-3 text-base font-semibold text-foreground capitalize">
                  {subject}
                  <span className="ml-2 text-xs font-normal text-foreground/50">
                    ({areas.length} weak area{areas.length !== 1 ? "s" : ""})
                  </span>
                </h2>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-foreground/60">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Student</th>
                        <th className="px-4 py-2 text-left font-medium">Skill Focus</th>
                        <th className="px-4 py-2 text-left font-medium">Weakness Type</th>
                        <th className="px-4 py-2 text-right font-medium">Attempts</th>
                        <th className="px-4 py-2 text-right font-medium">Accuracy</th>
                        <th className="px-4 py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {areas
                        .sort((a, b) => a.accuracy - b.accuracy)
                        .map((wa) => (
                          <tr key={wa.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2 font-medium text-foreground">
                              {wa.student.name}
                            </td>
                            <td className="px-4 py-2 text-foreground/70">{wa.skillFocus}</td>
                            <td className="px-4 py-2 text-foreground/60 capitalize">
                              {wa.weaknessType}
                            </td>
                            <td className="px-4 py-2 text-right text-foreground/70">
                              {wa.attemptsCount}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <AccuracyBadge accuracy={wa.accuracy} />
                            </td>
                            <td className="px-4 py-2 text-right">
                              {canDo(ctx.role, "issueAssignment") && (
                                <Link
                                  href={`/teacher/assignments/new?studentId=${wa.studentId}&skill=${wa.skillFocus}&subject=${wa.subject}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Assign →
                                </Link>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function AccuracyBadge({ accuracy }: { accuracy: number }) {
  if (accuracy < 40) {
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        {accuracy}%
      </span>
    );
  }
  if (accuracy < 65) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        {accuracy}%
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
      {accuracy}%
    </span>
  );
}
