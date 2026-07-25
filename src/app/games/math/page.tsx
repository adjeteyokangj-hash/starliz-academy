"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import StudentContextStrip from "@/components/student/StudentContextStrip";
import VoiceHelpControls from "@/components/learning/VoiceHelpControls";
import { MathQuestion, getMathQuestions, getWeightedMathQuestions, getMathInsight } from "@/lib/adaptive";
import { validateContentItem } from "@/lib/content_validator";
import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";
import { levelFromXp, processMathAttempt } from "@/lib/progress";
import { ChildProfile, getProfile, hydrateActiveProfileFromServer, saveProfile, resolveCoachingPace } from "@/lib/store";
import { speakWithContext } from "@/lib/voice";
import { isUsageLocked, trackUsage } from "@/lib/screen_time";
import { fetchProfileHistory } from "@/lib/progress_data";
import { getNextQuestionId, markQuestionCompleted } from "@/lib/question_history";
import { recordCoachInteraction } from "@/lib/coach/session-memory";
import { fetchAiMathQuestion, fetchAssignedMathBatch, resetAssignedContentCursor } from "@/lib/ai_content";
import { syncAttemptToServer } from "@/lib/server_sync";
import { getTutorFeedbackPlan, hydrateCoachingMemoryFromServer } from "@/lib/tutor-voice";
import { playCorrectSound, playTryAgainSound } from "@/lib/game-sounds";
import { awardChildRewards } from "@/lib/child_wallet";
import { getTutorLine } from "@/lib/tutorVoice";
import {
  buildMathCompletionSnapshot,
  buildMathSessionSummaryMetrics,
  buildMathRequiredItemIds,
  canAutoSelectMathQuestion,
  isStaleAssignmentResponse,
  isTerminalMathLifecycle,
  resolveAssignmentSessionDecision,
  resolveAuthoritativeSessionTotal,
  resolveNextAssignedMathQuestion,
  shouldCompleteOnAssignedExhaustion,
  selectNextPendingAssignment,
  taskPathForAssignedSubject,
  type MathCompletionSnapshot,
  type MathSessionLifecycle,
  MATH_NEXT_SESSION_DASHBOARD_HREF,
} from "@/lib/math-assignment-session";
import { computeCanonicalSessionMetrics, type CanonicalItemOutcome } from "@/lib/canonical-learning-state";
import { shouldEnableStudentVoiceWorkflow } from "@/lib/lesson-voice-help";
import { continueDaytimePeriodFromClient } from "@/lib/schools/daytime-period-client";
import SmartCoachPanel from "@/components/coach/SmartCoachPanel";
import DaytimeTutorPanel from "@/components/games/DaytimeTutorPanel";
import {
  DaytimeSchoolLessonShell,
  DaytimeMathsPanel,
  DaytimeAnswerFeedback,
} from "@/components/student/daytime-lesson";
import { useDaytimeStagePack } from "@/components/student/daytime-lesson/useDaytimeStagePack";

const LEVEL_LABELS: Record<number, string> = {
  1: "⭐ Level 1: Counting with visuals",
  2: "⭐⭐ Level 2: Guided sums",
  3: "⭐⭐⭐ Level 3: No visual support",
  4: "⭐⭐⭐⭐ Level 4: Multi-step operations",
  5: "⭐⭐⭐⭐⭐ Level 5: Word problems",
};

const RECENT_LIMIT = 10;
const MATH_SESSION_TARGET = 10;

