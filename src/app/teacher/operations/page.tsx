import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { readSessionFromCookie } from "@/lib/auth";
import { canDo, getSchoolTeacherContext } from "@/lib/schools/rbac";
import { getAccessibleStudents, getSchoolWeakAreas } from "@/lib/schools/scoping";

export default async function TeacherOperationsPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher/operations");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");
  if (!canDo(ctx.role, "viewProgress")) redirect("/teacher");

  const students = await getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role);
  const childIds = students.map((s) => s.childId);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [weakAreas, openAssignments, alerts, incidents] = await Promise.all([
    getSchoolWeakAreas(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    childIds.length
      ? prisma.assignment.findMany({
          where: { studentId: { in: childIds }, status: { in: ["assigned", "in_progress"] } },
          orderBy: { createdAt: "asc" },
          take: 500,
        })
      : Promise.resolve([]),
    prisma.schoolSafeguardingAlert.findMany({
      where: { schoolId: ctx.schoolId, status: { in: ["open", "under_review", "escalated"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: { student: { select: { id: true, name: true } } },
    }),
    prisma.safeguardingIncident.findMany({
      where: { schoolId: ctx.schoolId, status: { in: ["open", "under_review", "escalated"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
  ]);

  // Weak learner queue: lowest accuracy first
  const weakLearnerQueue = weakAreas
    .filter((w) => w.accuracy < 65)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 20);

  // Assignment completion alerts: overdue open assignments (>7 days)
  const overdueAssignments = openAssignments.filter(
    (a) => a.createdAt < weekAgo
  );

  // Engagement indicators from attempts (last 7 days)
  const attemptRows = childIds.length
    ? await prisma.attempt.findMany({
        where: {
          studentId: { in: childIds },
          createdAt: { gte: weekAgo },
        },
        select: { studentId: true, createdAt: true, correct: true },
      })
    : [];

  const engagement = new Map<string, { attempts: number; days: Set<string>; correct: number }>();
  for (const row of attemptRows) {
    const entry = engagement.get(row.studentId) ?? { attempts: 0, days: new Set<string>(), correct: 0 };
    entry.attempts += 1;
    entry.days.add(row.createdAt.toISOString().slice(0, 10));
    if (row.correct) entry.correct += 1;
    engagement.set(row.studentId, entry);
  }

  const indicators = students
    .map((s) => {
      const e = engagement.get(s.childId) ?? { attempts: 0, days: new Set<string>(), correct: 0 };
      const accuracy = e.attempts > 0 ? Math.round((e.correct / e.attempts) * 100) : 0;
      return {
        childId: s.childId,
        name: s.child.name,
        classroom: s.classroom?.name ?? "—",
        attempts: e.attempts,
        activeDays: e.days.size,
        accuracy,
      };
    })
    .sort((a, b) => a.activeDays - b.activeDays);

  const recommendationByWeakType: Record<string, string> = {
    accuracy_drop: "Assign short targeted practice and daily check-in.",
    fluency: "Add timed low-pressure drills and retrieval warm-ups.",
    misconception: "Use explicit reteach with worked examples.",
    default: "Review last 5 attempts and issue targeted intervention assignment.",
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teacher Operations Dashboard</h1>
        <p className="text-sm text-foreground/60 mt-1">
          Weak learner queue, intervention recommendations, engagement and safeguarding signals.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Weak Queue" value={weakLearnerQueue.length} />
        <Metric label="Overdue Assignments" value={overdueAssignments.length} alert={overdueAssignments.length > 0} />
        <Metric label="Safeguarding Alerts" value={alerts.length} alert={alerts.length > 0} />
        <Metric label="Open Incidents" value={incidents.length} alert={incidents.length > 0} />
        <Metric label="Students In Scope" value={students.length} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold text-foreground mb-3">Weak Learner Queue</h2>
        {weakLearnerQueue.length === 0 ? (
          <p className="text-sm text-foreground/50">No immediate intervention queue items.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Skill</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Accuracy</th>
                  <th className="px-3 py-2 text-left">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {weakLearnerQueue.map((w) => (
                  <tr key={w.id}>
                    <td className="px-3 py-2 font-medium text-foreground">{w.student.name}</td>
                    <td className="px-3 py-2 text-foreground/70">{w.skillFocus}</td>
                    <td className="px-3 py-2 text-foreground/70">{w.weaknessType}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.accuracy < 40 ? "bg-destructive/10 text-destructive" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                        {w.accuracy}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground/70">
                      {recommendationByWeakType[w.weaknessType] ?? recommendationByWeakType.default}
                      {canDo(ctx.role, "issueAssignment") && (
                        <Link
                          href={`/teacher/assignments/new?studentId=${w.studentId}&skill=${w.skillFocus}&subject=${w.subject}`}
                          className="ml-2 text-primary hover:underline"
                        >
                          Assign
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold text-foreground mb-3">Attendance &amp; Engagement Indicators (7 days)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground/60">
              <tr>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-left">Classroom</th>
                <th className="px-3 py-2 text-right">Active Days</th>
                <th className="px-3 py-2 text-right">Attempts</th>
                <th className="px-3 py-2 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {indicators.map((row) => (
                <tr key={row.childId}>
                  <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                  <td className="px-3 py-2 text-foreground/70">{row.classroom}</td>
                  <td className="px-3 py-2 text-right text-foreground/70">{row.activeDays}</td>
                  <td className="px-3 py-2 text-right text-foreground/70">{row.attempts}</td>
                  <td className="px-3 py-2 text-right text-foreground/70">{row.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold text-foreground mb-3">Assignment Completion Alerts</h2>
          {overdueAssignments.length === 0 ? (
            <p className="text-sm text-foreground/50">No overdue open assignments.</p>
          ) : (
            <ul className="space-y-2">
              {overdueAssignments.slice(0, 15).map((a) => (
                <li key={a.id} className="text-sm text-foreground/70">
                  Student {a.studentId.slice(-8)} · {a.status} · {a.createdAt.toLocaleDateString("en-GB")}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold text-foreground mb-3">Safeguarding Notifications</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-foreground/50">No open safeguarding alerts.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 12).map((a) => (
                <li key={a.id} className="text-sm text-foreground/70">
                  <span className="font-medium text-foreground">{a.category}</span>
                  {" · "}{a.severity}
                  {" · "}{a.student?.name ?? "Unknown student"}
                  {" · "}{a.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-foreground/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
