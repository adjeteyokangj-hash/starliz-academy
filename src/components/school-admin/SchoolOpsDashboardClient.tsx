"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SchoolOpsOverview } from "@/lib/schools/school-ops-overview";
import type { SchoolRole } from "@/lib/schools/permissions";

type Props = {
  schoolName: string;
  actorRole: SchoolRole;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityClass(severity: string): string {
  if (severity === "critical") return "border-red-300 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-border bg-muted/30 text-foreground";
}

function MetricLink(props: {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Link
      href={props.href}
      className="rounded-xl border border-border bg-background px-3 py-3 transition-colors hover:bg-muted/40"
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground">{props.value}</p>
      <p className="mt-1 text-xs font-semibold text-foreground/70">{props.label}</p>
      {props.hint ? <p className="mt-0.5 text-[11px] text-foreground/45">{props.hint}</p> : null}
    </Link>
  );
}

function StatRow(props: { label: string; value: string | number; href?: string }) {
  const body = (
    <>
      <span className="text-foreground/65">{props.label}</span>
      <span className="font-semibold tabular-nums text-foreground">{props.value}</span>
    </>
  );
  if (props.href) {
    return (
      <Link
        href={props.href}
        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">{body}</div>;
}

export default function SchoolOpsDashboardClient({ schoolName, actorRole }: Props) {
  const [overview, setOverview] = useState<SchoolOpsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/school-admin/overview");
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(payload.error ?? "Unable to load school overview.");
          return;
        }
        setOverview(payload.overview ?? null);
      } catch {
        if (!cancelled) setError("Unable to load school overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const attendanceHint = overview
    ? `${overview.health.attendanceToday.present} present / ${overview.health.attendanceToday.marked} marked`
    : undefined;

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{schoolName}</h1>
          <p className="mt-1 text-sm text-foreground/60">School operations overview</p>
        </div>
        {overview ? (
          <p className="text-xs text-foreground/45">As of {formatWhen(overview.asOf)}</p>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-foreground/60">Loading school health…</p>
      ) : null}
      {error ? (
        <p className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {overview ? (
        <>
          <CollapsibleCard title="School Health" className="mt-8" bodyClassName="p-4" defaultOpen>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricLink
                href="/school-admin/day-school/students"
                label="Students"
                value={overview.health.students}
              />
              <MetricLink
                href="/school-admin/day-school/teachers"
                label="Staff"
                value={overview.health.teachers}
              />
              <MetricLink
                href="/school-admin/day-school/classes"
                label="Classes"
                value={overview.health.classes}
              />
              <MetricLink
                href="/school-admin/day-school/attendance"
                label="Attendance today"
                value={overview.health.attendanceToday.present}
                hint={attendanceHint}
              />
              <MetricLink
                href="/school-admin/day-school/students"
                label="Active parent links"
                value={overview.health.activeParents}
              />
              <MetricLink
                href="/school-admin/short-learning/bookings"
                label="Live Short Learning"
                value={overview.health.activeShortLearning}
              />
              <MetricLink
                href="/school-admin/day-school/teachers"
                label="Pending invites"
                value={overview.health.pendingInvites}
              />
              <MetricLink
                href="/school-admin/day-school/lesson-review"
                label="Lesson reviews"
                value={overview.health.lessonReviewsOutstanding}
              />
              {overview.health.safeguarding ? (
                <MetricLink
                  href="/school-admin/settings"
                  label="Safeguarding open"
                  value={overview.health.safeguarding.openAlerts}
                  hint={
                    overview.health.safeguarding.criticalAlerts > 0
                      ? `${overview.health.safeguarding.criticalAlerts} critical`
                      : undefined
                  }
                />
              ) : null}
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title="Needs attention"
            count={overview.alerts.length}
            className="mt-6"
            bodyClassName="p-4"
            defaultOpen
          >
            {overview.alerts.length === 0 ? (
              <p className="text-sm text-foreground/60">Nothing needs attention right now.</p>
            ) : (
              <ul className="space-y-2">
                {overview.alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${severityClass(alert.severity)}`}
                    >
                      <span className="font-medium">{alert.title}</span>
                      {typeof alert.count === "number" ? (
                        <span className="tabular-nums font-semibold">{alert.count}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleCard>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <CollapsibleCard title="Staff" bodyClassName="p-3" defaultOpen>
              <StatRow
                label="Teaching now (estimate)"
                value={overview.staff.teachingNowEstimate}
                href="/school-admin/day-school/timetable"
              />
              <StatRow
                label="Live heartbeats"
                value={overview.staff.liveTeachingHeartbeats}
                href="/school-admin/day-school/timetable"
              />
              <StatRow
                label="Pending invites"
                value={overview.staff.pendingInvites}
                href="/school-admin/day-school/teachers"
              />
              <StatRow label="Recently joined" value={overview.staff.recentlyJoined} />
              <StatRow
                label="On Short Learning shifts"
                value={overview.staff.onShortLearningShifts}
                href="/school-admin/short-learning/shifts"
              />
              <StatRow
                label="Teachers without class"
                value={overview.staff.teachersWithoutClass}
                href="/school-admin/day-school/teachers"
              />
              <StatRow
                label="Staff absent today"
                value={overview.staff.absentToday}
                href="/school-admin/day-school/teachers"
              />
            </CollapsibleCard>

            <CollapsibleCard title="Students" bodyClassName="p-3" defaultOpen>
              <StatRow
                label="Absent today"
                value={overview.students.absentToday}
                href="/school-admin/day-school/attendance"
              />
              <StatRow
                label="Without class"
                value={overview.students.withoutClass}
                href="/school-admin/day-school/students"
              />
              <StatRow
                label="Without guardian"
                value={overview.students.withoutGuardian}
                href="/school-admin/day-school/students"
              />
              <StatRow
                label="New enrolments (14d)"
                value={overview.students.newEnrolments}
                href="/school-admin/day-school/students"
              />
            </CollapsibleCard>

            <CollapsibleCard title="Day School" bodyClassName="p-3" defaultOpen>
              <StatRow
                label="Awaiting review"
                value={overview.daySchool.awaitingReview}
                href="/school-admin/day-school/lesson-review"
              />
              <StatRow
                label="Machine failed"
                value={overview.daySchool.machineFailed}
                href="/school-admin/day-school/lesson-review"
              />
              <StatRow
                label="Unassigned classes"
                value={overview.daySchool.unassignedClasses}
                href="/school-admin/day-school/classes"
              />
              <StatRow
                label="Empty classes"
                value={overview.daySchool.emptyClasses}
                href="/school-admin/day-school/classes"
              />
              {overview.daySchool.timetablePreview.length > 0 ? (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="px-2 text-xs font-semibold uppercase tracking-wide text-foreground/45">
                    Today preview
                  </p>
                  <ul className="mt-1 space-y-1">
                    {overview.daySchool.timetablePreview.map((row) => (
                      <li key={row.id} className="px-2 text-xs text-foreground/70">
                        {row.startsAt}–{row.endsAt} {row.title}
                        {row.classroomName ? ` · ${row.classroomName}` : ""}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/school-admin/day-school/timetable"
                    className="mt-2 inline-block px-2 text-xs font-semibold text-primary hover:underline"
                  >
                    Open timetable
                  </Link>
                </div>
              ) : null}
            </CollapsibleCard>

            <CollapsibleCard title="Short Learning" bodyClassName="p-3" defaultOpen>
              <StatRow
                label="Today bookings"
                value={overview.shortLearning.todayBookings}
                href="/school-admin/short-learning/bookings"
              />
              <StatRow
                label="Changes needing review"
                value={overview.shortLearning.changesNeedingReview}
                href="/school-admin/short-learning/bookings"
              />
              <StatRow
                label="Coverage gap (mins, 48h)"
                value={overview.shortLearning.coverageGapMinutes}
                href="/school-admin/short-learning/coverage"
              />
              <StatRow
                label="Live sessions"
                value={overview.shortLearning.liveSessions}
                href="/school-admin/short-learning/bookings"
              />
            </CollapsibleCard>
          </div>

          <CollapsibleCard
            title="Recent activity"
            count={overview.activity.length}
            className="mt-6"
            bodyClassName="p-4"
            defaultOpen
          >
            {overview.activity.length === 0 ? (
              <p className="text-sm text-foreground/60">No recent school activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {overview.activity.map((item) => {
                  const href = item.href || "/school-admin";
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        className="group flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="font-medium text-foreground group-hover:text-primary">{item.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-foreground/45">{formatWhen(item.at)}</span>
                          <span className="text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
                            Details
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleCard>

          <CollapsibleCard title="Quick actions" className="mt-6" bodyClassName="p-4" defaultOpen>
            <div className="flex flex-wrap gap-3">
              {overview.quickActions.map((action) => (
                <Link
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/40"
                >
                  {action.label}
                </Link>
              ))}
            </div>
            {actorRole !== "owner" ? (
              <p className="mt-3 text-xs text-foreground/45">
                Create School Admin is available to School Owners only.
              </p>
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard title="Known limitations" className="mt-6" bodyClassName="p-4" defaultOpen={false}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/65">
              {overview.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CollapsibleCard>
        </>
      ) : null}
    </div>
  );
}