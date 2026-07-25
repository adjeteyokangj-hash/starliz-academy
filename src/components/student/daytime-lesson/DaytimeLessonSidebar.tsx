"use client";

import DaytimeTutorPanel from "@/components/games/DaytimeTutorPanel";
import type { LessonProgressSnapshot } from "@/lib/schools/daytime-lesson-ui";
import type { StudentFacingSessionPlan } from "@/lib/schools/daytime-lesson-ui";
import type { HumanSupportState } from "@/lib/schools/human-support-timing";

type Props = {
  periodId: string;
  assignmentId: string;
  contentId: string;
  questionId?: string;
  questionIndex?: number;
  studentAttempt?: string;
  progress: LessonProgressSnapshot;
  sessionPlan?: StudentFacingSessionPlan | null;
  teacherGuidance?: { text: string; teacherName: string | null } | null;
  humanSupport?: {
    state: HumanSupportState;
    label: string;
    minutesRemaining: number | null;
  } | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export default function DaytimeLessonSidebar({
  periodId,
  assignmentId,
  contentId,
  questionId,
  questionIndex,
  studentAttempt,
  progress,
  sessionPlan,
  teacherGuidance,
  humanSupport,
  mobileOpen,
  onMobileClose,
}: Props) {
  const body = (
    <aside
      data-testid="daytime-lesson-sidebar"
      className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Need help?</p>
          <h2 className="mt-1 text-base font-bold text-slate-900">AI Tutor</h2>
        </div>
        {onMobileClose ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 lg:hidden"
          >
            Close
          </button>
        ) : null}
      </div>

      <DaytimeTutorPanel
        periodId={periodId}
        assignmentId={assignmentId}
        contentId={contentId}
        questionId={questionId}
        questionIndex={questionIndex}
        studentAttempt={studentAttempt}
        variant="premium"
        className="rounded-xl border border-violet-100 bg-violet-50/50 p-3"
      />

      <section data-testid="daytime-lesson-progress-card" className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Lesson progress</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Answered</dt>
            <dd className="font-bold text-slate-900">{progress.answered}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Correct</dt>
            <dd className="font-bold text-emerald-700">{progress.correct}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Incorrect</dt>
            <dd className="font-bold text-amber-700">{progress.incorrect}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Accuracy</dt>
            <dd className="font-bold text-indigo-700">{progress.accuracy}%</dd>
          </div>
        </dl>
        {sessionPlan ? (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500">Current stage</p>
            <p className="text-sm font-semibold text-slate-900">{sessionPlan.currentStageName}</p>
            <div className="mt-2 flex gap-1">
              {sessionPlan.stages.map((stage, index) => (
                <div
                  key={`${stage.stage}-${index}`}
                  className={`h-1.5 flex-1 rounded-full ${
                    stage.completed
                      ? "bg-emerald-400"
                      : index === sessionPlan.currentStageIndex
                        ? "bg-indigo-500"
                        : "bg-slate-200"
                  }`}
                  title={stage.label}
                />
              ))}
            </div>
          </div>
        ) : null}
        {progress.bestStreak != null ? (
          <p className="mt-2 text-xs text-slate-600">
            Best streak: <span className="font-semibold text-slate-900">{progress.bestStreak}</span>
          </p>
        ) : null}
      </section>

      {teacherGuidance?.text ? (
        <section
          data-testid="daytime-teacher-guidance"
          className="rounded-xl border border-sky-200 bg-sky-50/90 p-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Teacher guidance</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {teacherGuidance.teacherName
              ? `${teacherGuidance.teacherName.startsWith("Ms ") || teacherGuidance.teacherName.startsWith("Mr ")
                ? teacherGuidance.teacherName
                : `Ms ${teacherGuidance.teacherName}`} says:`
              : "Your teacher says:"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{teacherGuidance.text}</p>
        </section>
      ) : null}

      {humanSupport ? (
        <section
          data-testid="daytime-human-support"
          data-support-state={humanSupport.state}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Support</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{humanSupport.label}</p>
        </section>
      ) : null}
    </aside>
  );

  if (typeof mobileOpen === "boolean") {
    return (
      <div className="contents">
        <div className="hidden lg:block">{body}</div>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" data-testid="daytime-tutor-drawer">
            <button
              type="button"
              aria-label="Close tutor panel"
              className="absolute inset-0 bg-slate-900/40"
              onClick={onMobileClose}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-2 shadow-2xl">
              {body}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return body;
}
