"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import DaytimeLessonHeader from "@/components/student/daytime-lesson/DaytimeLessonHeader";
import DaytimeLessonSidebar from "@/components/student/daytime-lesson/DaytimeLessonSidebar";
import { useDaytimeLessonContext } from "@/components/student/daytime-lesson/useDaytimeLessonContext";
import {
  buildLessonProgressSnapshot,
  type LessonProgressSnapshot,
} from "@/lib/schools/daytime-lesson-ui";

type Props = {
  periodId: string;
  assignmentId: string;
  contentId: string;
  questionId?: string;
  questionIndex?: number;
  studentAttempt?: string;
  answered: number;
  correct: number;
  bestStreak?: number | null;
  lessonProgressPct?: number | null;
  mobileActionBar?: ReactNode;
  children: ReactNode;
};

export default function DaytimeSchoolLessonShell({
  periodId,
  assignmentId,
  contentId,
  questionId,
  questionIndex,
  studentAttempt,
  answered,
  correct,
  bestStreak,
  lessonProgressPct,
  mobileActionBar,
  children,
}: Props) {
  const { data, loading, error } = useDaytimeLessonContext(periodId, contentId);
  const [tutorOpen, setTutorOpen] = useState(false);

  const progress: LessonProgressSnapshot = buildLessonProgressSnapshot({
    answered,
    correct,
    bestStreak,
  });

  const title = data?.lesson.title ?? "Lesson";
  const subject = data?.lesson.subject ?? "Class";

  return (
    <div
      data-testid="daytime-school-lesson-shell"
      className="min-h-screen bg-linear-to-b from-slate-50 via-[#f7f8fc] to-violet-50/40 text-slate-900"
    >
      <DaytimeLessonHeader
        title={title}
        subject={subject}
        skillFocus={data?.lesson.skillFocus}
        room={data?.lesson.room}
        teacherName={data?.lesson.teacherName}
        scheduledPeriod={data?.lesson.scheduledPeriod}
        sessionPlan={data?.sessionPlan}
        lessonProgressPct={lessonProgressPct ?? null}
      />

      {loading && !data ? (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="mt-4 h-24 rounded bg-slate-100" />
          </div>
        </div>
      ) : null}

      {error && !data ? (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)] lg:items-start">
        <main className="min-w-0 space-y-4 pb-28 lg:pb-8" data-testid="daytime-lesson-main">
          {children}
        </main>
        <DaytimeLessonSidebar
          periodId={periodId}
          assignmentId={assignmentId}
          contentId={contentId}
          questionId={questionId}
          questionIndex={questionIndex}
          studentAttempt={studentAttempt}
          progress={progress}
          sessionPlan={data?.sessionPlan}
          teacherGuidance={data?.teacherGuidance}
          humanSupport={data?.humanSupport}
          mobileOpen={tutorOpen}
          onMobileClose={() => setTutorOpen(false)}
        />
      </div>

      <div
        data-testid="daytime-mobile-action-bar"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTutorOpen(true)}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-900"
          >
            AI Tutor
          </button>
          <div className="min-w-0 flex-1">{mobileActionBar}</div>
        </div>
      </div>
    </div>
  );
}
