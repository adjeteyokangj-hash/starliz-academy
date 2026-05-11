import Link from "next/link";
import { redirect } from "next/navigation";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getAccessibleStudents } from "@/lib/schools/scoping";
import { prisma } from "@/lib/db";

export default async function TeacherStudentsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/students");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");

  const students = await getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role);

  // Enrich with weak area count per student
  const weakAreaCounts = await prisma.weakArea.groupBy({
    by: ["studentId"],
    where: { studentId: { in: students.map((s) => s.childId) } },
    _count: { id: true },
  });
  const weakMap = new Map(weakAreaCounts.map((w) => [w.studentId, w._count.id]));

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="mt-0.5 text-sm text-foreground/60">
            {students.length} student{students.length !== 1 ? "s" : ""} accessible to you
          </p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-foreground/50">No students found in your assigned classrooms.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-foreground/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Level</th>
                <th className="px-4 py-3 text-left font-medium">XP</th>
                <th className="px-4 py-3 text-left font-medium">Streak</th>
                <th className="px-4 py-3 text-left font-medium">Weak Areas</th>
                <th className="px-4 py-3 text-left font-medium">Classroom</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => {
                const weakCount = weakMap.get(s.childId) ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.child.name}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{s.child.level ?? 1}</td>
                    <td className="px-4 py-3 text-foreground/70">{s.child.xp ?? 0}</td>
                    <td className="px-4 py-3 text-foreground/70">{s.child.streak ?? 0}d</td>
                    <td className="px-4 py-3">
                      {weakCount > 0 ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {weakCount}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground/60">
                      {s.classroom?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/teacher/students/${s.id}`}
                        className="text-xs font-medium text-primary hover:underline"
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
    </div>
  );
}
