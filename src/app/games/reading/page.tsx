"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Button from "@/components/ui/Button";
import MascotReaction from "@/components/ui/MascotReaction";
import PremiumAccessGate from "@/components/subscriptions/PremiumAccessGate";
import RewardToast from "@/components/rewards/RewardToast";
import AITutorFeedback from "@/components/tutor/AITutorFeedback";
import GameSuccessBurst from "@/components/game/GameSuccessBurst";
import ContentMismatchFallback from "@/components/ContentMismatchFallback";
import { getReadingPassages, type ReadingPassage } from "@/lib/adaptive";
import { validateContentItem } from "@/lib/content_validator";
import { applyReadingFluencyAssessment, levelFromXp, processReadingAttempt } from "@/lib/progress";
import { ChildProfile, getProfile, hydrateActiveProfileFromServer, saveProfile, resolveCoachingPace } from "@/lib/store";
import { beginStudentTurn, endStudentTurn, getVoiceReaction, speakEncouragement, speakProfileFeedback, speakWithContext, stopVoicePlayback } from "@/lib/voice";
import { isUsageLocked, trackUsage } from "@/lib/screen_time";
import { fetchProfileHistory, getProfileHistory } from "@/lib/progress_data";
import { markQuestionCompleted } from "@/lib/question_history";
import { recordCoachInteraction } from "@/lib/coach/session-memory";
import { syncAttemptToServer } from "@/lib/server_sync";
import { fetchAssignedReadingBatch, resetAssignedContentCursor } from "@/lib/ai_content";
import { getTutorFeedbackPlan, speakTutorFeedback, hydrateCoachingMemoryFromServer } from "@/lib/tutor-voice";
import { playCorrectSound, playTryAgainSound } from "@/lib/game-sounds";
import { awardChildRewards } from "@/lib/child_wallet";
import {
  getReadingHintMessage,
  getReadingHintSpeech,
  getReadingTaskInstruction,
  getTutorLine,
} from "@/lib/tutorVoice";
import SmartCoachPanel from "@/components/coach/SmartCoachPanel";

const MIN_READING_QUESTIONS = 5;
const MAX_RECENT_READING_IDS = 24;

type ReadAloudScoringMode = "gentle" | "balanced" | "strict";
type ReadAloudTarget = "passage" | "question" | "answer";

const READ_ALOUD_TARGETS: ReadAloudTarget[] = ["passage", "question", "answer"];

const READ_ALOUD_FEEDBACK_THRESHOLDS: Record<ReadAloudScoringMode, { strong: number; developing: number }> = {
  gentle: { strong: 75, developing: 55 },
  balanced: { strong: 85, developing: 65 },
  strict: { strong: 92, developing: 75 },
};

function readAloudTargetLabel(target: ReadAloudTarget): string {
  if (target === "passage") return "Passage";
  if (target === "question") return "Question";
  return "Answer";
}

function readAloudTargetText(item: ReadingPassage, target: ReadAloudTarget): string {
  if (target === "passage") return item.passage;
  if (target === "question") return item.question;
  return item.answer;
}

function readAloudTargetInstruction(target: ReadAloudTarget): string {
  if (target === "passage") return "read the passage aloud";
  if (target === "question") return "read the question aloud";
  return "say the answer aloud";
}

function inferQuestionType(question: string): "literal" | "inference" {
  const q = question.toLowerCase();
  if (q.includes("why") || q.includes("how") || q.includes("think") || q.includes("purpose")) {
    return "inference";
  }
  return "literal";
}

