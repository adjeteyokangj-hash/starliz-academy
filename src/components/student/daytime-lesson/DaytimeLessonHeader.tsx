"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatRemainingMs, remainingMsUntil } from "@/lib/schools/daytime-lesson-ui";
import type { StudentFacingSessionPlan } from "@/lib/schools/daytime-lesson-ui";

type Props = {
  title: string;
  subject: string;
  skillFocus?: string | null;
  room?: string | null;
  teacherName?: string | null;
  scheduledPeriod?: string | null;
  sessionPlan?: StudentFacingSessionPlan | null;
  lessonProgressPct?: number | null;
};

function resolveEndsAt(sessionPlan?: StudentFacingSessionPlan | null, scheduledPeriod?: string | null): string {
  if (sessionPlan?.periodEndsAt) return sessionPlan.periodEndsAt;
  if (scheduledPeriod?.includes("–")) return scheduledPeriod.split("–")[1]?.trim() ?? "";
  return "";
}

export default function DaytimeLessonHeader({
  title,
  subject,
  skillFocus,
  room,
  teacherName,
  scheduledPeriod,
  sessionPlan,
  lessonProgressPct,
}: Props) {
  const endsAt = resolveEndsAt(sessionPlan, scheduledPeriod);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const remainingLabel = endsAt ? formatRemainingMs(remainingMsUntil(endsAt, nowMs)) : "—";

  const metaBits = [
    skillFocus?.trim() || null,
    room ? `Room ${room.replace(/^room\s+/i, "")}` : null,
    teacherName
      ? (teacherName.startsWith("Ms ") || teacherName.startsWith("Mr ") || teacherName.startsWith("Mrs ")
        ? teacherName
        : `Ms ${teacherName}`)
      : null,
  ].filter(Boolean);

  return (
    <header
      data-testid="daytime-lesson-header"
      className="border-b border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/student/today"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              ← Back to Today
            </Link>
            <span className="text-sm font-black tracking-tight text-indigo-700">StarLiz</span>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
              {subject}
              {title ? ` — ${title}` : ""}
            </p>
            {metaBits.length ? (
              <p className="mt-1 text-sm text-slate-600">{metaBits.join(" · ")}</p>
            ) : null}
            {scheduledPeriod ? (
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{scheduledPeriod}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 sm:gap-6">
          {sessionPlan ? (
            <div data-testid="daytime-stage-label">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {sessionPlan.progressLabel}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{sessionPlan.currentStageName}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Time left</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-indigo-800" data-testid="daytime-time-remaining">
              {remainingLabel}
            </p>
          </div>
          {typeof lessonProgressPct === "number" ? (
            <div className="min-w-[8rem]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Lesson progress</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-linear-to-r from-indigo-500 to-violet-500 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, lessonProgressPct))}%` }}
                  data-testid="daytime-lesson-progress"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
