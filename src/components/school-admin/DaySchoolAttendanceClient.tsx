"use client";

import { useEffect, useState } from "react";
import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

type AttendancePeriod = {
  schoolDayLessonId: string;
  title: string;
  subject: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  classroomName: string | null;
  teacherName: string | null;
  registerEligible: boolean;
  completion: string;
  summary: {
    present?: number;
    absent?: number;
    late?: number;
    excused?: number;
    unmarked?: number;
  };
};

export default function DaySchoolAttendanceClient() {
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [periods, setPeriods] = useState<AttendancePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const boot = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const qs = new URLSearchParams({ sessionDate });
          const res = await fetch(`/api/school-admin/day-school/attendance?${qs}`);
          const payload = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setError(payload.error ?? "Failed to load attendance.");
            setPeriods([]);
            return;
          }
          setPeriods(payload.periods ?? []);
        } catch {
          if (!cancelled) setError("Unable to load attendance.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
    };
  }, [sessionDate]);

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
          <p className="mt-0.5 text-sm text-foreground/60">
            School-wide Day School registers for the selected session date.
          </p>
        </div>
        <label className="text-sm text-foreground/70">
          Session date
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="mt-1 block rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error ? <p className="mb-4 text-sm font-semibold text-destructive" role="alert">{error}</p> : null}
      {loading ? <p className="text-sm text-foreground/50">Loading attendance…</p> : null}

      {!loading && periods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-foreground/50">No periods found for this date.</p>
        </div>
      ) : null}

      {periods.length > 0 ? (
        <CollapsibleCard title="Attendance periods" count={periods.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-foreground/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Period</th>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-left font-medium">Teacher</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periods.map((period) => (
                  <tr key={period.schoolDayLessonId} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{period.title}</p>
                      <p className="text-xs text-foreground/50">
                        {period.subject} · {period.startsAt}–{period.endsAt}
                        {period.room ? ` · ${period.room}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-foreground/70">{period.classroomName ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground/70">{period.teacherName ?? "—"}</td>
                    <td className="px-4 py-3 text-xs capitalize text-foreground/60">
                      {period.completion.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground/60">
                      {period.registerEligible
                        ? `P ${period.summary.present ?? 0} · A ${period.summary.absent ?? 0} · L ${period.summary.late ?? 0}`
                        : "Not register-eligible"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      ) : null}
    </div>
  );
}
