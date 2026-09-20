import { minMathQuestionsForMinutes } from "@/lib/schools/math-practice-fill";
import {
  buildShortLearningSessionPlan,
  type ShortLearningSessionPlan,
} from "@/lib/schools/short-learning-session-plan";

export const SHORT_LEARNING_WARNING_MINUTES = 15;
export const SHORT_LEARNING_LAST_MINUTES = 5;

export type ShortLearningClockPhase = "ok" | "warning" | "final" | "ended";

export function remainingMsUntilIso(endsAtIso: string, nowMs = Date.now()): number {
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return Number.NaN;
  return Math.max(0, end - nowMs);
}

/** Open from 5 minutes before start until the exact endsAt instant (not inclusive). */
export function isShortLearningClockOpen(input: {
  startsAtIso: string;
  endsAtIso: string;
  nowMs?: number;
  earlyEntryMinutes?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const start = Date.parse(input.startsAtIso);
  const end = Date.parse(input.endsAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const early = Math.max(0, input.earlyEntryMinutes ?? 5) * 60_000;
  return now >= start - early && now < end;
}

export function shortLearningClockPhase(remainingMs: number): ShortLearningClockPhase {
  if (remainingMs <= 0) return "ended";
  if (remainingMs <= SHORT_LEARNING_LAST_MINUTES * 60_000) return "final";
  if (remainingMs <= SHORT_LEARNING_WARNING_MINUTES * 60_000) return "warning";
  return "ok";
}

export function formatSessionCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function shortLearningClockCopy(input: {
  remainingMs: number;
  durationMinutes?: number | null;
}): { headline: string; detail: string } {
  const phase = shortLearningClockPhase(input.remainingMs);
  const countdown = formatSessionCountdown(input.remainingMs);
  const duration = input.durationMinutes && input.durationMinutes > 0
    ? `${input.durationMinutes}-minute session`
    : "Short Learning session";

  if (phase === "ended") {
    return {
      headline: "Session time is up",
      detail: `This ${duration} has ended on time.`,
    };
  }
  if (phase === "final") {
    return {
      headline: "Last minutes",
      detail: `${countdown} remaining — finish this question, then wrap up.`,
    };
  }
  if (phase === "warning") {
    return {
      headline: "You have 15 minutes left",
      detail: `${countdown} remaining in this ${duration}.`,
    };
  }
  return {
    headline: duration,
    detail: `${countdown} remaining`,
  };
}

/** Question budget across every generative block in a booked session. */
export function expectedMathQuestionsForSessionPlan(plan: ShortLearningSessionPlan): number {
  return plan.blocks
    .filter((block) => block.requiresContent)
    .reduce((sum, block) => sum + minMathQuestionsForMinutes(block.estimatedMinutes, block.title), 0);
}

export function expectedMathQuestionsForDuration(durationMinutes: number): number {
  return expectedMathQuestionsForSessionPlan(buildShortLearningSessionPlan(durationMinutes));
}
