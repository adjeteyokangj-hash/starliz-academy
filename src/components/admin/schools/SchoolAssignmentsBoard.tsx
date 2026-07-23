"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export default function SchoolAssignmentsBoard({ schoolId }: { schoolId: string }) {
  const { school, loading, error } = useSchoolDashboardRecord(schoolId);

  const lessons = useMemo(() => {
    return [...(school?.dayLessons ?? [])]
      .filter((row) => row.lessonType !== "break" && row.lessonType !== "registration")
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodIndex - b.periodIndex);
  }, [school?.dayLessons]);

  if (loading) {
    return <p className="text-sm text-slate-300">Loading assignments...</p>;
  }
  if (error || !school) {
    return <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error ?? "Unable to load assignments."}</p>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-white">Assignment Planner</h2>
        <p className="mt-1 text-xs text-slate-400">Plan class lessons onto the weekday timetable with a named tutor and room.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/admin/schools/${schoolId}/assignments/new`} className="inline-flex rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/25">
            Assign Lesson
          </Link>
          <Link href={`/admin/schools/${schoolId}/timetable`} className="inline-flex rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white">
            Open timetable
          </Link>
        </div>
      </article>
      <article className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-white">Assigned Lesson Queue</h2>
        <p className="mt-1 text-xs text-slate-400">
          {lessons.length === 0
            ? "No teaching lessons scheduled yet. Assign a lesson or bootstrap the daytime school."
            : `${lessons.length} teaching period(s) on the school timetable.`}
        </p>
        {lessons.length > 0 ? (
          <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-xs text-slate-300">
            {lessons.slice(0, 20).map((lesson) => (
              <li key={lesson.id} className="rounded-lg border border-slate-700/70 bg-slate-900/70 px-2 py-1.5">
                <p className="font-semibold text-white">{lesson.title}</p>
                <p className="text-slate-400">
                  {DAY_LABELS[lesson.dayOfWeek]} {lesson.startsAt}–{lesson.endsAt}
                  {lesson.classroomName ? ` · ${lesson.classroomName}` : ""}
                  {lesson.teacherName ? ` · ${lesson.teacherName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </div>
  );
}
