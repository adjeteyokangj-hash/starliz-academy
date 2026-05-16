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
import { MathQuestion, getMathQuestions, getWeightedMathQuestions, getMathInsight } from "@/lib/adaptive";
import { validateContentItem } from "@/lib/content_validator";
import { levelFromXp, processMathAttempt } from "@/lib/progress";
import { ChildProfile, getProfile, hydrateActiveProfileFromServer, saveProfile, resolveCoachingPace } from "@/lib/store";
import { getVoiceReaction, speakProfileFeedback, speakWithContext } from "@/lib/voice";
import { isUsageLocked, trackUsage } from "@/lib/screen_time";
import { fetchProfileHistory, getProfileHistory } from "@/lib/progress_data";
import { getNextQuestionId, markQuestionCompleted } from "@/lib/question_history";
import { recordCoachInteraction } from "@/lib/coach/session-memory";
import { fetchAiMathQuestion, fetchAssignedMathQuestion, resetAssignedContentCursor } from "@/lib/ai_content";
import { syncAttemptToServer } from "@/lib/server_sync";
import { getTutorFeedbackPlan, speakTutorFeedback, hydrateCoachingMemoryFromServer } from "@/lib/tutor-voice";
import { playCorrectSound, playTryAgainSound } from "@/lib/game-sounds";
import { awardChildRewards } from "@/lib/child_wallet";
import { getTutorLine } from "@/lib/tutorVoice";
import SmartCoachPanel from "@/components/coach/SmartCoachPanel";

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
};

