"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AttendanceRegisterPanel, {
  type RegisterView,
} from "@/components/schools/AttendanceRegisterPanel";

type PageProps = {
  params: Promise<{ dayLessonId: string }>;
};

export default function TeacherAttendanceRegisterPage({ params }: PageProps) {
  const [dayLessonId, setDayLessonId] = useState<string | null>(null);
  const [register, setRegister] = useState<RegisterView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void params.then((value) => {
      if (active) setDayLessonId(value.dayLessonId);
    });
    return () => {
      active = false;
    };
  }, [params]);

  useEffect(() => {
    if (!dayLessonId) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/teacher/attendance/${dayLessonId}`, {
          credentials: "include",
          cache: "no-store",
        });
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
  }, [dayLessonId]);

  return (
    <div className="space-y-4 p-6">
      <Link href="/teacher/timetable" className="text-sm text-foreground/60 hover:text-foreground">
        ← Back to timetable
      </Link>
      {loading ? <p className="text-sm text-foreground/60">Loading register…</p> : null}
      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}
      {register && dayLessonId ? (
        <AttendanceRegisterPanel
          register={register}
          saveUrl={`/api/teacher/attendance/${dayLessonId}`}
          onSaved={setRegister}
        />
      ) : null}
    </div>
  );
}
