/**
 * Pure helpers for the premium daytime school lesson experience.
 * Keep student-facing copy free of internal IDs and queue ETAs when no tutor is online.
 */

import type { DaytimeSessionPlanDto } from "@/lib/schools/start-daytime-period";
import type { HumanSupportState } from "@/lib/schools/human-support-timing";
import { deriveHumanSupportSummary } from "@/lib/schools/human-support-timing";

const INTERNAL_ID_LEAK =
  /(?:^|[^a-z0-9])(?:(?:warmup|core|stretch)-)?c[a-z0-9]{20,}(?:[^a-z0-9]|$)/i;

export type DaytimeStageDisplayName = "Warm-up" | "Core practice" | "Stretch challenge" | string;

export type StudentHumanSupportDisplay = {
  state: HumanSupportState;
  label: string;
  /** Minutes remaining in an active human session, when known. */
  minutesRemaining: number | null;
};

export type StudentFacingSessionPlan = {
  progressLabel: string;
  currentStageName: string;
  currentStageIndex: number;
  totalStages: number;
  periodEndsAt: string;
  periodMinutes: number;
  stages: Array<{
    stageIndex: number;
    stage: string;
    label: string;
    completed: boolean;
  }>;
  nextStageLabel: string | null;
};

export function studentFacingTextLeaksInternalIds(text: string): boolean {
  return INTERNAL_ID_LEAK.test(text);
}

export function stageDisplayName(stage: string, label?: string | null): DaytimeStageDisplayName {
  if (label?.trim()) {
    const trimmed = label.trim();
    if (trimmed.toLowerCase() === "stretch") return "Stretch challenge";
    if (trimmed.toLowerCase() === "core") return "Core practice";
    return trimmed;
  }
  const key = stage.trim().toLowerCase();
  if (key === "warmup" || key === "warm-up") return "Warm-up";
  if (key === "stretch") return "Stretch challenge";
  if (key === "core") return "Core practice";
  return label?.trim() || "Core practice";
}

export function toStudentFacingSessionPlan(
  plan: DaytimeSessionPlanDto | null | undefined,
): StudentFacingSessionPlan | null {
  if (!plan || !plan.stages.length) return null;
  const totalStages = Math.max(1, plan.stages.length);
  const currentIndex = Math.min(Math.max(0, plan.currentIndex), totalStages - 1);
  const current = plan.stages[currentIndex];
  const next = plan.stages.slice(currentIndex + 1).find((stage) => !stage.completed) ?? null;
  return {
    progressLabel: plan.progressLabel,
    currentStageName: stageDisplayName(current?.stage ?? "core", current?.label),
    currentStageIndex: currentIndex,
    totalStages,
    periodEndsAt: plan.periodEndsAt,
    periodMinutes: plan.periodMinutes,
    stages: plan.stages.map((stage) => ({
      stageIndex: stage.stageIndex,
      stage: stage.stage,
      label: stageDisplayName(stage.stage, stage.label),
      completed: stage.completed,
    })),
    nextStageLabel: next ? stageDisplayName(next.stage, next.label) : null,
  };
}

export function formatClockRange(startsAt: string, endsAt: string): string {
  const start = startsAt.trim();
  const end = endsAt.trim();
  if (!start || !end) return "";
  return `${start}–${end}`;
}

export function formatRemainingMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00 remaining";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} remaining`;
}

export function remainingMsUntil(periodEndsAt: string, nowMs = Date.now()): number {
  // periodEndsAt on session plan is HH:MM wall-clock; prefer ISO when present.
  if (periodEndsAt.includes("T") || periodEndsAt.includes("-")) {
    const parsed = Date.parse(periodEndsAt);
    if (Number.isFinite(parsed)) return Math.max(0, parsed - nowMs);
  }
  const match = periodEndsAt.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  const now = new Date(nowMs);
  const end = new Date(now);
  end.setHours(hours, minutes, 0, 0);
  if (end.getTime() < now.getTime()) {
    // Overnight edge: treat as already ended for countdown purposes.
    return 0;
  }
  return end.getTime() - now.getTime();
}

