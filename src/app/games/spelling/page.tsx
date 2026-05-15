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
import { SpellingWord, getSpellingWordPool, getWeightedSpellingWordId, getReviewWords, getSpellingPatternInsight } from "@/lib/adaptive";
import { levelFromXp, processSpellingAttempt } from "@/lib/progress";
import { ChildProfile, getProfile, hydrateActiveProfileFromServer, saveProfile, resolveCoachingPace } from "@/lib/store";
import { speakEncouragement, speakWithContext } from "@/lib/voice";
import { isUsageLocked, trackUsage } from "@/lib/screen_time";
import { fetchProfileHistory } from "@/lib/progress_data";
import { getNextQuestionId, markQuestionCompleted } from "@/lib/question_history";
import { recordCoachInteraction } from "@/lib/coach/session-memory";
import { fetchAiSpellingWord, fetchAssignedSpellingWord, resetAssignedContentCursor } from "@/lib/ai_content";
import { syncAttemptToServer } from "@/lib/server_sync";
import { skillFocusToCode, serializeSkills } from "@/lib/skills";
import { getTutorFeedbackPlan, speakTutorFeedback, hydrateCoachingMemoryFromServer } from "@/lib/tutor-voice";
import { playCorrectSound, playTryAgainSound } from "@/lib/game-sounds";
import { awardChildRewards } from "@/lib/child_wallet";
import {
  isAlphabetWord,
  getSpellingHintMessage,
  getSpellingHintSpeech,
  getSpellingModeInstruction,
  getSpellingModePromptTitle,
  getSpellingModeVoiceInstruction,
  getTutorLine,
} from "@/lib/tutorVoice";
import SmartCoachPanel from "@/components/coach/SmartCoachPanel";
import { generateLetterOptions, getBlendText } from "@/lib/spellingEngine";
import { classifySpeechMatch, type SpeechMatchResult } from "@/lib/speechCheck";
import {
  applyTutorPersonality,
  type TutorEmotion,
  type TutorPersonality,
} from "@/lib/tutorPersonality";

const LEVEL_LABELS: Record<number, string> = {
  1: "⭐ Alphabet foundation",
  2: "⭐⭐ Two-letter words",
  3: "⭐⭐⭐ CVC word building",
  4: "⭐⭐⭐⭐ Word families",
  5: "⭐⭐⭐⭐⭐ Advanced families",
};

const PHASE_LABELS = {
  learn: "Learn",
  practice: "Practice",
  pattern: "Pattern",
  recall: "Recall",
  mini_test: "Mini Test",
  boss_test: "Boss Test",
} as const;

const JOURNEY_STAGES = ["Learn", "Practise", "Recall", "Boss Test"] as const;

const MODE_LABELS = {
  listen_type: "Listen & Type",
  build_word: "Build the Word",
  missing_letter: "Missing Letter",
  choose_correct: "Choose Correct",
  fix_mistake: "Fix the Mistake",
  scramble_word: "Scramble Word",
  alphabetical_order: "Alphabetical Order",
  pattern_mode: "Pattern Mode",
  recall_test: "Recall Test",
  boss_test: "Boss Test",
} as const;

const RECENT_LIMIT = 10;

type SessionPhase = {
  word: string;
  phase: keyof typeof PHASE_LABELS;
  mode: keyof typeof MODE_LABELS;
  noHints?: boolean;
};

type SpellingSessionPlan = {
  words: string[];
  seenWords: string[];
  weakWords: string[];
  masteredWords: string[];
  patternGroups: Record<string, string[]>;
  phases: SessionPhase[];
};

type WordMemorySummary = {
  seenWords: number;
  weakWords: number;
  masteredWords: number;
};

type DisplayMode = keyof typeof MODE_LABELS;
type LessonStage = "ASSESS_SPEECH" | "TEACH_RETRY" | "TAP_SELECT" | "COMPLETE";
type SpeechFallbackReason = "network" | "not-allowed" | "unsupported" | null;

type PersistedSpellingState = {
  currentWord: SpellingWord | null;
  sessionStepIndex: number;
  reviewMode: boolean;
  retryPackMode: boolean;
  contextKey: string;
};

type StudentSkillRow = {
  skill: string;
  accuracy: number;
  attempts: number;
  status: "weak" | "improving" | "mastered" | string;
};

type SpellingMastery = {
  letterSound: number;
  twoLetter: number;
  cvc: number;
  wordFamily: number;
};

function seededValue(text: string): number {
  return [...text].reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
}

function shuffleWithSeed<T>(items: T[], seedSource: string): T[] {
  const copy = [...items];
  let seed = seededValue(seedSource) || 1;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const nextIndex = seed % (index + 1);
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  }
  return copy;
}

function makeIncorrectSpelling(word: string): string {
  if (word.endsWith("e") && word.length > 3) {
    return word.slice(0, -1);
  }
  if (word.length > 3) {
    const letters = word.split("");
    [letters[1], letters[2]] = [letters[2], letters[1]];
    return letters.join("");
  }
  return word.split("").reverse().join("");
}

function compareAlphabetically(left: string, right: string): number {
  return left.localeCompare(right);
}

function countCharacter(text: string, character: string): number {
  return [...text].filter((item) => item === character).length;
}

function describeVisualTarget(text: string): string {
  if (!text) return "that";
  const lower = text === text.toLowerCase() && text !== text.toUpperCase();
  return lower ? `lowercase ${text}` : `capital ${text}`;
}

