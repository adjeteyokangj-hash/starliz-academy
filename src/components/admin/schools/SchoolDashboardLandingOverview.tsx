"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
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
  { label: "Timetable", href: "timetable" },
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
  if (normalized === "pilot" || normalized === "trialing") return { label: "Pilot", className: "border-[var(--admin-primary)]/40 bg-sky-500/10 text-sky-200" };
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
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId);
  const metrics = useDerivedSchoolMetrics(school);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const computed = useMemo(() => {
    if (!school) {
      return {
        recentAuditEvents24h: 0,
        unassignedStudents: 0,
        inactiveTeachers: 0,
        aiLessonsGenerated: 0,
        parentEngagementPct: 0,
        classroomCoveragePct: 0,
        licenceUtilisationPct: 0,
        systemHealth: 0,
        onboardingProgress: 0,
        lastActivityAt: null as string | null,
        recentStudentActivity: [] as ActivityRecord[],
        recentTeacherActivity: [] as ActivityRecord[],
        recentCoachActivity: [] as ActivityRecord[],
        recentSafeguarding: [] as SafeguardingIncidentRecord[],
        weakLearningTrends: [] as ActivityRecord[],
        aiInterventions: [] as ActivityRecord[],
        playableDaytimeLessons: [] as Array<{
          periodId: string;
          title: string;
          startsAt: string;
          contentId: string;
          contentType: string;
          topic: string;
          itemCount: number;
          status: string;
        }>,
      };
    }

    const now = nowMs();
    const oneDayMs = 1000 * 60 * 60 * 24;

    const recentActivity = school.activityTimeline.filter((item) => {
      const age = now - new Date(item.createdAt).getTime();
      return age <= oneDayMs;
    });

    const aiEvents = school.activityTimeline.filter((item) => {
      const action = item.action.toLowerCase();
      return action.includes("ai") || action.includes("daytime_lesson_content");
    });
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
    const systemHealth = Math.max(0, Math.min(100, Math.round(100 - metrics.riskScore * 0.6 + metrics.engagementScore * 0.35)));

    const playableSeen = new Set<string>();
    const playableDaytimeLessons: Array<{
      periodId: string;
      title: string;
      startsAt: string;
      contentId: string;
      contentType: string;
      topic: string;
      itemCount: number;
      status: string;
    }> = [];
    for (const period of school.dayLessons ?? []) {
      const content = period.playableContent;
      if (!content || playableSeen.has(content.id)) continue;
      playableSeen.add(content.id);
      playableDaytimeLessons.push({
        periodId: period.id,
        title: period.title,
        startsAt: period.startsAt,
        contentId: content.id,
        contentType: content.contentType,
        topic: content.topic || period.subject,
        itemCount: content.itemCount,
        status: content.status,
      });
    }

    return {
      recentAuditEvents24h: recentActivity.length,
      unassignedStudents: metrics.studentsWithoutClassroom,
      inactiveTeachers: metrics.inactiveTeachers,
      aiLessonsGenerated: Math.max(aiEvents.length, playableDaytimeLessons.length),
      parentEngagementPct,
      classroomCoveragePct: metrics.classroomCoveragePct,
      licenceUtilisationPct: metrics.licenceUtilisationPct,
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
      playableDaytimeLessons: playableDaytimeLessons.slice(0, 8),
    };
  }, [
    metrics.classroomCoveragePct,
    metrics.deliveredCommsPct,
    metrics.engagementScore,
    metrics.inactiveTeachers,
    metrics.licenceUtilisationPct,
    metrics.riskScore,
    metrics.studentsWithoutClassroom,
    school,
  ]);

  if (loading) {
    return (
      <div className="space-y-5">
        <section className="animate-pulse rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5">
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
            <article key={index} className="animate-pulse rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
              <div className="h-4 w-24 rounded bg-slate-800" />
              <div className="mt-3 h-7 w-16 rounded bg-slate-800" />
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="animate-pulse rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
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
  const teachingLessons = (school.dayLessons ?? []).filter(
    (row) => row.lessonType !== "break" && row.lessonType !== "registration",
  ).length;
  const safeguarding = safeguardingBadge(school.safeguarding.openAlerts, school.safeguarding.criticalAlerts);
  const licence = statusBadge(school.licence?.status ?? "pilot");

  const overviewMetrics = [
    { label: "Total Students", value: String(activeStudents) },
    { label: "Recent audit events (24h)", value: String(computed.recentAuditEvents24h) },
    { label: "Teachers", value: String(activeTeachers) },
    { label: "Classes", value: String(totalClasses) },
    { label: "Daytime lessons", value: String(teachingLessons) },
    { label: "Safeguarding Alerts", value: String(school.safeguarding.openAlerts) },
    { label: "Unassigned students", value: String(computed.unassignedStudents) },
    { label: "AI audit events", value: String(computed.aiLessonsGenerated) },
    { label: "Parent comms delivered %", value: `${computed.parentEngagementPct}%` },
    { label: "Class coverage %", value: `${computed.classroomCoveragePct}%` },
    { label: "Licence utilisation %", value: school.licence?.seatLimit ? `${computed.licenceUtilisationPct}%` : "No seat limit" },
  ];

  const upcomingActions = [
    activeStudents === 0 ? "Add first students to begin school onboarding" : null,
    activeTeachers === 0 ? "Add teachers and assign class ownership" : null,
    totalClasses === 0 ? "Create classes to organize student cohorts" : null,
    teachingLessons === 0 ? "Build a daytime timetable with real lessons" : null,
    school.safeguarding.openAlerts > 0 ? "Review open safeguarding alerts" : null,
    computed.unassignedStudents > 0 ? `Assign ${computed.unassignedStudents} student(s) without a class` : null,
    computed.inactiveTeachers > 0 ? `Follow up ${computed.inactiveTeachers} non-active staff invite/status` : null,
    computed.aiLessonsGenerated === 0 ? "Generate playable lesson content for the timetable" : null,
  ].filter((item): item is string => Boolean(item));

  const unassignedPreview = school.students
    .filter((row) => row.status === "active" && !row.classroomId)
    .slice(0, 5);
  const inactiveTeacherPreview = school.teachers
    .filter((row) => row.status !== "active")
    .slice(0, 5);

  const setupSteps = [
    {
      id: "teacher",
      done: activeTeachers > 0 || school.teachers.length > 0,
      title: "Invite at least one teacher",
      href: `/admin/schools/${schoolId}/staff/new?role=teacher`,
      cta: "Invite teacher",
    },
    {
      id: "class",
      done: totalClasses > 0,
      title: "Create at least one class",
      href: `/admin/schools/${schoolId}/classrooms/new`,
      cta: "Create class",
    },
    {
      id: "student",
      done: activeStudents > 0,
      title: "Enrol at least one student",
      href: `/admin/schools/${schoolId}/students/new`,
      cta: "Enrol student",
    },
    {
      id: "lessons",
      done: teachingLessons > 0,
      title: "Schedule daytime lessons on the timetable",
      href: `/admin/schools/${schoolId}/timetable`,
      cta: "Open timetable",
    },
    {
      id: "assign",
      done: computed.unassignedStudents === 0 || activeStudents === 0,
      title: "Assign unassigned students to classes",
      href: `/admin/schools/${schoolId}/students`,
      cta: "Open roster",
    },
  ] as const;
  const setupComplete = setupSteps.every((step) => step.done);
  const setupDoneCount = setupSteps.filter((step) => step.done).length;

  async function handleBootstrapDaytimeSchool() {
    setBootstrapping(true);
    setBootstrapError(null);
    setGenerateMessage(null);
    const result = await postSchoolAction("bootstrapDaytimeSchool", { schoolId });
    setBootstrapping(false);
    if (!result.ok) {
      setBootstrapError(result.error);
      return;
    }
    refresh();
  }

  async function handleGenerateLessonContent() {
    setGeneratingContent(true);
    setBootstrapError(null);
    setGenerateMessage(null);
    const result = await postSchoolAction("generateDaytimeLessonContent", {
      schoolId,
      force: false,
    });
    setGeneratingContent(false);
    if (!result.ok) {
      setBootstrapError(result.error);
      return;
    }
    const generated = result.data.generateContentResult as {
      created?: number;
      reused?: number;
      blackBoxFailed?: number;
    } | undefined;
    setGenerateMessage(
      `Lessons ready — created ${generated?.created ?? 0}, already linked ${generated?.reused ?? 0}, Lesson Health failed ${generated?.blackBoxFailed ?? 0}. Open Timetable to preview and approve.`,
    );
    refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5">
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

      <section className={`rounded-2xl border p-4 ${setupComplete ? "border-emerald-500/30 bg-emerald-500/10" : "border-[var(--admin-primary)]/40 bg-sky-500/10"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{setupComplete ? "Setup complete" : "Setup this school"}</h2>
            <p className="mt-1 text-xs text-slate-300">
              {setupComplete
                ? "Tutors, classes, students, and daytime lessons are in place. Open the timetable for today’s board."
                : `Stand up a runnable daytime academy — tutors, a class, students, and real lessons. Progress ${setupDoneCount}/${setupSteps.length}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!setupComplete ? (
              <>
                <button
                  type="button"
                  disabled={bootstrapping}
                  onClick={() => void handleBootstrapDaytimeSchool()}
                  className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-60"
                >
                  {bootstrapping ? "Building timetable + lessons…" : "Build week timetable"}
                </button>
                <Link
                  href={`/admin/schools/${schoolId}/staff/new?role=teacher`}
                  className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-500/30"
                >
                  Start setup
                </Link>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={generatingContent}
                  onClick={() => void handleGenerateLessonContent()}
                  className="rounded-lg border border-violet-400/50 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-50 hover:bg-violet-500/30 disabled:opacity-60"
                >
                  {generatingContent ? "Generating lessons…" : "Generate lesson content"}
                </button>
                <Link
                  href={`/admin/schools/${schoolId}/timetable`}
                  className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/30"
                >
                  Open timetable
                </Link>
              </div>
            )}
          </div>
        </div>
        {bootstrapError ? <p className="mt-2 text-xs text-rose-200">{bootstrapError}</p> : null}
        {generateMessage ? <p className="mt-2 text-xs text-emerald-200">{generateMessage}</p> : null}
        <ol className="mt-3 grid gap-2 md:grid-cols-2">
          {setupSteps.map((step, index) => (
            <li key={step.id} className="rounded-lg border border-[var(--admin-border)] bg-slate-950/50 px-3 py-2 text-xs text-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  <span className="text-slate-500">{index + 1}.</span> {step.title}
                </p>
                <span className={step.done ? "text-emerald-300" : "text-amber-200"}>{step.done ? "Done" : "Todo"}</span>
              </div>
              {!step.done ? (
                <Link href={step.href} className="mt-2 inline-flex font-semibold text-[var(--admin-primary-hover)] hover:text-sky-200">{step.cta}</Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {overviewMetrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{metric.label}</p>
            <p className="mt-2 text-2xl font-black text-white">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">At a glance · Unassigned students</h3>
            <Link href={`/admin/schools/${schoolId}/students`} className="text-xs font-semibold text-[var(--admin-primary-hover)] hover:text-sky-200">Open roster</Link>
          </div>
          {unassignedPreview.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">All active students are assigned to a class.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {unassignedPreview.map((student) => (
                <li key={student.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  {student.childName ?? "Unnamed student"}
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">At a glance · Non-active staff</h3>
            <Link href={`/admin/schools/${schoolId}/staff`} className="text-xs font-semibold text-[var(--admin-primary-hover)] hover:text-sky-200">Open teachers</Link>
          </div>
          {inactiveTeacherPreview.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">All staff records are active.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {inactiveTeacherPreview.map((teacher) => (
                <li key={teacher.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  {(teacher.name ?? teacher.email ?? "Unnamed staff")} · {teacher.status}
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
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
        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Recent Student Activity</h3>
          {computed.recentStudentActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No students yet. Add students to start activity tracking.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentStudentActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDateTime(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Recent Safeguarding Incidents</h3>
          {computed.recentSafeguarding.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No safeguarding incidents recorded for this school.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentSafeguarding.map((incident) => (
                <li key={incident.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p>{incident.category} | {incident.severity}</p>
                  <p className="text-slate-400">{shortDate(incident.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Weak Learning Trends</h3>
          {computed.weakLearningTrends.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No weak area trends currently flagged.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.weakLearningTrends.map((item) => (
                <li key={item.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Teacher Activity</h3>
          {activeTeachers === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No teachers yet. Add teachers to enable class delivery workflows.</p>
          ) : computed.recentTeacherActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No teacher activity captured in the selected period.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentTeacherActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Coach Activity</h3>
          {computed.recentCoachActivity.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No coach support history recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.recentCoachActivity.map((item) => (
                <li key={item.id} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p>{item.action}</p>
                  <p className="text-slate-400">{shortDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Class lessons</h3>
            <Link href={`/admin/schools/${schoolId}/timetable`} className="text-xs font-semibold text-[var(--admin-primary-hover)] hover:text-sky-200">
              Open timetable
            </Link>
          </div>
          {computed.playableDaytimeLessons.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              No class lessons generated yet. Use Generate lesson content on the timetable, then approve each period.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {computed.playableDaytimeLessons.map((item) => (
                <li key={item.contentId} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="text-slate-400">
                    {item.contentType} · {item.topic} · {item.itemCount} items · {item.status}
                  </p>
                  <Link
                    href={`/admin/schools/${schoolId}/timetable`}
                    className="mt-1 inline-flex font-semibold text-violet-300 hover:text-violet-100"
                  >
                    Review on timetable →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">School Content Hub</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CONTENT_HUB_ITEMS.map((item) => (
              <div key={item} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-xs text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
          <h3 className="text-sm font-semibold text-white">Upcoming Tasks / Actions</h3>
          {upcomingActions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-300">No urgent setup tasks right now. Continue with weekly review and governance checks.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-slate-300">
              {upcomingActions.map((task) => (
                <li key={task} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1.5">{task}</li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
