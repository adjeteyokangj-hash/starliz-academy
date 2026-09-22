"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ShortLearningLessonShell from "@/components/student/ShortLearningLessonShell";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

type BlockType = "welcome" | "break" | "tutor_support" | "progress_report" | string;

type Props = {
  bookingId: string;
  sessionId: string;
  blockId: string;
  blockType: BlockType;
  title: string;
  estimatedMinutes: number;
  learningObjective: string | null;
  subject: string;
  schoolName: string;
  durationMinutes: number;
  endsAtIso: string;
  learningFocus: string | null;
  completedTitles: string[];
};

function stageCopy(blockType: BlockType, props: Props): { eyebrow: string; body: string; cta: string } {
  if (blockType === "welcome") {
    return {
      eyebrow: "Welcome",
      body: `This is a ${props.durationMinutes}-minute ${props.subject} Short Learning class. Your AI tutor will teach, then you practise. A human tutor may join only if they are available.`,
      cta: "Start the lesson",
    };
  }
  if (blockType === "break") {
    return {
      eyebrow: "Break",
      body: "Take a short rest. Stretch, drink water, then come back ready for the next block.",
      cta: "I'm ready to continue",
    };
  }
  if (blockType === "tutor_support") {
    return {
      eyebrow: "Tutor support",
      body: "Use the AI tutor if anything from the last block is still unclear. Invite a human tutor only if you need extra help.",
      cta: "Continue the journey",
    };
  }
  return {
    eyebrow: "Progress report",
    body: props.completedTitles.length
      ? "Here is what you covered in this session. Keep the methods you practised and try one more question later if you can."
      : "This Short Learning session is wrapping up. Well done for staying with the class.",
    cta: "Finish session",
  };
}

export default function ShortLearningStageScreen(props: Props) {
  const router = useRouter();
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = stageCopy(props.blockType, props);

  const continueJourney = useCallback(async () => {
    if (continuing) return;
    setContinuing(true);
    setError(null);
    try {
      const res = await fetchWithRefreshRetry(
        `/api/student/short-learning/${encodeURIComponent(props.bookingId)}/session`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completedBlockId: props.blockId }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Unable to continue.");
      }
      const href = typeof payload.lessonHref === "string" && payload.lessonHref.startsWith("/")
        ? payload.lessonHref
        : typeof payload.href === "string" && payload.href.startsWith("/")
          ? payload.href
          : `/student/short-learning/${encodeURIComponent(props.bookingId)}`;
      router.push(href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to continue.");
      setContinuing(false);
    }
  }, [continuing, props.blockId, props.bookingId, router]);

  return (
    <ShortLearningLessonShell
      bookingId={props.bookingId}
      sessionId={props.sessionId}
      blockId={props.blockId}
      assignmentId=""
      contentId=""
      blockTitle={props.title}
      subject={props.subject}
      learningObjective={props.learningObjective}
      endsAtIso={props.endsAtIso}
      durationMinutes={props.durationMinutes}
      hideTutor={props.blockType !== "tutor_support"}
    >
      <section
        data-testid="short-learning-stage-screen"
        data-block-type={props.blockType}
        className="rounded-3xl border border-violet-200 bg-white p-6 shadow-sm"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900">{props.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {props.schoolName}
          {props.estimatedMinutes > 0 ? ` · about ${props.estimatedMinutes} minutes` : ""}
        </p>
        {props.learningFocus ? (
          <p className="mt-3 text-sm font-semibold text-slate-800">Focus: {props.learningFocus}</p>
        ) : null}
        {props.learningObjective ? (
          <p className="mt-1 text-sm text-slate-700">{props.learningObjective}</p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-slate-700">{copy.body}</p>

        {props.blockType === "progress_report" && props.completedTitles.length ? (
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-800" data-testid="short-learning-progress-list">
            {props.completedTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ol>
        ) : null}

        {props.blockType === "tutor_support" ? (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4" data-testid="short-learning-tutor-stage-note">
            <p className="text-sm font-semibold text-slate-900">AI tutor is ready on the next questions.</p>
            <p className="mt-1 text-sm text-slate-700">
              If a method still feels unclear, continue and use Explain, Hint, or Invite a tutor on the practice screen.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="short-learning-stage-continue"
          onClick={() => void continueJourney()}
          disabled={continuing}
          className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white hover:bg-violet-600 disabled:opacity-60"
        >
          {continuing ? "Continuing…" : copy.cta}
        </button>
      </section>
    </ShortLearningLessonShell>
  );
}
