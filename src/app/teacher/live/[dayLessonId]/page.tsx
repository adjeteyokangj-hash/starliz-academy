"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LiveClassroomBoard from "@/components/teacher/LiveClassroomBoard";

type PageProps = {
  params: Promise<{ dayLessonId: string }>;
};

export default function TeacherLiveClassroomPage({ params }: PageProps) {
  const [dayLessonId, setDayLessonId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void params.then((value) => {
      if (active) setDayLessonId(value.dayLessonId);
    });
    return () => {
      active = false;
    };
  }, [params]);

  return (
    <div className="space-y-4 p-6">
      <Link href="/teacher/timetable" className="text-sm text-foreground/60 hover:text-foreground">
        ← Back to timetable
      </Link>
      {dayLessonId ? <LiveClassroomBoard dayLessonId={dayLessonId} /> : (
        <p className="text-sm text-foreground/60">Loading…</p>
      )}
    </div>
  );
}
