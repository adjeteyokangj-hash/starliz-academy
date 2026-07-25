import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { readSessionFromCookie } from "@/lib/auth";
import { getSchoolTeacherContext, canDo } from "@/lib/schools/rbac";
import { getSchoolSeatUsage } from "@/lib/schools/licensing";
import { getAccessibleClassrooms, getAccessibleStudents, getSchoolWeakAreas } from "@/lib/schools/scoping";
import { getTeacherSupportDashboard } from "@/lib/schools/teacher-support-dashboard";
import { resolveTutorShiftEligibility } from "@/lib/schools/tutor-support-shifts";
import { isSchoolAdminRole, PORTAL_MODE_COOKIE } from "@/lib/schools/portal-routing";
import { prisma } from "@/lib/db";

export default async function TeacherDashboardPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/teacher");

  const ctx = await getSchoolTeacherContext(session.userId);
  if (!ctx) redirect("/dashboard");

  const supportOnlyLead =
    ctx.role === "support"
    || (canDo(ctx.role, "viewHumanSupport") && !canDo(ctx.role, "issueAssignment"));

  const [seatUsage, classrooms, students, weakAreas, support, presence] = await Promise.all([
    canDo(ctx.role, "viewBilling") ? getSchoolSeatUsage(ctx.schoolId) : null,
    getAccessibleClassrooms(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    getAccessibleStudents(ctx.schoolId, ctx.schoolTeacherId, ctx.role),
    canDo(ctx.role, "viewWeakAreas") ? getSchoolWeakAreas(ctx.schoolId, ctx.schoolTeacherId, ctx.role) : null,
    canDo(ctx.role, "viewHumanSupport")
      ? getTeacherSupportDashboard({
          schoolId: ctx.schoolId,
          schoolName: ctx.schoolName,
          schoolTeacherId: ctx.schoolTeacherId,
          role: ctx.role,
        })
      : null,
    prisma.tutorPresence.findUnique({
      where: { schoolTeacherId: ctx.schoolTeacherId },
      select: { status: true, lastHeartbeatAt: true, activeSessionId: true },
    }),
  ]);

  const shiftEligibility =
    supportOnlyLead || canDo(ctx.role, "viewHumanSupport")
      ? await resolveTutorShiftEligibility({
          schoolId: ctx.schoolId,
          schoolTeacherId: ctx.schoolTeacherId,
          presenceStatus: presence?.status ?? "offline",
          lastHeartbeatAt: presence?.lastHeartbeatAt ?? null,
          hasActiveSupportSession: Boolean(presence?.activeSessionId),
        })
      : null;

  const portalMode = (await cookies()).get(PORTAL_MODE_COOKIE)?.value;
  const schoolAdminLinkLabel =
    portalMode === "teaching" && isSchoolAdminRole(ctx.role)
      ? "Return to School Admin"
      : "Switch to School Admin";

  const criticalWeakAreas = weakAreas?.filter((w) => w.accuracy < 40) ?? [];
  const showTeachingClassrooms = canDo(ctx.role, "viewClassrooms") && !supportOnlyLead && classrooms.length > 0;

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
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{ctx.schoolName}</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {roleLabel[ctx.role] ?? ctx.role} Dashboard
          </p>
        </div>
        {isSchoolAdminRole(ctx.role) ? (
          <Link
            href="/api/portal/mode?mode=school_admin"
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/40"
          >
            {schoolAdminLinkLabel}
          </Link>
        ) : null}
      </div>

      {/* Stats row — classroom teachers */}
      {!supportOnlyLead ? (
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
      ) : null}

      {shiftEligibility ? (
        <section className="mb-8 rounded-2xl border border-sky-200 bg-sky-50/70 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">Tutor shift eligibility</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {shiftEligibility.derivedState.replaceAll("-", " ")}
          </h2>
          <p className="mt-1 text-sm text-foreground/70">{shiftEligibility.reason}</p>
          <p className="mt-2 text-sm text-foreground/70">
            Can go available:{" "}
            <span className="font-semibold">{shiftEligibility.canBecomeAvailable ? "Yes" : "No"}</span>
            {" · "}
            Can accept students:{" "}
            <span className="font-semibold">{shiftEligibility.canAcceptStudent ? "Yes" : "No"}</span>
          </p>
          {shiftEligibility.nextShift ? (
            <p className="mt-2 text-sm text-foreground/60">
              Next shift: {new Date(shiftEligibility.nextShift.startsAt).toLocaleString()} –{" "}
              {new Date(shiftEligibility.nextShift.endsAt).toLocaleString()}
            </p>
          ) : null}
          {shiftEligibility.graceActive && shiftEligibility.graceEndsAt ? (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              Grace until {new Date(shiftEligibility.graceEndsAt).toLocaleString()}
            </p>
          ) : null}
        </section>
      ) : null}

      {support ? (
        <section className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">Human support</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">Support desk</h2>
              <p className="mt-1 text-sm text-foreground/60">
                Presence: <span className="font-semibold capitalize">{support.presence.status}</span>
                {" · "}
                {support.counts.assignedToMe} assigned · {support.counts.waiting} waiting · {support.counts.activeMine} active
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/teacher/support"
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-600"
              >
                Open Support
              </Link>
              <Link
                href="/teacher/timetable"
                className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100"
              >
                Timetable / Live
              </Link>
            </div>
          </div>
          {support.activeSession ? (
            <div className="mt-4 rounded-xl border border-violet-200 bg-white/80 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">Active assignment</p>
              <p className="mt-1 text-base font-semibold text-foreground">{support.activeSession.studentName}</p>
              <dl className="mt-3 grid gap-2 text-sm text-foreground/75 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-foreground/50">Started</dt>
                  <dd>{new Date(support.activeSession.startedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Planned end</dt>
                  <dd>
                    {support.activeSession.plannedEndsAt
                      ? new Date(support.activeSession.plannedEndsAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Budget</dt>
                  <dd>{support.activeSession.budgetMinutes} minutes</dd>
                </div>
                <div>
                  <dt className="text-xs text-foreground/50">Session</dt>
                  <dd className="font-mono text-xs">{support.activeSession.sessionId.slice(0, 10)}…</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {support.activeSession.liveHref ? (
                  <Link
                    href={support.activeSession.liveHref}
                    className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-violet-600"
                  >
                    Continue session
                  </Link>
                ) : null}
                <Link
                  href="/teacher/support"
                  className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-violet-900 hover:bg-violet-50"
                >
                  Outcome controls
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Classrooms overview */}
      {showTeachingClassrooms && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">My teaching classrooms</h2>
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
