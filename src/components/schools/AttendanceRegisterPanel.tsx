"use client";

import { useMemo, useState } from "react";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  type AttendanceStatus,
} from "@/lib/schools/attendance-status";

export type RegisterStudentView = {
  schoolStudentId: string;
  name: string;
  status: AttendanceStatus;
  note: string | null;
  onCurrentRoster: boolean;
  historicalOnly: boolean;
};

export type RegisterView = {
  schoolDayLessonId: string;
  sessionDate: string;
  registerEligible: boolean;
  completion: string;
  period: {
    title: string;
    subject: string;
    lessonType: string;
    startsAt: string;
    endsAt: string;
    room: string | null;
    classroomName: string | null;
    teacherName: string | null;
  };
  summary: {
    totalStudents: number;
    present: number;
    absent: number;
    late: number;
    authorisedAbsence: number;
    medical: number;
    notRecorded: number;
    completion: string;
  };
  students: RegisterStudentView[];
};

type Props = {
  register: RegisterView;
  saveUrl: string;
  onSaved: (register: RegisterView) => void;
};

type DraftRow = {
  status: AttendanceStatus;
  note: string;
};

export default function AttendanceRegisterPanel({ register, saveUrl, onSaved }: Props) {
  const [draft, setDraft] = useState<Record<string, DraftRow>>(() => {
    const next: Record<string, DraftRow> = {};
    for (const student of register.students) {
      next[student.schoolStudentId] = {
        status: student.status,
        note: student.note ?? "",
      };
    }
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const unrecordedCount = useMemo(() => {
    return register.students.filter((student) => {
      if (!student.onCurrentRoster) return false;
      const row = draft[student.schoolStudentId];
      return (row?.status ?? student.status) === "not_recorded";
    }).length;
  }, [draft, register.students]);

  function syncDraftFromRegister(next: RegisterView) {
    const mapped: Record<string, DraftRow> = {};
    for (const student of next.students) {
      mapped[student.schoolStudentId] = {
        status: student.status,
        note: student.note ?? "",
      };
    }
    setDraft(mapped);
  }

  async function persist(mode: "draft" | "register" | "mark_all_present") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const entries = register.students.map((student) => {
        const row = draft[student.schoolStudentId];
        return {
          schoolStudentId: student.schoolStudentId,
          status: row?.status ?? student.status,
          note: row?.note ?? student.note,
        };
      });

      const response = await fetch(saveUrl, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          sessionDate: register.sessionDate,
          entries: mode === "mark_all_present" ? [] : entries,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Unable to save register.");
      }
      const next = data.register as RegisterView;
      onSaved(next);
      syncDraftFromRegister(next);
      setMessage(mode === "mark_all_present"
        ? `Marked ${data.savedCount ?? next.summary.totalStudents} students present.`
        : `Saved ${data.savedCount ?? entries.length} attendance marks.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save register.");
    } finally {
      setSaving(false);
    }
  }

  if (!register.registerEligible) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/70">
        Break and lunch periods do not have a student attendance register.
      </div>
    );
  }

  const dateLabel = new Date(`${register.sessionDate}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-foreground/45">Attendance register</p>
        <h1 className="mt-1 text-xl font-black text-foreground">{register.period.title}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {register.period.subject}
          {" · "}
          {dateLabel}
          {" · "}
          {register.period.startsAt}–{register.period.endsAt}
          {register.period.room ? ` · ${register.period.room}` : ""}
          {register.period.classroomName ? ` · ${register.period.classroomName}` : ""}
          {register.period.teacherName ? ` · ${register.period.teacherName}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-border px-2 py-1 capitalize">{register.completion.replaceAll("_", " ")}</span>
          <span className="rounded-lg border border-border px-2 py-1">Roster {register.summary.totalStudents}</span>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-200">
            Present {register.summary.present}
          </span>
          <span className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-200">
            Absent {register.summary.absent}
          </span>
          <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-100">
            Late {register.summary.late}
          </span>
          <span className="rounded-lg border border-slate-500/40 px-2 py-1">
            Not recorded {unrecordedCount}
          </span>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || register.summary.totalStudents === 0}
          onClick={() => void persist("mark_all_present")}
          className="rounded-lg border border-sky-500/50 bg-[var(--admin-primary-muted)] px-3 py-2 text-sm font-semibold text-[var(--admin-text)] disabled:opacity-50"
        >
          Mark all present
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void persist("draft")}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void persist("register")}
          className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
        >
          Save register
        </button>
      </div>

      {register.students.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground/60">
          No students on this class roster for the selected date.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {register.students.map((student) => {
            const row = draft[student.schoolStudentId] ?? {
              status: student.status,
              note: student.note ?? "",
            };
            const unrecorded = student.onCurrentRoster && row.status === "not_recorded";
            return (
              <li
                key={student.schoolStudentId}
                className={`space-y-2 px-4 py-3 ${unrecorded ? "bg-amber-500/10" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{student.name}</p>
                    {student.historicalOnly ? (
                      <p className="text-[11px] text-foreground/50">Left class — historical mark retained</p>
                    ) : null}
                    {unrecorded ? (
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                        Not recorded
                      </p>
                    ) : null}
                  </div>
                  <select
                    value={row.status}
                    onChange={(event) => {
                      const status = event.target.value as AttendanceStatus;
                      setDraft((prev) => ({
                        ...prev,
                        [student.schoolStudentId]: { ...row, status },
                      }));
                    }}
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {ATTENDANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ATTENDANCE_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                {row.status === "late" || row.status === "absent" || row.status === "authorised_absence" || row.status === "medical" ? (
                  <input
                    type="text"
                    value={row.note}
                    onChange={(event) => {
                      setDraft((prev) => ({
                        ...prev,
                        [student.schoolStudentId]: { ...row, note: event.target.value },
                      }));
                    }}
                    placeholder="Optional note"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