/**
 * Student-safe human support labels.
 * Never invent a queue/ETA when no tutor is online.
 */
export function studentHumanSupportDisplay(input: {
  onlineTutorCount: number;
  availableTutorCount: number;
  busyTutorCount: number;
  studentQueued?: boolean;
  studentSessionActive?: boolean;
  plannedEndsAt?: string | null;
  nowMs?: number;
}): StudentHumanSupportDisplay {
  const summary = deriveHumanSupportSummary({
    onlineTutorCount: input.onlineTutorCount,
    availableTutorCount: input.availableTutorCount,
    busyTutorCount: input.busyTutorCount,
    studentQueued: input.studentQueued,
    studentSessionActive: input.studentSessionActive,
  });

  let minutesRemaining: number | null = null;
  if (input.studentSessionActive && input.plannedEndsAt) {
    const end = Date.parse(input.plannedEndsAt);
    if (Number.isFinite(end)) {
      minutesRemaining = Math.max(0, Math.ceil((end - (input.nowMs ?? Date.now())) / 60000));
    }
  }

  if (summary.state === "ai-only" || input.onlineTutorCount <= 0) {
    return { state: "ai-only", label: "AI support available", minutesRemaining: null };
  }
  if (summary.state === "human-session-active") {
    return {
      state: "human-session-active",
      label:
        minutesRemaining != null
          ? `Tutor assigned · ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}`
          : "Human support in progress",
      minutesRemaining,
    };
  }
  if (summary.state === "tutor-available") {
    return {
      state: "tutor-available",
      label: "A tutor is available if AI help is exhausted",
      minutesRemaining: null,
    };
  }
  if (summary.state === "queued") {
    // Only show queue language when tutors are online (deriveHumanSupportSummary already gates).
    return { state: "queued", label: "Human support in progress", minutesRemaining: null };
  }
  return {
    state: "tutors-busy",
    label: "A tutor is available if AI help is exhausted",
    minutesRemaining: null,
  };
}

export function accuracyPercent(answered: number, correct: number): number {
  if (answered <= 0) return 0;
  return Math.round((Math.max(0, correct) / answered) * 100);
}

export type LessonProgressSnapshot = {
  answered: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  bestStreak: number | null;
};

export function buildLessonProgressSnapshot(input: {
  answered: number;
  correct: number;
  bestStreak?: number | null;
}): LessonProgressSnapshot {
  const answered = Math.max(0, Math.floor(input.answered));
  const correct = Math.max(0, Math.min(answered, Math.floor(input.correct)));
  return {
    answered,
    correct,
    incorrect: Math.max(0, answered - correct),
    accuracy: accuracyPercent(answered, correct),
    bestStreak: typeof input.bestStreak === "number" && Number.isFinite(input.bestStreak)
      ? Math.max(0, Math.floor(input.bestStreak))
      : null,
  };
}

export type DaytimeStagePackExtras = {
  title?: string;
  passage?: {
    title: string;
    text: string;
    paragraphs: string[];
  };
  vocabulary?: Array<{ word: string; childFriendlyMeaning: string; example?: string }>;
  spellingFocus?: string;
  targetWords?: string[];
  ruleExplanation?: string;
  learningObjective?: string;
  explanation?: string;
  workedExamples?: Array<{ question: string; steps: string[]; answer: string }>;
  scenarioOrObservation?: string;
  activities?: Array<{ kind: string; title?: string; estimatedMinutes?: number }>;
  subjectType?: string;
};