function normalizeSpeechTranscript(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisualMode(mode: DisplayMode): boolean {
  return mode === "listen_type";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getSkillAccuracy(skills: StudentSkillRow[], skillCode: string): number {
  const row = skills.find((entry) => entry.skill === skillCode);
  if (!row) return 0;
  return clamp((row.accuracy ?? 0) / 100, 0, 1);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSpellingMastery(skills: StudentSkillRow[]): SpellingMastery {
  const letterSound = average([
    getSkillAccuracy(skills, "letter_recognition"),
    getSkillAccuracy(skills, "letter_sound"),
  ]);
  const cvc = getSkillAccuracy(skills, "cvc");
  const twoLetter = average([
    letterSound,
    cvc > 0 ? cvc : letterSound,
  ]);
  const wordFamily = average([
    getSkillAccuracy(skills, "short_vowels"),
    getSkillAccuracy(skills, "blends"),
    getSkillAccuracy(skills, "digraphs"),
  ]);

  return { letterSound, twoLetter, cvc, wordFamily };
}

function chooseSpellingDifficultyFromMastery(skills: StudentSkillRow[]): number {
  const mastery = getSpellingMastery(skills);
  if (mastery.letterSound < 0.7) return 1;
  if (mastery.twoLetter < 0.7) return 2;
  if (mastery.cvc < 0.7) return 3;
  // promote to upper tiers only with stronger long-term mastery signal
  if (mastery.cvc >= 0.85 && mastery.wordFamily >= 0.7) return 5;
  return 4;
}

export default function SpellingQuestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignedContentId = searchParams.get("contentId");
  const assignedAssignmentId = searchParams.get("assignmentId") ?? undefined;
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const profileId = profile?.id ?? null;
  const [currentWord, setCurrentWord] = useState<SpellingWord | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [coachOpen, setCoachOpen] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [reaction, setReaction] = useState<{ mood: "happy" | "support" | "celebrate"; message: string } | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [retryPackMode, setRetryPackMode] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [insightMessage, setInsightMessage] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [recentWordIds, setRecentWordIds] = useState<string[]>([]);
  const [reviewQueueIds, setReviewQueueIds] = useState<string[]>([]);
  const [contentSource, setContentSource] = useState<"assigned" | "ai-cache" | "static">("static");
  const [usingAssignedContent, setUsingAssignedContent] = useState(false);
  const [sessionPlan, setSessionPlan] = useState<SpellingSessionPlan | null>(null);
  const [sessionPlanLoading, setSessionPlanLoading] = useState(false);
  const [wordMemorySummary, setWordMemorySummary] = useState<WordMemorySummary | null>(null);
  const [lastMistakeType, setLastMistakeType] = useState<string | null>(null);
  const [buildSelection, setBuildSelection] = useState<number[]>([]);
  const [buildTypedAnswer, setBuildTypedAnswer] = useState("");
  const [showBlendMode, setShowBlendMode] = useState(false);
  const [blendStage, setBlendStage] = useState<0 | 1 | 2>(0);
  const [alphaSelection, setAlphaSelection] = useState<string[]>([]);
  const [sessionStepIndex, setSessionStepIndex] = useState(0);
  const [buildWordRevealed, setBuildWordRevealed] = useState(false);
  const [missingLetterRevealed, setMissingLetterRevealed] = useState(false);
  const [masteredTodayWords, setMasteredTodayWords] = useState<string[]>([]);
  const [sessionWeakWords, setSessionWeakWords] = useState<string[]>([]);
  const [showBossCelebration, setShowBossCelebration] = useState(false);
  const [bossTransitionStage, setBossTransitionStage] = useState<"idle" | "unlock" | "countdown">("idle");
  const [bossCountdownValue, setBossCountdownValue] = useState<number | null>(null);
  const [bossPromptReady, setBossPromptReady] = useState(true);
  const [bossStats, setBossStats] = useState({ correct: 0, total: 0 });
  const [bossBonusSummary, setBossBonusSummary] = useState({ completion: 0, perfect: 0 });
  const [requireSpeech, setRequireSpeech] = useState(false);
  const [speechPassed, setSpeechPassed] = useState(false);
  const [speechAttempts, setSpeechAttempts] = useState(0);
  const [spokenText, setSpokenText] = useState("");
  const [speechListening, setSpeechListening] = useState(false);
  const [speechStatusMessage, setSpeechStatusMessage] = useState("");
  const [speechFallbackReason, setSpeechFallbackReason] = useState<SpeechFallbackReason>(null);
  const [speechLastMatchResult, setSpeechLastMatchResult] = useState<SpeechMatchResult | "no-speech" | null>(null);
  const [pendingAdvance, setPendingAdvance] = useState<{ nextIndex: number; inReview: boolean } | null>(null);
  const [tutorEmotion, setTutorEmotion] = useState<TutorEmotion>("idle");
  const [lessonStage, setLessonStage] = useState<LessonStage>("ASSESS_SPEECH");
  const [skillMasteryReady, setSkillMasteryReady] = useState(false);
  const lastPromptRef = useRef<{ key: string; at: number } | null>(null);
  const bossTransitionShownRef = useRef(false);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [rewardToast, setRewardToast] = useState<{ points: number; message: string } | null>(null);
  const [tutorFeedback, setTutorFeedback] = useState<string>("");
  const [showSuccessBurst, setShowSuccessBurst] = useState(false);
  const [sessionStartStats, setSessionStartStats] = useState<{ stars: number; xp: number; coins: number } | null>(null);
  const restoreAttemptedRef = useRef(false);
  /** Track every word used this session per level; reset when pool exhausted to avoid repeats. */
  const usedInSessionRef = useRef<Set<string>>(new Set());
  const lastAutoSelectionContextRef = useRef<string | null>(null);

  const getLevelChoiceKey = (childId: string) => `starliz_spelling_level_choice_${childId}`;
  const getSavedLevelKey = (childId: string) => `starliz_spelling_saved_level_${childId}`;
  const getResumeStateKey = (childId: string) => `starliz_spelling_resume_${childId}`;

  const loadSpellingSession = useCallback(async (studentId: string, difficulty: number) => {
    setSessionPlanLoading(true);
    try {
      const response = await fetch(`/api/spelling/session?studentId=${studentId}&level=${difficulty}`);
      if (!response.ok) return;
      const payload = await response.json() as SpellingSessionPlan;
      setSessionPlan(payload);
      setSessionStepIndex((prev) => (payload.phases.length ? Math.min(prev, payload.phases.length - 1) : 0));
      setWordMemorySummary({
        seenWords: payload.seenWords.length,
        weakWords: payload.weakWords.length,
        masteredWords: payload.masteredWords.length,
      });
    } catch {
      // Keep the local game playable even if the word-memory API is unavailable.
    } finally {
      setSessionPlanLoading(false);
    }
  }, []);

  const updateWordMemory = useCallback(async (studentId: string, word: string, input: string) => {
    try {
      const response = await fetch("/api/spelling/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, word, input }),
      });

      if (!response.ok) return null;

      const payload = await response.json() as {
        updated: { status: "seen" | "weak" | "mastered"; mistakeType: string | null };
        summary: WordMemorySummary;
      };

      setWordMemorySummary(payload.summary);
      setLastMistakeType(payload.updated.mistakeType);
      return payload;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void hydrateActiveProfileFromServer().then((serverProfile) => {
      const p = serverProfile ?? getProfile();
      if (!p) {
        router.replace("/onboarding");
        return;
      }
      const usageUpdated = trackUsage(p, 1);

      void fetch("/api/student/skills", { credentials: "include" })
        .then((response) => response.ok ? response.json() as Promise<StudentSkillRow[]> : Promise.resolve([] as StudentSkillRow[]))
        .then((skills) => {
          const masteryLevel = chooseSpellingDifficultyFromMastery(Array.isArray(skills) ? skills : []);
          const mastery = getSpellingMastery(Array.isArray(skills) ? skills : []);
          const acrossDaysReady = mastery.wordFamily >= 0.85;
          setSkillMasteryReady(acrossDaysReady);

          const levelFromSkills = Math.max(1, masteryLevel);
          setProfile({
            ...usageUpdated,
            adaptive: {
              ...usageUpdated.adaptive,
              spellingDifficulty: levelFromSkills,
            },
            subjectLevels: {
              ...usageUpdated.subjectLevels,
              spelling: levelFromSkills,
            },
          });

          if (levelFromSkills > 1) {
            const levelChoiceKey = `starliz_spelling_level_choice_${p.id}`;
            const remembered = typeof window !== "undefined" ? window.sessionStorage.getItem(levelChoiceKey) : null;
            if (remembered !== "continue" && remembered !== "restart") {
              setShowLevelPicker(true);
            }
          }
        })
        .catch(() => {
          const savedSpellingLevel = Math.max(1, p.subjectLevels?.spelling ?? p.adaptive.spellingDifficulty ?? 1);
          setProfile({
            ...usageUpdated,
            adaptive: {
              ...usageUpdated.adaptive,
              spellingDifficulty: savedSpellingLevel,
            },
            subjectLevels: {
              ...usageUpdated.subjectLevels,
              spelling: savedSpellingLevel,
            },
          });

          if (savedSpellingLevel > 1) {
            const levelChoiceKey = `starliz_spelling_level_choice_${p.id}`;
            const remembered = typeof window !== "undefined" ? window.sessionStorage.getItem(levelChoiceKey) : null;
            if (remembered !== "continue" && remembered !== "restart") {
              setShowLevelPicker(true);
            }
          }
        });

      setSessionStartStats({
        stars: usageUpdated.stars,
        xp: usageUpdated.xp,
        coins: usageUpdated.coins,
      });

      // Sync coaching memory from server so cross-device consistency is maintained.
      void hydrateCoachingMemoryFromServer(p.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileId) return;
    void fetchProfileHistory(profileId);
  }, [profileId]);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSpellingSession(profile.id, profile.adaptive.spellingDifficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSpellingSession, profile?.id, profile?.adaptive.spellingDifficulty]);

  const wordPool = useMemo(() => (profile ? getSpellingWordPool(profile.adaptive.spellingDifficulty) : []), [profile]);
  const currentContextKey = useMemo(() => {
    if (!profile) return null;
    return [
      profile.id,
      profile.adaptive.spellingDifficulty,
      assignedContentId ?? "",
      assignedAssignmentId ?? "",
    ].join(":");
  }, [assignedAssignmentId, assignedContentId, profile]);
  const allSpellingWords = useMemo(() => {
    const wordsByKey = new Map<string, SpellingWord>();
    for (const difficulty of [1, 2, 3, 4, 5]) {
      for (const word of getSpellingWordPool(difficulty)) {
        const key = word.word.trim().toLowerCase();
        if (!wordsByKey.has(key)) {
          wordsByKey.set(key, word);
        }
      }
    }
    return [...wordsByKey.values()];
  }, []);

  useEffect(() => {
    if (!profile || !wordPool.length || !currentContextKey || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(getResumeStateKey(profile.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedSpellingState;
      if (parsed.contextKey !== currentContextKey || !parsed.currentWord) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentWord(parsed.currentWord);
      // Clamp to within the current session plan's phase count to prevent
      // a stale index (from a longer session) putting the player out of bounds.
      const restoredIndex = parsed.sessionStepIndex ?? 0;
      setSessionStepIndex(
        sessionPlan?.phases.length
          ? Math.min(restoredIndex, sessionPlan.phases.length - 1)
          : restoredIndex,
      );
      setReviewMode(Boolean(parsed.reviewMode));
      setRetryPackMode(Boolean(parsed.retryPackMode));
      setHintLevel(0);
      setAttemptCount(0);
      setAnswer("");
      setBuildSelection([]);
      setAlphaSelection([]);
      setBuildWordRevealed(false);
      setMissingLetterRevealed(false);
      setQuestionStartedAt(Date.now());
      lastAutoSelectionContextRef.current = currentContextKey;
    } catch {
      // Ignore malformed stored data and continue with normal flow.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContextKey, profile, wordPool.length]);

  useEffect(() => {
    if (!profile || !currentContextKey || typeof window === "undefined") return;
    const payload: PersistedSpellingState = {
      currentWord,
      sessionStepIndex,
      reviewMode,
      retryPackMode,
      contextKey: currentContextKey,
    };
    window.sessionStorage.setItem(getResumeStateKey(profile.id), JSON.stringify(payload));
  }, [currentContextKey, currentWord, profile, retryPackMode, reviewMode, sessionStepIndex]);
  const todayWeakSpellingWords = useMemo(
    () => profile?.dailySubjectProgress.weakItems.spelling ?? [],
    [profile?.dailySubjectProgress.weakItems.spelling]
  );
  const weakSpellingRetryIds = useMemo(() => {
    const uniqueIds = new Set<string>();
    const allWordsByValue = new Map(allSpellingWords.map((word) => [word.word.trim().toLowerCase(), word.id]));
    for (const weakWord of todayWeakSpellingWords) {
      const id = allWordsByValue.get(weakWord.trim().toLowerCase());
      if (id) uniqueIds.add(id);
    }
    return [...uniqueIds];
  }, [allSpellingWords, todayWeakSpellingWords]);

  type SpellingWordLike = {
    word: string;
    sentenceContext: string;
    categoryHint: string;
    syllables: string;
  };

  /** Speak the full prompt: sentence context for level 5, otherwise word directly. */
  function speakSpellingPrompt(word: SpellingWordLike): void {
    const level = profile?.adaptive.spellingDifficulty ?? 1;
    const purchasedVoice = profile?.settings.voiceStyle;

    if (displayMode === "listen_type" || displayMode === "boss_test" || displayMode === "recall_test") {
      if (isAlphabetWord(word.word)) {
        void speakWithContext(
          getTutorLine({ subject: "alphabet", answer: word.word, purchasedVoice }),
          "spelling_instruction",
        );
        return;
      }
      if (level >= 5 && word.sentenceContext) {
        // Read sentence naturally, then say the word clearly for spelling
        void speakWithContext(
          `${word.sentenceContext} The word to spell is... ${word.word}.`,
          "spelling_sentence",
        );
        return;
      }
      void speakWithContext(
        getTutorLine({
          subject: "spelling",
          answer: word.word,
          purchasedVoice,
          includeEncouragement: true,
        }),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "missing_letter") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word, missingLetterPrompt.hiddenIndexes.length),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "build_word") {
      const sounds = getBlendText(word.word).soundLine;
      void speakWithContext(
        `Build this word from sounds. ${sounds}`,
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "choose_correct") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "fix_mistake") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "scramble_word") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "alphabetical_order") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word),
        "spelling_instruction",
      );
      return;
    }

    if (displayMode === "pattern_mode") {
      void speakWithContext(
        getSpellingModeVoiceInstruction(displayMode, word.word),
        "spelling_instruction",
      );
      return;
    }

    // Fallback — generic dictation
    void speakWithContext(word.word, "spelling_dictation");
  }

  async function chooseNextWord(currentProfile: ChildProfile, inReviewMode?: boolean, preferAssigned = false, forcedSessionIndex?: number): Promise<void> {
    const isReview = inReviewMode ?? reviewMode;
    const spellingSupportMode = currentProfile.literacySupport?.mode === "spelling_support";
    let nextWord: SpellingWord | null = null;
    let nextSource: "assigned" | "ai-cache" | "static" = "static";
    const nextIndex = forcedSessionIndex ?? sessionStepIndex;

    if (preferAssigned && (assignedAssignmentId || assignedContentId)) {
      const assignedWord = await fetchAssignedSpellingWord(assignedContentId ?? "", assignedAssignmentId);
      if (assignedWord) {
        nextWord = assignedWord;
        nextSource = "assigned";
      }
    }

    if (isReview) {
      const fullReviewPool = getReviewWords(currentProfile, currentProfile.adaptive.spellingDifficulty);
      const reviewPool = fullReviewPool
        .filter((word) => !recentWordIds.includes(word.id));

      if (!reviewQueueIds.length) {
        const cycleIds = reviewPool.map((word) => word.id);
        setReviewQueueIds(cycleIds);
      }

      const queue = reviewQueueIds.length ? reviewQueueIds : reviewPool.map((word) => word.id);
      let remainingQueue = [...queue];
      while (remainingQueue.length && !nextWord) {
        const queuedId = remainingQueue[0];
        remainingQueue = remainingQueue.slice(1);
        nextWord = reviewPool.find((word) => word.id === queuedId)
          ?? fullReviewPool.find((word) => word.id === queuedId)
          ?? null;
      }
      setReviewQueueIds(remainingQueue);

      if (!nextWord) {
        setReviewMode(false);
        if (queue.length) {
          setRetryPackMode(false);
          setFeedback("Retry pack refreshed. Some older weak items are no longer available, so we loaded balanced practice.");
        } else {
          setFeedback("Amazing! You have cleared your tricky words. Back to regular practice!");
        }
      }
    }

    if (!nextWord && !isReview && sessionPlan?.phases.length) {
      const queuedWord = sessionPlan.phases[nextIndex]?.word;
      if (queuedWord) {
        nextWord = allSpellingWords.find((word) => word.word.toLowerCase() === queuedWord.toLowerCase()) ?? null;
      }
    }

    if (!nextWord && !isReview && spellingSupportMode) {
      const weakWordSet = new Set(todayWeakSpellingWords.map((word) => word.trim().toLowerCase()));
      const supportCandidates = allSpellingWords.filter((word) => {
        if (recentWordIds.includes(word.id)) return false;
        const key = word.word.trim().toLowerCase();
        return weakWordSet.has(key) || (currentProfile.weaknessMap[key] ?? 0) > 0;
      });
      if (supportCandidates.length) {
        const weightedId = getWeightedSpellingWordId(currentProfile, supportCandidates, recentWordIds);
        nextWord = supportCandidates.find((word) => word.id === weightedId) ?? supportCandidates[0] ?? null;
      }
    }

    if (!nextWord) {
      const sessionCandidates = allSpellingWords.filter((word) =>
        sessionPlan?.words.includes(word.word.toLowerCase())
        && !recentWordIds.includes(word.id),
      );

      if (sessionCandidates.length) {
        const weightedId = getWeightedSpellingWordId(currentProfile, sessionCandidates, recentWordIds);
        nextWord = sessionCandidates.find((word) => word.id === weightedId) ?? sessionCandidates[0] ?? null;
      }
    }

    if (!nextWord) {
      const aiWord = await fetchAiSpellingWord(currentProfile.adaptive.spellingDifficulty, recentWordIds);
      if (aiWord) {
        nextWord = aiWord;
        nextSource = "ai-cache";
      }
    }

    if (!nextWord) {
      // Exhaust all words in the current pool before allowing any to repeat.
      let availablePool = wordPool.filter((w) => !usedInSessionRef.current.has(w.id));
      if (!availablePool.length) {
        usedInSessionRef.current.clear();
        availablePool = wordPool;
      }
      const weighted = getWeightedSpellingWordId(currentProfile, availablePool, recentWordIds);
      const candidateIds = availablePool.map((w) => w.id);
      const nextId = weighted ?? getNextQuestionId({
        childId: currentProfile.id,
        activity: "spelling",
        level: currentProfile.adaptive.spellingDifficulty,
        candidateIds,
      });
      nextWord = availablePool.find((w) => w.id === nextId) ?? availablePool[0] ?? null;
    }

    setCurrentWord(nextWord);
    setContentSource(nextSource);
    setUsingAssignedContent(nextSource === "assigned");
    setHintLevel(spellingSupportMode ? 1 : 0);
    setAttemptCount(0);
    setCoachOpen(spellingSupportMode);
    setAnswer("");
    setBuildTypedAnswer("");
    setBuildWordRevealed(false);
    setMissingLetterRevealed(false);
    setShowBlendMode(true);
    setBlendStage(0);
    setRequireSpeech(false);
    setSpeechPassed(false);
    setSpeechAttempts(0);
    setSpokenText("");
    setSpeechListening(false);
    setSpeechStatusMessage("");
    setSpeechFallbackReason(null);
    setSpeechLastMatchResult(null);
    setPendingAdvance(null);
    setTutorEmotion("thinking");
    setLessonStage("ASSESS_SPEECH");
    setBuildSelection([]);
    setAlphaSelection([]);
    setQuestionStartedAt(Date.now());
    if (nextWord) {
      usedInSessionRef.current.add(nextWord.id);
      setRecentWordIds((prev) => {
        const merged = [...prev.filter((id) => id !== nextWord.id), nextWord.id];
        return merged.slice(-RECENT_LIMIT);
      });
    }
  }

  useEffect(() => {
    if (assignedAssignmentId || assignedContentId) {
      resetAssignedContentCursor("spelling", assignedContentId, assignedAssignmentId);
    }
  }, [assignedContentId, assignedAssignmentId]);

  useEffect(() => {
    if (!profile || !wordPool.length) return;
    const contextKey = [
      profile.id,
      profile.adaptive.spellingDifficulty,
      assignedContentId ?? "",
      assignedAssignmentId ?? "",
    ].join(":");
    if (lastAutoSelectionContextRef.current === contextKey && currentWord) return;
    lastAutoSelectionContextRef.current = contextKey;
    void chooseNextWord(profile, undefined, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedAssignmentId, assignedContentId, currentWord, profile, wordPool.length]);

  const targetWord = useMemo(() => currentWord, [currentWord]);
  const currentSessionStep = useMemo(() => {
    if (!sessionPlan?.phases.length || !targetWord) return null;
    return sessionPlan.phases[sessionStepIndex]
      ?? sessionPlan.phases.find((entry) => entry.word === targetWord.word.toLowerCase())
      ?? null;
  }, [sessionPlan, sessionStepIndex, targetWord]);
  const spellingDifficulty = profile?.adaptive.spellingDifficulty ?? 1;
  const patternHighlights = useMemo(
    () => Object.entries(sessionPlan?.patternGroups ?? {}).filter(([, words]) => words.length > 1).slice(0, 3),
    [sessionPlan],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const displayMode = useMemo<DisplayMode>(() => {
    if (!currentSessionStep) return "listen_type";
    if (currentSessionStep.phase === "recall") return "recall_test";
    if (currentSessionStep.phase === "boss_test") return "boss_test";
    return currentSessionStep.mode as DisplayMode;
  }, [currentSessionStep]);

  const buildLetters = useMemo(() => {
    if (!targetWord) return [];
    const shuffled = shuffleWithSeed(targetWord.word.split(""), `${targetWord.word}-build`);
    if (shuffled.join("") === targetWord.word) {
      return [...shuffled.slice(1), shuffled[0]];
    }
    return shuffled;
  }, [targetWord]);

  const buildTargetAnswer = useMemo(() => {
    if (!targetWord) return "";
    if (buildLetters.length === targetWord.word.length) return targetWord.word;

    const remainingLetters = new Map<string, number>();
    buildLetters.forEach((letter) => {
      remainingLetters.set(letter, (remainingLetters.get(letter) ?? 0) + 1);
    });

    const orderedVisibleLetters = targetWord.word
      .split("")
      .filter((letter) => {
        const remaining = remainingLetters.get(letter) ?? 0;
        if (remaining <= 0) return false;
        remainingLetters.set(letter, remaining - 1);
        return true;
      })
      .join("");

    if (orderedVisibleLetters.length === buildLetters.length) {
      return orderedVisibleLetters;
    }

    return targetWord.word.slice(0, buildLetters.length);
  }, [buildLetters, targetWord]);

  const validBuildSelection = useMemo(
    () => buildSelection.filter((index) => index >= 0 && index < buildLetters.length),
    [buildLetters.length, buildSelection],
  );

  const selectedBuildLetters = useMemo(
    () => validBuildSelection.map((index) => buildLetters[index] ?? ""),
    [buildLetters, validBuildSelection],
  );

  const selectedBuildWord = useMemo(
    () => selectedBuildLetters.join(""),
    [selectedBuildLetters],
  );

  const buildDisplaySlots = useMemo(
    () => Array.from({ length: buildLetters.length }, (_, index) => (
      buildWordRevealed ? buildTargetAnswer[index] ?? "_" : selectedBuildLetters[index] ?? "_"
    )),
    [buildLetters.length, buildTargetAnswer, buildWordRevealed, selectedBuildLetters],
  );

  const buildWordStateAligned = useMemo(
    () => validBuildSelection.length <= buildLetters.length
      && buildDisplaySlots.length === buildLetters.length
      && buildTargetAnswer.length === buildLetters.length,
    [buildDisplaySlots.length, buildLetters.length, buildTargetAnswer.length, validBuildSelection.length],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const missingLetterPrompt = useMemo(() => {
    if (!targetWord) return { maskedWord: "", missingLetters: "", hiddenIndexes: [] as number[], letters: [] as string[] };
    const letters = targetWord.word.split("");
    const available = letters.map((_, index) => index).filter((index) => index !== 0 && index !== letters.length - 1);
    const performanceBonus = sessionCorrect >= 3 || (wordMemorySummary?.masteredWords ?? 0) > (wordMemorySummary?.weakWords ?? 0);
    const hiddenCount = spellingDifficulty <= 2 ? 1 : Math.min(2, available.length, performanceBonus || targetWord.word.length >= 5 ? 2 : 1);
    const hiddenIndexes = shuffleWithSeed(available, `${targetWord.word}-missing`).slice(0, hiddenCount).sort((a, b) => a - b);
    return {
      maskedWord: letters.map((letter, index) => (hiddenIndexes.includes(index) ? "_" : letter)).join(" "),
      missingLetters: hiddenIndexes.map((index) => letters[index]).join(""),
      letters,
      hiddenIndexes,
    };
  }, [sessionCorrect, spellingDifficulty, targetWord, wordMemorySummary?.masteredWords, wordMemorySummary?.weakWords]);

  const missingLetterChoiceOptions = useMemo(() => {
    if (!targetWord) return [];
    const optionCount = spellingDifficulty <= 2 ? 4 : spellingDifficulty <= 4 ? 5 : 6;
    const distractors = shuffleWithSeed(
      "abcdefghijklmnopqrstuvwxyz"
        .split("")
        .filter((letter) => !missingLetterPrompt.missingLetters.includes(letter) && !targetWord.word.includes(letter)),
      `${targetWord.word}-missing-options`,
    ).slice(0, Math.max(2, optionCount - missingLetterPrompt.missingLetters.length));
    return shuffleWithSeed(
      [...missingLetterPrompt.missingLetters.split(""), ...distractors],
      `${targetWord.word}-missing-options-display`,
    );
  }, [missingLetterPrompt.missingLetters, spellingDifficulty, targetWord]);

  const missingLetterDisplaySlots = useMemo(() => {
    if (!targetWord) return [] as Array<{ key: string; value: string; isHidden: boolean; isFilled: boolean }>;
    let filledIndex = 0;
    return missingLetterPrompt.letters.map((letter, index) => {
      const isHidden = missingLetterPrompt.hiddenIndexes.includes(index);
      const value = isHidden
        ? (missingLetterRevealed ? letter : answer[filledIndex] ?? "_")
        : letter;
      if (isHidden) filledIndex += 1;
      return {
        key: `${letter}-${index}`,
        value,
        isHidden,
        isFilled: isHidden && value !== "_",
      };
    });
  }, [answer, missingLetterPrompt.hiddenIndexes, missingLetterPrompt.letters, missingLetterRevealed, targetWord]);

  const chooseCorrectOptions = useMemo(() => {
    if (!targetWord) return [];
    const variants = [
      targetWord.word,
      makeIncorrectSpelling(targetWord.word),
      `${targetWord.word}${targetWord.word.endsWith("e") ? "" : "e"}`,
      targetWord.word.split("").reverse().join(""),
    ];
    return shuffleWithSeed([...new Set(variants)].slice(0, 4), `${targetWord.word}-choose`);
  }, [targetWord]);

  const incorrectWordPrompt = useMemo(() => (targetWord ? makeIncorrectSpelling(targetWord.word) : ""), [targetWord]);

  const scrambledWord = useMemo(() => {
    if (!targetWord) return "";
    const scrambled = shuffleWithSeed(targetWord.word.split(""), `${targetWord.word}-scramble`).join("");
    return scrambled === targetWord.word ? `${targetWord.word.slice(1)}${targetWord.word[0] ?? ""}` : scrambled;
  }, [targetWord]);

  const alphabeticalWords = useMemo(() => {
    if (!targetWord) return [];
    const sourceWords = [...new Set([...(sessionPlan?.words ?? []), ...wordPool.map((entry) => entry.word)])]
      .filter((word) => word !== targetWord.word && Math.abs(word.length - targetWord.word.length) <= 1)
      .slice(0, 8);
    const companions = shuffleWithSeed(sourceWords, `${targetWord.word}-alpha`).slice(0, 2);
    const words = [...new Set([targetWord.word, ...companions])].slice(0, 3);
    return shuffleWithSeed(words, `${targetWord.word}-alpha-display`);
  }, [sessionPlan?.words, targetWord, wordPool]);

  const alphabeticalCorrectAnswer = useMemo(
    () => [...alphabeticalWords].sort(compareAlphabetically).join("|"),
    [alphabeticalWords],
  );

  const patternFamilyWords = useMemo(() => {
    if (!targetWord) return [];
    const family = sessionPlan?.patternGroups[targetWord.patterns?.[0] ?? ""]
      ?? sessionPlan?.patternGroups[targetWord.word.slice(-3)]
      ?? [];
    return family.filter((word) => word !== targetWord.word).slice(0, 3);
  }, [sessionPlan?.patternGroups, targetWord]);

  const patternModeOptions = useMemo(() => {
    if (!targetWord) return [];
    const targetPatterns = new Set(targetWord.patterns ?? []);
    const nonMatchingCandidates = wordPool
      .filter(
        (entry) =>
          entry.word !== targetWord.word &&
          !patternFamilyWords.includes(entry.word) &&
          !(entry.patterns ?? []).some((p) => targetPatterns.has(p)),
      )
      .map((entry) => entry.word);
    // Fallback: if no non-matching words exist, just exclude targetWord
    const pool = nonMatchingCandidates.length >= 3
      ? nonMatchingCandidates
      : wordPool.map((e) => e.word).filter((w) => w !== targetWord.word && !patternFamilyWords.includes(w));
    const distractors = shuffleWithSeed(pool, `${targetWord.word}-pattern-distractors`).slice(0, 3);
    return shuffleWithSeed([targetWord.word, ...distractors].slice(0, 4), `${targetWord.word}-pattern`);
  }, [patternFamilyWords, targetWord, wordPool]);

  const modeTitle = useMemo(() => MODE_LABELS[displayMode], [displayMode]);
  const blendText = useMemo(() => getBlendText(targetWord?.word ?? ""), [targetWord?.word]);
  const tutorPersonality = (profile?.settings?.voiceStyle ?? "default") as TutorPersonality;
  const isLetterConversation = useMemo(
    () => Boolean(targetWord && isAlphabetWord(targetWord.word) && displayMode === "listen_type"),
    [displayMode, targetWord],
  );
  const isWordConversation = displayMode === "build_word";
  const usesTutorConversation = isLetterConversation || isWordConversation;
  const letterChoiceOptions = useMemo(
    () => (isLetterConversation && targetWord ? generateLetterOptions([targetWord.word]) : []),
    [isLetterConversation, targetWord],
  );
  const modePromptTitle = useMemo(() => {
    if (isWordConversation) return "What word do you see on the screen?";
    if (isLetterConversation) return "What letter do you see on the screen?";
    return getSpellingModePromptTitle(displayMode, targetWord?.word);
  }, [displayMode, isLetterConversation, isWordConversation, targetWord?.word]);
  const modeDescription = useMemo(() => {
    if (isWordConversation) {
      if (lessonStage === "TAP_SELECT") return "Now type the word.";
      if (lessonStage === "TEACH_RETRY") return "Listen to the tutor, then try saying it again.";
      return "Say the word you see on the screen.";
    }
    if (isLetterConversation) {
      if (lessonStage === "TAP_SELECT") {
        const letterLabel = describeVisualTarget(targetWord?.word ?? "");
        return `Now tap ${letterLabel}.`;
      }
      if (lessonStage === "TEACH_RETRY") return "Listen to the tutor, then try saying it again.";
      return "Say the letter you see on the screen.";
    }
    return getSpellingModeInstruction(displayMode, targetWord?.word, missingLetterPrompt.hiddenIndexes.length);
  }, [displayMode, isLetterConversation, isWordConversation, missingLetterPrompt.hiddenIndexes.length, targetWord?.word, lessonStage]);
  const tutorFace = {
    idle: "🙂",
    thinking: "🤔",
    listening: "👂",
    encouraging: "😊",
    celebrating: "🎉",
    supporting: "💛",
    try_again: "🙂",
  }[tutorEmotion];

  const helpLocked = currentSessionStep?.noHints === true || displayMode === "recall_test" || displayMode === "boss_test";

  const currentJourneyIndex = useMemo(() => {
    switch (currentSessionStep?.phase) {
      case "learn":
        return 0;
      case "practice":
      case "pattern":
      case "mini_test":
        return 1;
      case "recall":
        return 2;
      case "boss_test":
        return 3;
      default:
        return 0;
    }
  }, [currentSessionStep?.phase]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const journeyStepLabel = useMemo(() => {
    if (!sessionPlan?.phases.length) return "Step 1 of 1";
    return `Step ${Math.min(sessionStepIndex + 1, sessionPlan.phases.length)} of ${sessionPlan.phases.length}`;
  }, [sessionPlan?.phases.length, sessionStepIndex]);

  const sessionWeakWordList = useMemo(
    () => [...new Set([...(sessionPlan?.weakWords ?? []), ...sessionWeakWords])],
    [sessionPlan?.weakWords, sessionWeakWords],
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const queueProgressSegments = useMemo(() => {
    if (!sessionPlan?.phases.length) return [];
    return sessionPlan.phases.map((phase, index) => ({
      id: `${phase.word}-${index}`,
      done: index < sessionStepIndex,
      current: index === sessionStepIndex,
    }));
  }, [sessionPlan?.phases, sessionStepIndex]);

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

  function getNextSessionIndex(): number {
    if (!sessionPlan?.phases.length) return 0;
    return Math.min(sessionStepIndex + 1, sessionPlan.phases.length - 1);
  }

  function isLastSessionStep(): boolean {
    if (!sessionPlan?.phases.length) return false;
    return sessionStepIndex >= sessionPlan.phases.length - 1;
  }

  function startSessionRun(nextProfile: ChildProfile, feedbackMessage = ""): void {
    setShowBossCelebration(false);
    setCurrentWord(null);
    setReviewMode(false);
    setRetryPackMode(false);
    setSessionCorrect(0);
    setAttemptCount(0);
    setHintLevel(0);
    setAnswer("");
    setBuildTypedAnswer("");
    setFeedback(feedbackMessage);
    setReaction(null);
    setTutorFeedback("");
    setBuildWordRevealed(false);
    setMissingLetterRevealed(false);
    setShowBlendMode(false);
    setBlendStage(0);
    setRequireSpeech(false);
    setSpeechPassed(false);
    setSpeechAttempts(0);
    setSpokenText("");
    setSpeechListening(false);
    setSpeechStatusMessage("");
    setSpeechFallbackReason(null);
    setSpeechLastMatchResult(null);
    setPendingAdvance(null);
    setBuildSelection([]);
    setAlphaSelection([]);
    setMasteredTodayWords([]);
    setSessionWeakWords([]);
    setSessionStepIndex(0);
    setBossStats({ correct: 0, total: 0 });
    setBossBonusSummary({ completion: 0, perfect: 0 });
    setBossTransitionStage("idle");
    setBossCountdownValue(null);
    setBossPromptReady(true);
    bossTransitionShownRef.current = false;
    setSessionStartStats({
      stars: nextProfile.stars,
      xp: nextProfile.xp,
      coins: nextProfile.coins,
    });
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(getResumeStateKey(nextProfile.id));
    }
    void loadSpellingSession(nextProfile.id, nextProfile.adaptive.spellingDifficulty);
    void chooseNextWord(nextProfile, false, true, 0);
  }

  function restartCurrentSession(): void {
    if (!profile) return;
    startSessionRun(profile);
  }

  function continueToNextLevel(): void {
    if (!profile) return;
    const currentLevel = Math.max(1, profile.subjectLevels?.spelling ?? profile.adaptive.spellingDifficulty ?? 1);
    const nextLevel = Math.min(5, currentLevel + 1);
    if (nextLevel === currentLevel) {
      startSessionRun(profile, "You have already reached the highest spelling level.");
      return;
    }

    const advancedProfile: ChildProfile = {
      ...profile,
      adaptive: {
        ...profile.adaptive,
        spellingDifficulty: nextLevel,
        spellingStreak: 0,
      },
      subjectLevels: {
        ...profile.subjectLevels,
        spelling: nextLevel,
      },
    };

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(getSavedLevelKey(profile.id), String(nextLevel));
      window.sessionStorage.setItem(getLevelChoiceKey(profile.id), "continue");
    }

    setProfile(advancedProfile);
    saveProfile(advancedProfile);
    startSessionRun(advancedProfile, `Great work. Welcome to ${LEVEL_LABELS[nextLevel]}.`);
  }

  const targetText = targetWord?.word.toLowerCase() ?? "";
  const visualPromptType = targetWord?.promptType === "image" && !targetWord.imageUrl
    ? "voice"
    : (targetWord?.promptType ?? "voice");
  const showMissingImageDebug = process.env.NODE_ENV !== "production"
    && targetWord?.promptType === "image"
    && !targetWord.imageUrl;
  const levelLabel = LEVEL_LABELS[spellingDifficulty] ?? LEVEL_LABELS[1];
  const currentSpellingLevel = Math.max(1, profile?.subjectLevels?.spelling ?? profile?.adaptive.spellingDifficulty ?? 1);
  const nextSpellingLevel = currentSpellingLevel < 5 ? currentSpellingLevel + 1 : null;
  const literacySupportMode = profile?.literacySupport?.mode ?? "balanced";
  const spellingSupportActive = literacySupportMode === "spelling_support";
  const readingSupportActive = literacySupportMode === "reading_support";
  const isLearnPhase = currentSessionStep?.phase === "learn";
  const showEmojiVisualHint = (spellingDifficulty <= 2 || isLearnPhase) && Boolean(targetWord?.emoji);
  const showVisualPrompt = isVisualMode(displayMode);

  const hintMessage = useMemo(() => getSpellingHintMessage({
    level: hintLevel,
    word: targetWord?.word,
    categoryHint: targetWord?.categoryHint,
    syllables: targetWord?.syllables,
  }), [hintLevel, targetWord?.categoryHint, targetWord?.syllables, targetWord?.word]);

  useEffect(() => {
    if (currentSessionStep?.phase !== "boss_test") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBossTransitionStage("idle");
      setBossCountdownValue(null);
      setBossPromptReady(true);
      return;
    }

    if (bossTransitionShownRef.current) {
      setBossPromptReady(true);
      return;
    }

    bossTransitionShownRef.current = true;
    setBossPromptReady(false);

    if (spellingDifficulty <= 2) {
      const readyTimer = window.setTimeout(() => setBossPromptReady(true), 300);
      return () => window.clearTimeout(readyTimer);
    }

    if (spellingDifficulty <= 4) {
      setBossTransitionStage("unlock");
      const unlockTimer = window.setTimeout(() => {
        setBossTransitionStage("idle");
        setBossPromptReady(true);
      }, 550);
      return () => window.clearTimeout(unlockTimer);
    }

    setBossTransitionStage("unlock");
    setBossCountdownValue(3);
    const timers = [
      window.setTimeout(() => setBossTransitionStage("countdown"), 300),
      window.setTimeout(() => setBossCountdownValue(2), 500),
      window.setTimeout(() => setBossCountdownValue(1), 700),
      window.setTimeout(() => {
        setBossTransitionStage("idle");
        setBossCountdownValue(null);
        setBossPromptReady(true);
      }, 900),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [currentSessionStep?.phase, spellingDifficulty]);

  useEffect(() => {
    if (!targetWord) return;
    if (usesTutorConversation) return;
    if (displayMode === "boss_test" && !bossPromptReady) return;
    const key = `${targetWord.id ?? targetWord.word}:${displayMode}`;
    const now = Date.now();
    if (lastPromptRef.current && lastPromptRef.current.key === key && now - lastPromptRef.current.at < 250) {
      return;
    }
    lastPromptRef.current = { key, at: now };
    if (displayMode === "boss_test") {
      const timer = window.setTimeout(() => speakSpellingPrompt(targetWord), 250);
      return () => window.clearTimeout(timer);
    }
    speakSpellingPrompt(targetWord);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossPromptReady, displayMode, targetWord, usesTutorConversation]);

  const speakTutorLine = useCallback((line: string, emotion: TutorEmotion) => {
    setTutorEmotion(emotion);
    void speakWithContext(applyTutorPersonality(line, tutorPersonality), "spelling_instruction");
  }, [tutorPersonality]);

  useEffect(() => {
    if (!targetWord || !usesTutorConversation) return;
    const timer = window.setTimeout(() => {
      if (isWordConversation) {
        speakTutorLine("What word do you see on the screen?", "listening");
      } else {
        speakTutorLine("What letter do you see on the screen?", "listening");
      }
      setLessonStage("ASSESS_SPEECH");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [isWordConversation, speakTutorLine, targetWord, usesTutorConversation]);

  useEffect(() => {
    if (!targetWord || !usesTutorConversation) return;
    const timer = window.setTimeout(() => {
      if (lessonStage === "ASSESS_SPEECH") {
        if (isWordConversation) {
          speakTutorLine("What word do you see on the screen?", "listening");
        } else {
          speakTutorLine("What letter do you see on the screen?", "listening");
        }
        return;
      }
      if (lessonStage === "TEACH_RETRY") {
        if (isLetterConversation) {
          speakTutorLine(`Good try. Look again. This is the letter ${describeVisualTarget(targetWord.word)}. Say ${targetWord.word}.`, "supporting");
        } else {
          speakTutorLine(`Good try. Look again. This is the word ${targetWord.word}. Say ${targetWord.word}.`, "supporting");
        }
        return;
      }
      if (lessonStage === "TAP_SELECT") {
        if (isWordConversation) {
          speakTutorLine("Now type the word.", "supporting");
        } else {
          speakTutorLine(`Now tap ${describeVisualTarget(targetWord.word)}.`, "supporting");
        }
        return;
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [isLetterConversation, isWordConversation, speakTutorLine, targetWord, lessonStage, usesTutorConversation]);

  async function awardCoinBonus(baseProfile: ChildProfile, bonusCoins: number, source: "recall_test" | "boss_test" | "bonus"): Promise<ChildProfile> {
    if (bonusCoins <= 0) return baseProfile;
    return awardChildRewards({
      childId: baseProfile.id,
      profile: baseProfile,
      source,
      coins: bonusCoins,
      note: source === "boss_test" ? "Boss test bonus" : source === "recall_test" ? "Recall test bonus" : "Bonus reward",
      difficulty: baseProfile.adaptive.spellingDifficulty,
      activityName: source === "boss_test" ? "Boss Test Bonus" : source === "recall_test" ? "Recall Test Bonus" : "Bonus Reward",
    });
  }

  function repeatQuestion() {
    if (!targetWord) return;
    if (usesTutorConversation) {
      if (lessonStage === "ASSESS_SPEECH") {
        if (isWordConversation) {
          speakTutorLine("What word do you see on the screen?", "listening");
        } else {
          speakTutorLine("What letter do you see on the screen?", "listening");
        }
        return;
      }
      if (lessonStage === "TEACH_RETRY") {
        if (isLetterConversation) {
          speakTutorLine(`Good try. Look again. This is the letter ${describeVisualTarget(targetWord.word)}. Say ${targetWord.word}.`, "supporting");
        } else {
          speakTutorLine(`Good try. Look again. This is the word ${targetWord.word}. Say ${targetWord.word}.`, "supporting");
        }
        return;
      }
      if (lessonStage === "TAP_SELECT") {
        speakTutorLine(isWordConversation ? "Now type the word." : `Now tap ${describeVisualTarget(targetWord.word)}.`, "encouraging");
        return;
      }
    }
    speakSpellingPrompt(targetWord);
  }

  function makeItEasier() {
    if (!targetWord || helpLocked) return;
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    const spokenHint = getSpellingHintMessage({
      level: nextLevel,
      word: targetWord.word,
      categoryHint: targetWord.categoryHint,
      syllables: targetWord.syllables,
    });
    if (spokenHint) {
      void speakWithContext(getSpellingHintSpeech(spokenHint), "spelling_instruction");
    }
  }

  function runCoachAction(mode: "repeat" | "slow" | "syllables" | "hint") {
    if (!targetWord || (helpLocked && mode !== "repeat")) return;
    if (mode === "repeat") {
      repeatQuestion();
      return;
    }
    if (mode === "slow") {
      // Say the word slowly, stretching phonetic sounds — say it twice
      void speakWithContext(`${targetWord.word}... ${targetWord.word}.`, "spelling_slow");
      return;
    }
    if (mode === "syllables") {
      const syllableParts = targetWord.syllables.split("-").map((s) => s.trim()).filter(Boolean);
      if (syllableParts.length <= 1) {
        // Single syllable — acknowledge it and say the word
        void speakWithContext(`${targetWord.word} has just one beat. ${targetWord.word}.`, "spelling_syllables");
      } else {
        const parts = syllableParts.join("... ");
        void speakWithContext(`${parts}... ${targetWord.word}.`, "spelling_syllables");
      }
      return;
    }
    makeItEasier();
  }

  function skipWord() {
    if (!profile || !targetWord) return;
    setFeedback(`Skipped ${targetWord.word}. Next word ready.`);
    if (!reviewMode && isLastSessionStep()) {
      setBossBonusSummary({ completion: 0, perfect: 0 });
      setShowBossCelebration(true);
      return;
    }
    const nextIndex = reviewMode ? sessionStepIndex : getNextSessionIndex();
    if (!reviewMode) setSessionStepIndex(nextIndex);
    void chooseNextWord(profile, reviewMode, true, nextIndex);
  }

  function handleBuildLetterClick(letter: string, index: number): void {
    if (showBlendMode || !targetWord || lessonStage !== "TAP_SELECT") return;
    if (validBuildSelection.includes(index)) return;
    if (validBuildSelection.length >= buildLetters.length) return;

    const expectedLetter = buildTargetAnswer[validBuildSelection.length] ?? "";
    if (letter !== expectedLetter) {
      const position = validBuildSelection.length;
      const mistakeType = position === 0
        ? "wrong_start_sound"
        : position === Math.floor(buildTargetAnswer.length / 2)
          ? "wrong_vowel"
          : position === buildTargetAnswer.length - 1
            ? "wrong_end_sound"
            : "wrong_order";
      setLastMistakeType(mistakeType);
      setTutorEmotion("try_again");
      setFeedback(`${buildTargetAnswer} starts with ${buildTargetAnswer[0]}. Try ${expectedLetter} first.`);
      void speakWithContext(applyTutorPersonality(`Good try. The next letter is ${expectedLetter}.`, tutorPersonality), "spelling_instruction");
      return;
    }

    setTutorEmotion("encouraging");
    void speakWithContext(letter, "spelling_instruction");
    const nextSelection = [...validBuildSelection, index];
    const nextWord = nextSelection.map((selectedIndex) => buildLetters[selectedIndex] ?? "").join("");
    setBuildSelection(nextSelection);
    if (nextWord.trim().toLowerCase() === buildTargetAnswer.trim().toLowerCase()) {
      setBuildWordRevealed(true);
      setTutorEmotion("celebrating");
      setLessonStage("TAP_SELECT");
      void speakWithContext(applyTutorPersonality("Now type the word.", tutorPersonality), "spelling_instruction");
    }
  }

  function continueWithParentTeacherOverride(): void {
    setSpeechListening(false);
    setSpeechFallbackReason(null);
    setSpeechStatusMessage("Parent/teacher continue enabled for this step.");

    if (usesTutorConversation) {
      setLessonStage("TAP_SELECT");
      return;
    }

    setSpeechPassed(true);
    setRequireSpeech(false);
    if (pendingAdvance && profile) {
      const nextIndex = pendingAdvance.nextIndex;
      const inReview = pendingAdvance.inReview;
      setPendingAdvance(null);
      void chooseNextWord(profile, inReview, true, nextIndex);
    }
  }

  function handleAlphabetLetterTap(letter: string): void {
    if (!targetWord || !isLetterConversation || lessonStage !== "TAP_SELECT") return;
    if (letter === targetWord.word) {
      setTutorEmotion("encouraging");
      void speakWithContext(letter, "spelling_instruction");
      setLessonStage("COMPLETE");
      setAnswer(letter);
      void checkAnswer(letter, targetWord.word, letter);
      return;
    }

    setTutorEmotion("try_again");
    setFeedback(`Good try. Tap ${targetWord.word.toUpperCase()}.`);
    void speakWithContext(applyTutorPersonality(`Good try. The letter is ${targetWord.word}.`, tutorPersonality), "spelling_instruction");
  }

  function handleSpeechResult(transcript: string, source: "speech" | "manual" = "speech"): void {
    if (!targetWord) return;
    const normalizedTranscript = normalizeSpeechTranscript(transcript);
    if (!normalizedTranscript) {
      setSpeechListening(false);
      setSpeechStatusMessage("I could not hear you. Try again.");
      setSpeechLastMatchResult("no-speech");
      setSpeechFallbackReason(null);
      return;
    }

    const matchResult = classifySpeechMatch(transcript, targetWord.word);
    const passed = matchResult !== "wrong";
    setSpeechListening(false);
    setSpokenText(transcript);
    setSpeechFallbackReason(null);
    setSpeechPassed(passed);
    setSpeechLastMatchResult(matchResult);
    setSpeechAttempts((attempts) => attempts + 1);

    void syncAttemptToServer({
      studentId: profile?.id ?? "",
      subject: "spelling",
      spellingMode: displayMode,
      skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
      questionText: targetWord.word,
      answerGiven: buildTypedAnswer,
      correctAnswer: targetWord.word,
      correct: matchResult === "exact",
      responseTimeMs: 0,
      hintsUsed: hintLevel,
      difficulty: profile?.adaptive.spellingDifficulty ?? 1,
      skills: serializeSkills([skillFocusToCode(targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "") ?? "cvc"].filter(Boolean)),
      pronunciationAttempted: source === "speech",
      pronunciationPassed: matchResult === "exact",
      spokenText: transcript,
      targetText: targetWord.word,
      errorType: matchResult === "exact" ? undefined : matchResult === "close" ? "close_match" : (lastMistakeType ?? "wrong_order"),
    });

    if (usesTutorConversation && (lessonStage === "ASSESS_SPEECH" || lessonStage === "TEACH_RETRY")) {
      if (matchResult === "exact") {
        setSpeechPassed(true);
        setSpeechStatusMessage("");
        const visualTarget = describeVisualTarget(targetWord.word);
        const successLine = `Yes, that's ${visualTarget}. Well done.`;
        setFeedback(successLine);
        setTutorEmotion("celebrating");
        void speakWithContext(applyTutorPersonality(successLine, tutorPersonality), "spelling_instruction");
        setLessonStage("TAP_SELECT");
        return;
      }

      if (matchResult === "close") {
        setSpeechStatusMessage("");
        const closeLine = `Good speaking. Let's say it again clearly: ${targetWord.word}.`;
        setFeedback(closeLine);
        setTutorEmotion("supporting");
        void speakWithContext(applyTutorPersonality(closeLine, tutorPersonality), "spelling_instruction");
        // Stay in ASSESS_SPEECH for clean retry — big word still shown
        setLessonStage("ASSESS_SPEECH");
        return;
      }

      // matchResult === "wrong"
      setSpeechStatusMessage(`I heard: ${transcript}`);
      setTutorEmotion("supporting");
      const retryCount = speechAttempts + 1;
      const supportLine = isWordConversation
        ? `Good try. Look again. This is the word ${targetWord.word}. Say ${targetWord.word}.`
        : `Good try. Look again. This is the letter ${describeVisualTarget(targetWord.word)}. Say ${targetWord.word}.`;
      const extraSupport = retryCount >= 3 ? ` This is ${describeVisualTarget(targetWord.word)}. Say ${targetWord.word} with me.` : "";
      const fullSupportLine = `${supportLine}${extraSupport}`;
      setFeedback(fullSupportLine);
      void speakWithContext(applyTutorPersonality(fullSupportLine, tutorPersonality), "spelling_instruction");
      setLessonStage("TEACH_RETRY");
      return;
    }

    if (passed) {
      setSpeechStatusMessage("Good speaking!");
      void speakWithContext("Good speaking!", "spelling_instruction");
      if (pendingAdvance && profile) {
        const nextIndex = pendingAdvance.nextIndex;
        const inReview = pendingAdvance.inReview;
        setPendingAdvance(null);
        setRequireSpeech(false);
        setSpeechAttempts(0);
        setSpeechPassed(true);
        void chooseNextWord(profile, inReview, true, nextIndex);
      }
      return;
    }

    if (speechAttempts >= 1) {
      setSpeechStatusMessage("");
      void speakWithContext("Good try! Let's move on.", "spelling_instruction");
      if (pendingAdvance && profile) {
        const nextIndex = pendingAdvance.nextIndex;
        const inReview = pendingAdvance.inReview;
        setPendingAdvance(null);
        setRequireSpeech(false);
        void chooseNextWord(profile, inReview, true, nextIndex);
      }
      return;
    }

    setSpeechStatusMessage(`I heard: ${transcript}`);
    void speakWithContext(`Try saying it again with me: ${targetWord.word}.`, "spelling_instruction");
  }

  function startListening(): void {
    if (typeof window === "undefined") return;
    const AnyWindow = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    };
    const RecognitionCtor = AnyWindow.SpeechRecognition ?? AnyWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechListening(false);
      setSpeechStatusMessage("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      setSpeechFallbackReason("unsupported");
      return;
    }

    const isSecureOrigin = window.location.protocol === "https:" || window.location.hostname === "localhost";
    if (!isSecureOrigin) {
      setSpeechListening(false);
      setSpeechStatusMessage("Microphone requires a secure origin. Open this lesson on http://localhost:3000 or HTTPS.");
      setSpeechFallbackReason("unsupported");
      return;
    }

    setSpeechListening(true);
    setSpeechFallbackReason(null);
    setSpeechStatusMessage(isLetterConversation ? "Listening now... say the letter." : "Listening now... say the word.");
    console.log("Speech recognition started");
    const recognition = new RecognitionCtor();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      console.log("Speech heard:", transcript);
      handleSpeechResult(transcript, "speech");
    };
    recognition.onerror = (event: { error?: string }) => {
      setSpeechListening(false);
      console.log("Speech recognition error:", event?.error ?? "unknown");
      const code = event?.error ?? "unknown";
      if (code === "network") {
        setSpeechStatusMessage("Voice service is not available right now. Please try again, or use parent/teacher continue.");
        setSpeechFallbackReason("network");
        return;
      }
      if (code === "not-allowed") {
        setSpeechStatusMessage("Microphone permission is blocked. Please allow microphone access.");
        setSpeechFallbackReason("not-allowed");
        return;
      }
      if (code === "no-speech") {
        setSpeechStatusMessage("I could not hear you. Try again.");
        setSpeechFallbackReason(null);
        return;
      }
      if (code === "audio-capture") {
        setSpeechStatusMessage("No microphone was found. Please connect or enable a microphone.");
        setSpeechFallbackReason(null);
        return;
      }
      setSpeechStatusMessage("I could not hear you. Try again.");
      setSpeechFallbackReason(null);
    };
    recognition.onend = () => {
      setSpeechListening(false);
    };
    recognition.start();
  }

  async function checkAnswer(submittedAnswer?: string, expectedAnswer?: string, memoryInput?: string) {
    if (!profile || !targetWord) return;
    if (isUsageLocked(profile)) {
      setFeedback("Screen-time limit reached. Ask parent to unlock more time.");
      return;
    }
    // eslint-disable-next-line react-hooks/purity
    const responseMs = questionStartedAt > 0 ? Date.now() - questionStartedAt : 0;
    const nextAnswer = submittedAnswer ?? answer;
    const spellingSupportMode = profile.literacySupport?.mode === "spelling_support";
    const normalized = nextAnswer.trim().toLowerCase();
    const normalizedExpected = (expectedAnswer ?? targetText).trim().toLowerCase();
    const buildOrderMismatch = displayMode === "build_word" && selectedBuildWord.trim().toLowerCase() !== buildTargetAnswer.trim().toLowerCase();

    const memoryPayload = await updateWordMemory(profile.id, targetWord.word, memoryInput ?? nextAnswer);
    if (memoryPayload) {
      void loadSpellingSession(profile.id, profile.adaptive.spellingDifficulty);
      if (memoryPayload.updated.status === "mastered") {
        setMasteredTodayWords((prev) => (prev.includes(targetWord.word) ? prev : [...prev, targetWord.word]));
      }
      if (memoryPayload.updated.status === "weak") {
        setSessionWeakWords((prev) => (prev.includes(targetWord.word) ? prev : [...prev, targetWord.word]));
      } else if (memoryPayload.updated.status === "mastered") {
        setSessionWeakWords((prev) => prev.filter((word) => word !== targetWord.word));
      }
    }

    if (!buildOrderMismatch && normalized === normalizedExpected) {
      const wasBuildWordMode = displayMode === "build_word";
      const wasMissingLetterMode = displayMode === "missing_letter";
      const wasRecallOrBossMode = displayMode === "recall_test" || displayMode === "boss_test";
      const bossAnswerStats = displayMode === "boss_test"
        ? { correct: bossStats.correct + 1, total: bossStats.total + 1 }
        : bossStats;
      const prevLevel = levelFromXp(profile.xp);
      const result = processSpellingAttempt(profile, true, targetWord.id ?? undefined, {
        hintsUsed: hintLevel,
        responseMs,
        supportTag: targetWord.word,
        masteryTag: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "core_word",
        weakItemKey: targetWord.word.toLowerCase(),
        difficultyBand: targetWord.level < profile.adaptive.spellingDifficulty ? "easier" : targetWord.level > profile.adaptive.spellingDifficulty ? "challenge" : "core",
      });
      const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
      const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
      const attemptPayload = {
        studentId: profile.id,
        subject: "spelling",
        spellingMode: displayMode,
        skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
        contentId: attemptContentId,
        assignmentId: attemptAssignmentId,
        questionText: targetWord.word,
        answerGiven: nextAnswer,
        correctAnswer: targetWord.word,
        correct: true,
        responseTimeMs: Math.round(responseMs),
        hintsUsed: hintLevel,
        difficulty: profile.adaptive.spellingDifficulty,
        skills: serializeSkills([skillFocusToCode(targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "") ?? "cvc"].filter(Boolean)),
        errorType: undefined,
      } as const;
      if (attemptAssignmentId || attemptContentId) {
        await syncAttemptToServer(attemptPayload);
      } else {
        void syncAttemptToServer(attemptPayload);
      }
      setAttemptCount(0);
      setAnswer("");
      setBuildTypedAnswer("");
      setBuildSelection([]);
      setAlphaSelection([]);

      const activityName = displayMode === "boss_test"
        ? "Boss Test"
        : displayMode === "recall_test"
          ? "Recall Test"
          : "Spelling Quest";
      let attemptProfile: Awaited<ReturnType<typeof awardChildRewards>>;
      try {
        attemptProfile = await awardChildRewards({
          childId: profile.id,
          source: "spelling",
          coins: result.rewardDelta.coins,
          xp: result.rewardDelta.xp,
          stars: result.rewardDelta.stars,
          note: `${displayMode.replaceAll("_", " ")} answer correct.`,
          difficulty: profile.adaptive.spellingDifficulty,
          activityName,
          profile: result.profile,
        });
      } catch {
        attemptProfile = result.profile;
        saveProfile(result.profile);
      }
      const baseCoinsEarned = result.rewardDelta.coins;
      const targetCoinsEarned = displayMode === "boss_test" ? 5 : displayMode === "recall_test" ? 2 : 0;
      const bonusCoins = targetCoinsEarned ? Math.max(0, targetCoinsEarned - baseCoinsEarned) : 0;
      const rewardedProfileRaw = await awardCoinBonus(
        attemptProfile,
        bonusCoins,
        displayMode === "boss_test" ? "boss_test" : "recall_test",
      );
      const rewardedProfile = (!skillMasteryReady && result.promotedDifficulty)
        ? {
            ...rewardedProfileRaw,
            adaptive: {
              ...rewardedProfileRaw.adaptive,
              spellingDifficulty: profile.adaptive.spellingDifficulty,
            },
            subjectLevels: {
              ...rewardedProfileRaw.subjectLevels,
              spelling: profile.subjectLevels?.spelling ?? profile.adaptive.spellingDifficulty,
            },
          }
        : rewardedProfileRaw;
      setProfile(rewardedProfile);

      const nextLevel = levelFromXp(rewardedProfile.xp);
      const levelUpNote = result.promotedDifficulty && skillMasteryReady ? " Difficulty increased!" : "";
      const surpriseNote = result.surpriseReward.awarded ? ` ${result.surpriseReward.message}` : "";
      const masteryNote = memoryPayload?.updated.status === "mastered" ? " Word mastered!" : "";
      if (wasBuildWordMode) {
        setBuildWordRevealed(true);
        setFeedback(`Great! You built '${buildTargetAnswer}'.${levelUpNote}${surpriseNote}${masteryNote}`);
      } else if (wasMissingLetterMode) {
        setMissingLetterRevealed(true);
        setFeedback(`Great! '${normalizedExpected}' completes '${targetWord.word}'. Say the word: ${targetWord.word}.${levelUpNote}${surpriseNote}${masteryNote}`);
      } else if (displayMode === "boss_test") {
        setFeedback(`You remembered that word! '${targetWord.word}' was correct.${levelUpNote}${surpriseNote}${masteryNote}`);
      } else if (displayMode === "recall_test") {
        setFeedback(`Great — you remembered that word! '${targetWord.word}' was correct.${levelUpNote}${surpriseNote}${masteryNote}`);
      } else {
        setFeedback(`Great job! Next one... ${targetWord.word} was correct.${levelUpNote}${surpriseNote}${masteryNote}`);
      }
      setReaction({
        mood: nextLevel > prevLevel || result.surpriseReward.awarded ? "celebrate" : "happy",
        message: wasBuildWordMode
          ? `Great! You built '${buildTargetAnswer}'.`
          : wasMissingLetterMode
          ? `Great! '${normalizedExpected}' completes '${targetWord.word}'.`
          : wasRecallOrBossMode
            ? "You remembered that word!"
            : "Great job! Next one...",
      });

      if (bonusCoins > 0) {
        setRewardToast({
          points: bonusCoins,
          message: displayMode === "boss_test" ? "Boss Test bonus coins." : "Recall bonus coins.",
        });
        window.setTimeout(() => setRewardToast(null), 2400);
      }

      if (targetWord.id) {
        markQuestionCompleted({
          childId: profile.id,
          activity: "spelling",
          level: profile.adaptive.spellingDifficulty,
          questionId: targetWord.id,
        });
      }

      recordCoachInteraction({
        questionText: targetWord.word,
        subject: "spelling",
        skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
        hintsUsed: hintLevel,
        correct: true,
        responseTimeMs: Math.round(responseMs),
        timestamp: Date.now(),
      });

      const newSessionCorrect = sessionCorrect + 1;
      setSessionCorrect(newSessionCorrect);
      if (displayMode === "boss_test") {
        setBossStats(bossAnswerStats);
      }
      const improved = result.promotedDifficulty || nextLevel > prevLevel || newSessionCorrect % 5 === 0;
      const tutorPlan = getTutorFeedbackPlan({
        childId: profile.id,
        subject: "spelling",
        correct: true,
        improvement: improved,
        answer: targetWord.word,
        response: nextAnswer,
        consecutiveCorrect: newSessionCorrect,
        consecutiveMistakes: 0,
        responseMs,
        usedHint: hintLevel > 0,
        coachingStylePreference: resolveCoachingPace("spelling", profile.settings.subjectCoachingStyles),
      });
      setTutorFeedback(tutorPlan.text);
      if (rewardedProfile.literacySupport?.mode === "spelling_support" && newSessionCorrect % 3 === 0 && !wasRecallOrBossMode) {
        setCoachOpen(true);
        setHintLevel((level) => Math.max(level, 2));
        await speakWithContext(
          `Support checkpoint. Great effort. Let's slow down and break this next word into sounds together.`,
          "spelling_instruction",
        );
      }
      const spokenSuccessMessage = (() => {
        if (displayMode === "missing_letter") {
          return `Great job. You chose ${normalizedExpected}. The completed word is ${targetWord.word}.`;
        }
        if (displayMode === "build_word") {
          return `Great job. You built the word ${buildTargetAnswer}.`;
        }
        if (displayMode === "alphabetical_order") {
          const orderedWords = [...alphabeticalWords].sort(compareAlphabetically);
          return `Great job. You put the words in alphabetical order. The order is ${orderedWords.join(", ")}.`;
        }
        if (displayMode === "choose_correct") {
          return `Great job. You picked the correct spelling: ${targetWord.word}.`;
        }
        if (displayMode === "fix_mistake") {
          return `Great job. You fixed the spelling. The correct word is ${targetWord.word}.`;
        }
        if (displayMode === "scramble_word") {
          return `Great job. You unscrambled the word ${targetWord.word}.`;
        }
        if (displayMode === "pattern_mode") {
          return `Great job. You chose the matching pattern word: ${targetWord.word}.`;
        }
        if (displayMode === "recall_test") {
          return `Great memory. You spelled ${targetWord.word} correctly.`;
        }
        if (displayMode === "boss_test") {
          return `Brilliant. You passed this boss word: ${targetWord.word}.`;
        }
        return `Great job. The word is ${targetWord.word}.`;
      })();
      await speakWithContext(spokenSuccessMessage, "spelling_instruction");
      if (profile.settings.sfxEnabled) {
        playCorrectSound();
      }
      setShowSuccessBurst(true);
      window.setTimeout(() => setShowSuccessBurst(false), 900);

      if (improved) {
        void awardChildRewards({
          childId: profile.id,
          source: "spelling",
          coins: 20,
          note: "Progress reward for stronger spelling accuracy.",
          reason: "accuracy_improved",
          difficulty: rewardedProfile.adaptive.spellingDifficulty,
          activityName: "Spelling Progress Bonus",
          profile: rewardedProfile,
        })
          .then((bonusProfile) => {
            setProfile(bonusProfile);
            setRewardToast({ points: 20, message: "Progress reward for stronger spelling accuracy." });
            window.setTimeout(() => setRewardToast(null), 2400);
          })
          .catch(() => undefined);
      }

      if (newSessionCorrect % 5 === 0) {
        const insight = getSpellingPatternInsight(result.profile);
        setInsightMessage(insight ?? "You are on a roll! Keep practising — you are doing brilliantly!");
      }

      const finishedBossTest = !reviewMode && currentSessionStep?.phase === "boss_test"
        && (isLastSessionStep() || sessionPlan?.phases[sessionStepIndex + 1]?.phase !== "boss_test");
      const reachedSessionEnd = !reviewMode && isLastSessionStep();
      const nextIndex = reviewMode ? sessionStepIndex : getNextSessionIndex();
      if (!reviewMode) setSessionStepIndex(nextIndex);
      if (wasBuildWordMode) {
        setLessonStage("COMPLETE");
        setTutorEmotion("celebrating");
      }

      if (finishedBossTest) {
        const completionBonus = 10;
        const perfectBonus = bossAnswerStats.correct === bossAnswerStats.total ? 20 : 0;
        try {
          const celebrationProfile = await awardCoinBonus(rewardedProfile, completionBonus + perfectBonus, "boss_test");
          setProfile(celebrationProfile);
        } catch {
          // bonus award failed — still show celebration
        }
        setBossBonusSummary({ completion: completionBonus, perfect: perfectBonus });
        setShowBossCelebration(true);
        return;
      }
      if (reachedSessionEnd) {
        setBossBonusSummary({ completion: 0, perfect: 0 });
        setShowBossCelebration(true);
        return;
      }
      window.setTimeout(() => {
        void chooseNextWord(rewardedProfile, reviewMode, true, nextIndex);
      }, 350);
      return;
    }

    const nextAttempt = attemptCount + 1;
    setAttemptCount(nextAttempt);
    setAnswer("");
    setBuildTypedAnswer("");

    if (buildOrderMismatch) {
      setLastMistakeType("wrong_order");
    }

    if (helpLocked) {
      const bossAnswerStats = displayMode === "boss_test"
        ? { correct: bossStats.correct, total: bossStats.total + 1 }
        : bossStats;
      const result = processSpellingAttempt(profile, false, targetWord.id ?? undefined, {
        hintsUsed: Math.max(hintLevel, 2),
        responseMs,
        supportTag: targetWord.word,
        masteryTag: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "core_word",
        weakItemKey: targetWord.word.toLowerCase(),
        difficultyBand: targetWord.level < profile.adaptive.spellingDifficulty ? "easier" : targetWord.level > profile.adaptive.spellingDifficulty ? "challenge" : "core",
      });
      const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
      const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
      void syncAttemptToServer({
        studentId: profile.id,
        subject: "spelling",
        spellingMode: displayMode,
        skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
        contentId: attemptContentId,
        assignmentId: attemptAssignmentId,
        questionText: targetWord.word,
        answerGiven: nextAnswer,
        correctAnswer: targetWord.word,
        correct: false,
        responseTimeMs: Math.round(responseMs),
        hintsUsed: Math.max(hintLevel, 2),
        difficulty: profile.adaptive.spellingDifficulty,
        skills: serializeSkills([skillFocusToCode(targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "") ?? "cvc"].filter(Boolean)),
        errorType: memoryPayload?.updated.mistakeType ?? undefined,
      });
      let awardedProfile: Awaited<ReturnType<typeof awardChildRewards>>;
      try {
        awardedProfile = await awardChildRewards({
          childId: profile.id,
          source: "spelling",
          coins: result.rewardDelta.coins,
          xp: result.rewardDelta.xp,
          stars: result.rewardDelta.stars,
          note: `${displayMode.replaceAll("_", " ")} answer incorrect.`,
          difficulty: profile.adaptive.spellingDifficulty,
          activityName: displayMode === "boss_test" ? "Boss Test" : displayMode === "recall_test" ? "Recall Test" : "Spelling Quest",
          profile: result.profile,
        });
      } catch {
        awardedProfile = result.profile;
        saveProfile(result.profile);
      }
      setProfile(awardedProfile);
      setAnswer("");
      setBuildTypedAnswer("");
      setBuildSelection([]);
      setAlphaSelection([]);
      const mistakeNote = memoryPayload?.updated.mistakeType ? ` (${memoryPayload.updated.mistakeType.replaceAll("_", " ")})` : "";
      if (displayMode === "boss_test") {
        setBossStats(bossAnswerStats);
        setFeedback(`Good try — let's keep going. The word was ${targetWord.word}.${mistakeNote}`);
        setReaction({ mood: "support", message: "Good try — let's keep going." });
      } else if (displayMode === "recall_test") {
        setFeedback(`Good try — let's practise it again. The word was ${targetWord.word}.${mistakeNote}`);
        setReaction({ mood: "support", message: "Good try — let's practise it again." });
      } else {
        setFeedback(`No hints on this round. The answer was ${targetWord.word}.${mistakeNote}`);
        setReaction({ mood: "support", message: `No hints on this round. The answer was ${targetWord.word}.` });
      }
      recordCoachInteraction({
        questionText: targetWord.word,
        subject: "spelling",
        skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
        hintsUsed: Math.max(hintLevel, 2),
        correct: false,
        responseTimeMs: Math.round(responseMs),
        timestamp: Date.now(),
      });
      const lockedTutorPlan = getTutorFeedbackPlan({
        childId: profile.id,
        subject: "spelling",
        correct: false,
        answer: targetWord.word,
        response: nextAnswer,
        consecutiveCorrect: 0,
        consecutiveMistakes: nextAttempt,
        responseMs,
        usedHint: false,
        coachingStylePreference: resolveCoachingPace("spelling", profile.settings.subjectCoachingStyles),
      });
      setTutorFeedback(lockedTutorPlan.text);
      speakTutorFeedback(lockedTutorPlan);
      setAttemptCount(0);
      const finishedBossTest = !reviewMode && currentSessionStep?.phase === "boss_test"
        && (isLastSessionStep() || sessionPlan?.phases[sessionStepIndex + 1]?.phase !== "boss_test");
      const reachedSessionEnd = !reviewMode && isLastSessionStep();
      const nextIndex = reviewMode ? sessionStepIndex : getNextSessionIndex();
      if (!reviewMode) setSessionStepIndex(nextIndex);
      if (finishedBossTest) {
        const completionBonus = 10;
        const perfectBonus = bossAnswerStats.correct === bossAnswerStats.total ? 20 : 0;
        try {
          const celebrationProfile = await awardCoinBonus(awardedProfile, completionBonus + perfectBonus, "boss_test");
          setProfile(celebrationProfile);
        } catch {
          // bonus award failed — still show celebration
        }
        setBossBonusSummary({ completion: completionBonus, perfect: perfectBonus });
        setShowBossCelebration(true);
        return;
      }
      if (reachedSessionEnd) {
        setBossBonusSummary({ completion: 0, perfect: 0 });
        setShowBossCelebration(true);
        return;
      }
      window.setTimeout(() => {
        void chooseNextWord(awardedProfile, reviewMode, true, nextIndex);
      }, 1200);
      return;
    }

    if (nextAttempt === 1) {
      setHintLevel((level) => Math.min(3, level + (spellingSupportMode ? 2 : 1)));
      if (spellingSupportMode) setCoachOpen(true);
      if (displayMode === "build_word") {
        const mistakeType = memoryPayload?.updated.mistakeType ?? lastMistakeType;
        const targetedHint = mistakeType === "wrong_start_sound"
          ? `${targetWord.word} starts with ${targetWord.word[0]}. Tap ${targetWord.word[0]} first.`
          : mistakeType === "wrong_vowel"
            ? `Listen for the middle sound in ${targetWord.word}.`
            : mistakeType === "wrong_end_sound"
              ? `Check the ending sound in ${targetWord.word}.`
              : "Build the word from left to right.";
        setFeedback(`Good try. ${targetedHint}`);
        setReaction({ mood: "support", message: `Good try. ${targetedHint}` });
        void speakEncouragement(`Good try. ${targetedHint}`);
        return;
      }
      if (displayMode === "missing_letter") {
        setFeedback(`Not quite. Try again — which letter makes '${targetWord.word}'?`);
        setReaction({ mood: "support", message: `Not quite. Try again — which letter makes '${targetWord.word}'?` });
        void speakEncouragement(`Not quite. Try again. Which letter makes ${targetWord.word}?`);
        return;
      }
      setFeedback("Good try. Listen again and have another go.");
      setReaction({ mood: "support", message: "Good try. Listen again and have another go." });
      void speakEncouragement(`Good try. ${getSpellingHintMessage({
        level: Math.min(3, hintLevel + 1),
        word: targetWord.word,
        categoryHint: targetWord.categoryHint,
        syllables: targetWord.syllables,
      })}`);
      return;
    }

    if (nextAttempt === 2) {
      setHintLevel((level) => Math.min(3, level + (spellingSupportMode ? 2 : 1)));
      if (spellingSupportMode) setCoachOpen(true);
      if (displayMode === "build_word") {
        const mistakeType = memoryPayload?.updated.mistakeType ?? lastMistakeType;
        const targetedHint = mistakeType === "wrong_start_sound"
          ? `${targetWord.word} begins with ${targetWord.word[0]}.`
          : mistakeType === "wrong_vowel"
            ? `Try the vowel sound in the middle of ${targetWord.word}.`
            : mistakeType === "wrong_end_sound"
              ? `${targetWord.word} ends with ${targetWord.word[targetWord.word.length - 1]}.`
              : "Check the order of the letters.";
        setFeedback(`Almost there. ${targetedHint}`);
        setReaction({ mood: "support", message: `Almost there. ${targetedHint}` });
        void speakEncouragement(`Almost there. ${targetedHint}`);
        return;
      }
      if (displayMode === "missing_letter") {
        setFeedback(`Look carefully. Which letter completes '${targetWord.word}'?`);
        setReaction({ mood: "support", message: `Look carefully. Which letter completes '${targetWord.word}'?` });
        void speakEncouragement(`Look carefully. Which letter completes ${targetWord.word}?`);
        return;
      }
      setFeedback("Almost there. Here is a bigger clue.");
      setReaction({ mood: "support", message: "Almost there. Here is a bigger clue." });
      void speakEncouragement(`Almost there. ${getSpellingHintMessage({
        level: Math.min(3, hintLevel + 1),
        word: targetWord.word,
        categoryHint: targetWord.categoryHint,
        syllables: targetWord.syllables,
      })}`);
      return;
    }

    const result = processSpellingAttempt(profile, false, targetWord.id ?? undefined, {
      hintsUsed: Math.max(hintLevel, 2),
      responseMs,
      supportTag: targetWord.word,
      masteryTag: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "core_word",
      weakItemKey: targetWord.word.toLowerCase(),
      difficultyBand: targetWord.level < profile.adaptive.spellingDifficulty ? "easier" : targetWord.level > profile.adaptive.spellingDifficulty ? "challenge" : "core",
    });
    const attemptContentId = usingAssignedContent ? assignedContentId ?? undefined : undefined;
    const attemptAssignmentId = usingAssignedContent ? assignedAssignmentId : undefined;
    void syncAttemptToServer({
      studentId: profile.id,
      subject: "spelling",
      spellingMode: displayMode,
      skillFocus: targetWord.patterns?.[0] ?? targetWord.categoryHint ?? targetWord.word,
      contentId: attemptContentId,
      assignmentId: attemptAssignmentId,
      questionText: targetWord.word,
      answerGiven: nextAnswer,
      correctAnswer: targetWord.word,
      correct: false,
      responseTimeMs: Math.round(responseMs),
      hintsUsed: Math.max(hintLevel, 2),
      difficulty: profile.adaptive.spellingDifficulty,
      skills: serializeSkills([skillFocusToCode(targetWord.patterns?.[0] ?? targetWord.categoryHint ?? "") ?? "cvc"].filter(Boolean)),
      errorType: memoryPayload?.updated.mistakeType ?? lastMistakeType ?? undefined,
    });
    let awardedProfile: Awaited<ReturnType<typeof awardChildRewards>>;
    try {
      awardedProfile = await awardChildRewards({
        childId: profile.id,
        source: "spelling",
        coins: result.rewardDelta.coins,
        xp: result.rewardDelta.xp,
        stars: result.rewardDelta.stars,
        note: `${displayMode.replaceAll("_", " ")} answer incorrect.`,
        difficulty: profile.adaptive.spellingDifficulty,
        activityName: "Spelling Quest",
        profile: result.profile,
      });
    } catch {
      awardedProfile = result.profile;
      saveProfile(result.profile);
    }
    setProfile(awardedProfile);
    const mistakeNote = memoryPayload?.updated.mistakeType ? ` (${memoryPayload.updated.mistakeType.replaceAll("_", " ")})` : "";
    if (displayMode === "build_word") {
      setBuildWordRevealed(true);
      setFeedback(`The letters build '${buildTargetAnswer}'. Let's try a new one.${mistakeNote}`);
      setReaction({ mood: "support", message: `The word is '${buildTargetAnswer}'. Let's practise another one.` });
    } else if (displayMode === "missing_letter") {
      setMissingLetterRevealed(true);
      setFeedback(`The missing letter was '${missingLetterPrompt.missingLetters}'. The word is '${targetWord.word}'.${mistakeNote}`);
      setReaction({ mood: "support", message: `The word is '${targetWord.word}'. Let's practise another one.` });
    } else {
      setFeedback(`The answer was ${targetWord.word}. Let's try a new one.${mistakeNote}`);
      setReaction({ mood: "support", message: `The answer was ${targetWord.word}. Let's try a new one.` });
    }
    const tutorPlan = getTutorFeedbackPlan({
      childId: profile.id,
      subject: "spelling",
      correct: false,
      answer: targetWord.word,
      response: nextAnswer,
      consecutiveCorrect: 0,
      consecutiveMistakes: nextAttempt,
      responseMs,
      usedHint: true,
      coachingStylePreference: resolveCoachingPace("spelling", profile.settings.subjectCoachingStyles),
    });
    setTutorFeedback(tutorPlan.text);
    speakTutorFeedback(tutorPlan);
    if (profile.settings.sfxEnabled) {
      playTryAgainSound();
    }
    if (displayMode === "build_word") {
      void speakEncouragement(`The letters build ${buildTargetAnswer}. Let's try a new one.`);
    } else if (displayMode === "missing_letter") {
      void speakEncouragement(`The missing letter was ${missingLetterPrompt.missingLetters}. The word is ${targetWord.word}.`);
    } else {
      void speakEncouragement(`The answer was ${targetWord.word}. Let's try a new one.`);
    }
    setAttemptCount(0);
    setBuildSelection([]);
    setAlphaSelection([]);
    const finishedBossTest = !reviewMode && currentSessionStep?.phase === "boss_test"
      && (isLastSessionStep() || sessionPlan?.phases[sessionStepIndex + 1]?.phase !== "boss_test");
    const reachedSessionEnd = !reviewMode && isLastSessionStep();
    const nextIndex = reviewMode ? sessionStepIndex : getNextSessionIndex();
    if (!reviewMode) setSessionStepIndex(nextIndex);
    if (finishedBossTest) {
      setShowBossCelebration(true);
      return;
    }
    if (reachedSessionEnd) {
      setBossBonusSummary({ completion: 0, perfect: 0 });
      setShowBossCelebration(true);
      return;
    }

    window.setTimeout(() => {
      void chooseNextWord(awardedProfile, reviewMode, true, nextIndex);
    }, 1200);
  }

  const reviewWordCount = profile ? getReviewWords(profile, profile.adaptive.spellingDifficulty).length : 0;
  const streakWidthClass = sessionCorrect >= 5
    ? "w-full"
    : sessionCorrect === 4
      ? "w-4/5"
      : sessionCorrect === 3
        ? "w-3/5"
        : sessionCorrect === 2
          ? "w-2/5"
          : sessionCorrect === 1
            ? "w-1/5"
            : "w-0";

  function chooseLevelMode(mode: "continue" | "restart"): void {
    if (!profile) return;
    const key = getLevelChoiceKey(profile.id);
    const savedLevelKey = getSavedLevelKey(profile.id);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(key, mode);
    }

    if (mode === "continue") {
      const rememberedLevel = typeof window !== "undefined"
        ? Number(window.sessionStorage.getItem(savedLevelKey) ?? "0")
        : 0;
      const resumeLevel = Math.max(
        1,
        rememberedLevel,
        profile.subjectLevels?.spelling ?? 1,
        profile.adaptive.spellingDifficulty ?? 1,
      );
      if (resumeLevel !== profile.adaptive.spellingDifficulty || resumeLevel !== profile.subjectLevels.spelling) {
        const resumed: ChildProfile = {
          ...profile,
          adaptive: {
            ...profile.adaptive,
            spellingDifficulty: resumeLevel,
          },
          subjectLevels: {
            ...profile.subjectLevels,
            spelling: resumeLevel,
          },
        };
        setProfile(resumed);
        saveProfile(resumed);
      }
      setShowLevelPicker(false);
      return;
    }

    if (mode === "restart") {
      const currentLevel = Math.max(
        1,
        profile.subjectLevels?.spelling ?? 1,
        profile.adaptive.spellingDifficulty ?? 1,
      );
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(savedLevelKey, String(currentLevel));
      }
      const restarted: ChildProfile = {
        ...profile,
        adaptive: {
          ...profile.adaptive,
          spellingDifficulty: 1,
          spellingStreak: 0,
        },
        subjectLevels: {
          ...profile.subjectLevels,
          spelling: 1,
        },
      };
      setProfile(restarted);
      saveProfile(restarted);
      setFeedback("Restarted at Level 1. You can continue from your saved level anytime.");
    }

    setShowLevelPicker(false);
  }

  function reopenLevelPicker(): void {
    if (!profile) return;
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(getLevelChoiceKey(profile.id));
    }
    setShowLevelPicker(true);
  }

  if (!profile) {
    return <main className="min-h-screen bg-background" />;
  }

  return (
    <PremiumAccessGate>
    <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
      <Navbar />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-200/50 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-100/70 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {showSuccessBurst ? <GameSuccessBurst /> : null}
        {rewardToast ? <RewardToast points={rewardToast.points} message={rewardToast.message} /> : null}
        {showBossCelebration ? (
          <div className="mb-6 rounded-4xl border border-amber-200 bg-linear-to-br from-amber-50 via-white to-emerald-50 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Boss Test Complete</p>
                <h2 className="mt-2 font-heading text-3xl font-black text-slate-900">Challenge finished</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  You finished this spelling challenge. Choose what happens next.
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {nextSpellingLevel
                    ? `Would you like to continue to ${LEVEL_LABELS[nextSpellingLevel]} or practise this level again?`
                    : "You have completed the highest spelling level. Continue will start a fresh challenge at this level."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Boss Test Bonus: +{bossBonusSummary.completion} coins</span>
                  {bossBonusSummary.perfect ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">Perfect Boss Bonus: +{bossBonusSummary.perfect} coins</span> : null}
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-cyan-800">Accuracy: {sessionPlan?.phases.length ? Math.round((sessionCorrect / sessionPlan.phases.length) * 100) : 0}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Stars</p>
                  <p className="mt-1 text-2xl font-black text-amber-600">+{sessionRewards.stars}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">XP</p>
                  <p className="mt-1 text-2xl font-black text-indigo-600">+{sessionRewards.xp}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Coins</p>
                  <p className="mt-1 text-2xl font-black text-emerald-600">+{sessionRewards.coins}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-4 text-center shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Mastered</p>
                  <p className="mt-1 text-2xl font-black text-cyan-700">{masteredTodayWords.length}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-emerald-200 bg-white/80 p-4">
                <p className="text-sm font-black text-emerald-800">Words mastered today</p>
                {masteredTodayWords.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {masteredTodayWords.map((word) => (
                      <span key={word} className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{word}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No new mastered words this time. Keep going.</p>
                )}
                <p className="mt-3 text-sm font-semibold text-emerald-800">Next suggestion: {profile.adaptive.nextBestActivity}</p>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-white/80 p-4">
                <p className="text-sm font-black text-amber-800">Weak words to practise again</p>
                {sessionWeakWordList.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sessionWeakWordList.map((word) => (
                      <span key={word} className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">{word}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">No weak words left in this session. Strong finish.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={continueToNextLevel}>
                {nextSpellingLevel ? `Continue to ${LEVEL_LABELS[nextSpellingLevel]}` : "Continue Challenge"}
              </Button>
              <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
              <Button variant="secondary" onClick={restartCurrentSession}>Practise This Level Again</Button>
            </div>
          </div>
        ) : null}

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

        <section className="overflow-hidden rounded-4xl border border-white/70 bg-white/85 shadow-[0_28px_80px_rgba(72,93,165,0.16)] backdrop-blur">
          <div className="border-b border-slate-200/70 bg-linear-to-r from-slate-950 via-indigo-950 to-blue-900 px-5 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                  Spelling Quest
                </p>
                <h1 className="mt-2 font-heading text-3xl font-black leading-tight sm:text-4xl">
                  Listen, spell, and level up.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
                  A focused spelling session with adaptive hints, coach support, and rewards
                  that respond to this child&apos;s progress.
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
          {showLevelPicker && profile ? (
            <div className="rounded-3xl border border-indigo-200 bg-indigo-50/80 p-4 shadow-sm">
              <p className="text-sm font-black text-indigo-950">Choose your spelling level</p>
              <p className="mt-1 text-sm leading-6 text-indigo-800">
                Saved level: {profile.subjectLevels?.spelling ?? profile.adaptive.spellingDifficulty}. Continue where you left off or restart from Level 1.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => chooseLevelMode("continue")}>Continue Saved Level</Button>
                <Button variant="secondary" onClick={() => chooseLevelMode("restart")}>Start from Level 1</Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">
              {levelLabel}
            </span>
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">
              Target {profile.dailySubjectProgress.completed.spelling}/{profile.dailySubjectProgress.targets.spelling}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${contentSource === "assigned" ? "bg-indigo-100 text-indigo-800" : contentSource === "ai-cache" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              Source: {contentSource === "assigned" ? "Assigned" : contentSource === "ai-cache" ? "AI Cache" : "Static"}
            </span>
            {spellingSupportActive ? (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">Spelling support active</span>
            ) : null}
            {readingSupportActive ? (
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">Reading catch-up active</span>
            ) : null}
            <span className={`rounded-full px-3 py-1 text-xs font-black ${skillMasteryReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {skillMasteryReady ? "Mastery across sessions" : "Building mastery across sessions"}
            </span>
            {profile.subjectLevels?.spelling > 1 ? (
              <button
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                onClick={reopenLevelPicker}
              >
                Change level choice
              </button>
            ) : null}
            {retryPackMode ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Retry Pack</span>
            ) : reviewMode ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Review Mode</span>
            ) : reviewWordCount > 0 ? (
              <button
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-200"
                onClick={() => {
                  setRetryPackMode(false);
                  setReviewMode(true);
                  if (profile) chooseNextWord(profile, true, true);
                }}
              >
                Practice tricky words ({reviewWordCount})
              </button>
            ) : null}
            {weakSpellingRetryIds.length ? (
              <button
                className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 hover:bg-rose-200"
                onClick={() => {
                  if (!profile) return;
                  const retryIds = weakSpellingRetryIds;
                  if (!retryIds.length) {
                    setRetryPackMode(false);
                    setFeedback("Retry pack refreshed. Some older weak items are no longer available, so we loaded balanced practice.");
                    return;
                  }
                  setReviewMode(true);
                  setRetryPackMode(true);
                  setReviewQueueIds(retryIds);
                  void chooseNextWord(profile, true, true);
                }}
              >
                Retry Weak Pack ({weakSpellingRetryIds.length})
              </button>
            ) : null}
            {reviewMode ? (
              <button
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                onClick={() => {
                  setRetryPackMode(false);
                  setReviewMode(false);
                  if (profile) chooseNextWord(profile, false, true);
                }}
              >
                Exit Review
              </button>
            ) : null}
          </div>

          <div className="mt-6 rounded-3xl bg-linear-to-br from-slate-950 to-indigo-950 p-5 text-white shadow-inner">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
              Current challenge
            </p>
            <div className="mt-4 rounded-3xl border border-white/12 bg-white/8 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Your journey</p>
                  <p className="mt-1 text-sm font-semibold text-white">{journeyStepLabel}</p>
                </div>
                <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-black text-cyan-100">
                  {JOURNEY_STAGES[currentJourneyIndex]}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {JOURNEY_STAGES.map((stage, index) => {
                  const isComplete = index < currentJourneyIndex;
                  const isCurrent = index === currentJourneyIndex;
                  return (
                    <div
                      key={stage}
                      className={`rounded-2xl border px-3 py-3 text-center ${isCurrent ? "border-cyan-200 bg-cyan-200/18 text-white" : isComplete ? "border-emerald-200/30 bg-emerald-300/12 text-emerald-100" : "border-white/10 bg-white/5 text-blue-100"}`}
                    >
                      <p className="text-[11px] font-black uppercase tracking-[0.16em]">
                        {isComplete ? "Done" : isCurrent ? "Now" : "Next"}
                      </p>
                      <p className="mt-1 text-sm font-black">{stage}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 rounded-3xl border border-white/12 bg-white/8 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Queue progress</p>
                  <p className="mt-1 text-sm font-semibold text-white">{journeyStepLabel}</p>
                </div>
                <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-black text-cyan-100">
                  {sessionPlan?.phases.length ?? 0} questions
                </span>
              </div>
              <div className="mt-4 flex items-center gap-1">
                {queueProgressSegments.length ? queueProgressSegments.map((segment) => (
                  <div
                    key={segment.id}
                    className={`h-2 flex-1 rounded-full ${segment.current ? "bg-cyan-300" : segment.done ? "bg-emerald-300" : "bg-white/15"}`}
                  />
                )) : <div className="h-2 flex-1 rounded-full bg-white/15" />}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-cyan-200/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                    {modeTitle}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
                    {PHASE_LABELS[currentSessionStep?.phase ?? "learn"]}
                  </span>
                  {displayMode === "boss_test" ? (
                    <span className="rounded-full bg-amber-300/20 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-amber-100">
                      Final Challenge ⭐
                    </span>
                  ) : null}
                </div>
                <h2 className="font-heading text-2xl font-black">{modePromptTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-blue-100">
                  {modeDescription}
                </p>
                {displayMode === "boss_test" ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-bold text-amber-100">{showBossCelebration ? "Challenge finished." : "You&apos;re almost finished!"}</p>
                    <p className="text-sm text-blue-100">{showBossCelebration ? "Choose whether to continue to the next level or practise this one again." : "No help this time — try your best."}</p>
                  </div>
                ) : null}
              </div>
              {showVisualPrompt && showEmojiVisualHint && targetWord?.emoji ? (
                <p className={isLearnPhase ? "text-7xl" : "text-5xl"} aria-label="word visual hint">{targetWord.emoji}</p>
          ) : null}
            </div>
          {spellingDifficulty >= 5 && displayMode === "listen_type" ? (
              <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm text-blue-100">
                Listen carefully. A sentence clue will be spoken.
              </p>
          ) : null}

          {showVisualPrompt && visualPromptType === "image" && targetWord?.imageUrl ? (
            <div className="mt-5 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={targetWord.imageUrl}
                alt="Spelling clue"
                className="max-h-48 rounded-xl border border-white/20 shadow-lg"
              />
            </div>
          ) : null}

          {showVisualPrompt && showMissingImageDebug ? (
            <p className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-100/90 px-4 py-3 text-xs font-bold text-amber-900">
              Admin debug: image prompt requested without imageUrl, fallback applied.
            </p>
          ) : null}
          </div>

          {displayMode === "build_word" ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">Build the word</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{modeDescription}</p>

              {showBlendMode ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-semibold text-amber-700">Blend the sounds</p>
                  <p className="mt-2 text-2xl font-bold tracking-widest text-slate-900">
                    {blendText.soundLine}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-indigo-700">
                    {blendStage === 0
                      ? `${blendText.buildLine.split(" -> ").slice(0, 2).join(" -> ")}`
                      : blendStage === 1
                        ? blendText.buildLine
                        : `${blendText.buildLine} -> ${blendText.finalWord}`}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {blendStage < 2 ? (
                      <Button
                        variant="secondary"
                        onClick={() => setBlendStage((stage) => {
                          if (stage === 0) return 1;
                          if (stage === 1) return 2;
                          return 2;
                        })}
                      >
                        Next blend step
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => {
                        setShowBlendMode(false);
                        setLessonStage("TAP_SELECT");
                        void speakWithContext(applyTutorPersonality("Great. Now let us build it with letters.", tutorPersonality), "spelling_instruction");
                      }}
                    >
                      I&apos;m ready to build it
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {buildDisplaySlots.map((slot, index) => (
                  <span
                    key={`${buildTargetAnswer}-${index}`}
                    className={`flex h-14 min-w-12 items-center justify-center rounded-2xl border-2 px-3 text-2xl font-black uppercase transition-all ${slot === "_" ? "border-indigo-300 bg-white text-indigo-900" : buildWordRevealed ? "scale-105 border-emerald-300 bg-emerald-50 text-emerald-800" : "border-indigo-300 bg-indigo-50 text-indigo-900 shadow-sm"}`}
                  >
                    {slot === "_" ? "_" : slot}
                  </span>
                ))}
              </div>
              {!buildWordStateAligned ? (
                <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                  The build slots are resetting to match the visible letters.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {buildLetters.map((letter, index) => {
                  const used = validBuildSelection.includes(index);
                  return (
                    <button
                      key={`${letter}-${index}`}
                      type="button"
                      disabled={used || showBlendMode || lessonStage !== "TAP_SELECT"}
                      onClick={() => handleBuildLetterClick(letter, index)}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-lg font-black uppercase transition ${used ? "border-slate-200 bg-slate-100 text-slate-300" : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"}`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setBuildSelection((prev) => prev.slice(0, -1))}>Undo</Button>
                <Button variant="secondary" onClick={() => setBuildSelection([])}>Clear</Button>
              </div>

              {lessonStage === "TAP_SELECT" || !usesTutorConversation ? (
                <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-indigo-700">Now type it yourself</p>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    value={buildTypedAnswer}
                    onChange={(event) => setBuildTypedAnswer(event.target.value)}
                    placeholder="Type the word you built"
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700">
                  Build the word first. Then you will type it.
                </div>
              )}
            </div>
          ) : null}

          {displayMode === "missing_letter" ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">
                {missingLetterPrompt.hiddenIndexes.length > 1 ? "Choose the missing letters" : "Choose the missing letter"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{modeDescription}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {missingLetterDisplaySlots.map((slot) => (
                  <span
                    key={slot.key}
                    className={`flex h-14 min-w-12 items-center justify-center rounded-2xl border-2 px-3 text-2xl font-black uppercase transition-all ${slot.isHidden ? "border-indigo-300 bg-indigo-50 text-indigo-900 shadow-sm" : "border-slate-200 bg-white text-slate-700"} ${slot.isFilled ? "scale-105 border-emerald-300 bg-emerald-50 text-emerald-800" : ""} ${missingLetterRevealed && slot.isHidden ? "ring-4 ring-emerald-100" : ""}`}
                  >
                    {slot.isHidden && !slot.isFilled ? "_" : slot.value}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {missingLetterChoiceOptions.map((letter, index) => {
                  const usedCount = countCharacter(answer, letter);
                  const availableCount = missingLetterChoiceOptions.filter((option) => option === letter).length;
                  const disabled = usedCount >= availableCount || answer.length >= missingLetterPrompt.hiddenIndexes.length;
                  return (
                    <button
                      key={`${letter}-${index}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => setAnswer((prev) => `${prev}${letter}`)}
                      className={`flex h-12 min-w-12 items-center justify-center rounded-2xl border px-4 text-lg font-black uppercase transition ${disabled ? "border-slate-200 bg-slate-100 text-slate-300" : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"}`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setAnswer((prev) => prev.slice(0, -1))} disabled={!answer}>Undo</Button>
                <Button variant="secondary" onClick={() => setAnswer("")} disabled={!answer}>Clear</Button>
              </div>
            </div>
          ) : null}

          {(requireSpeech && !speechPassed) || (usesTutorConversation && (lessonStage === "ASSESS_SPEECH" || lessonStage === "TEACH_RETRY")) ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">
                {isLetterConversation ? "What letter do you see on the screen?" : "What word do you see on the screen?"}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {lessonStage === "TEACH_RETRY"
                  ? "Good try. Look again, then say it again."
                  : "Say the letter or word you see on the screen."}
              </p>
              <div className="mx-auto mt-3 max-w-md">
                <input
                  className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder={isLetterConversation ? "If microphone is unavailable, type the letter you said" : "If microphone is unavailable, type the word you said"}
                  value={spokenText}
                  onChange={(event) => setSpokenText(event.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Button onClick={startListening}>{speechListening ? "Listening... speak now" : "🎤 Say it out loud"}</Button>
                <Button variant="secondary" onClick={() => handleSpeechResult(spokenText, "manual")}>Check typed speech</Button>
                <Button variant="secondary" onClick={repeatQuestion}>Repeat prompt</Button>
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">Microphone ready. Click Say it out loud.</p>
              {speechStatusMessage ? (
                <p className="mt-2 text-sm font-bold text-slate-700">{speechStatusMessage}</p>
              ) : null}
              {(speechFallbackReason === "network" || speechFallbackReason === "not-allowed" || speechFallbackReason === "unsupported") ? (
                <div className="mt-3">
                  <Button onClick={continueWithParentTeacherOverride} className="bg-amber-500 text-amber-950 hover:bg-amber-400">
                    Parent/Teacher Continue
                  </Button>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-600">Speech attempts: {speechAttempts}/3</p>
              {process.env.NODE_ENV === "development" ? (
                <div className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left font-mono text-xs text-amber-900">
                  <p className="font-black uppercase tracking-wide">Dev: Speech Debug</p>
                  <p>Target: {targetWord?.word ?? "—"}</p>
                  <p>Heard: {spokenText || "(none)"}</p>
                  <p>Match: {speechLastMatchResult ?? "—"}</p>
                  <p>Attempts: {speechAttempts}/3</p>
                  <p>Service: {speechListening ? "listening" : (speechFallbackReason ?? "ready")}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {isLetterConversation && lessonStage === "TAP_SELECT" ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">Tap the letter</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {letterChoiceOptions.map((letter, index) => (
                  <button
                    key={`${letter}-${index}`}
                    type="button"
                    onClick={() => handleAlphabetLetterTap(letter)}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-xl font-black uppercase text-indigo-900 transition hover:bg-indigo-50"
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {displayMode === "choose_correct" ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {chooseCorrectOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void checkAnswer(option, targetWord?.word, option)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-lg font-black text-slate-900 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          {displayMode === "fix_mistake" ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-700">This spelling is wrong</p>
              <p className="mt-3 text-center text-3xl font-black tracking-[0.18em] text-rose-900">{incorrectWordPrompt}</p>
              <input
                className="mt-4 w-full rounded-2xl border border-rose-200 bg-white px-5 py-4 text-lg font-bold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type the corrected word"
              />
            </div>
          ) : null}

          {displayMode === "scramble_word" ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">Unscramble these letters</p>
              <p className="mt-3 text-center text-3xl font-black tracking-[0.25em] text-indigo-900">{scrambledWord.toUpperCase()}</p>
              <input
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-lg font-bold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type the correct word"
              />
            </div>
          ) : null}

          {displayMode === "alphabetical_order" ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">Tap the words from A to Z</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {alphabeticalWords.map((word) => {
                  const usedCount = alphaSelection.filter((item) => item === word).length;
                  const disabled = usedCount >= alphabeticalWords.filter((item) => item === word).length;
                  return (
                    <button
                      key={word}
                      type="button"
                      disabled={disabled}
                      onClick={() => setAlphaSelection((prev) => [...prev, word])}
                      className={`rounded-2xl border px-4 py-3 text-base font-black ${disabled ? "border-slate-200 bg-slate-100 text-slate-300" : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"}`}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">
                {alphaSelection.length ? alphaSelection.join(" → ") : "Your order will appear here."}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => setAlphaSelection((prev) => prev.slice(0, -1))}>Undo</Button>
                <Button variant="secondary" onClick={() => setAlphaSelection([])}>Clear</Button>
              </div>
            </div>
          ) : null}

          {displayMode === "pattern_mode" ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">Choose the word that fits this pattern family</p>
              <p className="mt-2 text-sm text-emerald-800">Pattern: {targetWord?.patterns?.[0] ?? targetWord?.word.slice(-3) ?? "word family"}</p>
              {patternFamilyWords.length ? (
                <p className="mt-2 text-sm font-semibold text-emerald-900">Family examples: {patternFamilyWords.join(", ")}</p>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {patternModeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => void checkAnswer(option, targetWord?.word, option)}
                    className="rounded-2xl border border-emerald-200 bg-white px-4 py-4 text-left text-base font-black text-slate-900 hover:bg-emerald-100"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {(displayMode === "listen_type" || displayMode === "recall_test" || displayMode === "boss_test") && !isLetterConversation ? (
            <div className={`mt-5 rounded-3xl border p-1 transition-all ${showSuccessBurst && (displayMode === "recall_test" || displayMode === "boss_test") ? "scale-[1.01] border-emerald-200 bg-emerald-50 shadow-[0_0_0_6px_rgba(167,243,208,0.45)]" : "border-transparent"}`}>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-lg font-bold text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={displayMode === "boss_test" ? "Type the full word" : displayMode === "listen_type" ? "Type what you hear" : "Type the word from memory"}
              />
            </div>
          ) : null}

          {displayMode === "boss_test" && bossTransitionStage !== "idle" ? (
            <div className="mt-5 rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 to-white px-5 py-6 text-center shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Boss Round</p>
              {bossTransitionStage === "unlock" ? (
                <>
                  <p className="mt-2 text-2xl font-black text-slate-900">Boss Test Unlocked!</p>
                  <p className="mt-2 text-sm text-slate-600">Great work — you&apos;ve unlocked the final challenge.</p>
                </>
              ) : null}
              {bossTransitionStage === "countdown" && bossCountdownValue ? (
                <>
                  <p className="mt-2 text-5xl font-black tracking-[0.18em] text-amber-600">{bossCountdownValue}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Get ready...</p>
                </>
              ) : null}
            </div>
          ) : null}

          {hintMessage ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{hintMessage}</p> : null}

          {hintLevel >= 2 && targetWord ? (
            <div className="mt-3" aria-label="Letter scaffold">
              <p className="mb-1 text-xs text-slate-500">Word has {targetWord.word.length} letters:</p>
              <div className="flex flex-wrap gap-1">
                {targetWord.word.split("").map((char, i) => (
                  <span
                    key={i}
                    className={`flex h-9 w-9 items-center justify-center rounded border-2 text-sm font-bold ${i === 0 ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-400"}`}
                  >
                    {i === 0 ? char.toUpperCase() : "_"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button
              className="w-full"
              disabled={
                (displayMode === "build_word" && (showBlendMode || lessonStage !== "TAP_SELECT" || !buildWordStateAligned || selectedBuildLetters.length !== buildLetters.length || !buildTypedAnswer.trim()))
                || (displayMode === "missing_letter" && answer.length !== missingLetterPrompt.hiddenIndexes.length)
                || (isLetterConversation && !answer.trim())
              }
              onClick={() => {
                if (displayMode === "build_word") {
                  void checkAnswer(buildTypedAnswer, buildTargetAnswer, selectedBuildWord);
                  return;
                }
                if (displayMode === "missing_letter") {
                  void checkAnswer(answer, missingLetterPrompt.missingLetters, answer);
                  return;
                }
                if (displayMode === "alphabetical_order") {
                  const selection = alphaSelection.join("|");
                  const correct = [...alphaSelection].sort(compareAlphabetically).join("|") === alphabeticalCorrectAnswer;
                  void checkAnswer(selection, alphabeticalCorrectAnswer, correct ? targetWord?.word : alphaSelection.join(" "));
                  return;
                }
                void checkAnswer();
              }}
            >
              Check Answer
            </Button>
            <Button className="w-full" variant="secondary" onClick={repeatQuestion}>Repeat Question</Button>
            {!helpLocked && <Button className="w-full" variant="accent" onClick={() => setCoachOpen((open) => !open)}>Coach</Button>}
            <Button className="w-full" variant="secondary" onClick={makeItEasier} disabled={helpLocked}>Make it easier</Button>
            <Button className="w-full" variant="secondary" onClick={skipWord}>Skip</Button>
            <Link href="/dashboard" className="block"><Button className="w-full" variant="secondary">Dashboard</Button></Link>
          </div>
          </div>

          {coachOpen && !helpLocked && targetWord ? (
            <SmartCoachPanel
              subject="spelling"
              question={`Spell: ${targetWord.word}`}
              correctAnswer={targetWord.word}
              hintCount={hintLevel}
              ageRange={profile?.ageRange}
              skillFocus={targetWord.patterns[0] ?? undefined}
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

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
            <div className="flex items-center gap-3">
              <p className="text-2xl">{tutorFace}</p>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-emerald-700">Tutor</p>
                <p>{tutorEmotion.replace("_", " ")}</p>
              </div>
            </div>
          </div>

          {reaction ? <div className="mt-3"><MascotReaction mood={reaction.mood} message={reaction.message} /></div> : null}

          {feedback ? (
            <p className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 font-bold text-indigo-900">{feedback}</p>
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
                        className={`h-2 rounded-full bg-linear-to-r from-cyan-300 to-indigo-300 ${streakWidthClass}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="text-blue-100">Hints used</p>
                      <p className="mt-1 text-xl font-black">{hintLevel}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3">
                      <p className="text-blue-100">Attempts</p>
                      <p className="mt-1 text-xl font-black">{attemptCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-amber-200 bg-linear-to-br from-amber-50 to-white p-5 shadow-sm">
                <p className="text-sm font-black text-amber-950">Reward mode</p>
                <p className="mt-2 text-sm leading-6 text-amber-800">
                  {reviewMode ? "Review mode is active with bonus rewards." : "Earn stars, XP, and coins by answering carefully."}
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-indigo-950">Word memory loop</p>
                    <p className="mt-2 text-sm leading-6 text-indigo-800">
                      {currentSessionStep
                        ? `${PHASE_LABELS[currentSessionStep.phase]} phase using ${MODE_LABELS[currentSessionStep.mode]}.`
                        : "Building today’s spelling session."}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-indigo-700 shadow-sm">
                    {sessionPlanLoading ? "Loading" : currentSessionStep ? PHASE_LABELS[currentSessionStep.phase] : "Ready"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-slate-500">Seen</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{wordMemorySummary?.seenWords ?? 0}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-slate-500">Weak</p>
                    <p className="mt-1 text-xl font-black text-amber-700">{wordMemorySummary?.weakWords ?? 0}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-slate-500">Mastered</p>
                    <p className="mt-1 text-xl font-black text-emerald-700">{wordMemorySummary?.masteredWords ?? 0}</p>
                  </div>
                </div>

                {lastMistakeType ? (
                  <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    Mistake pattern spotted: {lastMistakeType.replaceAll("_", " ")}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-slate-500">Mastered today</p>
                    <p className="mt-1 text-xl font-black text-emerald-700">{masteredTodayWords.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <p className="text-slate-500">Weak to revisit</p>
                    <p className="mt-1 text-xl font-black text-amber-700">{sessionWeakWordList.length}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
                <p className="text-sm font-black text-amber-950">Weak words to practise again</p>
                {sessionWeakWordList.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sessionWeakWordList.map((word) => (
                      <span key={word} className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-800 shadow-sm">{word}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    No weak words right now. Keep the streak going.
                  </p>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
                <p className="text-sm font-black text-emerald-950">Pattern engine</p>
                {patternHighlights.length ? (
                  <div className="mt-3 space-y-2">
                    {patternHighlights.map(([pattern, words]) => (
                      <div key={pattern} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{pattern}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{words.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-emerald-800">
                    Pattern families will appear after the system sees enough related words.
                  </p>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-black text-slate-900">Quick tip</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Repeat the word, try it once, then use Coach if you need a clue.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      </div>
    </main>
    </PremiumAccessGate>
  );
}
