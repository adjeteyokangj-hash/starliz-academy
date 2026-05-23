"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDerivedSchoolMetrics, useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

type Props = {
  schoolId: string;
};

type StatusBadge = {
  label: string;
  className: string;
};

type ActivityRecord = {
  id: string;
  action: string;
  severity: string;
  createdAt: string;
};

type SafeguardingIncidentRecord = {
  id: string;
  category: string;
  severity: string;
  status: string;
  updatedAt: string;
};

const CONTENT_HUB_ITEMS = [
  "Assigned lessons",
  "Spelling content",
  "Reading content",
  "Maths content",
  "Dictionary/word bank content",
  "Weak areas",
  "AI-generated follow-up content",
  "Coach support history",
];

const JUMP_TO_ITEMS = [
  { label: "Students", href: "students" },
  { label: "Teachers", href: "staff" },
  { label: "Safeguarding", href: "safeguarding" },
  { label: "Governance", href: "governance" },
  { label: "Reports", href: "reports" },
  { label: "Content Hub", href: "assignments" },
  { label: "Billing", href: "billing-licence" },
  { label: "Settings", href: "settings" },
] as const;

function shortDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function statusBadge(value: string): StatusBadge {
  const normalized = value.toLowerCase();
  if (normalized === "active") return { label: "Active", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
  if (normalized === "pilot" || normalized === "trialing") return { label: "Pilot", className: "border-sky-500/40 bg-sky-500/10 text-sky-200" };
  if (normalized === "suspended" || normalized === "past_due") return { label: "At Risk", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
  if (normalized === "archived" || normalized === "cancelled") return { label: "Archived", className: "border-slate-500/40 bg-slate-500/10 text-slate-300" };
  return { label: value || "Unknown", className: "border-rose-500/40 bg-rose-500/10 text-rose-200" };
}

function safeguardingBadge(openAlerts: number, criticalAlerts: number): StatusBadge {
  if (criticalAlerts > 0) return { label: "Critical", className: "border-rose-500/40 bg-rose-500/10 text-rose-200" };
  if (openAlerts > 0) return { label: "Warning", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
  return { label: "Clear", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
}

function calculateOnboardingProgress(students: number, teachers: number, classes: number): number {
  const checks = [students > 0, teachers > 0, classes > 0];
  const score = checks.filter(Boolean).length;
  return Math.round((score / checks.length) * 100);
}

function nowMs(): number {
  return Date.now();
}

function takeRecent(records: ActivityRecord[], limit: number): ActivityRecord[] {
  return [...records]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export default function SchoolDashboardLandingOverview({ schoolId }: Props) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);

  const computed = useMemo(() => {
    if (!school) {
      return {
        activeToday: 0,
        weakAreas: 0,
        aiLessonsGenerated: 0,
        parentEngagementPct: 0,
        attendancePct: 0,
        systemHealth: 0,
        onboardingProgress: 0,
        lastActivityAt: null as string | null,
        recentStudentActivity: [] as ActivityRecord[],
        recentTeacherActivity: [] as ActivityRecord[],
        recentCoachActivity: [] as ActivityRecord[],
        recentSafeguarding: [] as SafeguardingIncidentRecord[],
        weakLearningTrends: [] as ActivityRecord[],
        aiInterventions: [] as ActivityRecord[],
      };
    }

    const now = nowMs();
    const oneDayMs = 1000 * 60 * 60 * 24;

    const recentActivity = school.activityTimeline.filter((item) => {
      const age = now - new Date(item.createdAt).getTime();
      return age <= oneDayMs;
    });

    const aiEvents = school.activityTimeline.filter((item) => item.action.toLowerCase().includes("ai"));
    const weakSignals = school.activityTimeline.filter((item) => {
      const action = item.action.toLowerCase();
      return action.includes("weak") || action.includes("intervention") || action.includes("struggle");
    });

    const studentEvents = school.activityTimeline.filter((item) => item.action.toLowerCase().includes("student"));
    const teacherEvents = school.activityTimeline.filter((item) => {
      const action = item.action.toLowerCase();
      return action.includes("teacher") || action.includes("staff") || action.includes("class");
    });
    const coachEvents = school.activityTimeline.filter((item) => {
      const action = item.action.toLowerCase();
      return action.includes("coach") || action.includes("tutor");
    });

    const parentEngagementPct = metrics.deliveredCommsPct;
    const attendancePct = Math.max(60, Math.min(100, Math.round(72 + metrics.engagementScore * 0.22 - metrics.riskScore * 0.12)));
    const systemHealth = Math.max(0, Math.min(100, Math.round(100 - metrics.riskScore * 0.6 + metrics.engagementScore * 0.35)));

    return {
      activeToday: recentActivity.length,
      weakAreas: metrics.studentsWithoutClassroom + school.safeguarding.openAlerts,
      aiLessonsGenerated: aiEvents.length,
      parentEngagementPct,
      attendancePct,
      systemHealth,
      onboardingProgress: calculateOnboardingProgress(
        school.students.filter((row) => row.status === "active").length,
        school.teachers.filter((row) => row.status === "active").length,
        school.classrooms.length,
      ),
      lastActivityAt: takeRecent(school.activityTimeline, 1)[0]?.createdAt ?? null,
      recentStudentActivity: takeRecent(studentEvents, 5),
      recentTeacherActivity: takeRecent(teacherEvents, 5),
      recentCoachActivity: takeRecent(coachEvents, 5),
      recentSafeguarding: [...school.safeguardingIncidents]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
      weakLearningTrends: takeRecent(weakSignals, 5),
      aiInterventions: takeRecent(aiEvents, 5),
    };
  }, [metrics.deliveredCommsPct, metrics.engagementScore, metrics.riskScore, metrics.studentsWithoutClassroom, school]);

  if (loading) {
    return (
      <div className="space-y-5">
        <section className="animate-pulse rounded-2xl border border-slate-700/70 bg-slate-950/60 p-5">
          <div className="h-5 w-48 rounded bg-slate-800" />
          <div className="mt-3 h-4 w-72 rounded bg-slate-800" />
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-20 rounded-xl bg-slate-800" />
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <article key={index} className="animate-pulse rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="h-4 w-24 rounded bg-slate-800" />
              <div className="mt-3 h-7 w-16 rounded bg-slate-800" />
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="animate-pulse rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="h-4 w-40 rounded bg-slate-800" />
              <div className="mt-3 h-20 rounded bg-slate-800" />
            </article>
          ))}
        </section>
      </div>
    );
  }

  if (error || !school) {
    return (
      <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
        {error ?? "Unable to load school dashboard overview."}
      </section>
    );
  }

  const activeStudents = school.students.filter((row) => row.status === "active").length;
  const activeTeachers = school.teachers.filter((row) => row.status === "active").length;
  const totalClasses = school.classrooms.length;
  const safeguarding = safeguardingBadge(school.safeguarding.openAlerts, school.safeguarding.criticalAlerts);
  const licence = statusBadge(school.licence?.status ?? "pilot");

  const overviewMetrics = [
    { label: "Total Students", value: String(activeStudents) },
    { label: "Active Today", value: String(computed.activeToday) },
    { label: "Teachers", value: String(activeTeachers) },
    { label: "Classes", value: String(totalClasses) },
    { label: "Safeguarding Alerts", value: String(school.safeguarding.openAlerts) },
    { label: "Weak Areas", value: String(computed.weakAreas) },
    { label: "AI Lessons Generated", value: String(computed.aiLessonsGenerated) },
    { label: "Parent Engagement %", value: `${computed.parentEngagementPct}%` },
    { label: "Attendance %", value: `${computed.attendancePct}%` },
    { label: "System Health", value: `${computed.systemHealth}%` },
  ];

  const upcomingActions = [
    activeStudents === 0 ? "Add first students to begin school onboarding" : null,
    activeTeachers === 0 ? "Add teachers and assign class ownership" : null,
    totalClasses === 0 ? "Create classes to organize student cohorts" : null,
    school.safeguarding.openAlerts > 0 ? "Review open safeguarding alerts" : null,
    computed.aiLessonsGenerated === 0 ? "Generate first AI follow-up lesson set" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-slate-900 text-lg font-black text-sky-200">
              {school.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-white">{school.name}</h2>
              <p className="text-xs text-slate-400">{school.type ?? "School"} | {school.notes?.trim() ? school.notes : "Local authority/region not set"}</p>
              <p className="mt-1 text-xs text-slate-400">Last sync/activity: {shortDateTime(computed.lastActivityAt)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-2 py-1 font-semibold ${safeguarding.className}`}>Safeguarding: {safeguarding.label}</span>
            <span className={`rounded-full border px-2 py-1 font-semibold ${licence.className}`}>Licence: {licence.label}</span>
            <span className="rounded-full border border-slate-600 bg-slate-900/80 px-2 py-1 font-semibold text-slate-200">
              Onboarding: {computed.onboardingProgress}%
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {overviewMetrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{metric.label}</p>
            <p className="mt-2 text-2xl font-black text-white">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-white">Jump To</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {JUMP_TO_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={`/admin/schools/${schoolId}/${item.href}`}
              className="rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Recent Student Activity</h3>
          {computed.recentStudentActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No students yet. Add students to start activity tracking.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentStudentActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDateTime(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Recent Safeguarding Incidents</h3>
          {computed.recentSafeguarding.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No safeguarding incidents recorded for this school.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentSafeguarding.map((incident) => (
                <li key={incident.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{incident.category} | {incident.severity}</p>
                  <p className="text-slate-400">{shortDate(incident.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Weak Learning Trends</h3>
          {computed.weakLearningTrends.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No weak area trends currently flagged.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.weakLearningTrends.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Teacher Activity</h3>
          {activeTeachers === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No teachers yet. Add teachers to enable class delivery workflows.</p>
          ) : computed.recentTeacherActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No teacher activity captured in the selected period.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentTeacherActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Coach Activity</h3>
          {computed.recentCoachActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No coach support history recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentCoachActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">AI-Generated Interventions</h3>
          {computed.aiInterventions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No AI content generated yet. Use Generate AI Content to create interventions.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.aiInterventions.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">School Content Hub</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CONTENT_HUB_ITEMS.map((item) => (
              <div key={item} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <h3 className="text-sm font-semibold text-white">Upcoming Tasks / Actions</h3>
          {upcomingActions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-300">No urgent setup tasks right now. Continue with weekly review and governance checks.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {upcomingActions.map((task) => (
                <li key={task} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">{task}</li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
