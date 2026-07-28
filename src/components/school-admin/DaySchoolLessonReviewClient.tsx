"use client";

import CollapsibleCard from "@/components/school-admin/CollapsibleCard";

import { useMemo, useState } from "react";
import LessonReviewModal, {
  type LessonReviewModalLesson,
} from "@/components/admin/schools/LessonReviewModal";
import { postSchoolAction } from "@/components/admin/schools/school-actions";
import { useSchoolDashboardRecord } from "@/components/admin/schools/school-dashboard-data";
import { sortPeriodsByTime } from "@/lib/schools/school-day-period";

type Props = {
  schoolId: string;
};

export default function DaySchoolLessonReviewClient({ schoolId }: Props) {
  const { school, loading, error, refresh } = useSchoolDashboardRecord(schoolId, "school-portal");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const queue = useMemo(() => {
    const lessons = sortPeriodsByTime(school?.dayLessons ?? []);
    return lessons.filter((row) => {
      const status = row.lessonReview?.reviewStatus;
      return status === "awaiting_review" || status === "machine_failed" || status === "draft";
    });
  }, [school?.dayLessons]);

  const reviewingLesson = useMemo((): LessonReviewModalLesson | null => {
    const row = queue.find((item) => item.id === reviewingId) ?? null;
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      skillFocus: row.skillFocus,
      playableSession: row.playableSession
        ? {
            stages: row.playableSession.stages,
            totalEstimatedMinutes: row.playableSession.totalEstimatedMinutes,
            periodMinutes: row.playableSession.periodMinutes,
          }
        : null,
      lessonReview: row.lessonReview
        ? {
            reviewStatus: row.lessonReview.reviewStatus,
            teacherReviewedAt: row.lessonReview.teacherReviewedAt,
            machineHealth: row.lessonReview.machineHealth,
          }
        : null,
    };
  }, [queue, reviewingId]);

  async function onApprove(dayLessonId: string) {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction(
      "approveDaytimeLesson",
      { schoolId, dayLessonId },
      { endpoint: "/api/school-admin/day-school/actions" },
    );
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionSuccess("Lesson approved.");
    setReviewingId(null);
    refresh();
  }

  async function onRegenerate(dayLessonId: string, reason: string, options?: { allowWeeklyReview?: boolean }) {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await postSchoolAction(
      "regenerateDaytimeLesson",
      {
        schoolId,
        dayLessonId,
        regenerateReason: reason,
        ...(options?.allowWeeklyReview
          ? { allowWeeklyReview: true, reviewReason: reason }
          : {}),
      },
      { endpoint: "/api/school-admin/day-school/actions" },
    );
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionSuccess("Lesson regenerated — re-check health before approving.");
    refresh();
  }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Lesson Review</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Review generated Day School lessons — correct or regenerate, then approve for publish. This is not the platform Content Library.
        </p>
      </div>

      {actionError ? <p className="mb-3 text-sm font-semibold text-destructive" role="alert">{actionError}</p> : null}
      {actionSuccess ? <p className="mb-3 text-sm font-semibold text-emerald-700">{actionSuccess}</p> : null}
      {loading ? <p className="text-sm text-foreground/50">Loading review queue…</p> : null}
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}

      {!loading && queue.length === 0 ? (
        <CollapsibleCard title="Lessons awaiting review" count={0} bodyClassName="p-12 text-center">
          <p className="text-foreground/50">No lessons awaiting review.</p>
        </CollapsibleCard>
      ) : null}

      {queue.length > 0 ? (
        <CollapsibleCard title="Lessons awaiting review" count={queue.length} bodyClassName="space-y-3 p-4">
        <ul className="space-y-3">
          {queue.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
            >
              <div>
                <p className="font-semibold text-foreground">{row.title}</p>
                <p className="text-xs text-foreground/55">
                  {row.subject} · {row.classroomName ?? "Class"} · {row.startsAt}–{row.endsAt}
                  {" · "}
                  {(row.lessonReview?.reviewStatus ?? "draft").replaceAll("_", " ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingId(row.id)}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Review
              </button>
            </li>
          ))}
        </ul>
        </CollapsibleCard>
      ) : null}

      {reviewingLesson ? (
        <LessonReviewModal
          lesson={reviewingLesson}
          busy={busy}
          hideContentLibrary
          onClose={() => {
            if (!busy) setReviewingId(null);
          }}
          onApprove={() => void onApprove(reviewingLesson.id)}
          onRegenerate={(reason, options) => void onRegenerate(reviewingLesson.id, reason, options)}
        />
      ) : null}
    </div>
  );
}