function inferPassageLevel(passageId: string): number {
  const match = passageId.match(/read-(\d+)-/i);
  const parsed = Number(match?.[1] ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeReadingRetryId(passageId: string): string {
  return passageId.trim().toLowerCase().replace(/-fallback-\d+-\d+$/i, "");
}

function getTimestampNow(): number {
  return Date.now();
}

function ensureMinimumReadingQuestions(questions: ReadingPassage[], minCount = MIN_READING_QUESTIONS): ReadingPassage[] {
  if (questions.length >= minCount) return questions;
  if (!questions.length) return [];

  const filled = [...questions];
  let cloneIndex = 0;
  while (filled.length < minCount) {
    const source = questions[cloneIndex % questions.length];
    const iteration = Math.floor(cloneIndex / questions.length) + 1;
    filled.push({
      ...source,
      id: `${source.id}-fallback-${iteration}-${cloneIndex}`,
    });
    cloneIndex += 1;
  }
  return filled;
}

function shuffleReadingPassages(questions: ReadingPassage[]): ReadingPassage[] {
  const shuffled = [...questions];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function shuffleQuestionChoices(question: ReadingPassage): ReadingPassage {
  const uniqueChoices = Array.from(new Set(question.choices));
  const choicesWithAnswer = uniqueChoices.includes(question.answer)
    ? uniqueChoices
    : [...uniqueChoices, question.answer];
  const shuffledChoices = [...choicesWithAnswer];
  for (let i = shuffledChoices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
  }
  return {
    ...question,
    choices: shuffledChoices,
  };
}

function chooseFreshReadingQuestions(pool: ReadingPassage[], recentIds: string[], minCount = MIN_READING_QUESTIONS): ReadingPassage[] {
  if (!pool.length) return [];
  const recentSet = new Set(recentIds.map((id) => normalizeReadingRetryId(id)));
  const unseen = pool.filter((entry) => !recentSet.has(normalizeReadingRetryId(entry.id)));
  const source = unseen.length >= minCount ? unseen : pool;
  const chosen = shuffleReadingPassages(source).slice(0, minCount);
  return ensureMinimumReadingQuestions(chosen, minCount);
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lcsLength(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[rows - 1][cols - 1] ?? 0;
}

function estimateReadAloudAccuracy(expected: string, spoken: string): number {
  const expectedWords = normalizeWords(expected);
  const spokenWords = normalizeWords(spoken);
  if (!expectedWords.length || !spokenWords.length) return 0;
  const matchedInOrder = lcsLength(expectedWords, spokenWords);
  return Math.max(0, Math.min(100, Math.round((matchedInOrder / expectedWords.length) * 100)));
}

function applyReadAloudMode(rawScore: number, mode: ReadAloudScoringMode): number {
  if (mode === "gentle") {
    return Math.min(100, rawScore + 8);
  }
  if (mode === "strict") {
    return Math.max(0, rawScore - 6);
  }
  return rawScore;
}

function buildReadingSessionQuestions(staticPool: ReadingPassage[], assignedPool: ReadingPassage[], currentDifficulty: number): ReadingPassage[] {
  const unique = new Map<string, ReadingPassage>();
  for (const question of assignedPool) {
    unique.set(question.id, question);
  }
  for (const question of staticPool) {
    if (!unique.has(question.id)) {
      unique.set(question.id, question);
    }
  }

  // Adaptive balancing: guarantee at least one easier and one challenge item when possible.
  const easierPool = getReadingPassages(Math.max(1, currentDifficulty - 1));
  const challengePool = getReadingPassages(Math.min(10, currentDifficulty + 1));
  const hasEasier = Array.from(unique.values()).some((entry) => inferPassageLevel(entry.id) < currentDifficulty);
  const hasChallenge = Array.from(unique.values()).some((entry) => inferPassageLevel(entry.id) > currentDifficulty);

  if (!hasEasier) {
    const extraEasier = easierPool.find((entry) => !unique.has(entry.id));
    if (extraEasier) unique.set(extraEasier.id, extraEasier);
  }
  if (!hasChallenge) {
    const extraChallenge = challengePool.find((entry) => !unique.has(entry.id));
    if (extraChallenge) unique.set(extraChallenge.id, extraChallenge);
  }

  const pool = Array.from(unique.values());
  const selected = assignedPool.length > 0
    ? pool
    : shuffleReadingPassages(pool);

  return ensureMinimumReadingQuestions(selected.slice(0, MIN_READING_QUESTIONS));
}

type PersistedReadingState = {
  sessionQuestions: ReadingPassage[];
  sessionIndex: number;
  sessionMode?: "standard" | "retry_pack" | "completed_base" | "completed_retry" | "completed";
  sessionComplete?: boolean;
  sessionAttempts: number;
  sessionCorrect: number;
  retryPackMode?: boolean;
  contentSource: "assigned" | "static";
  contextKey: string;
  recentQuestionIds?: string[];
  readAloudMode?: ReadAloudScoringMode;
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{
    0: {
      transcript: string;
    };
    isFinal: boolean;
    length: number;
  }>;
  resultIndex: number;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function ReadingJourneyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedContentId = searchParams.get("contentId");
  const assignedAssignmentId = searchParams.get("assignmentId") ?? undefined;
  const requestedMode = searchParams.get("mode");
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const profileId = profile?.id ?? null;
  const [sessionQuestions, setSessionQuestions] = useState<ReadingPassage[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionMode, setSessionMode] = useState<"standard" | "retry_pack" | "completed_base" | "completed_retry">("standard");
  const [feedback, setFeedback] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [coachOpen, setCoachOpen] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [reaction, setReaction] = useState<{ mood: "happy" | "support" | "celebrate"; message: string } | null>(null);
  const [contentSource, setContentSource] = useState<"assigned" | "static">("static");
  const [assignmentLoadError, setAssignmentLoadError] = useState<string | null>(null);
  const [assignmentApplying, setAssignmentApplying] = useState(false);
  const [rewardToast, setRewardToast] = useState<{ points: number; message: string } | null>(null);
  const [tutorFeedback, setTutorFeedback] = useState("");
  const [showSuccessBurst, setShowSuccessBurst] = useState(false);
  const [readingVoiceEnabled, setReadingVoiceEnabled] = useState(true);
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionStartStats, setSessionStartStats] = useState<{ stars: number; xp: number; coins: number } | null>(null);
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [isListeningToChild, setIsListeningToChild] = useState(false);
  const [readAloudScore, setReadAloudScore] = useState<number | null>(null);
  const [readAloudTranscript, setReadAloudTranscript] = useState("");
  const [didReadAloudThisQuestion, setDidReadAloudThisQuestion] = useState(false);
  const [thisQuestionRequiresReadAloud, setThisQuestionRequiresReadAloud] = useState(false);
  const [thisQuestionReadAloudTarget, setThisQuestionReadAloudTarget] = useState<ReadAloudTarget>("answer");
  const [readAloudMode, setReadAloudMode] = useState<ReadAloudScoringMode>("gentle");
  const lastAutoReadRef = useRef<string | null>(null);
  const restoreAttemptedRef = useRef(false);
  const restoredFromStorageRef = useRef(false);
  const lastAutoSessionContextRef = useRef<string | null>(null);
  const completionWritebackKeyRef = useRef<string | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const sessionComplete = sessionMode === "completed_base" || sessionMode === "completed_retry";
  const retryPackMode = sessionMode === "retry_pack";
  const readToTutorSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const win = window as Window & {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(win.SpeechRecognition ?? win.webkitSpeechRecognition);
  }, []);
  const readAloudReadyToAnswer = didReadAloudThisQuestion || !thisQuestionRequiresReadAloud || !readToTutorSupported;

  const getResumeStateKey = (childId: string) => `starliz_reading_resume_${childId}`;

  useEffect(() => {
    void hydrateActiveProfileFromServer().then((serverProfile) => {
      const p = serverProfile ?? getProfile();
      if (!p) {
        router.replace("/onboarding");
        return;
      }
      const usageUpdated = trackUsage(p, 1);
      setProfile(usageUpdated);
      setReadingVoiceEnabled(usageUpdated.settings.voiceEnabled);
      setSessionStartStats({ stars: usageUpdated.stars, xp: usageUpdated.xp, coins: usageUpdated.coins });
      void hydrateCoachingMemoryFromServer(p.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileId) return;
    void fetchProfileHistory(profileId);
  }, [profileId]);

  const passagePool = useMemo(() => (profile ? getReadingPassages(profile.adaptive.readingDifficulty) : []), [profile]);
  const allReadingPassages = useMemo(() => {
    const byId = new Map<string, ReadingPassage>();
    for (const difficulty of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const entry of getReadingPassages(difficulty)) {
        const normalizedId = normalizeReadingRetryId(entry.id);
        if (!byId.has(normalizedId)) {
          byId.set(normalizedId, { ...entry, id: normalizedId });
        }
      }
    }
    return [...byId.values()];
  }, []);
  const weakReadingRetryIds = useMemo(() => {
    if (!profile) return [] as string[];
    const availableIds = new Set(allReadingPassages.map((entry) => normalizeReadingRetryId(entry.id)));
    const uniqueIds = new Set<string>();
    for (const weakId of profile.dailySubjectProgress.weakItems.reading) {
      const normalizedId = normalizeReadingRetryId(weakId);
      if (availableIds.has(normalizedId)) {
        uniqueIds.add(normalizedId);
      }
    }
    return [...uniqueIds];
  }, [allReadingPassages, profile]);
  const currentContextKey = useMemo(() => {
    if (!profile) return null;
    return [
      profile.id,
      profile.adaptive.readingDifficulty,
      assignedContentId ?? "",
      assignedAssignmentId ?? "",
    ].join(":");
  }, [assignedAssignmentId, assignedContentId, profile]);

  useEffect(() => {
    if (!profile || !passagePool.length || !currentContextKey || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(getResumeStateKey(profile.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedReadingState;
      const restoredMode = parsed.sessionMode === "completed" ? "completed_base" : (parsed.sessionMode
        ?? (parsed.sessionComplete ? "completed_base" : parsed.retryPackMode ? "retry_pack" : "standard"));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecentQuestionIds(Array.isArray(parsed.recentQuestionIds) ? parsed.recentQuestionIds : []);
      setReadAloudMode(parsed.readAloudMode ?? "gentle");
      if ((parsed.contentSource ?? "static") === "static") {
        const currentDifficulty = profile.adaptive.readingDifficulty;
        const allowedIds = new Set<string>([
          ...getReadingPassages(Math.max(1, currentDifficulty - 1)).map((entry) => normalizeReadingRetryId(entry.id)),
          ...getReadingPassages(currentDifficulty).map((entry) => normalizeReadingRetryId(entry.id)),
          ...getReadingPassages(Math.min(10, currentDifficulty + 1)).map((entry) => normalizeReadingRetryId(entry.id)),
        ]);
        const hasStaleIds = (parsed.sessionQuestions ?? []).some((entry) => !allowedIds.has(normalizeReadingRetryId(entry.id)));
        if (hasStaleIds) return;
      }
      // Don't restore a completed session — let auto-start launch a fresh one instead
      if (parsed.contextKey !== currentContextKey || !parsed.sessionQuestions?.length || restoredMode === "completed_base" || restoredMode === "completed_retry") return;
      setSessionQuestions(parsed.sessionQuestions);
      setSessionIndex(Math.max(0, Math.min(parsed.sessionIndex ?? 0, parsed.sessionQuestions.length - 1)));
      setSessionMode(restoredMode);
      setSessionAttempts(parsed.sessionAttempts ?? 0);
      setSessionCorrect(parsed.sessionCorrect ?? 0);
      setContentSource(parsed.contentSource ?? "static");
      setHintLevel(0);
      setCoachOpen(false);
      setQuestionStartedAt(Date.now());
      lastAutoReadRef.current = null;
      lastAutoSessionContextRef.current = currentContextKey;
      restoredFromStorageRef.current = true;
    } catch {
      // Ignore malformed resume data.
    }
  }, [currentContextKey, passagePool.length, profile]);

  useEffect(() => {
    if (!profile || !currentContextKey || typeof window === "undefined") return;
    const payload: PersistedReadingState = {
      sessionQuestions,
      sessionIndex,
      sessionMode,
      sessionComplete,
      sessionAttempts,
      sessionCorrect,
      retryPackMode,
      contentSource,
      contextKey: currentContextKey,
      recentQuestionIds,
      readAloudMode,
    };
    window.sessionStorage.setItem(getResumeStateKey(profile.id), JSON.stringify(payload));
  }, [contentSource, currentContextKey, profile, readAloudMode, recentQuestionIds, retryPackMode, sessionAttempts, sessionComplete, sessionCorrect, sessionIndex, sessionMode, sessionQuestions]);

  useEffect(() => {
    if (!profile || !sessionComplete || typeof window === "undefined") return;
    window.sessionStorage.removeItem(getResumeStateKey(profile.id));
  }, [profile, sessionComplete]);

  useEffect(() => {
    if (!assignedAssignmentId || !sessionComplete) return;
    const writebackKey = `${assignedAssignmentId}:${sessionMode}`;
    if (completionWritebackKeyRef.current === writebackKey) return;
    completionWritebackKeyRef.current = writebackKey;

    void fetch(`/api/assignments/${encodeURIComponent(assignedAssignmentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "completed" }),
    }).catch(() => {
      completionWritebackKeyRef.current = null;
    });
  }, [assignedAssignmentId, sessionComplete, sessionMode]);

  useEffect(() => {
    if (assignedAssignmentId || assignedContentId) {
      resetAssignedContentCursor("reading", assignedContentId, assignedAssignmentId);
    }
  }, [assignedContentId, assignedAssignmentId]);

  const item = useMemo(() => sessionQuestions[sessionIndex] ?? null, [sessionQuestions, sessionIndex]);

  const usingAssignedContent = contentSource === "assigned";

  const readingDifficulty = profile?.adaptive.readingDifficulty ?? 1;
  const literacySupportMode = profile?.literacySupport?.mode ?? "balanced";
  const spellingSupportActive = literacySupportMode === "spelling_support";
  const readingSupportActive = literacySupportMode === "reading_support";
  const hintMessage = useMemo(() => {
    if (!item || hintLevel === 0) return "";
    if (hintLevel === 1) return getReadingHintMessage(1);
    if (hintLevel === 2) {
      // Find the passage sentence most relevant to the question without naming the answer
      const sentences = item.passage.match(/[^.!?]+[.!?]+/g) ?? [item.passage];
      const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "of", "for", "is", "was", "it", "he", "she", "so"]);
      const questionWords = item.question.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
      let best = sentences[0] ?? item.passage;
      let bestScore = 0;
      for (const s of sentences) {
        const lower = s.toLowerCase();
        const score = questionWords.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      return getReadingHintMessage(2, best.trim());
    }
    return getReadingHintMessage(3);
  }, [hintLevel, item]);

  const startReadingSession = useCallback(async (currentProfile: ChildProfile, preferAssigned = false, retryIds: string[] = []): Promise<void> => {
    const reportAssignmentFailure = async (reason: string, details?: Record<string, unknown>) => {
      try {
        await fetch("/api/student/assignment-load-failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            assignmentId: assignedAssignmentId,
            contentId: assignedContentId,
            subject: "reading",
            skillFocus: null,
            yearGroup: currentProfile.yearGroup ?? null,
            keyStage: currentProfile.keyStageLevel ?? null,
            reason,
            details,
          }),
        });
      } catch {
        // Ignore telemetry failures.
      }
    };

    const upperSecondary = (() => {
      const parsed = Number(String(currentProfile.yearGroup ?? "").match(/\d+/)?.[0] ?? "0");
      return Number.isFinite(parsed) && parsed >= 10;
    })();
    const supportOverrideRequested = searchParams.get("support") === "1" || searchParams.get("intervention") === "1";

    setAssignmentLoadError(null);
    let assignedItems: ReadingPassage[] = [];
    if (preferAssigned && (assignedAssignmentId || assignedContentId)) {
      setAssignmentApplying(true);
      const batch = await fetchAssignedReadingBatch(assignedContentId ?? "", assignedAssignmentId);
      setAssignmentApplying(false);
      assignedItems = batch?.items ?? [];

      if (!assignedItems.length) {
        setAssignmentLoadError("Assigned content could not be loaded");
        await reportAssignmentFailure("assigned_content_missing", {
          requestedMode,
          assignmentId: assignedAssignmentId ?? null,
          contentId: assignedContentId ?? null,
        });
        return;
      }

      const supportTag = `${batch?.content?.topic ?? ""} ${batch?.content?.skillFocus ?? ""} ${String(batch?.content?.metadata?.curriculumPathway ?? "")}`.toLowerCase();
      const explicitSupportAssignment = /intervention|support|catch-?up|foundation/.test(supportTag);
      if (upperSecondary && !explicitSupportAssignment && !supportOverrideRequested) {
        const hasPrimaryLevelPassage = assignedItems.some((entry) => /mia has a red kite/i.test(entry.passage) || /^read-1-/i.test(entry.id));
        if (hasPrimaryLevelPassage) {
          setAssignmentLoadError("Assigned content could not be loaded");
          await reportAssignmentFailure("upper_secondary_received_primary_reading", {
            assignmentId: assignedAssignmentId ?? null,
            contentId: assignedContentId ?? null,
            requestedMode,
            samplePassageId: assignedItems[0]?.id ?? null,
          });
          return;
        }
      }
    }

    const baseQuestions = buildReadingSessionQuestions(passagePool, assignedItems, currentProfile.adaptive.readingDifficulty);
    const normalizedRetryIds = [...new Set(retryIds.map((id) => normalizeReadingRetryId(id)))];
    const retryQuestions = normalizedRetryIds.length
      ? allReadingPassages.filter((entry) => normalizedRetryIds.includes(normalizeReadingRetryId(entry.id)))
      : [];
    const staticGuardedQuestions = upperSecondary && !supportOverrideRequested && assignedItems.length === 0
      ? baseQuestions.filter((entry) => inferPassageLevel(entry.id) >= 7)
      : baseQuestions;
    const questions = retryQuestions.length
      ? shuffleReadingPassages(retryQuestions)
      : chooseFreshReadingQuestions(staticGuardedQuestions.length ? staticGuardedQuestions : baseQuestions, recentQuestionIds, MIN_READING_QUESTIONS);
    if (normalizedRetryIds.length && !retryQuestions.length) {
      setSessionMode("standard");
      setFeedback("Retry pack refreshed. Some older weak items are no longer available, so we loaded balanced practice.");
    }
    if (!questions.length) return;
    const questionsWithShuffledChoices = questions.map((entry) => shuffleQuestionChoices(entry));

    setRecentQuestionIds((prev) => {
      const merged = [...prev, ...questionsWithShuffledChoices.map((entry) => normalizeReadingRetryId(entry.id))];
      const deduped = Array.from(new Set(merged));
      return deduped.slice(-MAX_RECENT_READING_IDS);
    });

    setSessionQuestions(questionsWithShuffledChoices);
    setSessionIndex(0);
    setSessionMode(retryQuestions.length ? "retry_pack" : "standard");
    setSessionAttempts(0);
    setSessionCorrect(0);
    setSessionStartStats({ stars: currentProfile.stars, xp: currentProfile.xp, coins: currentProfile.coins });
    setContentSource(assignedItems.length ? "assigned" : "static");
    const readingSupportMode = currentProfile.literacySupport?.mode === "reading_support";
    setHintLevel(readingSupportMode ? 1 : 0);
    setCoachOpen(readingSupportMode);
    setQuestionStartedAt(performance.now());
    lastAutoReadRef.current = null;
    setReadAloudScore(null);
    setReadAloudTranscript("");
    setDidReadAloudThisQuestion(false);
    setThisQuestionRequiresReadAloud(false);
    setThisQuestionReadAloudTarget("answer");
  }, [allReadingPassages, assignedAssignmentId, assignedContentId, passagePool, recentQuestionIds, requestedMode, searchParams]);

  useEffect(() => {
    if (!item || !profile) return;
    if (profile.literacySupport?.mode === "reading_support") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHintLevel((level) => Math.max(level, 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, profile]);

  function stopReadAloudAssessment(): void {
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    setIsListeningToChild(false);
  }

  function startReadAloudAssessment(): void {
    if (!item) return;
    if (typeof window === "undefined") return;
    beginStudentTurn("reading_read_aloud_start");

    const win = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setFeedback("Read-to-tutor is not supported on this browser yet. Please use Chrome or Edge.");
      setDidReadAloudThisQuestion(true);
      return;
    }

    if (isListeningToChild) {
      stopReadAloudAssessment();
      return;
    }

    const recognition = new RecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    let transcript = "";
    setReadAloudTranscript("");
    setReadAloudScore(null);
    setIsListeningToChild(true);

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i += 1) {
        combined += `${event.results[i][0].transcript} `;
      }
      transcript = combined.trim();
      setReadAloudTranscript(transcript);
    };

    // @ts-expect-error SpeechRecognition.onerror event type varies across browser typings
    recognition.onerror = (event: { error: string }) => {
      endStudentTurn("reading_read_aloud_error");
      setIsListeningToChild(false);
      speechRecognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "audio-capture") {
        setFeedback("Microphone access was blocked. Check your browser settings, then choose your answer.");
        setDidReadAloudThisQuestion(true);
      } else if (event.error === "no-speech") {
        setFeedback("No speech detected. Make sure your microphone is on and try again, or choose your answer.");
        setDidReadAloudThisQuestion(true);
      } else {
        setFeedback("I couldn't hear clearly. You can still choose your answer.");
        setDidReadAloudThisQuestion(true);
      }
    };

    recognition.onend = () => {
      endStudentTurn("reading_read_aloud_end");
      setIsListeningToChild(false);
      speechRecognitionRef.current = null;
      if (!transcript.trim()) {
        setFeedback("No speech was captured. Check your mic or tap an answer.");
        setDidReadAloudThisQuestion(true);
        return;
      }

      const targetText = readAloudTargetText(item, thisQuestionReadAloudTarget);
      const targetScore = applyReadAloudMode(
        estimateReadAloudAccuracy(targetText, transcript),
        readAloudMode,
      );
      setReadAloudScore(targetScore);
      setDidReadAloudThisQuestion(true);

      // Update fluency profile from whichever target was required.
      if (!profile) return;
      const nextProfile = applyReadingFluencyAssessment(profile, targetScore);
      setProfile(nextProfile);
      saveProfile(nextProfile);

      if (thisQuestionReadAloudTarget === "answer") {
        const choices = item.choices;
        let bestChoice = "";
        let bestScore = 0;
        for (const choice of choices) {
          const score = estimateReadAloudAccuracy(choice, transcript);
          if (score > bestScore) {
            bestScore = score;
            bestChoice = choice;
          }
        }

        const directCorrectScore = applyReadAloudMode(
          estimateReadAloudAccuracy(item.answer, transcript),
          readAloudMode,
        );
        const isCorrectChoice = bestChoice === item.answer;

        // If the spoken response matches the correct answer strongly, submit it directly.
        if (directCorrectScore >= 45) {
          const clarityLabel = targetScore >= 75 ? "Very clear!" : targetScore >= 50 ? "Good reading." : "Keep practising your clarity.";
          setTutorFeedback(`Correct. I heard the right answer. Reading clarity: ${targetScore}%. ${clarityLabel}`);
          void choose(item.answer);
        } else if (bestScore >= 40 && bestChoice) {
          if (isCorrectChoice) {
            const clarityLabel = targetScore >= 75 ? "Very clear!" : targetScore >= 50 ? "Good reading." : "Keep practising your clarity.";
            setTutorFeedback(`Correct. I heard "${bestChoice}". Reading clarity: ${targetScore}%. ${clarityLabel}`);
            void choose(bestChoice);
          } else {
            setTutorFeedback(`I heard "${bestChoice}". That is not the correct answer.`);
            setFeedback(`Heard: "${transcript}". Tap the answer you mean.`);
          }
        } else if (bestScore >= 20 && bestChoice) {
          setTutorFeedback(`I think I heard "${bestChoice}" (${bestScore}% match). Tap it to confirm or choose another.`);
          setFeedback(`Heard: "${transcript}". Tap the answer you mean.`);
        } else {
          setTutorFeedback(`I could not catch a clear answer. Reading clarity: ${targetScore}%.`);
          setFeedback(`Heard: "${transcript || "(nothing)"}". Tap the correct answer.`);
        }
      } else {
        const thresholds = READ_ALOUD_FEEDBACK_THRESHOLDS[readAloudMode];
        const targetLabel = readAloudTargetLabel(thisQuestionReadAloudTarget).toLowerCase();
        if (targetScore >= thresholds.strong) {
          setTutorFeedback(`Great ${targetLabel} reading: ${targetScore}% match.`);
        } else if (targetScore >= thresholds.developing) {
          setTutorFeedback(`Good ${targetLabel} reading: ${targetScore}% match. Try to read a little more clearly.`);
        } else {
          setTutorFeedback(`Developing ${targetLabel} reading: ${targetScore}% match. Slow down and try again next time.`);
        }
        setFeedback(`Read-aloud check complete for ${targetLabel}. Now choose your answer.`);
      }
    };

    recognition.start();
  }

  useEffect(() => () => {
    speechRecognitionRef.current?.stop();
  }, []);

  function advanceToNextQuestion(): void {
    setSessionIndex((prev) => Math.min(prev + 1, Math.max(0, sessionQuestions.length - 1)));
    setHintLevel(0);
    setCoachOpen(false);
    // eslint-disable-next-line react-hooks/purity
    setQuestionStartedAt(Date.now());
    lastAutoReadRef.current = null;
    setReadAloudScore(null);
    setReadAloudTranscript("");
    setDidReadAloudThisQuestion(false);
    setThisQuestionRequiresReadAloud(false);
    setThisQuestionReadAloudTarget("answer");
  }

  useEffect(() => {
    if (!profile || !passagePool.length) return;
    if (restoredFromStorageRef.current) {
      restoredFromStorageRef.current = false;
      return;
    }
    if (currentContextKey && lastAutoSessionContextRef.current === currentContextKey && sessionQuestions.length) return;
    lastAutoSessionContextRef.current = currentContextKey;
    void startReadingSession(profile, true, []);
  }, [currentContextKey, passagePool.length, profile, sessionQuestions.length, startReadingSession]);

  const sessionRewards = useMemo(() => {
    if (!profile || !sessionStartStats) return { stars: 0, xp: 0, coins: 0 };
    return {
      stars: Math.max(0, profile.stars - sessionStartStats.stars),
      xp: Math.max(0, profile.xp - sessionStartStats.xp),
      coins: Math.max(0, profile.coins - sessionStartStats.coins),
    };
  }, [profile, sessionStartStats]);

  const readingMastery = useMemo(() => {
    if (!profile) return [] as Array<{ tag: string; accuracy: number }>;
    return Object.entries(profile.masteryTags.reading)
      .map(([tag, stats]) => ({ tag, accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3);
  }, [profile]);

  function readCurrentQuestion(force = false): void {
    if (!item || (!readingVoiceEnabled && !force)) return;
    const skipPassage = thisQuestionRequiresReadAloud && thisQuestionReadAloudTarget === "passage";
    const skipQuestion = thisQuestionRequiresReadAloud && thisQuestionReadAloudTarget === "question";

    const speakClosingPrompt = () => {
      if (!sessionComplete) {
        if (thisQuestionRequiresReadAloud) {
          const instruction = getReadingTaskInstruction(readAloudTargetInstruction(thisQuestionReadAloudTarget));
          setTutorFeedback(instruction);
          void speakEncouragement(instruction);
        } else {
          const instruction = getTutorLine({
            subject: "reading",
            mode: "choice",
            purchasedVoice: profile?.settings.voiceStyle,
            includeEncouragement: true,
          });
          setTutorFeedback(instruction);
          void speakEncouragement(instruction);
        }
      }
    };

    const speakQuestionIfNeeded = () => {
      if (skipQuestion) {
        speakClosingPrompt();
        return;
      }
      void speakWithContext(item.question, "reading_question", {
        onEnd: speakClosingPrompt,
      });
    };

    // Do not read aloud the section assigned to the student for read-to-tutor.
    if (skipPassage) {
      speakQuestionIfNeeded();
      return;
    }

    void speakWithContext(item.passage, "reading_passage", {
      onEnd: speakQuestionIfNeeded,
    });
  }

  useEffect(() => {
    if (!item || sessionComplete) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadAloudScore(null);
    setReadAloudTranscript("");
    setDidReadAloudThisQuestion(false);
    const requiresReadAloud = readToTutorSupported && Math.random() < 0.5;
    const randomTarget = READ_ALOUD_TARGETS[Math.floor(Math.random() * READ_ALOUD_TARGETS.length)] ?? "answer";
    setThisQuestionRequiresReadAloud(requiresReadAloud);
    setThisQuestionReadAloudTarget(randomTarget);
    const instruction = requiresReadAloud
      ? getReadingTaskInstruction(readAloudTargetInstruction(randomTarget))
      : getTutorLine({
        subject: "reading",
        purchasedVoice: profile?.settings.voiceStyle,
      });
    setFeedback(instruction);
    setTutorFeedback(instruction);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, sessionComplete]);

  useEffect(() => {
    if (!item || !readingVoiceEnabled) return;
    if (lastAutoReadRef.current === item.id) return;
    lastAutoReadRef.current = item.id;
    const timer = window.setTimeout(() => {
      readCurrentQuestion();
    }, 450);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, readingVoiceEnabled]);

  function toggleReadingVoice(): void {
    if (!profile) return;
    const nextEnabled = !readingVoiceEnabled;
    const updated: ChildProfile = {
      ...profile,
      settings: {
        ...profile.settings,
        voiceEnabled: nextEnabled,
      },
    };
    setReadingVoiceEnabled(nextEnabled);
    setProfile(updated);
    saveProfile(updated);
    if (nextEnabled) {
      window.setTimeout(() => readCurrentQuestion(true), 100);
    } else {
      stopVoicePlayback();
    }
  }

  function continueToNextLevel(): void {
    if (!profile) return;
    const currentLevel = Math.max(1, profile.subjectLevels?.reading ?? profile.adaptive.readingDifficulty ?? 1);
    const nextLevel = Math.min(10, currentLevel + 1);
    if (nextLevel === currentLevel) {
      // Already at max — just start a fresh session at the same level
      restoredFromStorageRef.current = false;
      void startReadingSession(profile, true);
      return;
    }
    const advancedProfile: ChildProfile = {
      ...profile,
      adaptive: {
        ...profile.adaptive,
        readingDifficulty: nextLevel,
      },
      subjectLevels: {
        ...profile.subjectLevels,
        reading: nextLevel,
      },
    };
    setProfile(advancedProfile);
    saveProfile(advancedProfile);
    restoredFromStorageRef.current = false;
    void startReadingSession(advancedProfile, true);
  }

  function makeItEasier() {
    setHintLevel((level) => {
      const next = Math.min(level + 1, 3);
      // Speak the upcoming hint aloud after state update
      if (item) {
        const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "of", "for", "is", "was", "it", "he", "she", "so"]);
        let excerpt = "";
        if (next === 2) {
          const sentences = item.passage.match(/[^.!?]+[.!?]+/g) ?? [item.passage];
          const questionWords = item.question.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
          let best = sentences[0] ?? item.passage;
          let bestScore = 0;
          for (const s of sentences) {
            const lower = s.toLowerCase();
            const score = questionWords.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
            if (score > bestScore) { bestScore = score; best = s; }
          }
          excerpt = best.trim();
        }
        void speakWithContext(getReadingHintSpeech(next, excerpt), "reading_question");
      }
      return next;
    });
  }

  async function choose(choice: string) {
    if (!profile || !item) return;
    if (!readAloudReadyToAnswer) {
      setFeedback(`Please ${readAloudTargetInstruction(thisQuestionReadAloudTarget)} first, then choose your answer.`);
      setCoachOpen(true);
      return;
    }
    if (isUsageLocked(profile)) {
      setFeedback("Screen-time limit reached. Ask parent to unlock more time.");
      return;
    }
    const isCorrect = choice === item.answer;
    const questionType = inferQuestionType(item.question);
    // eslint-disable-next-line react-hooks/purity
    const responseMs = questionStartedAt > 0 ? Math.max(0, performance.now() - questionStartedAt) : 0;
    const prevLevel = levelFromXp(profile.xp);
    const result = processReadingAttempt(profile, isCorrect, item.id, {
      hintsUsed: hintLevel,
      responseMs,
      supportTag: questionType,
      masteryTag: questionType,
      weakItemKey: normalizeReadingRetryId(item.id),
      difficultyBand: inferPassageLevel(item.id) < profile.adaptive.readingDifficulty ? "easier" : inferPassageLevel(item.id) > profile.adaptive.readingDifficulty ? "challenge" : "core",
    });
    const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
    const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
    const attemptPayload = {
      studentId: profile.id,
      subject: "reading",
      skillFocus: questionType,
      contentId: attemptContentId,
      assignmentId: attemptAssignmentId,
      questionText: item.question,
      answerGiven: choice,
      correctAnswer: item.answer,
      correct: isCorrect,
      responseTimeMs: Math.round(responseMs),
      hintsUsed: hintLevel,
      difficulty: profile.adaptive.readingDifficulty,
    } as const;
    if (attemptAssignmentId || attemptContentId) {
      await syncAttemptToServer(attemptPayload);
    } else {
      void syncAttemptToServer(attemptPayload);
    }
    let awardedProfile: Awaited<ReturnType<typeof awardChildRewards>>;
    try {
      awardedProfile = await awardChildRewards({
        childId: profile.id,
        source: "reading",
        coins: result.rewardDelta.coins,
        xp: result.rewardDelta.xp,
        stars: result.rewardDelta.stars,
        note: isCorrect ? "Reading answer correct." : "Reading answer incorrect.",
        difficulty: profile.adaptive.readingDifficulty,
        activityName: "Reading Journey",
        profile: result.profile,
      });
    } catch {
      awardedProfile = result.profile;
      saveProfile(result.profile);
    }
    setProfile(awardedProfile);
    setSessionAttempts((prev) => prev + 1);
    const nextLevel = levelFromXp(awardedProfile.xp);
    const today = new Date().toISOString().slice(0, 10);
    const dailyProgress = getProfileHistory(awardedProfile).filter((event) => event.ts.slice(0, 10) === today).length;
    if (isCorrect) {
      setSessionCorrect((prev) => prev + 1);
      const rewardSuffix = result.surpriseReward.awarded ? ` ${getVoiceReaction("reward-earned")} ${result.surpriseReward.message}` : "";
      speakProfileFeedback(awardedProfile, "correct", `${getVoiceReaction("daily-quest")} ${dailyProgress}/${awardedProfile.dailyGoal}. ${nextLevel > prevLevel ? getVoiceReaction("level-up") : ""}${rewardSuffix}`);
      setReaction({ mood: nextLevel > prevLevel || result.surpriseReward.awarded ? "celebrate" : "happy", message: result.surpriseReward.awarded ? result.surpriseReward.message : nextLevel > prevLevel ? "Reading level up! Amazing focus!" : "Wonderful reading! Keep flowing." });
      recordCoachInteraction({
        questionText: item.question,
        subject: "reading",
        skillFocus: questionType,
        hintsUsed: hintLevel,
        correct: true,
        responseTimeMs: Math.round(responseMs),
        timestamp: getTimestampNow(),
      });
      const improved = result.promotedDifficulty || nextLevel > prevLevel;
      const tutorPlan = getTutorFeedbackPlan({
        childId: profile.id,
        subject: "reading",
        correct: true,
        improvement: improved,
        answer: item.answer,
        response: choice,
        questionType,
        consecutiveCorrect: sessionCorrect + 1,
        consecutiveMistakes: 0,
        responseMs,
        usedHint: hintLevel > 0,
        coachingStylePreference: resolveCoachingPace("reading", profile.settings.subjectCoachingStyles),
      });
      setTutorFeedback(tutorPlan.text);
      await speakWithContext(`Great reading. The answer is: ${item.answer}.`, "reading_question");
      if (profile.settings.sfxEnabled) {
        playCorrectSound();
      }
      setShowSuccessBurst(true);
      window.setTimeout(() => setShowSuccessBurst(false), 900);

      if (improved) {
        void awardChildRewards({
          childId: profile.id,
          source: "reading",
          coins: 20,
          note: "Progress reward for stronger reading comprehension.",
          reason: "accuracy_improved",
          difficulty: awardedProfile.adaptive.readingDifficulty,
          activityName: "Reading Progress Bonus",
          profile: awardedProfile,
        })
          .then((bonusProfile) => {
            setProfile(bonusProfile);
            setRewardToast({ points: 20, message: "Progress reward for stronger reading comprehension." });
            window.setTimeout(() => setRewardToast(null), 2400);
          })
          .catch(() => undefined);
      }
    } else {
      speakProfileFeedback(awardedProfile, "wrong");
      setReaction({ mood: "support", message: "You are learning. Read it once more and try again." });
      recordCoachInteraction({
        questionText: item.question,
        subject: "reading",
        skillFocus: questionType,
        hintsUsed: hintLevel + 1,
        correct: false,
        responseTimeMs: Math.round(responseMs),
        timestamp: getTimestampNow(),
      });
      setHintLevel((level) => Math.min(level + 1, 3));
      const tutorPlan = getTutorFeedbackPlan({
        childId: profile.id,
        subject: "reading",
        correct: false,
        answer: item.answer,
        response: choice,
        questionType,
        consecutiveCorrect: 0,
        consecutiveMistakes: Math.max(1, hintLevel + 1),
        responseMs,
        usedHint: true,
        coachingStylePreference: resolveCoachingPace("reading", profile.settings.subjectCoachingStyles),
      });
      setTutorFeedback(tutorPlan.text);
      speakTutorFeedback(tutorPlan);
      if (profile.settings.sfxEnabled) {
        playTryAgainSound();
      }
    }
    setFeedback(isCorrect ? `Excellent reading!${result.promotedDifficulty ? " Difficulty increased!" : ""}${result.surpriseReward.awarded ? ` ${result.surpriseReward.message}` : ""}` : "Good try. Read carefully and try another passage.");
    if (isCorrect) {
      markQuestionCompleted({
        childId: profile.id,
        activity: "reading",
        level: profile.adaptive.readingDifficulty,
        questionId: item.id,
      });
    }

    if (sessionIndex >= sessionQuestions.length - 1) {
      setSessionMode(retryPackMode ? "completed_retry" : "completed_base");
      setFeedback(
        isCorrect
          ? "Session complete. Continue to the next level or go to dashboard."
          : "Session complete. Great effort today. Continue to the next level or go to dashboard."
      );
    } else {
      window.setTimeout(() => {
        advanceToNextQuestion();
      }, isCorrect ? 300 : 900);
    }
  }

  if (!profile) return <main className="min-h-screen bg-background" />;

  if (item) {
    const contentValidation = validateContentItem(item as Record<string, unknown>, "reading");
    if (!contentValidation.valid) {
      return <ContentMismatchFallback subject="Reading" message={contentValidation.error ?? "This activity does not match Reading."} />;
    }
  }

  if (assignmentLoadError && !item) {
    return (
      <PremiumAccessGate>
        <>
          <Navbar />
          <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
          <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-10">
            <div className="w-full rounded-3xl border border-rose-200 bg-white p-6 shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-600">Content Load Error</p>
              <h1 className="mt-3 text-2xl font-black text-slate-950">Assigned content could not be loaded</h1>
              <p className="mt-2 text-sm text-slate-600">We could not open this assignment safely. Please return to the dashboard and try again later.</p>
              <div className="mt-5">
                <Link href="/dashboard" className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
                  Return to dashboard
                </Link>
              </div>
            </div>
          </section>
          </main>
        </>
      </PremiumAccessGate>
    );
  }

  if ((!item && assignmentApplying) || !item) {
    return (
      <PremiumAccessGate>
        <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
          <Navbar />
          <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-4 py-10">
            <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Preparing Session</p>
              <h1 className="mt-3 text-2xl font-black text-slate-950">Loading your reading assignment...</h1>
              <p className="mt-2 text-sm text-slate-600">Please wait while we fetch your content.</p>
            </div>
          </section>
        </main>
      </PremiumAccessGate>
    );
  }

  return (
    <PremiumAccessGate>
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-100/70 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {showSuccessBurst ? <GameSuccessBurst /> : null}
        {rewardToast ? <RewardToast points={rewardToast.points} message={rewardToast.message} /> : null}

        <section className="overflow-hidden rounded-4xl border border-white/70 bg-white/85 shadow-[0_28px_80px_rgba(72,93,165,0.16)] backdrop-blur">
          <div className="border-b border-slate-200/70 bg-linear-to-r from-slate-950 via-violet-950 to-blue-900 px-5 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                  Reading Journey
                </p>
                <h1 className="mt-2 font-heading text-3xl font-black leading-tight sm:text-4xl">
                  Read, understand, and grow.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
                  Short comprehension practice with focused questions, coach support,
                  and rewards for careful reading.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/15 bg-white/10 p-3 text-center shadow-2xl">
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Stars</p>
                  <p className="mt-1 text-2xl font-black">{profile.stars}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-100">XP</p>
                  <p className="mt-1 text-2xl font-black">{profile.xp}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Coins</p>
                  <p className="mt-1 text-2xl font-black">{profile.coins}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-black text-violet-800">
                    Reading level {readingDifficulty}/10
                  </span>
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">
                    Target {profile.dailySubjectProgress.completed.reading}/{profile.dailySubjectProgress.targets.reading}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${usingAssignedContent ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700"}`}>
                    Source: {usingAssignedContent ? "Assignment Library" : "Static"}
                  </span>
                  {requestedMode === "literature" ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Literature mode</span>
                  ) : null}
                  {readingSupportActive ? (
                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">Reading support active</span>
                  ) : null}
                  {spellingSupportActive ? (
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">Spelling catch-up active</span>
                  ) : null}
                  {retryPackMode ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Retry Pack</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleReadingVoice}
                    className={`rounded-full px-3 py-1 text-xs font-black transition ${
                      readingVoiceEnabled
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Voice {readingVoiceEnabled ? "On" : "Off"}
                  </button>
                </div>

                <div className="mt-6 rounded-3xl bg-linear-to-br from-slate-950 to-violet-950 p-5 text-white shadow-inner">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                    Passage
                  </p>
                  <p className="mt-4 rounded-2xl bg-white/10 p-5 text-lg leading-9 text-white">
                    {item.passage}
                  </p>
                </div>

                <div className="mt-5 rounded-3xl border border-violet-100 bg-violet-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                    Question
                  </p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-violet-500">
                    {sessionComplete ? "Session complete" : `Question ${Math.min(sessionIndex + 1, sessionQuestions.length)} of ${sessionQuestions.length}`}
                  </p>
                  {!sessionComplete && thisQuestionRequiresReadAloud ? (
                    <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${readAloudReadyToAnswer ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {readAloudReadyToAnswer
                        ? `${readAloudTargetLabel(thisQuestionReadAloudTarget)} read aloud complete`
                        : `${readAloudTargetLabel(thisQuestionReadAloudTarget)} read aloud required`}
                    </p>
                  ) : null}
                  <h2 className="mt-2 font-heading text-2xl font-black leading-tight text-slate-950">
                    {item.question}
                  </h2>
                </div>

                {hintMessage ? (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    {hintMessage}
                  </p>
                ) : null}

                <div className="mt-5 grid gap-3">
                  {item.choices.map((choice, index) => (
                    <Button
                      key={choice}
                      variant="secondary"
                      className="flex w-full items-center justify-start gap-3 px-5 py-4 text-left"
                      onClick={() => choose(choice)}
                      disabled={!readAloudReadyToAnswer || sessionComplete}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 text-sm font-black">
                        {index + 1}
                      </span>
                      <span>{choice}</span>
                    </Button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Button className="w-full" variant="secondary" onClick={() => readCurrentQuestion()} disabled={!readingVoiceEnabled}>Read aloud</Button>
                  <Button className="w-full" variant="secondary" onClick={startReadAloudAssessment}>
                    {isListeningToChild ? "Stop reading check" : "Read to tutor"}
                  </Button>
                  <Button className="w-full" variant="accent" onClick={() => setCoachOpen((open) => !open)}>Coach</Button>
                  <Button className="w-full" variant="secondary" onClick={makeItEasier}>Make it easier</Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      advanceToNextQuestion();
                    }}
                    disabled={sessionComplete || sessionIndex >= sessionQuestions.length - 1}
                  >
                    Try Another
                  </Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      const retryIds = weakReadingRetryIds;
                      if (!retryIds.length) return;
                      void startReadingSession(profile, true, retryIds);
                    }}
                    disabled={sessionMode === "completed_retry" || !weakReadingRetryIds.length}
                  >
                    Retry Weak Pack ({weakReadingRetryIds.length})
                  </Button>
                  <Link href="/dashboard" className="block"><Button className="w-full" variant="secondary">Dashboard</Button></Link>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Read-to-tutor scoring</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(["gentle", "balanced", "strict"] as ReadAloudScoringMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setReadAloudMode(mode)}
                        className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                          readAloudMode === mode
                            ? "bg-violet-600 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {mode[0].toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {readAloudScore !== null || readAloudTranscript ? (
                  <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                    {readAloudScore !== null ? <p className="m-0 font-black">Read-to-tutor score: {readAloudScore}%</p> : null}
                    {readAloudTranscript ? <p className="m-0 mt-1">Transcript: {readAloudTranscript}</p> : null}
                  </div>
                ) : null}

                {sessionComplete ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="m-0 font-black">Session complete</p>
                    <p className="m-0 mt-1 font-semibold">Rewards: +{sessionRewards.stars} stars, +{sessionRewards.xp} XP, +{sessionRewards.coins} coins</p>
                    <p className="m-0 mt-1 font-semibold">Top mastery: {readingMastery.map((entry) => `${entry.tag} (${entry.accuracy}%)`).join(", ") || "Building now"}</p>
                    <p className="m-0 mt-1 font-semibold">Next suggestion: {profile.adaptive.nextBestActivity}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button variant="accent" className="w-full" onClick={continueToNextLevel}>
                        {(profile.subjectLevels?.reading ?? profile.adaptive.readingDifficulty ?? 1) >= 10
                          ? "Play again at top level"
                          : `Continue to Level ${Math.min(10, (profile.subjectLevels?.reading ?? profile.adaptive.readingDifficulty ?? 1) + 1)}`}
                      </Button>
                      <Link href="/dashboard" className="block">
                        <Button variant="secondary" className="w-full">Go to Dashboard</Button>
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

          {coachOpen && item ? (
            <SmartCoachPanel
              studentId={profile?.id}
              subject="reading"
              question={item.question}
              correctAnswer={item.answer}
              passageText={item.passage}
              hintCount={hintLevel}
              ageRange={profile?.ageRange}
              yearGroup={Number(profile?.yearGroup?.match(/\d+/)?.[0] ?? "") || undefined}
              keyStageLevel={profile?.keyStageLevel}
              skillFocus={inferQuestionType(item.question)}
              assignmentId={assignedAssignmentId}
              contentId={assignedContentId ?? undefined}
              confidenceScore={0.5}
              onHintUsed={(newCount) => setHintLevel(newCount)}
              onClose={() => setCoachOpen(false)}
            />
          ) : null}
          {tutorFeedback ? (
            <div className="mt-3">
              <AITutorFeedback text={tutorFeedback} />
            </div>
          ) : null}
          {reaction ? <div className="mt-3"><MascotReaction mood={reaction.mood} message={reaction.message} /></div> : null}

          {feedback ? (
            <p className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 font-bold text-violet-900">{feedback}</p>
          ) : null}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Reading Focus</p>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>Support used</span>
                      <span>{hintLevel}/3</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10">
                      <div
                        className={`h-2 rounded-full bg-linear-to-r from-violet-300 to-cyan-300 ${
                          hintLevel >= 3
                            ? "w-full"
                            : hintLevel === 2
                              ? "w-2/3"
                              : hintLevel === 1
                                ? "w-1/3"
                                : "w-0"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 text-sm">
                    <p className="text-blue-100">Skill</p>
                    <p className="mt-1 text-xl font-black">Comprehension</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-violet-200 bg-linear-to-br from-violet-50 to-white p-5 shadow-sm">
                <p className="text-sm font-black text-violet-950">Answer strategy</p>
                <p className="mt-2 text-sm leading-6 text-violet-800">
                  Find the words in the passage that match the question, then choose the closest answer.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-black text-slate-900">Quick tip</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Read the passage twice: once for meaning, once to find the evidence.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      </div>
    </main>
    </>
    </PremiumAccessGate>
  );
}
