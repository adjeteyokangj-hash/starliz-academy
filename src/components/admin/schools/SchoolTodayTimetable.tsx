"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import LessonReviewModal, {
  type LessonReviewModalLesson,
} from "@/components/admin/schools/LessonReviewModal";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";
import {
  describeSchoolClock,
  minutesNow,
  resolvePeriodState,
  schoolDayOfWeek,
  sortPeriodsByTime,
  weekdayLabel,
} from "@/lib/schools/school-day-period";
import { isPlayableDaytimeLessonType } from "@/lib/schools/start-daytime-period";

type Props = {
  schoolId: string;
};

type EditableLesson = {
  id: string;
  title: string;
  subject: string;
  teacherId: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  lessonId: string | null;
};

function reviewBadge(status: string | null | undefined, hasPacks: boolean): {
  label: string;
  className: string;
} {
  if (!hasPacks) {
    return { label: "Draft", className: "border-sky-500/40 bg-sky-500/15 text-sky-100" };
  }
  if (status === "approved") {
    return { label: "Approved", className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" };
  }
  if (status === "machine_failed") {
    return { label: "Machine failed", className: "border-rose-500/40 bg-rose-500/15 text-rose-100" };
  }
  if (status === "awaiting_review") {
    return { label: "Awaiting review", className: "border-amber-500/40 bg-amber-500/15 text-amber-100" };
  }
  return { label: "Draft", className: "border-sky-500/40 bg-sky-500/15 text-sky-100" };
}

export default function SchoolTodayTimetable({ schoolId }: Props) {
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(schoolDayOfWeek());
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>("all");
  const [editing, setEditing] = useState<EditableLesson | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const teachers = useMemo(() => {
    return (school?.teachers ?? [])
      .filter((row) => row.status === "active" || row.status === "invited")
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.email || "Tutor",
      }));
  }, [school?.teachers]);

  const classrooms = useMemo(() => {
    return (school?.classrooms ?? [])
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.id,
        label: `${row.name ?? "Class"}${row.yearGroup ? ` · ${row.yearGroup}` : ""}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [school?.classrooms]);

  useEffect(() => {
    if (!school || selectedClassroomId !== "all") return;
    const year4 = school.classrooms.find((row) => row.status === "active" && /year\s*4/i.test(`${row.name ?? ""} ${row.yearGroup ?? ""}`));
    const withStudents = school.classrooms.find((row) => row.status === "active" && (row.studentsCount ?? 0) > 0);
    const preferred = year4 ?? withStudents ?? school.classrooms.find((row) => row.status === "active");
    if (preferred?.id) setSelectedClassroomId(preferred.id);
  }, [school, selectedClassroomId]);

  const board = useMemo(() => {
    const lessons = sortPeriodsByTime(
      (school?.dayLessons ?? [])
        .filter((row) => row.dayOfWeek === selectedDay)
        .filter((row) => selectedClassroomId === "all" || row.classroomId === selectedClassroomId)
        .map((row) => ({
          id: row.id,
          title: row.title,
          subject: row.subject,
          lessonType: row.lessonType,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          periodIndex: row.periodIndex,
          room: row.room,
          teacherId: row.teacherId,
          teacherName: row.teacherName,
          classroomName: row.classroomName,
          classroomId: row.classroomId,
          lessonId: row.lessonId,
          lessonTitle: row.lessonTitle ?? null,
          skillFocus: row.skillFocus,
          playableContent: row.playableContent ?? null,
          playableSession: row.playableSession ?? null,
          lessonReview: row.lessonReview ?? null,
        })),
    );
    const now = minutesNow();
    const clock = describeSchoolClock(lessons, now);
    const playableLessons = lessons.filter((row) => row.playableContent || row.playableSession);
    const teachable = lessons.filter((row) => isPlayableDaytimeLessonType(row.lessonType));
    const approvedCount = teachable.filter((row) => row.lessonReview?.reviewStatus === "approved").length;
    const awaitingCount = teachable.filter((row) => row.lessonReview?.reviewStatus === "awaiting_review").length;
    const failedCount = teachable.filter((row) => row.lessonReview?.reviewStatus === "machine_failed").length;
    const dayBlockers = teachable
      .filter((row) => {
        const status = row.lessonReview?.reviewStatus ?? "draft";
        return status !== "approved" && status !== "awaiting_review";
      })
      .map((row) => {
        const status = row.lessonReview?.reviewStatus ?? "draft";
        const reason = status === "machine_failed" ? "machine failed" : "needs content";
        return `${row.subject}: ${row.title} (${reason})`;
      });
    const canApproveDay = teachable.length > 0
      && dayBlockers.length === 0
      && approvedCount < teachable.length;
    return {
      lessons,
      clock,
      now,
      playableLessons,
      teachable,
      approvedCount,
      awaitingCount,
      failedCount,
      dayBlockers,
      canApproveDay,
    };
  }, [school?.dayLessons, selectedClassroomId, selectedDay]);

  const reviewingLesson = useMemo((): LessonReviewModalLesson | null => {
    if (!reviewingId) return null;
    const row = board.lessons.find((lesson) => lesson.id === reviewingId);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      skillFocus: row.skillFocus,
      playableSession: row.playableSession
        ? {
            stages: row.playableSession.stages,
            totalEstimatedMinutes: row.playableSession.totalEstimatedMinutes,
            periodMinutes: row.playableSession.periodMinutes,
          }
        : null,
      lessonReview: row.lessonReview,
    };
  }, [board.lessons, reviewingId]);

  async function handleBootstrap() {
    setBootstrapping(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("bootstrapDaytimeSchool", { schoolId });
    setBootstrapping(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    const summary = (result.data.bootstrapResult as { summary?: Record<string, { created: number; reused: number; restored: number }> } | undefined)?.summary;
    const created = summary
      ? Object.values(summary).reduce((sum, bucket) => sum + bucket.created + bucket.restored, 0)
      : 0;
    setActionSuccess(created > 0
      ? `Week timetable ready (${created} updates). Mon–Fri now use different lessons; each teaching slot has a matching Lesson.`
      : "Week timetable already matched — Mon–Fri teaching content is already varied.");
    refresh();
  }

  async function handleGenerateContent(force = false) {
    setGeneratingContent(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("generateDaytimeLessonContent", {
      schoolId,
      classroomId: selectedClassroomId === "all" ? null : selectedClassroomId,
      dayOfWeek: selectedDay,
      force,
    });
    setGeneratingContent(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    const generated = result.data.generateContentResult as {
      created?: number;
      reused?: number;
      blackBoxFailed?: number;
      contentCount?: number;
    } | undefined;
    const created = generated?.created ?? 0;
    const reused = generated?.reused ?? 0;
    const failed = generated?.blackBoxFailed ?? 0;
    if (failed > 0) {
      setActionSuccess(
        `Generated ${created} lesson(s); ${failed} need repair (Lesson Health failed). Open a period to review or regenerate.`,
      );
    } else {
      setActionSuccess(
        created > 0
          ? `Generated ${created} lesson(s) — Lesson Health PASS${reused ? ` · ${reused} already linked` : ""}. Open each period to preview and approve.`
          : reused > 0
            ? `Lesson content already linked for ${reused} slot(s). Open Lesson to review, or Force regenerate to replace packs.`
            : "No new lesson packs were needed.",
      );
    }
    refresh();
  }

  async function handleApproveLesson(dayLessonId: string) {
    setReviewBusy(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("approveDaytimeLesson", { schoolId, dayLessonId });
    setReviewBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionSuccess("Lesson approved — students can Start lesson for this period.");
    setReviewingId(null);
    refresh();
  }

  async function handleRegenerateLesson(
    dayLessonId: string,
    regenerateReason?: string,
    options?: { allowWeeklyReview?: boolean },
  ) {
    setReviewBusy(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("regenerateDaytimeLesson", {
      schoolId,
      dayLessonId,
      ...(regenerateReason ? { regenerateReason } : {}),
      ...(options?.allowWeeklyReview ? { allowWeeklyReview: true, reviewReason: regenerateReason ?? "intentional_review" } : {}),
    });
    setReviewBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionSuccess("Lesson regenerated. Check Lesson Health, then approve when ready.");
    refresh();
  }

  async function handleApproveDay() {
    if (selectedClassroomId === "all") {
      setActionError("Select a class before approving the day.");
      return;
    }
    setReviewBusy(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("approveDaytimeDay", {
      schoolId,
      classroomId: selectedClassroomId,
      dayOfWeek: selectedDay,
    });
    setReviewBusy(false);
    if (!result.ok) {
      const blockerText = result.blockers?.length
        ? ` · ${result.blockers.slice(0, 4).join(" · ")}`
        : board.dayBlockers.length
          ? ` · ${board.dayBlockers.slice(0, 4).join(" · ")}`
          : "";
      setActionError(`${result.error}${blockerText}`);
      return;
    }
    const summary = result.data.approveDayResult as {
      approvedCount?: number;
      newlyApproved?: number;
    } | undefined;
    setActionSuccess(
      `Day approved (${summary?.approvedCount ?? board.teachable.length} lessons). Students can Start approved periods.`,
    );
    refresh();
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setSavingEdit(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction("updateSchoolDayLesson", {
      schoolId,
      dayLessonId: editing.id,
      teacherId: String(form.get("teacherId") ?? "").trim() || null,
      room: String(form.get("room") ?? "").trim() || null,
      startsAt: String(form.get("startsAt") ?? "").trim(),
      endsAt: String(form.get("endsAt") ?? "").trim(),
      subject: String(form.get("subject") ?? "").trim(),
      title: String(form.get("title") ?? "").trim(),
      lessonId: editing.lessonId,
    });
    setSavingEdit(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionSuccess("Period updated.");
    setEditing(null);
    refresh();
  }

  if (loading) {
    return (
      <section className="animate-pulse rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5">
        <div className="h-5 w-48 rounded bg-slate-800" />
        <div className="mt-4 h-40 rounded bg-slate-800" />
      </section>
    );
  }

  if (error || !school) {
    return (
      <section className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
        {error ?? "Unable to load school day timetable."}
      </section>
    );
  }

  const empty = board.lessons.length === 0;
  const current = board.lessons.find((row) => row.id === board.clock.current?.id) ?? null;
  const selectedClassLabel = classrooms.find((row) => row.id === selectedClassroomId)?.label ?? "All classes";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--admin-primary-hover)]">School day</p>
            <h2 className="mt-1 text-xl font-black text-white">{weekdayLabel(selectedDay)} timetable</h2>
            <p className="mt-1 text-xs text-slate-400">
              Edit one class at a time. Changes save to that class&apos;s day periods.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  selectedDay === day
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-50"
                    : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white"
                }`}
              >
                {weekdayLabel(day).slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-xs text-slate-300">
            Class
            <select
              value={selectedClassroomId}
              onChange={(event) => setSelectedClassroomId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="all">All classes (long list)</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>{classroom.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void handleBootstrap()}
            title="Builds Mon–Fri periods with different lessons each day, and creates a Lesson for each teaching slot."
            className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/30 disabled:opacity-60"
          >
            {bootstrapping ? "Building varied week…" : "Build week timetable"}
          </button>
          <button
            type="button"
            disabled={generatingContent || empty}
            onClick={() => void handleGenerateContent(false)}
            className="rounded-lg border border-violet-300/70 bg-violet-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generatingContent ? "Generating lessons…" : "Generate lesson content"}
          </button>
          <Link
            href={`/admin/schools/${schoolId}/assignments/new`}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Add one lesson
          </Link>
        </div>

        <div id="generate-lesson-content" className="mt-4 scroll-mt-24 rounded-xl border border-violet-400/50 bg-violet-500/15 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-violet-50">Create class lessons</p>
              <p className="mt-1 text-xs text-violet-100/85">
                Builds staged packs for this day/class, runs Lesson Health automatically, then open a period to preview and approve.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={generatingContent || empty}
                onClick={() => void handleGenerateContent(false)}
                className="rounded-lg border border-violet-300/60 bg-violet-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generatingContent ? "Generating lessons…" : "Generate lesson content"}
              </button>
              <button
                type="button"
                disabled={generatingContent || empty}
                onClick={() => void handleGenerateContent(true)}
                title="Replace existing linked packs and re-run Lesson Health."
                className="rounded-lg border border-violet-400/40 bg-violet-950/60 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-900/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Force regenerate
              </button>
            </div>
          </div>
        </div>

        {!empty && selectedClassroomId !== "all" && board.teachable.length > 0 ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-50">
                  Day approval · {weekdayLabel(selectedDay)} · {selectedClassLabel}
                </p>
                <p className="mt-1 text-xs text-emerald-100/85">
                  {board.approvedCount} of {board.teachable.length} lessons approved
                  {board.awaitingCount ? ` · ${board.awaitingCount} awaiting review` : ""}
                  {board.failedCount ? ` · ${board.failedCount} machine failed` : ""}
                </p>
                {board.dayBlockers.length ? (
                  <p className="mt-1 text-[11px] text-amber-100/90">
                    Needs attention: {board.dayBlockers.slice(0, 3).join(" · ")}
                    {board.dayBlockers.length > 3 ? "…" : ""}
                  </p>
                ) : board.awaitingCount > 0 ? (
                  <p className="mt-1 text-[11px] text-emerald-100/80">
                    {board.awaitingCount} lesson(s) ready to approve.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={reviewBusy || !board.canApproveDay}
                onClick={() => void handleApproveDay()}
                className="rounded-lg border border-emerald-300/50 bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {!board.canApproveDay && board.approvedCount === board.teachable.length
                  ? "Day approved"
                  : reviewBusy
                    ? "Approving…"
                    : "Approve day"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Now</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {current
                ? `${current.startsAt}–${current.endsAt} · ${current.title}`
                : board.clock.phase === "before_school"
                  ? "Before school"
                  : board.clock.phase === "after_school"
                    ? "After school"
                    : "Outside lesson periods"}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Next</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {board.clock.next
                ? `${board.lessons.find((row) => row.id === board.clock.next?.id)?.title ?? "Next period"}`
                : "—"}
            </p>
          </article>
          <article className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Viewing</p>
            <p className="mt-1 text-sm font-semibold text-white">{selectedClassLabel}</p>
          </article>
        </div>
      </section>

      {actionError ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{actionError}</p> : null}
      {actionSuccess ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{actionSuccess}</p> : null}

      {!empty && board.playableLessons.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-violet-500/30 bg-violet-500/10">
          <div className="border-b border-violet-500/20 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-violet-200">
              Lesson review centre · {board.playableLessons.length}
            </p>
            <p className="mt-1 text-xs text-violet-100/80">
              Open a lesson to preview stages, check Lesson Health, and approve for students.
            </p>
          </div>
          <ul className="divide-y divide-violet-500/20">
            {board.playableLessons.map((lesson) => {
              const content = lesson.playableContent;
              const session = lesson.playableSession;
              const badge = reviewBadge(
                lesson.lessonReview?.reviewStatus,
                Boolean(session?.stages.length || content),
              );
              const stageSummary = session
                ? session.stages
                    .map((stage) => `${stage.stage} ${stage.estimatedMinutes}m`)
                    .join(" · ")
                : null;
              const typeLabel = (session?.contentType ?? content?.contentType ?? "pack").toUpperCase();
              return (
                <li key={`${lesson.id}-${content?.id ?? session?.stages[0]?.id ?? "pack"}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">
                      <span className="font-mono text-xs text-violet-200/90">{lesson.startsAt}–{lesson.endsAt}</span>
                      <span className="ml-2">{lesson.title}</span>
                      <span className={`ml-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
                        {badge.label}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-violet-100/80">
                      <span className="rounded border border-violet-400/40 bg-violet-500/20 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-violet-50">
                        {typeLabel}
                      </span>
                      {session ? (
                        <span className="ml-2">
                          {stageSummary} · total {session.totalEstimatedMinutes}m / period {session.periodMinutes}m
                        </span>
                      ) : content ? (
                        <span className="ml-2">
                          {content.topic || lesson.subject}
                          {` · ${content.itemCount} item${content.itemCount === 1 ? "" : "s"}`}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewingId(lesson.id)}
                    className="shrink-0 rounded-md border border-violet-400/40 bg-violet-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-violet-50 hover:bg-violet-500/30"
                  >
                    Open lesson
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!empty && board.playableLessons.length === 0 ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-50">
          <p className="font-semibold">No class lessons generated for this view yet</p>
          <p className="mt-1 text-amber-100/90">
            Use <span className="font-semibold">Generate lesson content</span> to create staged packs, then open each period to preview and approve.
          </p>
          <button
            type="button"
            disabled={generatingContent}
            onClick={() => void handleGenerateContent(false)}
            className="mt-3 rounded-lg border border-violet-300/60 bg-violet-500 px-3 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-60"
          >
            {generatingContent ? "Generating lessons…" : "Generate lesson content now"}
          </button>
        </section>
      ) : null}

      {empty ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-50">
          <p className="font-semibold">No periods for this class on {weekdayLabel(selectedDay)}</p>
          <p className="mt-1 text-amber-100/90">
            Use <span className="font-semibold">Build week timetable</span> to create Mon–Fri periods and matching Lesson records for each teaching slot.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
              Period board · {board.lessons.length} periods
            </p>
          </div>
          <ul className="divide-y divide-slate-800">
            {board.lessons.map((lesson) => {
              const state = resolvePeriodState(lesson.startsAt, lesson.endsAt, board.now);
              const playable = isPlayableDaytimeLessonType(lesson.lessonType);
              const badge = reviewBadge(
                lesson.lessonReview?.reviewStatus,
                Boolean(lesson.playableSession?.stages.length || lesson.playableContent),
              );
              return (
                <li
                  key={lesson.id}
                  className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[7rem_1fr_10rem_7rem_8rem] md:items-center ${
                    state === "now" ? "bg-sky-500/10" : state === "past" ? "opacity-70" : ""
                  }`}
                >
                  <div className="font-mono text-xs text-slate-300">
                    {lesson.startsAt}–{lesson.endsAt}
                    {state === "now" ? <span className="ml-2 rounded border border-sky-400/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-200">Now</span> : null}
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      {lesson.title}
                      {playable ? (
                        <span className={`ml-2 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
                          {badge.label}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400">
                      {lesson.subject}
                      {lesson.skillFocus ? ` · ${lesson.skillFocus}` : ""}
                      {lesson.classroomName ? ` · ${lesson.classroomName}` : ""}
                      {lesson.playableSession
                        ? ` · ${lesson.playableSession.stages.map((s) => `${s.stage} ${s.estimatedMinutes}m`).join(" · ")} · ${lesson.playableSession.totalEstimatedMinutes}m / ${lesson.playableSession.periodMinutes}m`
                        : lesson.playableContent
                          ? ` · ${lesson.playableContent.contentType} · ${lesson.playableContent.itemCount} items`
                          : lesson.lessonId
                            ? " · Lesson shell only"
                            : playable
                              ? " · Needs content"
                              : ""}
                    </p>
                    {playable && (lesson.playableSession || lesson.playableContent || lesson.lessonId) ? (
                      <button
                        type="button"
                        onClick={() => setReviewingId(lesson.id)}
                        className="mt-1 inline-flex text-[11px] font-semibold text-violet-300 hover:text-violet-100"
                      >
                        Open lesson →
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-300">{lesson.teacherName ?? "Unassigned tutor"}</p>
                  <p className="text-xs text-slate-400">{lesson.room ?? "—"}</p>
                  <button
                    type="button"
                    onClick={() => setEditing({
                      id: lesson.id,
                      title: lesson.title,
                      subject: lesson.subject,
                      teacherId: lesson.teacherId,
                      room: lesson.room,
                      startsAt: lesson.startsAt,
                      endsAt: lesson.endsAt,
                      lessonId: lesson.lessonId,
                    })}
                    className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500"
                  >
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--admin-rail)] p-3 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close edit period"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!savingEdit) setEditing(null);
            }}
          />
          <section className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--admin-primary)]/40 bg-slate-950 p-5 shadow-[var(--admin-shadow)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-primary-hover)]">Edit period</p>
                <h3 className="mt-1 text-lg font-black text-white">{editing.title}</h3>
              </div>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">
                Title
                <input name="title" defaultValue={editing.title} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-300">
                Subject / activity
                <input name="subject" defaultValue={editing.subject} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-300">
                Tutor
                <select name="teacherId" defaultValue={editing.teacherId ?? ""} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="">Unassigned</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-300">
                Room
                <input name="room" defaultValue={editing.room ?? ""} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-300">
                Starts
                <input name="startsAt" defaultValue={editing.startsAt} required pattern="\d{1,2}:\d{2}" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-slate-300">
                Ends
                <input name="endsAt" defaultValue={editing.endsAt} required pattern="\d{1,2}:\d{2}" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" disabled={savingEdit} className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-50 hover:bg-sky-500/30 disabled:opacity-60">
                  {savingEdit ? "Saving..." : "Save period"}
                </button>
                <button type="button" disabled={savingEdit} onClick={() => setEditing(null)} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {reviewingLesson ? (
        <LessonReviewModal
          lesson={reviewingLesson}
          busy={reviewBusy}
          onClose={() => {
            if (!reviewBusy) setReviewingId(null);
          }}
          onApprove={() => void handleApproveLesson(reviewingLesson.id)}
          onRegenerate={(reason, options) => void handleRegenerateLesson(reviewingLesson.id, reason, options)}
        />
      ) : null}
    </div>
  );
}
