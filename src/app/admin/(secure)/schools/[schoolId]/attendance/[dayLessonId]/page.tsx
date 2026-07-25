"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SchoolDashboardShell from "@/components/admin/schools/SchoolDashboardShell";
import AttendanceRegisterPanel, {
  type RegisterView,
} from "@/components/schools/AttendanceRegisterPanel";

type PageProps = {
  params: Promise<{ schoolId: string; dayLessonId: string }>;
  searchParams: Promise<{ sessionDate?: string }>;
};

export default function AdminSchoolAttendanceRegisterPage({ params, searchParams }: PageProps) {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [dayLessonId, setDayLessonId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [register, setRegister] = useState<RegisterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([params, searchParams]).then(([route, query]) => {
      if (!active) return;
      setSchoolId(route.schoolId);
      setDayLessonId(route.dayLessonId);
      setSessionDate(query.sessionDate ?? new Date().toISOString().slice(0, 10));
    });
    return () => {
      active = false;
    };
  }, [params, searchParams]);

  useEffect(() => {
    if (!schoolId || !dayLessonId || !sessionDate) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/schools/${schoolId}/attendance/${dayLessonId}?sessionDate=${encodeURIComponent(sessionDate ?? "")}`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Unable to load register.");
        }
        if (!active) return;
        setRegister(data.register as RegisterView);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to load register.");
        setRegister(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [schoolId, dayLessonId, sessionDate]);

  if (!schoolId) {
    return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <SchoolDashboardShell
      schoolId={schoolId}
      activeTab="attendance"
      title="Amend register"
      subtitle="Admin can reopen and amend persisted daytime attendance marks."
    >
      <div className="space-y-4">
        <Link
          href={`/admin/schools/${schoolId}/attendance${sessionDate ? `?sessionDate=${encodeURIComponent(sessionDate)}` : ""}`}
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Back to day attendance
        </Link>
        {loading ? <p className="text-sm text-slate-400">Loading register…</p> : null}
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}
        {register && dayLessonId ? (
          <AttendanceRegisterPanel
            register={register}
            saveUrl={`/api/admin/schools/${schoolId}/attendance/${dayLessonId}`}
            onSaved={setRegister}
          />
        ) : null}
      </div>
    </SchoolDashboardShell>
  );
}