function inferMathDifficulty(questionId: string): number {
  const match = questionId.match(/math-(\d)-/i);
  const parsed = Number(match?.[1] ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeMathRetryId(questionId: string): string {
  return questionId.trim().toLowerCase().replace(/-session-\d+-\d+$/i, "");
}

function isAlgebraPrompt(prompt: string): boolean {
  return /solve\s+for\s+x|\d*\s*x\s*[+\-]\s*\d+\s*=\s*-?\d+|\bx\s*=|linear\s+equation/i.test(prompt);
}

function parseLinearEquation(prompt: string): { a: number; b: number; c: number } | null {
  const compact = prompt.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
  const expression = compact.match(/(\d*\s*x\s*[+\-]\s*\d+\s*=\s*-?\d+)/i)?.[1] ?? compact;
  const match = expression.match(/^(\d+)?\s*x\s*([+\-])\s*(\d+)\s*=\s*(-?\d+)$/i);
  if (!match) return null;
  const a = Number(match[1] ?? "1");
  const bRaw = Number(match[3]);
  const c = Number(match[4]);
  const b = match[2] === "-" ? -bRaw : bRaw;
  if (![a, b, c].every(Number.isFinite) || a === 0) return null;
  return { a, b, c };
}

function buildSimplifiedAlgebraPrompt(prompt: string): string | null {
  const eq = parseLinearEquation(prompt);
  if (!eq) return null;
  if (Math.abs(eq.a) > 1) {
    const reducedA = eq.a > 1 ? eq.a - 1 : eq.a;
    const reducedB = eq.b > 0 ? Math.max(1, eq.b - 1) : Math.min(-1, eq.b + 1);
    const reducedC = reducedA * 2 + reducedB;
    const sign = reducedB >= 0 ? "+" : "-";
    return `Try this easier version first: ${reducedA === 1 ? "x" : `${reducedA}x`} ${sign} ${Math.abs(reducedB)} = ${reducedC}`;
  }
  const reducedB = eq.b > 0 ? Math.max(1, eq.b - 1) : Math.min(-1, eq.b + 1);
  const reducedC = 4 + reducedB;
  const sign = reducedB >= 0 ? "+" : "-";
  return `Try this easier version first: x ${sign} ${Math.abs(reducedB)} = ${reducedC}`;
}

type PersistedMathState = {
  currentQuestion: MathQuestion | null;
  sessionStep: number;
  sessionMode?: "standard" | "retry_pack" | "completed_base" | "completed_retry" | "completed";
  sessionComplete?: boolean;
  sessionAttempts: number;
  sessionCorrect: number;
  retryPackMode?: boolean;
  retryInitialCount?: number;
  contextKey: string;
  questionOutcomes?: Record<string, CanonicalItemOutcome>;
};

type StudentAssignmentQueueEntry = {
  id: string;
  status: string;
  href?: string | null;
  subject?: string | null;
  contentId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export default function MathMissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedContentId = searchParams.get("contentId");
  const assignedAssignmentId = searchParams.get("assignmentId") ?? undefined;
  const daytimePeriodId = searchParams.get("daytimePeriodId");
  const [answerFeedbackKind, setAnswerFeedbackKind] = useState<"correct" | "incorrect" | null>(null);
  const daytimeStagePack = useDaytimeStagePack({
    enabled: Boolean(daytimePeriodId),
    contentId: assignedContentId,
    assignmentId: assignedAssignmentId,
  });
  const isDaytimeSchool = Boolean(daytimePeriodId && assignedAssignmentId && assignedContentId);
  const assignmentLockedSession = Boolean(assignedAssignmentId || assignedContentId);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const profileId = profile?.id ?? null;
  const [currentQuestion, setCurrentQuestion] = useState<MathQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [coachOpen, setCoachOpen] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [reaction, setReaction] = useState<{ mood: "happy" | "support" | "celebrate"; message: string } | null>(null);
  const [forcedChoices, setForcedChoices] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [insightMessage, setInsightMessage] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [submittedAttempts, setSubmittedAttempts] = useState(0);
  const [recentQuestionIds, setRecentQuestionIds] = useState<string[]>([]);
  const [contentSource, setContentSource] = useState<"assigned" | "ai-cache" | "static">("static");
  const [usingAssignedContent, setUsingAssignedContent] = useState(false);
  const [rewardToast, setRewardToast] = useState<{ points: number; message: string } | null>(null);
  const [tutorFeedback, setTutorFeedback] = useState("");
  const [showSuccessBurst, setShowSuccessBurst] = useState(false);
  const [sessionStep, setSessionStep] = useState(0);
  const [sessionMode, setSessionMode] = useState<"standard" | "retry_pack" | "completed_base" | "completed_retry">("standard");
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const [sessionStartStats, setSessionStartStats] = useState<{ stars: number; xp: number; coins: number } | null>(null);
  const [questionOutcomes, setQuestionOutcomes] = useState<Record<string, CanonicalItemOutcome>>({});
  const [retryQueueIds, setRetryQueueIds] = useState<string[]>([]);
  const [retryInitialCount, setRetryInitialCount] = useState(0);
  const [correctSinceCheckpoint, setCorrectSinceCheckpoint] = useState(0);
  const [sessionVoiceHelpEnabled, setSessionVoiceHelpEnabled] = useState(false);
  const [assignedQuestions, setAssignedQuestions] = useState<MathQuestion[]>([]);
  const [assignedQuestionsLoaded, setAssignedQuestionsLoaded] = useState(false);
  const [assignedLoadError, setAssignedLoadError] = useState<string | null>(null);
  const [frozenAssignedTotal, setFrozenAssignedTotal] = useState<number | null>(null);
  const [sessionLifecycle, setSessionLifecycle] = useState<MathSessionLifecycle>("idle");
  const [completionSnapshot, setCompletionSnapshot] = useState<MathCompletionSnapshot | null>(null);
  const [launchingNextAssignedSession, setLaunchingNextAssignedSession] = useState(false);
  const [hasPendingNextAssignment, setHasPendingNextAssignment] = useState<boolean | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const [explainWhyQuestion, setExplainWhyQuestion] = useState<{
    question: string;
    choices: string[];
    correctIdx: number;
    answered: boolean;
  } | null>(null);
  const restoreAttemptedRef = useRef(false);
  const lastAutoSelectionContextRef = useRef<string | null>(null);
  const sessionLifecycleRef = useRef<MathSessionLifecycle>("idle");
  const assignmentLoadTokenRef = useRef(0);
  const activeSessionIdentityRef = useRef(`${assignedAssignmentId ?? ""}:${assignedContentId ?? ""}`);
  const launchingNextAssignmentIdRef = useRef<string | null>(null);
  const coachPanelRef = useRef<HTMLDivElement | null>(null);
  const voiceHelpEnabled = shouldEnableStudentVoiceWorkflow(sessionVoiceHelpEnabled);

  const sessionComplete = sessionMode === "completed_base"
    || sessionMode === "completed_retry"
    || sessionLifecycle === "completed"
    || sessionLifecycle === "launching-next";
  const retryPackMode = sessionMode === "retry_pack";
  const sessionQuestionTarget = resolveAuthoritativeSessionTotal({
    assignmentLocked: assignmentLockedSession,
    assignedQuestionCount: assignedQuestions.length,
    frozenAssignedTotal,
    retryPackMode,
    retryInitialCount,
    standardTarget: MATH_SESSION_TARGET,
  });
  const displaySessionTotal = completionSnapshot?.totalCount
    ?? (sessionQuestionTarget > 0 ? sessionQuestionTarget : null);
  const requiredStepIds = useMemo(() => {
    if (assignmentLockedSession) {
      if (assignedQuestions.length <= 0) return [] as string[];
      return buildMathRequiredItemIds({
        assignmentLocked: true,
        assignedQuestions,
        sessionQuestionTarget: Math.max(assignedQuestions.length, sessionQuestionTarget),
      });
    }
    return buildMathRequiredItemIds({
      assignmentLocked: false,
      assignedQuestions,
      sessionQuestionTarget: Math.max(1, sessionQuestionTarget || MATH_SESSION_TARGET),
    });
  }, [assignedQuestions, assignmentLockedSession, sessionQuestionTarget]);
  const canonicalSession = useMemo(() => {
    const approvedSkippedIds = Object.entries(questionOutcomes)
      .filter(([, outcome]) => outcome.state === "skipped")
      .map(([id]) => id);
    return computeCanonicalSessionMetrics({
      requiredItemIds: requiredStepIds,
      outcomes: questionOutcomes,
      approvedSkippedIds,
    });
  }, [questionOutcomes, requiredStepIds]);

  const getResumeStateKey = (childId: string) => `starliz_math_resume_${childId}`;

  function setLifecycle(next: MathSessionLifecycle) {
    sessionLifecycleRef.current = next;
    setSessionLifecycle(next);
  }

  function clearAdvanceTimer() {
    if (advanceTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  function resetTransientQuestionState() {
    clearAdvanceTimer();
    setCurrentQuestion(null);
    setAnswer("");
    setHintLevel(0);
    setAttemptCount(0);
    setSubmittedAttempts(0);
    setCoachOpen(false);
    setForcedChoices(false);
    setQuestionStartedAt(0);
    setFeedback("");
    setTutorFeedback("");
    setReaction(null);
    setExplainWhyQuestion(null);
    setInsightMessage(null);
    setShowSuccessBurst(false);
    setUsingAssignedContent(false);
    setContentSource("static");
    setRecentQuestionIds([]);
  }

  function resetForNextAssignment() {
    resetTransientQuestionState();
    setSessionStep(0);
    setSessionMode("standard");
    setSessionAttempts(0);
    setSessionCorrect(0);
    setQuestionOutcomes({});
    setRetryQueueIds([]);
    setRetryInitialCount(0);
    setCorrectSinceCheckpoint(0);
    setAssignedQuestions([]);
    setAssignedQuestionsLoaded(false);
    setAssignedLoadError(null);
    setFrozenAssignedTotal(null);
    setCompletionSnapshot(null);
    setHasPendingNextAssignment(null);
    restoreAttemptedRef.current = false;
    lastAutoSelectionContextRef.current = null;
    if (typeof window !== "undefined" && profile?.id) {
      window.sessionStorage.removeItem(getResumeStateKey(profile.id));
    }
  }

  function enterCompletionMode(
    mode: "completed_base" | "completed_retry",
    message: string,
    reactionMessage: string,
    metricsOverride?: {
      answeredCount: number;
      totalCount: number;
      correctCount: number;
      skippedCount: number;
    },
  ) {
    if (isTerminalMathLifecycle(sessionLifecycleRef.current) && sessionLifecycleRef.current !== "completing") {
      return;
    }
    clearAdvanceTimer();
    setLifecycle("completing");
    const candidateTotal = metricsOverride?.totalCount
      ?? (typeof frozenAssignedTotal === "number" && frozenAssignedTotal > 0 ? frozenAssignedTotal : null)
      ?? (sessionQuestionTarget > 0 ? sessionQuestionTarget : null)
      ?? (canonicalSession.totalRequired > 0 ? canonicalSession.totalRequired : null)
      ?? (requiredStepIds.length > 0 ? requiredStepIds.length : null);
    if (!candidateTotal || candidateTotal <= 0) {
      setLifecycle("active");
      setFeedback("Unable to complete this assigned session because no valid question total is available.");
      return;
    }
    const totalCount = candidateTotal;
    const snapshot = buildMathCompletionSnapshot({
      assignmentId: assignedAssignmentId,
      contentId: assignedContentId,
      answeredCount: metricsOverride?.answeredCount ?? canonicalSession.answeredCount,
      totalCount,
      correctCount: metricsOverride?.correctCount
        ?? (canonicalSession.correctCount > 0 ? canonicalSession.correctCount : sessionCorrect),
      skippedCount: metricsOverride?.skippedCount ?? canonicalSession.skippedCount,
    });
    setCompletionSnapshot(snapshot);
    setSessionStep(totalCount);
    setSessionMode(mode);
    setCurrentQuestion(null);
    setAnswer("");
    setHintLevel(0);
    setAttemptCount(0);
    setSubmittedAttempts(0);
    setCoachOpen(false);
    setForcedChoices(false);
    setQuestionStartedAt(0);
    setUsingAssignedContent(false);
    setFeedback(message);
    setReaction({ mood: "celebrate", message: reactionMessage });
    setLifecycle("completed");
    if (typeof window !== "undefined" && profile?.id) {
      window.sessionStorage.removeItem(getResumeStateKey(profile.id));
    }
  }

  useEffect(() => {
    void hydrateActiveProfileFromServer().then((serverProfile) => {
      const p = serverProfile ?? getProfile();
      if (!p) {
        setProfileLoading(false);
        router.replace("/onboarding");
        return;
      }
      const usageUpdated = trackUsage(p, 1);
      setProfile(usageUpdated);
      setSessionStartStats({ stars: usageUpdated.stars, xp: usageUpdated.xp, coins: usageUpdated.coins });
      void hydrateCoachingMemoryFromServer(p.id);
      setProfileLoading(false);
    }).catch(() => {
      setProfileLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileYearGroup = profile?.yearGroup?.trim() || undefined;
  const profileContext = useMemo(() => {
    if (!profile) return null;
    const yearGroup = profileYearGroup;
    return {
      studentName: profile.name,
      ageGroup: yearGroup ? ageGroupForYearGroup(yearGroup) : undefined,
      yearGroup,
      keyStage: profile.keyStageLevel?.trim() || (yearGroup ? keyStageForYearGroup(yearGroup) : undefined),
      curriculum: "National Curriculum UK",
    };
  }, [profile, profileYearGroup]);

  useEffect(() => {
    if (!profileId) return;
    void fetchProfileHistory(profileId);
  }, [profileId]);

  const questionPool = useMemo(
    () => (profile ? getWeightedMathQuestions(profile, getMathQuestions(profile.adaptive.mathDifficulty)) : []),
    [profile]
  );
  const allMathQuestions = useMemo(() => {
    const byId = new Map<string, MathQuestion>();
    for (const difficulty of [1, 2, 3, 4, 5]) {
      for (const questionItem of getMathQuestions(difficulty)) {
        const normalizedId = normalizeMathRetryId(questionItem.id);
        if (!byId.has(normalizedId)) {
          byId.set(normalizedId, { ...questionItem, id: normalizedId });
        }
      }
    }
    return [...byId.values()];
  }, []);
  const weakMathRetryIds = useMemo(() => {
    if (!profile) return [] as string[];
    const availableIds = new Set(allMathQuestions.map((entry) => normalizeMathRetryId(entry.id)));
    const uniqueIds = new Set<string>();
    for (const weakId of profile.dailySubjectProgress.weakItems.math) {
      const normalizedId = normalizeMathRetryId(weakId);
      if (availableIds.has(normalizedId)) {
        uniqueIds.add(normalizedId);
      }
    }
    return [...uniqueIds];
  }, [allMathQuestions, profile]);
  const currentContextKey = useMemo(() => {
    if (!profile) return null;
    return [
      profile.id,
      profile.adaptive.mathDifficulty,
      assignedContentId ?? "",
      assignedAssignmentId ?? "",
    ].join(":");
  }, [assignedAssignmentId, assignedContentId, profile]);

  useEffect(() => {
    if (!profile || !questionPool.length || !currentContextKey || restoreAttemptedRef.current) return;
    if (isTerminalMathLifecycle(sessionLifecycleRef.current)) return;
    restoreAttemptedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(getResumeStateKey(profile.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedMathState;
      const restoredMode = parsed.sessionMode === "completed" ? "completed_base" : (parsed.sessionMode
        ?? (parsed.sessionComplete ? "completed_base" : parsed.retryPackMode ? "retry_pack" : "standard"));
      if (parsed.contextKey !== currentContextKey || !parsed.currentQuestion) return;
      const parsedStep = parsed.sessionStep ?? 0;
      const normalizedCompleted = restoredMode === "completed_base" || restoredMode === "completed_retry";
      queueMicrotask(() => {
        if (isTerminalMathLifecycle(sessionLifecycleRef.current)) return;
        setCurrentQuestion(normalizedCompleted ? null : parsed.currentQuestion);
        setSessionStep(normalizedCompleted ? Math.max(parsedStep, displaySessionTotal ?? parsedStep) : parsedStep);
        setSessionMode(restoredMode);
        setSessionAttempts(parsed.sessionAttempts ?? 0);
        setSessionCorrect(parsed.sessionCorrect ?? 0);
        setQuestionOutcomes(parsed.questionOutcomes ?? {});
        setRetryInitialCount(parsed.retryInitialCount ?? 0);
        setHintLevel(0);
        setAttemptCount(0);
        setSubmittedAttempts(0);
        setAnswer("");
        setForcedChoices(false);
        setQuestionStartedAt(Date.now());
        lastAutoSelectionContextRef.current = currentContextKey;
        if (normalizedCompleted) {
          setLifecycle("completed");
        } else {
          setLifecycle("active");
        }
      });
    } catch {
      // Ignore malformed resume data.
    }
  }, [currentContextKey, displaySessionTotal, profile, questionPool.length]);

  useEffect(() => {
    if (!profile || !currentContextKey || typeof window === "undefined") return;
    if (sessionComplete || isTerminalMathLifecycle(sessionLifecycleRef.current)) return;
    const payload: PersistedMathState = {
      currentQuestion,
      sessionStep,
      sessionMode,
      sessionComplete,
      sessionAttempts,
      sessionCorrect,
      questionOutcomes,
      retryPackMode,
      retryInitialCount,
      contextKey: currentContextKey,
    };
    window.sessionStorage.setItem(getResumeStateKey(profile.id), JSON.stringify(payload));
  }, [currentContextKey, currentQuestion, profile, questionOutcomes, retryInitialCount, retryPackMode, sessionAttempts, sessionComplete, sessionCorrect, sessionMode, sessionStep]);

  useEffect(() => {
    if (!profile || !sessionComplete || typeof window === "undefined") return;
    window.sessionStorage.removeItem(getResumeStateKey(profile.id));
  }, [profile, sessionComplete]);

  async function moveToNextQuestion(
    currentProfile: ChildProfile,
    preferAssigned = false,
    resetSessionProgress = false,
    retryIdsOverride?: string[],
    /** Explicit step for assigned index lookup — required after advanceSession (setState is async). */
    sessionStepOverride?: number,
  ): Promise<void> {
    if (isTerminalMathLifecycle(sessionLifecycleRef.current)) {
      return;
    }
    // Call sites still pass preferAssigned; assignment-locked sessions never use cursor fetch.
    void preferAssigned;

    const activeRetryQueue = retryIdsOverride ?? retryQueueIds;
    const activeRetryMode = retryPackMode || Boolean(retryIdsOverride?.length);

    if (resetSessionProgress) {
      setSessionStep(0);
      setSessionMode(activeRetryMode ? "retry_pack" : "standard");
      setSessionAttempts(0);
      setSessionCorrect(0);
      setQuestionOutcomes({});
      setCompletionSnapshot(null);
      setSessionStartStats({ stars: currentProfile.stars, xp: currentProfile.xp, coins: currentProfile.coins });
      if (retryIdsOverride?.length) {
        setRetryInitialCount(retryIdsOverride.length);
      }
    }

    if (assignmentLockedSession) {
      if (!assignedQuestionsLoaded || sessionQuestionTarget <= 0) {
        return;
      }
      const assignedQuestion = await resolveNextAssignedMathQuestion({
        assignmentLocked: true,
        assignedQuestions,
        sessionStep: resetSessionProgress ? 0 : (sessionStepOverride ?? sessionStep),
      });
      if (isTerminalMathLifecycle(sessionLifecycleRef.current)) {
        return;
      }
      const assignmentDecision = resolveAssignmentSessionDecision({
        assignmentLocked: true,
        assignedQuestionAvailable: Boolean(assignedQuestion),
      });

    if (assignedQuestion && !assignmentDecision.assignmentExhausted) {
      // Keep step label and problem in the same update so advance doesn't flash Q2 with Q1 content.
      if (typeof sessionStepOverride === "number") {
        setSessionStep(sessionStepOverride);
      }
      setCurrentQuestion(assignedQuestion);
      setContentSource("assigned");
      setUsingAssignedContent(true);
      setHintLevel(0);
      setAttemptCount(0);
      setSubmittedAttempts(0);
      setCoachOpen(false);
      setAnswer("");
      setForcedChoices(false);
      setFeedback("");
      setTutorFeedback("");
      setReaction(null);
      setShowSuccessBurst(false);
      setQuestionStartedAt(Date.now());
      if (sessionLifecycleRef.current !== "active") {
        setLifecycle("active");
      }
      setRecentQuestionIds((prev) => {
        const merged = [...prev.filter((id) => id !== assignedQuestion.id), assignedQuestion.id];
        return merged.slice(-RECENT_LIMIT);
      });
      return;
    }

      if (assignmentDecision.assignmentExhausted) {
        const exhaustedCanonicalSession = computeCanonicalSessionMetrics({
          requiredItemIds: requiredStepIds,
          outcomes: questionOutcomes,
          approvedSkippedIds: Object.entries(questionOutcomes)
            .filter(([, outcome]) => outcome.state === "skipped")
            .map(([id]) => id),
        });
        if (shouldCompleteOnAssignedExhaustion(exhaustedCanonicalSession.canComplete)) {
          enterCompletionMode(
            "completed_base",
            "Assigned session complete. Start the next assigned session or go to dashboard.",
            "Assigned session complete. Great work!",
            {
              answeredCount: exhaustedCanonicalSession.answeredCount,
              totalCount: frozenAssignedTotal && frozenAssignedTotal > 0
                ? frozenAssignedTotal
                : exhaustedCanonicalSession.totalRequired,
              correctCount: exhaustedCanonicalSession.correctCount,
              skippedCount: exhaustedCanonicalSession.skippedCount,
            },
          );
        } else {
          setFeedback(`Keep going: ${exhaustedCanonicalSession.unresolvedCount} required question${exhaustedCanonicalSession.unresolvedCount === 1 ? "" : "s"} still unresolved.`);
          setReaction({ mood: "support", message: "Finish all required assigned questions to complete this session." });
        }
      }
      return;
    }

    let nextQuestion: MathQuestion | null = null;
    let nextSource: "ai-cache" | "static" = "static";

    if (activeRetryMode && activeRetryQueue.length) {
      const retryId = activeRetryQueue[0];
      const remainingRetryIds = activeRetryQueue.slice(1);
      setRetryQueueIds(remainingRetryIds);
      setSessionMode("retry_pack");
      const normalizedRetryId = normalizeMathRetryId(retryId);
      nextQuestion = questionPool.find((questionItem) => normalizeMathRetryId(questionItem.id) === normalizedRetryId)
        ?? allMathQuestions.find((questionItem) => normalizeMathRetryId(questionItem.id) === normalizedRetryId)
        ?? null;
      if (nextQuestion) {
        nextSource = "static";
      } else if (!remainingRetryIds.length) {
        setSessionMode("standard");
        setFeedback("Retry pack refreshed. Some older weak items are no longer available, so we loaded balanced practice.");
      }
    }

    if (!nextQuestion) {
      const stepForBalance = resetSessionProgress ? 0 : (sessionStepOverride ?? sessionStep);
      const currentDifficulty = currentProfile.adaptive.mathDifficulty;
      const shouldUseEasier = stepForBalance === 0;
      const effectiveTarget = Math.max(1, sessionQuestionTarget || MATH_SESSION_TARGET);
      const shouldUseChallenge = stepForBalance === effectiveTarget - 1;
      const targetDifficulty = shouldUseEasier
        ? Math.max(1, currentDifficulty - 1)
        : shouldUseChallenge
          ? Math.min(5, currentDifficulty + 1)
          : currentDifficulty;
      const balancedPool = getMathQuestions(targetDifficulty).filter((item) => !recentQuestionIds.includes(item.id));
      if (balancedPool.length) {
        nextQuestion = balancedPool[Math.floor(Math.random() * balancedPool.length)] ?? null;
        nextSource = "static";
      }
    }

    const aiQuestion = await fetchAiMathQuestion(currentProfile.adaptive.mathDifficulty, recentQuestionIds);
    if (!nextQuestion && aiQuestion) {
      nextQuestion = aiQuestion;
      nextSource = "ai-cache";
    }

    if (!nextQuestion) {
      const candidates = questionPool.map((questionItem) => questionItem.id).filter((id) => !recentQuestionIds.includes(id));
      const nextId = getNextQuestionId({
        childId: currentProfile.id,
        activity: "math",
        level: currentProfile.adaptive.mathDifficulty,
        candidateIds: candidates.length ? candidates : questionPool.map((questionItem) => questionItem.id),
      });
      nextQuestion = questionPool.find((questionItem) => questionItem.id === nextId) ?? null;
    }

    setCurrentQuestion(nextQuestion);
    setContentSource(nextSource);
    setUsingAssignedContent(false);
    setHintLevel(0);
    setAttemptCount(0);
    setSubmittedAttempts(0);
    setCoachOpen(false);
    setAnswer("");
    setForcedChoices(false);
    if (typeof sessionStepOverride === "number") {
      setSessionStep(sessionStepOverride);
    }
    setFeedback("");
    setTutorFeedback("");
    setReaction(null);
    setShowSuccessBurst(false);
    setQuestionStartedAt(Date.now());
    if (nextQuestion && sessionLifecycleRef.current !== "active") {
      setLifecycle("active");
    }
    if (nextQuestion) {
      setRecentQuestionIds((prev) => {
        const merged = [...prev.filter((id) => id !== nextQuestion.id), nextQuestion.id];
        return merged.slice(-RECENT_LIMIT);
      });
    }
  }

  function advanceSession(currentProfile: ChildProfile, delayMs: number, nextOutcomes?: Record<string, CanonicalItemOutcome>): void {
    if (isTerminalMathLifecycle(sessionLifecycleRef.current)) {
      return;
    }
    const outcomes = nextOutcomes ?? questionOutcomes;
    const nextCanonicalSession = computeCanonicalSessionMetrics({
      requiredItemIds: requiredStepIds,
      outcomes,
      approvedSkippedIds: Object.entries(outcomes)
        .filter(([, outcome]) => outcome.state === "skipped")
        .map(([id]) => id),
    });
    if (retryPackMode && retryQueueIds.length === 0) {
      if (nextCanonicalSession.canComplete) {
        enterCompletionMode(
          "completed_retry",
          "Retry pack complete. Great correction work. You can move to the next level or return to the dashboard.",
          "Retry pack complete. Excellent recovery!",
          {
            answeredCount: nextCanonicalSession.answeredCount,
            totalCount: Math.max(1, retryInitialCount, nextCanonicalSession.totalRequired),
            correctCount: nextCanonicalSession.correctCount,
            skippedCount: nextCanonicalSession.skippedCount,
          },
        );
      } else {
        setFeedback(`Keep going: ${nextCanonicalSession.unresolvedCount} required question${nextCanonicalSession.unresolvedCount === 1 ? "" : "s"} still unresolved.`);
      }
      return;
    }

    const effectiveTarget = sessionQuestionTarget > 0 ? sessionQuestionTarget : (retryPackMode ? Math.max(1, retryInitialCount) : MATH_SESSION_TARGET);
    const nextStep = sessionStep + 1;
    if (nextStep >= effectiveTarget) {
      if (nextCanonicalSession.canComplete) {
        enterCompletionMode(
          "completed_base",
          "Session complete. Start the next session or go to dashboard.",
          "Session complete. Amazing focus!",
          {
            answeredCount: nextCanonicalSession.answeredCount,
            totalCount: (frozenAssignedTotal && frozenAssignedTotal > 0)
              ? frozenAssignedTotal
              : (sessionQuestionTarget > 0 ? sessionQuestionTarget : nextCanonicalSession.totalRequired),
            correctCount: nextCanonicalSession.correctCount,
            skippedCount: nextCanonicalSession.skippedCount,
          },
        );
      } else {
        setFeedback(`Keep going: ${nextCanonicalSession.unresolvedCount} required question${nextCanonicalSession.unresolvedCount === 1 ? "" : "s"} still unresolved.`);
      }
      return;
    }
    // Delay only the swap. Do not bump sessionStep early — that made "Question 2"
    // appear while Q1 content was still on screen (visible flicker).
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      if (isTerminalMathLifecycle(sessionLifecycleRef.current)) return;
      void moveToNextQuestion(currentProfile, true, false, undefined, nextStep);
    }, delayMs);
  }

  useEffect(() => {
    if (assignedAssignmentId || assignedContentId) {
      resetAssignedContentCursor("math", assignedContentId, assignedAssignmentId);
    }
  }, [assignedContentId, assignedAssignmentId]);

  useEffect(() => {
    const nextIdentity = `${assignedAssignmentId ?? ""}:${assignedContentId ?? ""}`;
    const previousIdentity = activeSessionIdentityRef.current;
    if (previousIdentity === nextIdentity) return;

    const launchingNextId = launchingNextAssignmentIdRef.current;
    const isExpectedLaunch = Boolean(
      launchingNextId
      && assignedAssignmentId
      && launchingNextId === assignedAssignmentId,
    );

    if (sessionLifecycleRef.current === "completed" && !isExpectedLaunch) {
      // Ignore unexpected URL churn while completion is locked.
      return;
    }

    activeSessionIdentityRef.current = nextIdentity;
    launchingNextAssignmentIdRef.current = null;
    resetForNextAssignment();
    setLifecycle(assignmentLockedSession ? "loading" : "idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedAssignmentId, assignedContentId, assignmentLockedSession]);

  useEffect(() => {
    const requestToken = ++assignmentLoadTokenRef.current;
    const requestAssignmentId = assignedAssignmentId ?? null;
    const requestContentId = assignedContentId ?? null;

    const isCurrentRequest = () => !isStaleAssignmentResponse({
      requestToken,
      activeToken: assignmentLoadTokenRef.current,
      requestAssignmentId,
      activeAssignmentId: assignedAssignmentId ?? null,
      requestContentId,
      activeContentId: assignedContentId ?? null,
    });

    if (!assignmentLockedSession) {
      void Promise.resolve().then(() => {
        if (!isCurrentRequest()) return;
        setAssignedQuestions([]);
        setAssignedQuestionsLoaded(false);
        setAssignedLoadError(null);
        setFrozenAssignedTotal(null);
      });
      return;
    }

    // Keep a finished completion lock stable, but never skip the initial load for a locked session.
    if (
      isTerminalMathLifecycle(sessionLifecycleRef.current)
      && sessionLifecycleRef.current !== "launching-next"
      && sessionLifecycleRef.current === "completed"
    ) {
      return;
    }

    void Promise.resolve().then(() => {
      if (!isCurrentRequest()) return;
      setLifecycle("loading");
      setAssignedQuestionsLoaded(false);
      setAssignedLoadError(null);
      setAssignedQuestions([]);
    });

    void fetchAssignedMathBatch(assignedContentId ?? "", assignedAssignmentId)
      .then((batch) => {
        if (!isCurrentRequest()) return;
        // Completion may have started while the request was in flight; keep the lock,
        // but mark loaded so the UI cannot remain stuck on the loading card.
        if (
          isTerminalMathLifecycle(sessionLifecycleRef.current)
          && sessionLifecycleRef.current !== "launching-next"
        ) {
          setAssignedQuestionsLoaded(true);
          return;
        }
        const items = batch?.items ?? [];
        setAssignedQuestions(items);
        setAssignedQuestionsLoaded(true);
        if (items.length > 0) {
          setFrozenAssignedTotal(items.length);
          setAssignedLoadError(null);
          if (sessionLifecycleRef.current === "loading" || sessionLifecycleRef.current === "launching-next") {
            setLifecycle("idle");
          }
          return;
        }
        setFrozenAssignedTotal(null);
        setAssignedLoadError("This assigned maths session has no valid questions. Return to the dashboard and ask a parent or teacher to check the assignment.");
        setFeedback("Assigned content is missing or invalid for this maths session.");
        setReaction({ mood: "support", message: "No valid assigned maths questions were found for this session." });
      })
      .catch(() => {
        if (!isCurrentRequest()) return;
        setAssignedQuestions([]);
        setFrozenAssignedTotal(null);
        setAssignedQuestionsLoaded(true);
        setAssignedLoadError("Unable to load this assigned maths session. Please return to the dashboard and try again.");
        setFeedback("Unable to load assigned maths questions right now.");
      });
  }, [assignedAssignmentId, assignedContentId, assignmentLockedSession]);

  useEffect(() => {
    if (!profile || !questionPool.length) return;
    if (!canAutoSelectMathQuestion(sessionLifecycleRef.current)) return;
    if (sessionComplete || isTerminalMathLifecycle(sessionLifecycle)) return;
    if (assignmentLockedSession && assignedLoadError) return;
    if (assignmentLockedSession && !assignedQuestionsLoaded) return;
    if (assignmentLockedSession && sessionQuestionTarget <= 0) return;
    if (currentContextKey && lastAutoSelectionContextRef.current === currentContextKey && currentQuestion) return;
    lastAutoSelectionContextRef.current = currentContextKey;
    void moveToNextQuestion(profile, true, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedAssignmentId, assignedContentId, assignedLoadError, assignedQuestionsLoaded, assignmentLockedSession, currentContextKey, currentQuestion, profile, questionPool, sessionComplete, sessionLifecycle, sessionQuestionTarget]);

  const question = useMemo(() => currentQuestion, [currentQuestion]);
  const sessionRewards = useMemo(() => {
    if (!profile || !sessionStartStats) {
      return { stars: 0, xp: 0, coins: 0 };
    }
    return {
      stars: Math.max(0, profile.stars - sessionStartStats.stars),
      xp: Math.max(0, profile.xp - sessionStartStats.xp),
      coins: Math.max(0, profile.coins - sessionStartStats.coins),
    };
  }, [profile, sessionStartStats]);
  const sessionSummary = useMemo(() => {
    if (completionSnapshot) {
      return {
        totalQuestions: completionSnapshot.totalCount,
        correctQuestions: completionSnapshot.correctCount,
        accuracyPct: completionSnapshot.accuracyPct,
      };
    }
    const summaryTarget = displaySessionTotal && displaySessionTotal > 0
      ? displaySessionTotal
      : Math.max(1, sessionQuestionTarget || MATH_SESSION_TARGET);
    return buildMathSessionSummaryMetrics({
      canonical: {
        totalRequired: canonicalSession.totalRequired > 0 ? canonicalSession.totalRequired : summaryTarget,
        correctCount: canonicalSession.correctCount,
      },
      sessionQuestionTarget: summaryTarget,
      sessionCorrect,
      sessionAttempts,
    });
  }, [canonicalSession.correctCount, canonicalSession.totalRequired, completionSnapshot, displaySessionTotal, sessionAttempts, sessionCorrect, sessionQuestionTarget]);
  const resolvedSummaryTotal = completionSnapshot?.totalCount
    ?? (canonicalSession.totalRequired > 0 ? canonicalSession.totalRequired : sessionSummary.totalQuestions);
  const resolvedSummaryCount = completionSnapshot
    ? Math.min(completionSnapshot.totalCount, completionSnapshot.answeredCount + completionSnapshot.skippedCount)
    : Math.min(resolvedSummaryTotal, canonicalSession.answeredCount + canonicalSession.skippedCount);
  const mathMastery = useMemo(() => {
    if (!profile) return [] as Array<{ tag: string; accuracy: number }>;
    return Object.entries(profile.masteryTags.math)
      .map(([tag, stats]) => ({ tag, accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3);
  }, [profile]);

  const mathDifficulty = profile?.adaptive.mathDifficulty ?? 1;
  const yearGroupNum = Number(profile?.yearGroup?.match(/\d+/)?.[0] ?? "0");
  const isOlderLearner = yearGroupNum >= 9 || Boolean(profile?.keyStageLevel?.toLowerCase().includes("gcse")) || (profile?.ageYears ?? 0) >= 14;
  const isAlgebraQuestion = Boolean(question?.prompt && isAlgebraPrompt(question.prompt));
  const levelLabel = isAlgebraQuestion
    ? (isOlderLearner ? "📘 GCSE Algebra: Linear equations" : "📘 Algebra: Solving linear equations")
    : (LEVEL_LABELS[mathDifficulty] ?? LEVEL_LABELS[1]);
  const progressTotal = displaySessionTotal && displaySessionTotal > 0 ? displaySessionTotal : null;
  const currentQuestionNumber = progressTotal ? Math.min(sessionStep + 1, progressTotal) : sessionStep + 1;
  const currentStepKey = requiredStepIds[Math.min(sessionStep, Math.max(0, requiredStepIds.length - 1))]
    ?? `step-${Math.min(sessionStep, Math.max(0, (progressTotal ?? MATH_SESSION_TARGET) - 1))}`;
  const showVisualSupport = !isAlgebraQuestion && (profile?.ageRange === "5-7" || mathDifficulty <= 2);
  const displayChoices = useMemo(() => {
    if (!question) return [] as number[];
    const sourceChoices = Array.isArray(question.choices) ? question.choices : [];
    if (!sourceChoices.length) return [] as number[];
    if (!isAlgebraQuestion) return sourceChoices;

    const eq = parseLinearEquation(question.prompt);
    const correct = question.answer;
    const round = (value: number) => Math.round(value * 100) / 100;
    const distractors = [
      eq ? eq.c / eq.a : correct - 1,
      eq ? (eq.c - eq.b) : correct + 1,
      eq ? (eq.c + eq.b) / eq.a : correct + 2,
      correct - 1,
      correct + 1,
    ]
      .map(round)
      .filter((value) => Number.isFinite(value) && value !== round(correct));
    return Array.from(new Set([round(correct), ...distractors])).slice(0, 4);
  }, [isAlgebraQuestion, question]);
  const showChoices = displayChoices.length > 0 && (Boolean(question?.choices?.length) || (!isOlderLearner && (showVisualSupport || forcedChoices)));
  const smartSupportCopy = isAlgebraQuestion
    ? (isOlderLearner
      ? "Use equation steps first: isolate x, then check by substitution. Visual buttons appear only when this question is configured for choices."
      : "Use one step at a time: move constants first, then divide by the x coefficient.")
    : (showVisualSupport
      ? "Visual answers and concrete models are shown to support counting and operation sense."
      : "Read carefully, estimate first, then solve and verify your final number.");
  const displayPrompt = useMemo(() => {
    if (!question) return "";
    // Normalize generated line breaks and keep arithmetic chunks together.
    const normalized = question.prompt
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return normalized.replace(
      /(\d+(?:\.\d+)?)\s*([+\-xX×*/÷])\s*(\d+(?:\.\d+)?)/g,
      (_match, left, op, right) => `${left}\u00A0${op}\u00A0${right}`,
    );
  }, [question]);
  const currentHint = question && hintLevel > 0 ? question.hints[Math.min(question.hints.length, hintLevel) - 1] ?? "Try breaking the problem into steps." : "";

  function buildCraVisual(current: NonNullable<typeof question>): string | null {
    const normalizedPrompt = current.prompt.replace(/\s*\n+\s*/g, " ").trim();
    const match = normalizedPrompt.match(/(-?\d+(?:\.\d+)?)\s*([+\-xX×*/÷])\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const left = Math.abs(Number(match[1]));
    const right = Math.abs(Number(match[3]));
    const op = match[2];
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    if (left > 20 || right > 20) return null; // Only show for small numbers

    const dots = (count: number) => "●".repeat(Math.min(count, 20));
    if (op === "+") {
      return `${dots(left)}  +  ${dots(right)}`;
    }
    if (op === "-") {
      const crossed = "○".repeat(Math.min(right, left));
      const remaining = dots(Math.max(0, left - right));
      return `${dots(left)}  →  cross out ${crossed}  →  ${remaining || "none left"}`;
    }
    if (op === "x" || op === "X" || op === "×" || op === "*") {
      const groupSize = Math.min(right, 10);
      const groupCount = Math.min(left, 5);
      const groups = Array.from({ length: groupCount }, () => dots(groupSize)).join("  |  ");
      return left <= 5 && right <= 10 ? `${groupCount} groups of ${groupSize}: ${groups}` : null;
    }
    return null;
  }

  function detectErrorType(
    userAnswer: string,
    correct: number,
    current: NonNullable<typeof question>,
  ): "off_by_one" | "wrong_direction" | "place_value" | "random" {
    const parsed = Number(userAnswer);
    if (!Number.isFinite(parsed)) return "random";
    const diff = Math.abs(parsed - correct);
    if (diff === 1) return "off_by_one";
    if (diff === correct * 2 || diff === correct + parsed) return "wrong_direction";
    if (diff % 10 === 0) return "place_value";
    const normalizedPrompt = current.prompt.replace(/\s*\n+\s*/g, " ").trim();
    const match = normalizedPrompt.match(/(-?\d+)\s*([+\-xX×*/÷])\s*(-?\d+)/);
    if (match) {
      const left = Number(match[1]);
      const right = Number(match[3]);
      const op = match[2];
      if ((op === "+" || op === "-") && parsed === left + right && op === "-") return "wrong_direction";
      if ((op === "+" || op === "-") && parsed === left - right && op === "+") return "wrong_direction";
    }
    return "random";
  }

  function buildErrorSpecificHint(
    errorType: "off_by_one" | "wrong_direction" | "place_value" | "random",
    current: NonNullable<typeof question>,
  ): string {
    if (errorType === "off_by_one") {
      return "You are very close! Double-check by counting one more time. Keep track carefully with your fingers.";
    }
    if (errorType === "wrong_direction") {
      const normalizedPrompt = current.prompt.replace(/\s*\n+\s*/g, " ").trim();
      const match = normalizedPrompt.match(/[+\-xX×*/÷]/);
      const op = match?.[0] ?? "";
      if (op === "+") return "We are adding here — count forward from the bigger number!";
      if (op === "-") return "We are subtracting here — count backward from the first number!";
      return "Check the symbol between the numbers — it tells you what to do.";
    }
    if (errorType === "place_value") {
      return "Look at the ones column and the tens column separately. Make sure you are counting the right place.";
    }
    return "Look carefully at the numbers and the symbol between them. Break it into smaller steps.";
  }

  function buildExplainWhyQuestion(current: NonNullable<typeof question>): {
    question: string;
    choices: string[];
    correctIdx: number;
  } | null {
    const normalizedPrompt = current.prompt.replace(/\s*\n+\s*/g, " ").trim();
    const match = normalizedPrompt.match(/(-?\d+)\s*([+\-xX×*/÷])\s*(-?\d+)/);
    if (!match) return null;
    const op = match[2];
    if (op === "+") {
      return {
        question: "Why do we count forward when we add?",
        choices: ["Because adding means putting more together, making a bigger number.", "Because adding means taking some away, making a smaller number."],
        correctIdx: 0,
      };
    }
    if (op === "-") {
      return {
        question: "Why do we count backward when we subtract?",
        choices: ["Because subtracting means taking away, so we get a smaller number.", "Because subtracting means adding more on, so we get a bigger number."],
        correctIdx: 0,
      };
    }
    if (op === "x" || op === "X" || op === "×" || op === "*") {
      return {
        question: "What does multiplication really mean?",
        choices: ["Adding equal groups together — like having 3 bags of 4 apples.", "Taking away numbers one at a time until nothing is left."],
        correctIdx: 0,
      };
    }
    return {
      question: "What does division really mean?",
      choices: ["Sharing equally — splitting a total into equal groups.", "Making a number bigger by adding the same amount over and over."],
      correctIdx: 0,
    };
  }

  function speakMathPrompt(current: NonNullable<typeof question>): void {
    if (!voiceHelpEnabled) return;
    void speakWithContext(
      getTutorLine({
        subject: "maths",
        prompt: current.prompt,
        purchasedVoice: profile?.settings.voiceStyle,
        includePrompt: true,
      }),
      "math_problem",
    );
  }

  function repeatQuestion() {
    if (!question) return;
    speakMathPrompt(question);
  }

  function setVoiceHelpEnabled(nextEnabled: boolean) {
    setSessionVoiceHelpEnabled(nextEnabled);
  }

  async function startNextAssignedSession(currentProfile: ChildProfile): Promise<void> {
    if (launchingNextAssignedSession) return;
    if (sessionLifecycleRef.current === "launching-next") return;

    if (!assignmentLockedSession) {
      setLifecycle("idle");
      setCompletionSnapshot(null);
      setSessionMode("standard");
      await moveToNextQuestion(currentProfile, true, true);
      return;
    }

    setLaunchingNextAssignedSession(true);
    setLifecycle("launching-next");

    const completedAssignmentId = assignedAssignmentId ?? completionSnapshot?.assignmentId;
    const dashboardHref = MATH_NEXT_SESSION_DASHBOARD_HREF;

    try {
      if (completedAssignmentId && (sessionMode === "completed_base" || sessionMode === "completed_retry" || completionSnapshot)) {
        let completionResponse: Response;
        try {
          completionResponse = await fetch(`/api/assignments/${encodeURIComponent(completedAssignmentId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          });
        } catch (error) {
          console.error("[math] assignment completion PATCH failed", {
            assignmentId: completedAssignmentId,
            error,
          });
          setLifecycle("completed");
          setReaction({ mood: "support", message: "Could not confirm assignment completion. Please try again." });
          setFeedback("Unable to mark this assignment complete right now. Please try again.");
          return;
        }

        if (!completionResponse.ok) {
          setLifecycle("completed");
          setReaction({ mood: "support", message: "Could not confirm assignment completion. Please try again." });
          setFeedback("Unable to mark this assignment complete right now. Please try again.");
          return;
        }
      }

      if (daytimePeriodId) {
        const continued = await continueDaytimePeriodFromClient({
          dayLessonId: daytimePeriodId,
          completedContentId: assignedContentId,
        });
        if (continued.ok) {
          if (continued.mode === "period_complete") {
            setHasPendingNextAssignment(false);
            setLifecycle("completed");
            setReaction({ mood: "celebrate", message: "Period activities complete. Returning to Today." });
            setFeedback("Great work — this period's stages are done.");
            window.setTimeout(() => router.push(continued.href || "/student/today"), 900);
            return;
          }
          launchingNextAssignmentIdRef.current = continued.assignmentId ?? "daytime-next";
          router.replace(continued.href);
          return;
        }
      }

      const assignmentsParams = new URLSearchParams({ studentId: currentProfile.id });
      if (completedAssignmentId) {
        assignmentsParams.set("currentAssignmentId", completedAssignmentId);
      }
      const assignmentsResponse = await fetch(`/api/student/assignments?${assignmentsParams.toString()}`, { credentials: "include" });
      if (!assignmentsResponse.ok) {
        throw new Error("Unable to load assigned queue.");
      }

      const payload = (await assignmentsResponse.json()) as { assignments?: StudentAssignmentQueueEntry[] };
      const queue = Array.isArray(payload.assignments) ? payload.assignments : [];
      const nextAssignment = selectNextPendingAssignment({
        assignments: queue,
        currentAssignmentId: completedAssignmentId,
      });

      if (!nextAssignment || nextAssignment.id === completedAssignmentId) {
        setHasPendingNextAssignment(false);
        setLifecycle("completed");
        setReaction({ mood: "celebrate", message: "No more assigned sessions pending. Returning to dashboard." });
        setFeedback("Great work. You have completed all pending assigned sessions. Returning to dashboard...");
        window.setTimeout(() => router.push(dashboardHref), 1000);
        return;
      }

      setHasPendingNextAssignment(true);
      launchingNextAssignmentIdRef.current = nextAssignment.id;
      // Keep completion snapshot/UI until the next assignment identity mounts and resets state.

      if (typeof nextAssignment.href === "string" && nextAssignment.href.trim()) {
        router.replace(nextAssignment.href);
        return;
      }

      const route = taskPathForAssignedSubject(nextAssignment.subject);
      const params = new URLSearchParams({ assignmentId: nextAssignment.id });
      if (nextAssignment.contentId) {
        params.set("contentId", nextAssignment.contentId);
      }
      router.replace(`/games/${route}?${params.toString()}`);
    } catch {
      launchingNextAssignmentIdRef.current = null;
      setLifecycle("completed");
      setReaction({ mood: "support", message: "Could not open the next assigned session. Returning to dashboard." });
      setFeedback("Unable to load the next assigned session right now. Returning to dashboard...");
      window.setTimeout(() => router.push(dashboardHref), 1000);
    } finally {
      setLaunchingNextAssignedSession(false);
    }
  }

  useEffect(() => {
    if (!coachOpen || !coachPanelRef.current) return;
    coachPanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [coachOpen]);

  function makeItEasier() {
    if (!question) return;
    if (isAlgebraQuestion && isOlderLearner) {
      const easierPrompt = buildSimplifiedAlgebraPrompt(question.prompt);
      if (easierPrompt) {
        setHintLevel(Math.min(hintLevel + 1, question?.hints.length ?? 3));
        setFeedback(easierPrompt);
        setReaction({ mood: "support", message: "Let us simplify first, then solve the original question." });
        return;
      }
    }
    const newLevel = Math.min(hintLevel + 1, question?.hints.length ?? 3);
    setHintLevel(newLevel);
    if (newLevel >= 2) setForcedChoices(true);
    const spokenHint = question.hints[Math.min(question.hints.length, newLevel) - 1] ?? "Try breaking the problem into steps.";
    setTutorFeedback(spokenHint);
  }

  async function checkAnswer() {
    if (!profile || !question) return;
    if (isUsageLocked(profile)) {
      setFeedback("Screen-time limit reached. Ask parent to unlock more time.");
      return;
    }

    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      setFeedback("Type an answer or pick one of the options first.");
      setReaction({ mood: "support", message: "Try an answer first, then I can help." });
      return;
    }

    const responseMs = questionStartedAt > 0 ? Date.now() - questionStartedAt : 0;
    const questionDifficulty = inferMathDifficulty(question.id);
    const difficultyBand = questionDifficulty < profile.adaptive.mathDifficulty
      ? "easier"
      : questionDifficulty > profile.adaptive.mathDifficulty
        ? "challenge"
        : "core";
    setSubmittedAttempts((prev) => prev + 1);
    setSessionAttempts((prev) => prev + 1);
    const parsedAnswer = Number(trimmedAnswer);
    const isCorrect = Number.isFinite(parsedAnswer) && Math.abs(parsedAnswer - question.answer) < 0.000001;

    if (isCorrect) {
      const prevLevel = levelFromXp(profile.xp);
      const result = processMathAttempt(profile, true, question.id, {
        hintsUsed: hintLevel,
        responseMs,
        supportTag: question.topic,
        masteryTag: question.topic,
        weakItemKey: normalizeMathRetryId(question.id),
        difficultyBand,
      });
      const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
      const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
      const attemptPayload = {
        studentId: profile.id,
        subject: "math",
        skillFocus: question.topic,
        contentId: attemptContentId,
        assignmentId: attemptAssignmentId,
        questionText: question.prompt,
        answerGiven: trimmedAnswer,
        correctAnswer: String(question.answer),
        correct: true,
        responseTimeMs: Math.round(responseMs),
        hintsUsed: hintLevel,
        difficulty: profile.adaptive.mathDifficulty,
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
          source: "math",
          coins: result.rewardDelta.coins,
          xp: result.rewardDelta.xp,
          stars: result.rewardDelta.stars,
          note: "Math answer correct.",
          difficulty: profile.adaptive.mathDifficulty,
          activityName: "Math Mission",
          profile: result.profile,
        });
      } catch {
        awardedProfile = result.profile;
        saveProfile(result.profile);
      }
      setProfile(awardedProfile);
      setAttemptCount(0);
      setSubmittedAttempts(0);
      setAnswer("");

      const nextLevel = levelFromXp(awardedProfile.xp);
      setReaction({ mood: nextLevel > prevLevel || result.surpriseReward.awarded ? "celebrate" : "happy", message: "Great job! Next one..." });
      setFeedback(`Great job! Next one...${result.promotedDifficulty ? " Difficulty increased!" : ""}${result.surpriseReward.awarded ? ` ${result.surpriseReward.message}` : ""}`);
      if (isDaytimeSchool) setAnswerFeedbackKind("correct");

      markQuestionCompleted({
        childId: profile.id,
        activity: "math",
        level: profile.adaptive.mathDifficulty,
        questionId: question.id,
      });

      recordCoachInteraction({
        questionText: question.prompt,
        subject: "math",
        skillFocus: question.topic,
        hintsUsed: hintLevel,
        correct: true,
        responseTimeMs: Math.round(responseMs),
        timestamp: Date.now(),
      });

      const newSessionCorrect = sessionCorrect + 1;
      setSessionCorrect(newSessionCorrect);
      const improved = result.promotedDifficulty || nextLevel > prevLevel || newSessionCorrect % 5 === 0;

      // Explain-why checkpoint: every 3 correct in math support mode
      const nextCorrectSinceCheckpoint = correctSinceCheckpoint + 1;
      setCorrectSinceCheckpoint(nextCorrectSinceCheckpoint);
      if (awardedProfile.mathSupport?.mode === "math_support" && nextCorrectSinceCheckpoint >= 3) {
        const ewq = buildExplainWhyQuestion(question);
        if (ewq) {
          setExplainWhyQuestion({ ...ewq, answered: false });
          setCorrectSinceCheckpoint(0);
        }
      }
      const tutorPlan = getTutorFeedbackPlan({
        childId: profile.id,
        subject: "math",
        correct: true,
        improvement: improved,
        answer: String(question.answer),
        response: trimmedAnswer,
        consecutiveCorrect: newSessionCorrect,
        consecutiveMistakes: 0,
        responseMs,
        usedHint: hintLevel > 0,
        coachingStylePreference: resolveCoachingPace("math", profile.settings.subjectCoachingStyles),
      });
      setTutorFeedback(tutorPlan.text);
      if (profile.settings.sfxEnabled) {
        playCorrectSound();
      }
      setShowSuccessBurst(true);
      window.setTimeout(() => setShowSuccessBurst(false), 900);

      if (improved) {
        void awardChildRewards({
          childId: profile.id,
          source: "math",
          coins: 20,
          note: "Progress reward for sharper maths accuracy.",
          reason: "accuracy_improved",
          difficulty: awardedProfile.adaptive.mathDifficulty,
          activityName: "Math Progress Bonus",
          profile: awardedProfile,
        })
          .then((bonusProfile) => {
            setProfile(bonusProfile);
            setRewardToast({ points: 20, message: "Progress reward for sharper maths accuracy." });
            window.setTimeout(() => setRewardToast(null), 2400);
          })
          .catch(() => undefined);
      }

      if (newSessionCorrect % 5 === 0) {
        const insight = getMathInsight(result.profile);
        setInsightMessage(insight ?? "You are on fire! Keep solving — you are getting sharper every question!");
      }

      const nextOutcomes: Record<string, CanonicalItemOutcome> = {
        ...questionOutcomes,
        [currentStepKey]: { state: "answered", correct: true },
      };
      setQuestionOutcomes(nextOutcomes);
      advanceSession(awardedProfile, 350, nextOutcomes);
      return;
    }

    const nextAttempt = attemptCount + 1;
    setAttemptCount(nextAttempt);
    setAnswer("");

    const errorType = detectErrorType(trimmedAnswer, question.answer, question);
    const errorHint = buildErrorSpecificHint(errorType, question);
    const inMathSupport = profile.mathSupport?.mode === "math_support";

    if (nextAttempt === 1) {
      const nextHint = Math.min(hintLevel + 1, question.hints.length);
      setHintLevel(nextHint);
      if (nextHint >= 2) setForcedChoices(true);
      const clue = inMathSupport
        ? errorHint
        : (question.hints[Math.min(question.hints.length, nextHint) - 1] ?? "Try breaking the problem into steps.");
      setFeedback("Good try. Listen again and have another go.");
      if (isDaytimeSchool) setAnswerFeedbackKind("incorrect");
      setReaction({ mood: "support", message: "Good try. Listen again and have another go." });
      recordCoachInteraction({
        questionText: question.prompt,
        subject: "math",
        skillFocus: question.topic,
        hintsUsed: nextHint,
        correct: false,
        responseTimeMs: Math.round(responseMs),
        timestamp: Date.now(),
      });
      setTutorFeedback(`Good try! Here is a clue to help you. ${clue}`);
      return;
    }

    if (nextAttempt === 2) {
      const nextHint = Math.min(hintLevel + 1, question.hints.length);
      setHintLevel(nextHint);
      if (nextHint >= 2) setForcedChoices(true);
      const clue = inMathSupport
        ? errorHint
        : (question.hints[Math.min(question.hints.length, nextHint) - 1] ?? "Try breaking the problem into steps.");
      setFeedback("Almost there. Here is a bigger clue.");
      setReaction({ mood: "support", message: "Almost there. Here is a bigger clue." });
      recordCoachInteraction({
        questionText: question.prompt,
        subject: "math",
        skillFocus: question.topic,
        hintsUsed: nextHint,
        correct: false,
        responseTimeMs: Math.round(responseMs),
        timestamp: Date.now(),
      });
      setTutorFeedback(`You are nearly there! Let me give you a bigger clue. ${clue}`);
      return;
    }

    const result = processMathAttempt(profile, false, question.id, {
      hintsUsed: Math.max(hintLevel, 2),
      responseMs,
      supportTag: question.topic,
      masteryTag: question.topic,
      weakItemKey: normalizeMathRetryId(question.id),
      difficultyBand,
    });
    const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
    const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
    void syncAttemptToServer({
      studentId: profile.id,
      subject: "math",
      skillFocus: question.topic,
      contentId: attemptContentId,
      assignmentId: attemptAssignmentId,
      questionText: question.prompt,
      answerGiven: trimmedAnswer,
      correctAnswer: String(question.answer),
      correct: false,
      responseTimeMs: Math.round(responseMs),
      hintsUsed: Math.max(hintLevel, 2),
      difficulty: profile.adaptive.mathDifficulty,
    });
    let awardedProfile: Awaited<ReturnType<typeof awardChildRewards>>;
    try {
      awardedProfile = await awardChildRewards({
        childId: profile.id,
        source: "math",
        coins: result.rewardDelta.coins,
        xp: result.rewardDelta.xp,
        stars: result.rewardDelta.stars,
        note: "Math answer incorrect.",
        difficulty: profile.adaptive.mathDifficulty,
        activityName: "Math Mission",
        profile: result.profile,
      });
    } catch {
      awardedProfile = result.profile;
      saveProfile(result.profile);
    }
    setProfile(awardedProfile);
    setAttemptCount(0);
    setSubmittedAttempts(0);
    setFeedback(`The answer was ${question.answer}. Let's try a new one.`);
    setReaction({ mood: "support", message: `The answer was ${question.answer}. Let's try a new one.` });
    const tutorPlan = getTutorFeedbackPlan({
      childId: profile.id,
      subject: "math",
      correct: false,
      answer: String(question.answer),
      response: trimmedAnswer,
      consecutiveCorrect: 0,
      consecutiveMistakes: nextAttempt,
      responseMs,
      usedHint: true,
      coachingStylePreference: resolveCoachingPace("math", profile.settings.subjectCoachingStyles),
    });
    setTutorFeedback(tutorPlan.text);
    if (profile.settings.sfxEnabled) {
      playTryAgainSound();
    }
    recordCoachInteraction({
      questionText: question.prompt,
      subject: "math",
      skillFocus: question.topic,
      hintsUsed: Math.max(hintLevel, 2),
      correct: false,
      responseTimeMs: Math.round(responseMs),
      timestamp: Date.now(),
    });
    setTutorFeedback(`Not to worry - the answer was ${question.answer}. Let us keep going and try another one!`);
    const nextOutcomes: Record<string, CanonicalItemOutcome> = {
      ...questionOutcomes,
      [currentStepKey]: { state: "answered", correct: false },
    };
    setQuestionOutcomes(nextOutcomes);
    advanceSession(awardedProfile, 1200, nextOutcomes);
  }

  if (profileLoading) {
    return (
      <PremiumAccessGate>
        <>
          <Navbar />
          <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
            <section className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4 py-8">
              <p className="text-lg font-semibold text-slate-500">Loading your learning profile...</p>
            </section>
          </main>
        </>
      </PremiumAccessGate>
    );
  }

  if (!profile) {
    return (
      <PremiumAccessGate>
        <>
          <Navbar />
          <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
            <section className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4 py-8">
              <p className="text-lg font-semibold text-rose-600">Unable to load your learning profile.</p>
            </section>
          </main>
        </>
      </PremiumAccessGate>
    );
  }

  if (!question && !sessionComplete) {
    const assignedContentMissing = Boolean(assignmentLockedSession && assignedQuestionsLoaded && assignedLoadError);
    if (isDaytimeSchool) {
      return (
        <PremiumAccessGate>
          <DaytimeSchoolLessonShell
            periodId={daytimePeriodId!}
            assignmentId={assignedAssignmentId!}
            contentId={assignedContentId!}
            answered={sessionAttempts}
            correct={sessionCorrect}
            lessonProgressPct={null}
            mobileActionBar={<span className="text-xs font-semibold text-slate-600">Loading maths…</span>}
          >
            <DaytimeMathsPanel
              learningObjective={daytimeStagePack?.learningObjective}
              explanation={daytimeStagePack?.explanation}
              workedExamples={daytimeStagePack?.workedExamples}
            />
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {assignedLoadError
                || feedback
                || (assignedContentMissing
                  ? "This maths stage is still being prepared. Try again in a moment or ask your teacher."
                  : "Loading your maths question…")}
            </div>
          </DaytimeSchoolLessonShell>
        </PremiumAccessGate>
      );
    }
    return (
      <PremiumAccessGate>
        <>
          <Navbar />
          <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
            <section className="mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center px-4 py-10">
              <div className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-black uppercase tracking-wide text-emerald-700">Math Mission</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">
                  {assignedContentMissing
                    ? "Assigned content unavailable"
                    : assignmentLockedSession && !assignedQuestionsLoaded
                      ? "Loading assigned session..."
                      : "Preparing your next question"}
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {assignedLoadError
                    || feedback
                    || (assignmentLockedSession
                      ? "Loading your assigned maths questions."
                      : "Getting the next maths question ready.")}
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {!assignedContentMissing ? (
                    <Button
                      variant="accent"
                      className="w-full"
                      onClick={() => {
                        if (isTerminalMathLifecycle(sessionLifecycleRef.current)) return;
                        setLifecycle("idle");
                        setSessionMode("standard");
                        void moveToNextQuestion(profile, true, true);
                      }}
                      disabled={isTerminalMathLifecycle(sessionLifecycle)}
                    >
                      Refresh session
                    </Button>
                  ) : null}
                  <Link href={MATH_NEXT_SESSION_DASHBOARD_HREF} className={assignedContentMissing ? "block sm:col-span-2" : "block"}>
                    <Button variant="secondary" className="w-full">Go to Dashboard</Button>
                  </Link>
                </div>
              </div>
            </section>
          </main>
        </>
      </PremiumAccessGate>
    );
  }

  // Validate content subject matches route (skip while completion UI has no active question)
  if (question) {
    const contentValidation = validateContentItem(question as Record<string, unknown>, "math");
    if (!contentValidation.valid) {
      return <ContentMismatchFallback subject="Maths" message={contentValidation.error ?? "Content does not match Maths."} />;
    }
  }

  return (
    <PremiumAccessGate>
    <>
      {isDaytimeSchool ? null : <Navbar />}
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      {isDaytimeSchool ? (
        <DaytimeSchoolLessonShell
          periodId={daytimePeriodId!}
          assignmentId={assignedAssignmentId!}
          contentId={assignedContentId!}
          questionId={question?.id}
          questionIndex={sessionStep}
          answered={sessionAttempts}
          correct={sessionCorrect}
          lessonProgressPct={
            sessionQuestionTarget > 0
              ? Math.round((Math.min(sessionStep, sessionQuestionTarget) / sessionQuestionTarget) * 100)
              : null
          }
          mobileActionBar={
            <Button className="w-full" onClick={() => { void checkAnswer(); }}>Check answer</Button>
          }
        >
          <DaytimeMathsPanel
            learningObjective={daytimeStagePack?.learningObjective}
            explanation={daytimeStagePack?.explanation}
            workedExamples={daytimeStagePack?.workedExamples}
          />
          {answerFeedbackKind === "correct" ? (
            <DaytimeAnswerFeedback kind="correct" explanation={feedback} onContinue={() => setAnswerFeedbackKind(null)} />
          ) : null}
          {answerFeedbackKind === "incorrect" ? (
            <DaytimeAnswerFeedback kind="incorrect" onTryAgain={() => setAnswerFeedbackKind(null)} />
          ) : null}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm [&>section]:shadow-none">
            {/* Existing mission chrome is nested for daytime; non-daytime path renders full page below. */}
            <p className="text-sm font-semibold text-slate-700">
              {question ? question.prompt : "Loading maths question…"}
            </p>
            {question?.visual ? (
              <p className="mt-3 text-sm text-slate-600" data-testid="daytime-maths-visual">{question.visual}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                className="min-w-[10rem] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Your answer"
                aria-label="Maths answer"
              />
              <Button onClick={() => { void checkAnswer(); }}>Check answer</Button>
            </div>
            {question?.choices?.length ? (
              <div className="mt-3 grid gap-2">
                {question.choices.map((choice) => (
                  <Button key={String(choice)} variant="secondary" className="justify-start" onClick={() => setAnswer(String(choice))}>
                    {choice}
                  </Button>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">Use the working area above, then check your answer. Ask the AI Tutor for a first step if you need help.</p>
          </div>
        </DaytimeSchoolLessonShell>
      ) : null}
      <div className={isDaytimeSchool ? "hidden" : undefined}>
      {profileContext ? (
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
          <StudentContextStrip
            studentName={profileContext.studentName}
            ageGroup={profileContext.ageGroup}
            yearGroup={profileContext.yearGroup}
            keyStage={profileContext.keyStage}
            curriculum={profileContext.curriculum}
          />
        </section>
      ) : null}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-100/70 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {showSuccessBurst ? <GameSuccessBurst /> : null}
        {rewardToast ? <RewardToast points={rewardToast.points} message={rewardToast.message} /> : null}

        {/* Learning Insight Popup */}
        {insightMessage ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 shadow-sm">
            <span className="text-2xl">🧠</span>
            <div className="flex-1">
              <p className="font-semibold text-purple-900">{insightMessage}</p>
            </div>
            <button
              className="text-purple-400 hover:text-purple-700"
              onClick={() => setInsightMessage(null)}
              aria-label="Dismiss insight"
            >✕</button>
          </div>
        ) : null}

        {/* Explain-why checkpoint */}
        {explainWhyQuestion ? (
          <div className="mb-4 rounded-2xl border border-violet-300 bg-violet-50 px-5 py-4 shadow-md">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤔</span>
              <div className="flex-1">
                <p className="font-black text-violet-900">Quick thinking check!</p>
                <p className="mt-1 text-sm font-semibold text-violet-800">{explainWhyQuestion.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {explainWhyQuestion.choices.map((choice, idx) => (
                    <button
                      key={idx}
                      disabled={explainWhyQuestion.answered}
                      onClick={() => {
                        const correct = idx === explainWhyQuestion.correctIdx;
                        setExplainWhyQuestion((prev) => prev ? { ...prev, answered: true } : null);
                        if (correct) {
                          setTutorFeedback("That is exactly right! Great thinking!");
                        } else {
                          setTutorFeedback(`Good try! The right answer is: ${explainWhyQuestion.choices[explainWhyQuestion.correctIdx]}`);
                        }
                        window.setTimeout(() => setExplainWhyQuestion(null), 2800);
                      }}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                        explainWhyQuestion.answered
                          ? idx === explainWhyQuestion.correctIdx
                            ? "border-emerald-400 bg-emerald-100 text-emerald-900"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                          : "border-violet-200 bg-white text-violet-900 hover:border-violet-400 hover:bg-violet-100"
                      }`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="text-violet-400 hover:text-violet-700"
                onClick={() => setExplainWhyQuestion(null)}
                aria-label="Dismiss"
              >✕</button>
            </div>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-4xl border border-white/70 bg-white/85 shadow-[0_28px_80px_rgba(72,93,165,0.16)] backdrop-blur">
          <div className="border-b border-slate-200/70 bg-linear-to-r from-slate-950 via-emerald-950 to-cyan-900 px-5 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                  Math Mission
                </p>
                <h1 className="mt-2 font-heading text-3xl font-black leading-tight sm:text-4xl">
                  Solve, reason, and level up.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-100">
                  {isAlgebraQuestion
                    ? "Algebra coaching with step-by-step scaffolds, confidence checks, and targeted feedback."
                    : "Adaptive maths practice with visual support, smart hints, and rewards that build confident number thinking."}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-3xl border border-white/15 bg-white/10 p-3 text-center shadow-2xl">
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-100">Stars</p>
                  <p className="mt-1 text-2xl font-black">{profile.stars}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-100">XP</p>
                  <p className="mt-1 text-2xl font-black">{profile.xp}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-100">Coins</p>
                  <p className="mt-1 text-2xl font-black">{profile.coins}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-800">
                    {levelLabel}
                  </span>
                  {!sessionComplete && progressTotal ? (
                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">
                      Question {currentQuestionNumber} of {progressTotal}
                    </span>
                  ) : null}
                  {!assignmentLockedSession ? (
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-800">
                      Daily goal: {profile.dailySubjectProgress.completed.math} of {profile.dailySubjectProgress.targets.math}
                    </span>
                  ) : null}
                  {sessionComplete ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      Session complete
                    </span>
                  ) : null}
                  {retryPackMode ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Retry Pack</span>
                  ) : null}
                  {profile.mathSupport?.mode === "math_support" ? (
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">🔢 Maths support active</span>
                  ) : null}
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${contentSource === "assigned" ? "bg-indigo-100 text-indigo-800" : contentSource === "ai-cache" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                    Source: {contentSource === "assigned" ? "Assigned" : contentSource === "ai-cache" ? "AI Cache" : "Static"}
                  </span>
                </div>

                {!sessionComplete && question ? (
                  <>
                    <div className="mt-6 rounded-3xl bg-linear-to-br from-slate-950 to-emerald-950 p-5 text-white shadow-inner">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                        Current problem
                      </p>
                      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="font-heading text-4xl font-black tracking-wide text-white">
                            {displayPrompt}
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-cyan-100">
                            {showChoices ? "Work it out, then choose or type your answer." : "Work it out, then type your answer."}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
                          <p className="text-xs font-bold uppercase tracking-wide text-cyan-100">Topic</p>
                          <p className="mt-1 text-sm font-black">{isAlgebraQuestion ? "Algebra" : question.topic}</p>
                        </div>
                      </div>
                      {showVisualSupport && question.visual ? (
                        <p className="mt-5 rounded-2xl bg-white/10 p-4 text-2xl leading-10 text-white">
                          {question.visual}
                        </p>
                      ) : null}
                      {profile.mathSupport?.mode === "math_support" && buildCraVisual(question) ? (
                        <div className="mt-4 rounded-2xl border border-violet-300 bg-violet-900/30 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-violet-200">Concrete picture</p>
                          <p className="mt-2 font-mono text-lg leading-8 text-white tracking-widest">{buildCraVisual(question)}</p>
                          <p className="mt-1 text-xs text-violet-200">Use this picture to help you count.</p>
                        </div>
                      ) : null}
                    </div>

                    {daytimePeriodId && assignedAssignmentId && assignedContentId && question ? (
                      <div className="mt-4">
                        <DaytimeTutorPanel
                          periodId={daytimePeriodId}
                          assignmentId={assignedAssignmentId}
                          contentId={assignedContentId}
                          questionId={question.id}
                          questionIndex={sessionStep}
                          studentAttempt={answer}
                          className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3"
                        />
                      </div>
                    ) : null}

                    {currentHint ? (
                      <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                        Hint: {currentHint}
                      </p>
                    ) : null}

                    <input
                      className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg font-bold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type the answer"
                      inputMode="numeric"
                    />

                    {showChoices ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        {displayChoices.map((choice) => (
                          <Button className="w-full text-lg" key={`${question.id}-${choice}`} variant="secondary" onClick={() => setAnswer(String(choice))}>{choice}</Button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Button className="w-full" onClick={checkAnswer}>Check Answer</Button>
                      <VoiceHelpControls
                        className="w-full"
                        voiceHelpEnabled={voiceHelpEnabled}
                        onToggleVoiceHelp={setVoiceHelpEnabled}
                        actions={[{
                          id: "read-question",
                          label: "Read question",
                          onClick: repeatQuestion,
                          disabled: !question,
                          variant: "secondary",
                        }]}
                      />
                      <Button className="w-full" variant="accent" onClick={() => setCoachOpen((open) => !open)} disabled={!question}>Coach</Button>
                      <Button className="w-full" variant="secondary" onClick={makeItEasier}>{isAlgebraQuestion && isOlderLearner ? "Need a scaffold" : "Make it easier"}</Button>
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => {
                          const nextOutcomes: Record<string, CanonicalItemOutcome> = {
                            ...questionOutcomes,
                            [currentStepKey]: { state: "skipped", correct: false },
                          };
                          setQuestionOutcomes(nextOutcomes);
                          advanceSession(profile, 0, nextOutcomes);
                        }}
                      >
                        Try Another
                      </Button>
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => {
                          const retryIds = weakMathRetryIds;
                          if (!retryIds.length) return;
                          void moveToNextQuestion(profile, true, true, retryIds);
                        }}
                        disabled={assignmentLockedSession || !weakMathRetryIds.length}
                      >
                        Retry Weak Pack ({weakMathRetryIds.length})
                      </Button>
                      <Link href={MATH_NEXT_SESSION_DASHBOARD_HREF} className="block"><Button className="w-full" variant="secondary">Dashboard</Button></Link>
                    </div>
                  </>
                ) : null}

                {sessionComplete ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="m-0 font-black">Session complete.</p>
                    <p className="m-0 mt-1 font-semibold">Accuracy: {sessionSummary.accuracyPct}% ({sessionSummary.correctQuestions}/{sessionSummary.totalQuestions})</p>
                    <p className="m-0 mt-1 font-semibold">Resolved: {resolvedSummaryCount}/{resolvedSummaryTotal} (Answered {completionSnapshot?.answeredCount ?? canonicalSession.answeredCount}, Skipped {completionSnapshot?.skippedCount ?? canonicalSession.skippedCount})</p>
                    <p className="m-0 mt-1 font-semibold">Rewards: +{sessionRewards.stars} stars, +{sessionRewards.xp} XP, +{sessionRewards.coins} coins</p>
                    <p className="m-0 mt-1 font-semibold">Top mastery: {mathMastery.map((entry) => `${entry.tag} (${entry.accuracy}%)`).join(", ") || "Building now"}</p>
                    <p className="m-0 mt-1 font-semibold">Next suggestion: {profile.adaptive.nextBestActivity}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="accent"
                        className="w-full"
                        onClick={() => {
                          if (!daytimePeriodId && hasPendingNextAssignment === false) {
                            router.push(MATH_NEXT_SESSION_DASHBOARD_HREF);
                            return;
                          }
                          void startNextAssignedSession(profile);
                        }}
                        disabled={launchingNextAssignedSession || sessionLifecycle === "launching-next"}
                      >
                          {daytimePeriodId
                            ? "Continue lesson"
                            : hasPendingNextAssignment === false
                              ? "Return to Dashboard"
                              : assignmentLockedSession
                                ? "Next Session"
                                : "Start next session"}
                      </Button>
                      <Link href={MATH_NEXT_SESSION_DASHBOARD_HREF} className="block">
                        <Button variant="secondary" className="w-full">Go to Dashboard</Button>
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

          {coachOpen && question && !(daytimePeriodId && assignedAssignmentId) ? (
            <div ref={coachPanelRef} className="scroll-mt-24 relative z-20">
              <SmartCoachPanel
                studentId={profile?.id}
                subject="maths"
                question={question.prompt}
                correctAnswer={String(question.answer)}
                studentAnswer={answer || undefined}
                hintCount={hintLevel}
                attemptCount={Math.max(submittedAttempts, attemptCount)}
                mathDifficulty={profile?.adaptive.mathDifficulty}
                ageRange={profile?.ageRange}
                yearGroup={Number(profile?.yearGroup?.match(/\d+/)?.[0] ?? "") || undefined}
                keyStageLevel={profile?.keyStageLevel}
                skillFocus={isAlgebraQuestion ? "algebra" : question.topic}
                assignmentId={assignedAssignmentId}
                contentId={assignedContentId ?? undefined}
                confidenceScore={0.5}
                voiceHelpEnabled={voiceHelpEnabled}
                onHintUsed={(newCount) => {
                  setHintLevel(newCount);
                  if (newCount >= 2) setForcedChoices(true);
                }}
                onClose={() => setCoachOpen(false)}
              />
            </div>
          ) : null}
          {voiceHelpEnabled && tutorFeedback ? (
            <div className="mt-3">
              <AITutorFeedback text={tutorFeedback} enabled={voiceHelpEnabled} />
            </div>
          ) : null}
          {reaction ? <div className="mt-3"><MascotReaction mood={reaction.mood} message={reaction.message} /></div> : null}

          {feedback ? (
            <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 font-bold text-emerald-900">{feedback}</p>
          ) : null}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Session</p>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>Correct streak</span>
                      <span>{sessionCorrect}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-white/10">
                      <div
                        className={`h-2 rounded-full bg-linear-to-r from-emerald-300 to-cyan-300 ${
                          sessionCorrect >= 5
                            ? "w-full"
                            : sessionCorrect === 4
                              ? "w-4/5"
                              : sessionCorrect === 3
                                ? "w-3/5"
                                : sessionCorrect === 2
                                  ? "w-2/5"
                                  : sessionCorrect === 1
                                    ? "w-1/5"
                                    : "w-0"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="text-cyan-100">Hints used</p>
                      <p className="mt-1 text-xl font-black">{hintLevel}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="text-cyan-100">Attempts</p>
                      <p className="mt-1 text-xl font-black">{submittedAttempts}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-emerald-200 bg-linear-to-br from-emerald-50 to-white p-5 shadow-sm">
                <p className="text-sm font-black text-emerald-950">Smart support</p>
                <p className="mt-2 text-sm leading-6 text-emerald-800">
                  {smartSupportCopy}
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-black text-slate-900">Quick tip</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Say the problem out loud, count carefully, then check before submitting.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      </div>
    </div>
    </main>
    </>
    </PremiumAccessGate>
  );
}