export function extractStagePackExtras(raw: unknown): DaytimeStagePackExtras | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const passageRaw = row.passage;
  let passage: DaytimeStagePackExtras["passage"];
  if (typeof passageRaw === "string" && passageRaw.trim()) {
    const paragraphs = passageRaw
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    passage = {
      title: typeof row.title === "string" ? row.title.trim() : "Passage",
      text: passageRaw.trim(),
      paragraphs: paragraphs.length ? paragraphs : [passageRaw.trim()],
    };
  } else if (passageRaw && typeof passageRaw === "object") {
    const p = passageRaw as Record<string, unknown>;
    const text = typeof p.text === "string" ? p.text.trim() : "";
    const paragraphs = Array.isArray(p.paragraphs)
      ? p.paragraphs.map((part) => String(part ?? "").trim()).filter(Boolean)
      : text
        ? text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
        : [];
    if (text || paragraphs.length) {
      passage = {
        title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : "Passage",
        text: text || paragraphs.join("\n\n"),
        paragraphs: paragraphs.length ? paragraphs : text ? [text] : [],
      };
    }
  }

  const vocabulary = Array.isArray(row.vocabulary)
    ? row.vocabulary
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        word: String(item.word ?? "").trim(),
        childFriendlyMeaning: String(item.childFriendlyMeaning ?? item.meaning ?? "").trim(),
        example: typeof item.example === "string" ? item.example.trim() : undefined,
      }))
      .filter((item) => item.word && item.childFriendlyMeaning)
    : undefined;

  const workedExamples = Array.isArray(row.workedExamples)
    ? row.workedExamples
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        question: String(item.question ?? "").trim(),
        steps: Array.isArray(item.steps) ? item.steps.map((s) => String(s ?? "").trim()).filter(Boolean) : [],
        answer: String(item.answer ?? "").trim(),
      }))
      .filter((item) => item.question)
    : undefined;

  const activities = Array.isArray(row.activities)
    ? row.activities
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        kind: String(item.kind ?? "").trim(),
        title: typeof item.title === "string" ? item.title.trim() : undefined,
        estimatedMinutes: typeof item.estimatedMinutes === "number" ? item.estimatedMinutes : undefined,
      }))
      .filter((item) => item.kind)
    : undefined;

  const extras: DaytimeStagePackExtras = {
    title: typeof row.title === "string" ? row.title.trim() : undefined,
    passage,
    vocabulary,
    spellingFocus: typeof row.spellingFocus === "string" ? row.spellingFocus.trim() : undefined,
    targetWords: Array.isArray(row.targetWords)
      ? row.targetWords.map((w) => String(w ?? "").trim()).filter(Boolean)
      : undefined,
    ruleExplanation: typeof row.ruleExplanation === "string" ? row.ruleExplanation.trim() : undefined,
    learningObjective: typeof row.learningObjective === "string" ? row.learningObjective.trim() : undefined,
    explanation: typeof row.explanation === "string" ? row.explanation.trim() : undefined,
    workedExamples,
    scenarioOrObservation: typeof row.scenarioOrObservation === "string"
      ? row.scenarioOrObservation.trim()
      : undefined,
    activities,
    subjectType: typeof row.subjectType === "string" ? row.subjectType.trim() : undefined,
  };

  const hasContent = Boolean(
    extras.passage
      || extras.vocabulary?.length
      || extras.spellingFocus
      || extras.targetWords?.length
      || extras.ruleExplanation
      || extras.learningObjective
      || extras.explanation
      || extras.workedExamples?.length
      || extras.scenarioOrObservation
      || extras.activities?.length,
  );
  return hasContent ? extras : null;
}

export function isPracticalPePack(extras: DaytimeStagePackExtras | null | undefined, subjectType?: string | null): boolean {
  const mode = (extras?.subjectType || subjectType || "").toLowerCase();
  if (mode.includes("practical") || mode.includes("pe") || mode === "practical-pe") return true;
  const kinds = (extras?.activities ?? []).map((a) => a.kind.toLowerCase());
  return kinds.some((kind) =>
    kind.includes("drill")
    || kind.includes("movement")
    || kind.includes("physical")
    || kind.includes("practical")
    || kind.includes("pe"),
  );
}
