"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";

type PeriodSummary = {
  schoolDayLessonId: string;
  title: string;
  subject: string;
  lessonType: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classroomName: string | null;
  teacherName: string | null;
  teacherId: string | null;
  registerEligible: boolean;
  completion: string;
  summary: {
    totalStudents: number;
    present: number;
    absent: number;
    late: number;
    authorisedAbsence: number;
    medical: number;
    notRecorded: number;
  };
};

type PageProps = {
  params: Promise<{ schoolId: string }>;
};

function completionLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function completionClass(value: string): string {
  if (value === "complete") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (value === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (value === "missing_tutor" || value === "no_roster") return "border-rose-500/40 bg-rose-500/10 text-rose-100";
  if (value === "not_applicable") return "border-slate-600 bg-slate-900 text-slate-400";
  return "border-slate-600 bg-slate-950 text-slate-300";
}

export default function AdminSchoolAttendancePage({ params }: PageProps) {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void params.then((value) => {
      if (active) setSchoolId(value.schoolId);
    });
    return () => {
      active = false;
    };
  }, [params]);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/schools/${schoolId}/attendance?sessionDate=${encodeURIComponent(sessionDate)}`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load attendance.");
        }
        if (!active) return;
        setPeriods((data.summary?.periods ?? []) as PeriodSummary[]);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load attendance.");
        setPeriods([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [schoolId, sessionDate]);

  if (!schoolId) {
    return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance"
      title="Day attendance"
      subtitle="Today’s scheduled periods with register completion from persisted attendance marks."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
          <label className="space-y-1 text-xs font-semibold text-slate-400">
            Session date
            <input
              type="date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
              className="block rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>

        {loading ? <p className="text-sm text-slate-400">Loading today’s registers…</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}

        {!loading && !error && periods.length === 0 ? (
          <p className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            No scheduled periods for this weekday.
          </p>
        ) : null}

        <div className="space-y-3">
          {periods.map((period) => (
            <article key={period.schoolDayLessonId} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">
                    {period.startsAt}–{period.endsAt}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-white">{period.title}</h2>
                  <p className="text-xs text-slate-400">
                    {period.subject}
                    {period.classroomName ? ` · ${period.classroomName}` : " · No class"}
                    {period.teacherName ? ` · ${period.teacherName}` : " · Missing tutor"}
                    {period.room ? ` · ${period.room}` : ""}
                  </p>
                </div>
                <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${completionClass(period.completion)}`}>
                  {completionLabel(period.completion)}
                </span>
              </div>

              {period.registerEligible ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4 lg:grid-cols-7">
                    <p>Total <span className="font-semibold text-white">{period.summary.totalStudents}</span></p>
                    <p>Present <span className="font-semibold text-white">{period.summary.present}</span></p>
                    <p>Absent <span className="font-semibold text-white">{period.summary.absent}</span></p>
                    <p>Late <span className="font-semibold text-white">{period.summary.late}</span></p>
                    <p>Authorised <span className="font-semibold text-white">{period.summary.authorisedAbsence}</span></p>
                    <p>Medical <span className="font-semibold text-white">{period.summary.medical}</span></p>
                    <p>Not recorded <span className="font-semibold text-white">{period.summary.notRecorded}</span></p>
                  </div>
                  <Link
                    href={`/admin/schools/${schoolId}/attendance/${period.schoolDayLessonId}?sessionDate=${encodeURIComponent(sessionDate)}`}
                    className="mt-3 inline-flex rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
                  >
                    Open register
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Break / lunch — no student register.</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </SchoolDashboardShell>
  );
}
