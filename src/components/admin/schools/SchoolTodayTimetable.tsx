"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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

export default function SchoolTodayTimetable({ schoolId }: Props) {
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(schoolDayOfWeek());
  const [editing, setEditing] = useState<EditableLesson | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const teachers = useMemo(() => {
    return (school?.teachers ?? [])
      .filter((row) => row.status === "active" || row.status === "invited")
      .map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.email || "Tutor",
      }));
  }, [school?.teachers]);

  const board = useMemo(() => {
    const lessons = sortPeriodsByTime(
      (school?.dayLessons ?? [])
        .filter((row) => row.dayOfWeek === selectedDay)
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
          lessonId: row.lessonId,
          skillFocus: row.skillFocus,
        })),
    );
    const now = minutesNow();
    const clock = describeSchoolClock(lessons, now);
    return { lessons, clock, now };
  }, [school?.dayLessons, selectedDay]);

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
    setActionSuccess(created > 0 ? `Daytime school updated (${created} created/restored).` : "Daytime school already complete — nothing duplicated.");
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
      <section className="animate-pulse rounded-xl border border-slate-700/70 bg-slate-950/60 p-5">
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

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-sky-300">School day</p>
            <h2 className="mt-1 text-xl font-black text-white">{weekdayLabel(selectedDay)} timetable</h2>
            <p className="mt-1 text-xs text-slate-400">
              Live periods for {school.name}. Edits persist to SchoolDayLesson.
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

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
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
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Next</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {board.clock.next
                ? `${board.lessons.find((row) => row.id === board.clock.next?.id)?.title ?? "Next period"}`
                : "—"}
            </p>
          </article>
          <article className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Classes / students</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {school.classrooms.length} classes · {school.students.filter((row) => row.status === "active").length} students
            </p>
          </article>
        </div>
      </section>

      {actionError ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{actionError}</p> : null}
      {actionSuccess ? <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{actionSuccess}</p> : null}

      {editing ? (
        <section className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4">
          <h3 className="text-sm font-semibold text-white">Edit period</h3>
          <form onSubmit={handleEditSubmit} className="mt-3 grid gap-3 md:grid-cols-2">
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
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button type="submit" disabled={savingEdit} className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-500/30 disabled:opacity-60">
                {savingEdit ? "Saving..." : "Save period"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200">
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {empty ? (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-50">
          <p className="font-semibold">No daytime lessons yet</p>
          <p className="mt-1 text-amber-100/90">
            Seed tutors, Year 5 class 5K, students, and a full Mon–Fri timetable — safe to re-run.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={bootstrapping}
              onClick={() => void handleBootstrap()}
              className="rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-50 hover:bg-sky-500/30 disabled:opacity-60"
            >
              {bootstrapping ? "Setting up school day..." : "Bootstrap daytime school"}
            </button>
            <Link
              href={`/admin/schools/${schoolId}/assignments/new`}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
            >
              Assign a lesson
            </Link>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Period board</p>
            <button
              type="button"
              disabled={bootstrapping}
              onClick={() => void handleBootstrap()}
              className="rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-500"
            >
              {bootstrapping ? "Syncing..." : "Re-sync bootstrap"}
            </button>
          </div>
          <ul className="divide-y divide-slate-800">
            {board.lessons.map((lesson) => {
              const state = resolvePeriodState(lesson.startsAt, lesson.endsAt, board.now);
              return (
                <li
                  key={lesson.id}
                  className={`grid gap-2 px-4 py-3 text-sm md:grid-cols-[7rem_1fr_10rem_7rem_4.5rem] md:items-center ${
                    state === "now" ? "bg-sky-500/10" : state === "past" ? "opacity-70" : ""
                  }`}
                >
                  <div className="font-mono text-xs text-slate-300">
                    {lesson.startsAt}–{lesson.endsAt}
                    {state === "now" ? <span className="ml-2 rounded border border-sky-400/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-200">Now</span> : null}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{lesson.title}</p>
                    <p className="text-xs text-slate-400">
                      {lesson.subject}
                      {lesson.skillFocus ? ` · ${lesson.skillFocus}` : ""}
                      {lesson.classroomName ? ` · ${lesson.classroomName}` : ""}
                    </p>
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
    </div>
  );
}