export default function MathMissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedContentId = searchParams.get("contentId");
  const assignedAssignmentId = searchParams.get("assignmentId") ?? undefined;
  const [profile, setProfile] = useState<ChildProfile | null>(null);
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
  const [retryQueueIds, setRetryQueueIds] = useState<string[]>([]);
  const [retryInitialCount, setRetryInitialCount] = useState(0);
  const [correctSinceCheckpoint, setCorrectSinceCheckpoint] = useState(0);
  const [explainWhyQuestion, setExplainWhyQuestion] = useState<{
    question: string;
    choices: string[];
    correctIdx: number;
    answered: boolean;
  } | null>(null);
  const restoreAttemptedRef = useRef(false);
  const lastAutoSelectionContextRef = useRef<string | null>(null);
  const coachPanelRef = useRef<HTMLDivElement | null>(null);

  const sessionComplete = sessionMode === "completed_base" || sessionMode === "completed_retry";
  const retryPackMode = sessionMode === "retry_pack";

  const getResumeStateKey = (childId: string) => `starliz_math_resume_${childId}`;

  useEffect(() => {
    void hydrateActiveProfileFromServer().then((serverProfile) => {
      const p = serverProfile ?? getProfile();
      if (!p) {
        router.replace("/onboarding");
        return;
      }
      const usageUpdated = trackUsage(p, 1);
      setProfile(usageUpdated);
      setSessionStartStats({ stars: usageUpdated.stars, xp: usageUpdated.xp, coins: usageUpdated.coins });
      void hydrateCoachingMemoryFromServer(p.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    restoreAttemptedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(getResumeStateKey(profile.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedMathState;
      const restoredMode = parsed.sessionMode === "completed" ? "completed_base" : (parsed.sessionMode
        ?? (parsed.sessionComplete ? "completed_base" : parsed.retryPackMode ? "retry_pack" : "standard"));
      if (parsed.contextKey !== currentContextKey || !parsed.currentQuestion) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentQuestion(parsed.currentQuestion);
      setSessionStep(parsed.sessionStep ?? 0);
      setSessionMode(restoredMode);
      setSessionAttempts(parsed.sessionAttempts ?? 0);
      setSessionCorrect(parsed.sessionCorrect ?? 0);
      setRetryInitialCount(parsed.retryInitialCount ?? 0);
      setHintLevel(0);
      setAttemptCount(0);
      setSubmittedAttempts(0);
      setAnswer("");
      setForcedChoices(false);
      setQuestionStartedAt(Date.now());
      lastAutoSelectionContextRef.current = currentContextKey;
    } catch {
      // Ignore malformed resume data.
    }
  }, [currentContextKey, profile, questionPool.length]);

  useEffect(() => {
    if (!profile || !currentContextKey || typeof window === "undefined") return;
    const payload: PersistedMathState = {
      currentQuestion,
      sessionStep,
      sessionMode,
      sessionComplete,
      sessionAttempts,
      sessionCorrect,
      retryPackMode,
      retryInitialCount,
      contextKey: currentContextKey,
    };
    window.sessionStorage.setItem(getResumeStateKey(profile.id), JSON.stringify(payload));
  }, [currentContextKey, currentQuestion, profile, retryInitialCount, retryPackMode, sessionAttempts, sessionComplete, sessionCorrect, sessionMode, sessionStep]);

  useEffect(() => {
    if (!profile || !sessionComplete || typeof window === "undefined") return;
    window.sessionStorage.removeItem(getResumeStateKey(profile.id));
  }, [profile, sessionComplete]);

  async function moveToNextQuestion(
    currentProfile: ChildProfile,
    preferAssigned = false,
    resetSessionProgress = false,
    retryIdsOverride?: string[],
  ): Promise<void> {
    const activeRetryQueue = retryIdsOverride ?? retryQueueIds;
    const activeRetryMode = retryPackMode || Boolean(retryIdsOverride?.length);

    if (resetSessionProgress) {
      setSessionStep(0);
      setSessionMode(activeRetryMode ? "retry_pack" : "standard");
      setSessionAttempts(0);
      setSessionCorrect(0);
      setSessionStartStats({ stars: currentProfile.stars, xp: currentProfile.xp, coins: currentProfile.coins });
      if (retryIdsOverride?.length) {
        setRetryInitialCount(retryIdsOverride.length);
      }
    }

    let nextQuestion: MathQuestion | null = null;
    let nextSource: "assigned" | "ai-cache" | "static" = "static";

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
      const currentDifficulty = currentProfile.adaptive.mathDifficulty;
      const shouldUseEasier = sessionStep === 0;
      const shouldUseChallenge = sessionStep === MATH_SESSION_TARGET - 1;
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

    if (preferAssigned && (assignedAssignmentId || assignedContentId)) {
      const assignedQuestion = await fetchAssignedMathQuestion(assignedContentId ?? "", assignedAssignmentId);
      if (assignedQuestion) {
        nextQuestion = assignedQuestion;
        nextSource = "assigned";
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
    setUsingAssignedContent(nextSource === "assigned");
    setHintLevel(0);
    setAttemptCount(0);
    setSubmittedAttempts(0);
    setCoachOpen(false);
    setAnswer("");
    setForcedChoices(false);
    setQuestionStartedAt(Date.now());
    if (nextQuestion) {
      setRecentQuestionIds((prev) => {
        const merged = [...prev.filter((id) => id !== nextQuestion.id), nextQuestion.id];
        return merged.slice(-RECENT_LIMIT);
      });
    }
  }

  function advanceSession(currentProfile: ChildProfile, delayMs: number): void {
    if (retryPackMode && retryQueueIds.length === 0) {
      setSessionMode("completed_retry");
      setFeedback("Retry pack complete. Great correction work. You can move to the next level or return to the dashboard.");
      setReaction({ mood: "celebrate", message: "Retry pack complete. Excellent recovery!" });
      return;
    }

    const nextStep = sessionStep + 1;
    if (nextStep >= MATH_SESSION_TARGET) {
      setSessionStep(MATH_SESSION_TARGET);
      setSessionMode("completed_base");
      setFeedback("Session complete. Start the next session or go to dashboard.");
      setReaction({ mood: "celebrate", message: "Session complete. Amazing focus!" });
      return;
    }
    setSessionStep(nextStep);
    window.setTimeout(() => {
      void moveToNextQuestion(currentProfile, true);
    }, delayMs);
  }

  useEffect(() => {
    if (assignedAssignmentId || assignedContentId) {
      resetAssignedContentCursor("math", assignedContentId, assignedAssignmentId);
    }
  }, [assignedContentId, assignedAssignmentId]);

  useEffect(() => {
    if (!profile || !questionPool.length) return;
    if (currentContextKey && lastAutoSelectionContextRef.current === currentContextKey && currentQuestion) return;
    lastAutoSelectionContextRef.current = currentContextKey;
    void moveToNextQuestion(profile, true, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedAssignmentId, assignedContentId, currentContextKey, currentQuestion, profile, questionPool]);

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
  const sessionAccuracy = sessionAttempts > 0 ? Math.round((sessionCorrect / sessionAttempts) * 100) : 0;
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
  const sessionQuestionTarget = retryPackMode ? Math.max(1, retryInitialCount) : MATH_SESSION_TARGET;
  const currentQuestionNumber = Math.min(sessionStep + 1, sessionQuestionTarget);
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

  useEffect(() => {
    if (!question) return;
    speakMathPrompt(question);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  function repeatQuestion() {
    if (!question) return;
    speakMathPrompt(question);
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
        void speakWithContext(`${easierPrompt}. Then use the same steps on your main question.`, "math_hint");
        return;
      }
    }
    const newLevel = Math.min(hintLevel + 1, question?.hints.length ?? 3);
    setHintLevel(newLevel);
    if (newLevel >= 2) setForcedChoices(true);
    const spokenHint = question.hints[Math.min(question.hints.length, newLevel) - 1] ?? "Try breaking the problem into steps.";
    void speakWithContext(spokenHint, "math_hint");
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
      const today = new Date().toISOString().slice(0, 10);
      const dailyProgress = getProfileHistory(awardedProfile).filter((item) => item.ts.slice(0, 10) === today).length;
      const rewardSuffix = result.surpriseReward.awarded ? ` ${getVoiceReaction("reward-earned")} ${result.surpriseReward.message}` : "";
      speakProfileFeedback(awardedProfile, "correct", `Great job! ${getVoiceReaction("daily-quest")} ${dailyProgress}/${awardedProfile.dailyGoal}. ${nextLevel > prevLevel ? getVoiceReaction("level-up") : ""}${rewardSuffix}`);
      setReaction({ mood: nextLevel > prevLevel || result.surpriseReward.awarded ? "celebrate" : "happy", message: "Great job! Next one..." });
      setFeedback(`Great job! Next one...${result.promotedDifficulty ? " Difficulty increased!" : ""}${result.surpriseReward.awarded ? ` ${result.surpriseReward.message}` : ""}`);

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
      await speakWithContext(`Great job. The answer is ${question.answer}.`, "math_hint");
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

      advanceSession(awardedProfile, 350);
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
      void speakWithContext(`Good try! Here is a clue to help you. ${clue}`, "math_hint");
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
      void speakWithContext(`You are nearly there! Let me give you a bigger clue. ${clue}`, "math_hint");
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
    speakTutorFeedback(tutorPlan);
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
    void speakWithContext(`Not to worry — the answer was ${question.answer}. Let us keep going and try another one!`, "encouragement");
    advanceSession(awardedProfile, 1200);
  }

  if (!profile || !question) return <main className="min-h-screen bg-background" />;

  // Validate content subject matches route
  const contentValidation = validateContentItem(question as Record<string, unknown>, "math");
  if (!contentValidation.valid) {
    return <ContentMismatchFallback subject="Maths" message={contentValidation.error ?? "Content does not match Maths."} />;
  }

  return (
    <PremiumAccessGate>
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
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
                          void speakWithContext("That is exactly right! Great thinking!", "math_hint");
                        } else {
                          void speakWithContext(`Good try! The right answer is: ${explainWhyQuestion.choices[explainWhyQuestion.correctIdx]}`, "math_hint");
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
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">
                    Question {currentQuestionNumber} of {sessionQuestionTarget}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black text-indigo-800">
                    Target {profile.dailySubjectProgress.completed.math}/{profile.dailySubjectProgress.targets.math}
                  </span>
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
                  <Button className="w-full" onClick={checkAnswer} disabled={sessionComplete}>Check Answer</Button>
                  <Button className="w-full" variant="secondary" onClick={repeatQuestion}>Repeat Question</Button>
                  <Button className="w-full" variant="accent" onClick={() => setCoachOpen((open) => !open)} disabled={!question}>Coach</Button>
                  <Button className="w-full" variant="secondary" onClick={makeItEasier} disabled={sessionComplete}>{isAlgebraQuestion && isOlderLearner ? "Need a scaffold" : "Make it easier"}</Button>
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => {
                      advanceSession(profile, 0);
                    }}
                    disabled={sessionComplete}
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
                    disabled={sessionMode === "completed_retry" || !weakMathRetryIds.length}
                  >
                    Retry Weak Pack ({weakMathRetryIds.length})
                  </Button>
                  <Link href="/dashboard" className="block"><Button className="w-full" variant="secondary">Dashboard</Button></Link>
                </div>

                {sessionComplete ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="m-0 font-black">Session complete.</p>
                    <p className="m-0 mt-1 font-semibold">Accuracy: {sessionAccuracy}% ({sessionCorrect}/{sessionAttempts})</p>
                    <p className="m-0 mt-1 font-semibold">Rewards: +{sessionRewards.stars} stars, +{sessionRewards.xp} XP, +{sessionRewards.coins} coins</p>
                    <p className="m-0 mt-1 font-semibold">Top mastery: {mathMastery.map((entry) => `${entry.tag} (${entry.accuracy}%)`).join(", ") || "Building now"}</p>
                    <p className="m-0 mt-1 font-semibold">Next suggestion: {profile.adaptive.nextBestActivity}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="accent"
                        className="w-full"
                        onClick={() => {
                          setSessionMode("standard");
                          void moveToNextQuestion(profile, true, true);
                        }}
                      >
                        Start next session
                      </Button>
                      <Link href="/dashboard" className="block">
                        <Button variant="secondary" className="w-full">Go to Dashboard</Button>
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>

          {coachOpen && question ? (
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
                onHintUsed={(newCount) => {
                  setHintLevel(newCount);
                  if (newCount >= 2) setForcedChoices(true);
                }}
                onClose={() => setCoachOpen(false)}
              />
            </div>
          ) : null}
          {tutorFeedback ? (
            <div className="mt-3">
              <AITutorFeedback text={tutorFeedback} />
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
    </main>
    </>
    </PremiumAccessGate>
  );
}
