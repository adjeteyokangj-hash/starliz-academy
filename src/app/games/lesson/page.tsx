"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInitialTutorRuntimeContext, createTutorEngineStore } from "@/hooks/useTutorEngine";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import StudentContextStrip from "@/components/student/StudentContextStrip";
import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";
import { type ChildProfile, getProfile, hydrateActiveProfileFromServer } from "@/lib/store";
import { beginStudentTurn, endStudentTurn, stopVoicePlayback } from "@/lib/voice";
import { syncAttemptToServer } from "@/lib/server_sync";
import { serializeSkills, skillFocusToCode } from "@/lib/skills";
import { getTutorToneLine } from "@/lib/tutorVoice";
import { type SpeechMatchResult } from "@/lib/speechCheck";
import { assessWarmupTranscript } from "@/lib/warmup-response";
import { levelFromXp } from "@/lib/level_system";
import { buildInterventionMission, isInterventionEligibleSkill } from "@/lib/interventionMission";
import { normalizeLessonContentItems, type NormalizedLessonItem } from "@/lib/lesson-runtime-normalizer";
import {
  decodeLessonText,
  classifySpokenVsTarget,
  describeTargetForTutor,
  fallbackVisualFromItem,
  getAnswer,
  getItemSection,
  getOptions,
  getPrompt,
  isAlphabetLessonItem,
  lessonSubjectBadge,
  normalise,
  normalizeSpokenText,
} from "@/lib/tutor-runtime/utils";
import {
  buildCoachSupportMessage,
  buildFinalRevealMessage,
  buildQuestionFormulaScaffold,
  buildRestoredLessonMessage,
  buildTutorPanelPrompt,
  buildWorkedSuccessMessage,
  computeAttemptWeightedScore,
  scoreForResolvedQuestion,
  buildTeachMessage,
  getAssessmentPrompt,
  getSpellingConversationTitle,
  getSupportPrompt,
  type LessonStage,
  type QuestionAttemptSummary,
} from "@/lib/engines/coaching-engine";
import { computeMasteryReady, type QuestionLearningStatus } from "@/lib/engines/mastery-engine";
import { reviewReason } from "@/lib/engines/review-engine";
import StarLizQuestionCard from "@/components/learning/StarLizQuestionCard";

type LessonItem = NormalizedLessonItem;

type LessonAssignment = {
  id: string;
  status: string;
  subject: string;
  studentId: string;
  contentId: string;
  title: string;
  skillFocus?: string | null;
  difficulty?: number;
  items: LessonItem[];
};

type ProgressSaveResponse = {
  rewards?: {
    xpEarned: number;
    coinsEarned: number;
    starsEarned: number;
    streak: number;
  };
  notification?: { ok: boolean; reason?: string };
};

type AnswerRecord = {
  item: LessonItem;
  section: "spelling" | "math" | "reading";
  correct: boolean;
  given: string;
};

type FeedbackMode = "none" | "continue" | "retry" | "skip_choice";
type LevelTag = "challenge" | "review" | "repair";
type SpeechFallbackReason = "network" | "not-allowed" | "unsupported" | null;
type WarmupPhase = "idle" | "listening" | "thinking" | "responding" | "celebrating";
type WarmupMood = "happy" | "excited" | "tired" | "sad" | "not_well" | "nervous" | "confused" | "neutral";
type WarmupLevel = "low" | "medium" | "high";
type SupportLevel = "standard" | "extra" | "challenge";
type SpeechButtonState = "idle" | "listening" | "try_again";
type LessonPhase = "warmup" | "lesson" | "review" | "boss_battle" | "complete";
type BossBattleStage = "transition" | "battle" | "result";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>>; timeStamp?: number }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type WarmupResult = {
  mood: WarmupMood;
  confidenceEstimate: number;
  energyEstimate: number;
  confidence: WarmupLevel;
  energy: WarmupLevel;
  supportLevel: SupportLevel;
  pace: "gentle" | "slower" | "balanced" | "faster";
  warmupResponse: string;
  hesitationMs: number;
  adaptation: {
    pacing: "slower" | "balanced" | "faster";
    hintStyle: "extra" | "gentle" | "standard" | "challenge";
    sessionMode: "short" | "standard" | "challenge";
  };
  tutorReply: string;
};

type LessonSessionSnapshot = {
  assignmentId: string;
  lessonPhase: LessonPhase;
  completed?: boolean;
  started: boolean;
  welcomeVoiceStarted: boolean;
  welcomeSpeechFinished: boolean;
  lessonStage: LessonStage;
  currentQuestionIndex: number;
  currentSubject: string;
  progress: number;
  tutorMessage: string;
  lastTutorMessage: string;
  transcript: string;
  voiceEnabled: boolean;
  answer: string;
  feedback: string;
  feedbackMode: FeedbackMode;
  attemptCount: number;
  speechAttempts: number;
  spokenAnswer: string;
  speechStatusMessage: string;
  speechWeakQuestionKeys: string[];
  speechLastMatchResult: SpeechMatchResult | "no-speech" | null;
  records: AnswerRecord[];
  reviewQueue: number[];
  isReviewRound: boolean;
  reviewPointer: number;
  reviewNotice: string;
  memoryFeedback: string;
  skippedQuestionKeys: string[];
  questionStatuses: Record<string, QuestionLearningStatus>;
  questionAttemptSummary: Record<string, QuestionAttemptSummary>;
  lessonMasteryReady: boolean;
  showReviewIntro: boolean;
  showReviewComplete: boolean;
  reviewImproved: boolean;
  pendingRecordsAfterReview: AnswerRecord[] | null;
  adaptiveSessionPlan: WarmupResult | null;
  warmupTranscript: string;
  warmupPrompt: string;
  warmupPhase: WarmupPhase;
  warmupStatus: string;
  lastChildResponse: string;
  mood: WarmupMood;
  confidence: number;
  confidenceLevel: WarmupLevel;
  energyLevel: WarmupLevel;
  supportLevel: SupportLevel;
  engagementLevel: "low" | "steady" | "high";
  currentItemSnapshot: LessonItem | null;
  rewardsEarned: ProgressSaveResponse["rewards"] | null;
  bossStage: BossBattleStage;
  bossQuestions: BossQuestion[];
  bossQuestionIndex: number;
  bossCorrectAnswers: number;
  bossHeartsLeft: number;
  bossAnswer: string;
  bossQuestionMisses: Record<string, number>;
  bossResult: BossResult | null;
  timeSpentSeconds: number;
  savedAt: string;
};

type BossQuestion = {
  id: string;
  slot: "warmup" | "focus" | "weak" | "mixed" | "final";
  slotLabel: string;
  item: LessonItem;
  section: "spelling" | "math" | "reading";
};

type BossResult = {
  win: boolean;
  perfectWin: boolean;
  rewards: {
    xpEarned: number;
    coinsEarned: number;
    starsEarned: number;
  };
  badge: string | null;
};

type BossCompletePayload = {
  ok?: boolean;
  alreadyClaimed?: boolean;
  rewards?: {
    xpEarned: number;
    coinsEarned: number;
    starsEarned: number;
  };
  win?: boolean;
  perfectWin?: boolean;
  badge?: string | null;
  error?: string;
};

function lessonSessionKey(assignmentId: string) {
  return `starliz_lesson_${assignmentId}`;
}

function toBossQuestionId(item: LessonItem, index: number): string {
  const id = String(item.id ?? "").trim();
  if (id) return id;
  return `lesson-item-${index}`;
}

function pickBossAnswer(item: LessonItem): string {
  return getAnswer(item);
}

function buildBossChallengeItem(section: "spelling" | "math" | "reading", slot: BossQuestion["slot"], source: LessonItem): LessonItem {
  if (section === "spelling") {
    const sourceAnswer = pickBossAnswer(source).toLowerCase();
    if (sourceAnswer.length === 1) {
      const letter = ["m", "s", "t", "c", "d", "a"].find((entry) => entry !== sourceAnswer) ?? "m";
      const upper = letter.toUpperCase();
      return {
        id: `boss-letter-${slot}`,
        type: "spelling",
        word: letter,
        answer: letter,
        prompt: `Tap the letter ${upper}`,
        options: [upper, "A", "S", "M"].filter((value, index, array) => array.indexOf(value) === index),
      } as unknown as LessonItem;
    }

    const longerWords = ["clock", "storm", "blend", "crust", "flight", "throne", "sprint", "bread"];
    const sourceLen = sourceAnswer.length;
    const scaledPool = longerWords.filter((word) => word.length >= Math.max(sourceLen, 4));
    const word = scaledPool[0] ?? "blend";
    return {
      id: `boss-word-${slot}`,
      type: "spelling",
      word,
      answer: word,
      prompt: `Spell the word ${word}`,
      options: [word, word.slice(0, -1) + "s", word[0] + "a" + word.slice(2), word.split("").reverse().join("")]
        .filter((value, index, array) => array.indexOf(value) === index)
        .slice(0, 4),
    } as unknown as LessonItem;
  }

  if (section === "math") {
    const sourcePrompt = getPrompt(source, "math");
    const match = sourcePrompt.match(/(\d+)\s*([+\-x*])\s*(\d+)/i);
    const left = match ? Math.min(20, Number(match[1]) + 3) : 7;
    const operator = match ? match[2] : "+";
    const right = match ? Math.min(12, Number(match[3]) + 2) : 5;
    const answerValue = operator === "-"
      ? left - right
      : operator.toLowerCase() === "x" || operator === "*"
        ? left * right
        : left + right;
    return {
      id: `boss-math-${slot}`,
      type: "math",
      prompt: `What is ${left} ${operator} ${right}?`,
      answer: String(answerValue),
      options: [String(answerValue), String(answerValue + 2), String(Math.max(0, answerValue - 2)), String(answerValue + 1)]
        .filter((value, index, array) => array.indexOf(value) === index)
        .slice(0, 4),
    } as unknown as LessonItem;
  }

  if (slot === "mixed") {
    return {
      id: "boss-reading-mixed",
      type: "reading",
      passage: "Sam packed a red ball, a blue hat, and a green book for the park.",
      prompt: "What did Sam pack for the park?",
      answer: "A red ball, a blue hat, and a green book",
      options: [
        "A red ball, a blue hat, and a green book",
        "Only a green book",
        "A yellow kite and a snack",
      ],
    } as unknown as LessonItem;
  }

  return {
    id: "boss-reading-final",
    type: "reading",
    passage: "Mina read three pages before dinner and two pages after dinner.",
    prompt: "How many pages did Mina read in total?",
    answer: "5",
    options: ["5", "3", "2"],
  } as unknown as LessonItem;
}

function heartsLabel(value: number): string {
  return Array.from({ length: 3 }, (_, index) => (index < value ? "❤️" : "🖤")).join(" ");
}

const LESSON_VOICE_KEY = "lessonVoiceEnabled";
const VOICE_UNAVAILABLE_MESSAGE = "Voice tutor unavailable on this device.";
const WARMUP_READY_INSTRUCTION = "When you're ready, click Begin my lesson to start.";

function withWarmupReadyInstruction(reply: string): string {
  return `${reply} ${WARMUP_READY_INSTRUCTION}`;
}

function detectWarmupMood(transcript: string, childName = "there"): WarmupResult {
  const text = decodeLessonText(transcript).toLowerCase();
  const has = (parts: string[]) => parts.some((part) => text.includes(part));
  const likesMaths = has(["i like maths", "i like math", "love maths", "love math", "maths is fun", "math is fun"]);
  const words = text.replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
  const positiveWords = ["good", "okay", "ok", "fine", "happy", "ready"];
  const negationWords = ["don't", "dont", "do", "not", "never", "no"];
  const hasNegatedPositive = words.some((word, index) => {
    if (!positiveWords.includes(word)) return false;
    const previous = words.slice(Math.max(0, index - 3), index);
    return previous.some((part) => negationWords.includes(part)) || previous.join(" ") === "do not";
  });
  const negativePhrase = hasNegatedPositive || has([
    "i don't feel good",
    "i do not feel good",
    "i feel bad",
    "i'm not good",
    "i am not good",
    "i don't feel well",
    "i do not feel well",
    "i'm tired",
    "i am tired",
    "i'm sad",
    "i am sad",
    "i'm scared",
    "i am scared",
    "i'm nervous",
    "i am nervous",
    "i don't know",
    "i am confused",
    "i'm confused",
    "im not okay",
    "i'm not okay",
    "i am not okay",
    "no i'm not ready",
    "no im not ready",
  ]);

  let mood: WarmupMood = "neutral";
  if (negativePhrase) mood = has(["tired"]) ? "tired" : has(["nervous", "scared"]) ? "nervous" : has(["confused", "don't know", "dont know"]) ? "confused" : "not_well";
  else if (has(["happy", "good", "great", "fine", "awesome", "okay", "ok"])) mood = "happy";
  if (!negativePhrase && has(["excited", "ready", "let's go", "lets go", "fun"])) mood = "excited";
  if (!negativePhrase && has(["tired", "sleepy", "yawn", "slow"])) mood = "tired";
  if (!negativePhrase && has(["sad", "upset", "unhappy", "cry", "bad"])) mood = "sad";
  if (!negativePhrase && has(["nervous", "worried", "scared", "anxious", "afraid"])) mood = "nervous";
  if (!negativePhrase && has(["confused", "hard", "stuck", "not sure", "i don't know", "idk", "don't know", "dont know"])) mood = "confused";

  const confidence: WarmupLevel =
    negativePhrase
      ? "low"
      : has(["confident", "easy", "i can", "i know", "i'm ready", "im ready"])
      ? "high"
      : mood === "nervous" || mood === "confused" || has(["can't", "cant", "don't know", "dont know", "not sure"])
        ? "low"
        : "medium";

  const energy: WarmupLevel =
    negativePhrase
      ? "low"
      : mood === "excited" || has(["lots of energy", "energetic"])
      ? "high"
      : mood === "tired" || mood === "sad" || mood === "not_well"
        ? "low"
        : "medium";

  const confidenceEstimate =
    confidence === "high" || mood === "excited" || mood === "happy"
      ? 80
      : confidence === "low"
        ? 40
        : 60;

  const energyEstimate =
    energy === "high" ? 90 : energy === "low" ? 35 : mood === "happy" ? 70 : 55;

  const supportLevel: SupportLevel =
    confidence === "high" || mood === "excited" ? "challenge" : confidence === "low" || mood === "tired" || mood === "sad" || mood === "not_well" || mood === "nervous" || mood === "confused" ? "extra" : "standard";
  const pace: WarmupResult["pace"] = supportLevel === "challenge" ? "balanced" : supportLevel === "extra" ? "gentle" : "balanced";

  const adaptation: WarmupResult["adaptation"] =
    mood === "tired" || mood === "sad" || mood === "not_well"
      ? { pacing: "slower", hintStyle: "extra", sessionMode: "short" as const }
      : mood === "nervous" || mood === "confused" || confidence === "low"
        ? { pacing: "slower", hintStyle: "extra", sessionMode: "standard" as const }
        : mood === "excited" || confidence === "high"
          ? { pacing: "faster", hintStyle: "challenge", sessionMode: "challenge" as const }
          : { pacing: "balanced", hintStyle: "standard", sessionMode: "standard" as const };

  const tutorReply =
    likesMaths
      ? `Awesome, ${childName}! We'll do some fun maths challenges today.`
      : mood === "not_well"
        ? `I'm sorry you're not feeling good, ${childName}. That's okay. We'll go slowly and I'll help you step by step.`
      : mood === "tired"
      ? `That's okay, ${childName}. We'll take it slowly and I'll help you step by step.`
      : mood === "sad"
        ? `That's okay, ${childName}. We'll start gently and I'll help you.`
      : mood === "excited"
        ? `Amazing energy, ${childName}! We'll start with a fun challenge.`
        : mood === "confused"
          ? `That's okay, ${childName}. I'll explain things clearly and give you extra help.`
          : mood === "nervous"
            ? `Don't worry, ${childName}. I'm here with you. We'll try together.`
            : mood === "happy"
              ? `That's great, ${childName}. I'm happy to hear that. We'll start with a fun challenge.`
              : `Thanks for telling me, ${childName}. We'll start gently and I'll help you.`;

  return {
    mood,
    confidenceEstimate,
    energyEstimate,
    confidence,
    energy,
    supportLevel,
    pace,
    warmupResponse: transcript,
    hesitationMs: 0,
    adaptation,
    tutorReply,
  };
}

function lessonCacheKey(assignmentId: string) {
  return `starliz:lesson:${assignmentId}`;
}

function pendingProgressKey(assignmentId: string) {
  return `starliz:lesson-progress:${assignmentId}`;
}

function TutorAvatar({ state }: { state: "idle" | "thinking" | "celebrate" | "try_again" }) {
  const isCelebrate = state === "celebrate";
  const isTryAgain = state === "try_again";
  const label = state === "idle" ? "Ready" : state === "thinking" ? "Thinking" : isCelebrate ? "Great work" : "Try again";
  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative h-28 w-28 rounded-4xl border-4 bg-white shadow-2xl transition-transform duration-300 ${
          isCelebrate
            ? "animate-bounce border-emerald-300 shadow-emerald-200"
            : isTryAgain
              ? "border-amber-300 shadow-amber-200"
              : state === "thinking"
                ? "animate-pulse border-cyan-300 shadow-cyan-200"
                : "border-indigo-300 shadow-indigo-200"
        }`}
      >
        <div className="absolute left-7 top-8 h-4 w-4 rounded-full bg-slate-950" />
        <div className="absolute right-7 top-8 h-4 w-4 rounded-full bg-slate-950" />
        <div
          className={`absolute left-1/2 top-16 h-4 w-10 -translate-x-1/2 border-b-4 ${
            isTryAgain ? "rounded-t-full border-amber-500" : "rounded-b-full border-indigo-600"
          }`}
        />
        {isCelebrate ? (
          <div className="absolute -right-3 -top-3 rounded-full bg-amber-300 px-2 py-1 text-sm font-black text-slate-950">XP</div>
        ) : null}
      </div>
      <p className="mt-4 font-black">{label}</p>
    </div>
  );
}

export default function DailyLessonGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const interventionEnabled = searchParams.get("intervention") === "1";
  const requestedPhase = searchParams.get("phase");
  const requestedBossPhase = requestedPhase === "boss_battle";
  const interventionSkill = searchParams.get("skill");
  const interventionSupportSkill = searchParams.get("supportSkill");
  const interventionAccuracy = Number(searchParams.get("accuracy") ?? "");
  const interventionLaunchedAt = searchParams.get("launchedAt");
  const startedAtRef = useRef(0);
  const restoreCheckedRef = useRef(false);
  const speechUnlockedRef = useRef(false);
  const voicesReadyRef = useRef(false);
  const lastActivityAtRef = useRef(0);
  const restoredReplayRef = useRef(false);
  const voiceUnlockPromiseRef = useRef<Promise<void> | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionStoppingRef = useRef(false);
  const bossEntryHandledRef = useRef(false);
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [assignment, setAssignment] = useState<LessonAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [error, setError] = useState("");
  const [lessonPhase, setLessonPhase] = useState<LessonPhase>(requestedBossPhase ? "boss_battle" : "warmup");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(LESSON_VOICE_KEY) !== "false";
  });
  const [tutorState, setTutorState] = useState<"idle" | "thinking" | "celebrate" | "try_again">("idle");
  const [voiceLine, setVoiceLine] = useState("I am ready when you are.");
  const [lastTutorMessage, setLastTutorMessage] = useState("I am ready when you are.");
  const [voiceUnavailable, setVoiceUnavailable] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [restoredMessage, setRestoredMessage] = useState("");
  const [online, setOnline] = useState(() => typeof window === "undefined" ? true : window.navigator.onLine);
  const [saveResult, setSaveResult] = useState<ProgressSaveResponse | null>(null);
  const [offlineNotice, setOfflineNotice] = useState("");
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("none");
  const [attemptCount, setAttemptCount] = useState(0);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachOpenCount, setCoachOpenCount] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const [isReviewRound, setIsReviewRound] = useState(false);
  const [showReviewIntro, setShowReviewIntro] = useState(false);
  const [reviewPointer, setReviewPointer] = useState(0);
  const [reviewNotice, setReviewNotice] = useState("");
  const [memoryFeedback, setMemoryFeedback] = useState("");
  const [showReviewComplete, setShowReviewComplete] = useState(false);
  const [reviewImproved, setReviewImproved] = useState(false);
  const [pendingRecordsAfterReview, setPendingRecordsAfterReview] = useState<AnswerRecord[] | null>(null);
  const [skippedQuestionKeys, setSkippedQuestionKeys] = useState<string[]>([]);
  const [lessonMasteryReady, setLessonMasteryReady] = useState(false);
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionLearningStatus>>({});
  const [questionAttemptSummary, setQuestionAttemptSummary] = useState<Record<string, QuestionAttemptSummary>>({});
  const [lessonStage, setLessonStage] = useState<LessonStage>("ASSESS_SPEECH");
  const [speechAttempts, setSpeechAttempts] = useState(0);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechButtonState, setSpeechButtonState] = useState<SpeechButtonState>("idle");
  const [spokenAnswer, setSpokenAnswer] = useState("");
  const [speechStatusMessage, setSpeechStatusMessage] = useState("");
  const [speechFallbackReason, setSpeechFallbackReason] = useState<SpeechFallbackReason>(null);
  const [speechWeakQuestionKeys, setSpeechWeakQuestionKeys] = useState<string[]>([]);
  const [speechLastMatchResult, setSpeechLastMatchResult] = useState<SpeechMatchResult | "no-speech" | null>(null);
  const [pendingIntervention, setPendingIntervention] = useState<{ skill: string; supportSkill: string; accuracy: number } | null>(null);
  const [interventionLaunchStarted, setInterventionLaunchStarted] = useState(false);
  const [warmupPhase, setWarmupPhase] = useState<WarmupPhase>("idle");
  const [warmupTranscript, setWarmupTranscript] = useState("");
  const [warmupPrompt, setWarmupPrompt] = useState("How are you feeling today?");
  const [warmupStatus, setWarmupStatus] = useState("");
  const [warmupResult, setWarmupResult] = useState<WarmupResult | null>(null);
  const [warmupFailedAttempts, setWarmupFailedAttempts] = useState(0);
  const [warmupSkipped, setWarmupSkipped] = useState(false);
  const [welcomeVoiceStarted, setWelcomeVoiceStarted] = useState(false);
  const [welcomeSpeechFinished, setWelcomeSpeechFinished] = useState(false);
  const [lastWarmupMemory, setLastWarmupMemory] = useState<{ mood: WarmupMood; date: string } | null>(null);
  const [bossStage, setBossStage] = useState<BossBattleStage>("transition");
  const [bossQuestions, setBossQuestions] = useState<BossQuestion[]>([]);
  const [bossQuestionIndex, setBossQuestionIndex] = useState(0);
  const [bossCorrectAnswers, setBossCorrectAnswers] = useState(0);
  const [bossHeartsLeft, setBossHeartsLeft] = useState(3);
  const [bossAnswer, setBossAnswer] = useState("");
  const [bossQuestionMisses, setBossQuestionMisses] = useState<Record<string, number>>({});
  const [bossSubmitting, setBossSubmitting] = useState(false);
  const [bossResult, setBossResult] = useState<BossResult | null>(null);

  // ── Runtime state machine (additive: runs in parallel, never blocks lesson logic) ──
  const [tutorEngine] = useState(() =>
    createTutorEngineStore(createInitialTutorRuntimeContext(assignmentId ?? "pending", 0)),
  );
  const tutorEngineLoadedRef = useRef(false);

  useEffect(() => {
    void hydrateActiveProfileFromServer()
      .then((serverProfile) => {
        const nextProfile = serverProfile ?? getProfile();
        if (!nextProfile) {
          setProfileLoading(false);
          router.replace("/onboarding");
          return;
        }
        setProfile(nextProfile);
        setProfileLoading(false);
      })
      .catch(() => {
        setProfileLoading(false);
      });
  }, [router]);

  const buildInterventionPath = useCallback(function buildInterventionPath(input: { assignmentId: string; skill: string; supportSkill: string; accuracy: number; launchedAt?: string }): string {
    const params = new URLSearchParams({
      assignmentId: input.assignmentId,
      intervention: "1",
      skill: input.skill,
      supportSkill: input.supportSkill,
      accuracy: String(input.accuracy),
      launchedAt: input.launchedAt ?? new Date().toISOString(),
    });
    return `/games/lesson?${params.toString()}`;
  }, []);

  const interventionMission = useMemo(() => {
    if (!interventionEnabled) return null;
    return buildInterventionMission({
      primarySkill: interventionSkill,
      supportSkill: interventionSupportSkill,
      accuracy: Number.isFinite(interventionAccuracy) ? interventionAccuracy : null,
    });
  }, [interventionAccuracy, interventionEnabled, interventionSkill, interventionSupportSkill]);

  useEffect(() => {
    async function loadLesson() {
      if (!assignmentId) {
        setError("Missing assignment.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/student/assignments?id=${encodeURIComponent(assignmentId)}`, { credentials: "include" });
        const payload = (await response.json()) as LessonAssignment & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load lesson.");
        setAssignment(payload);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(lessonCacheKey(assignmentId), JSON.stringify(payload));
        }
      } catch (err) {
        const cached = typeof window !== "undefined" ? window.localStorage.getItem(lessonCacheKey(assignmentId)) : null;
        if (cached) {
          setAssignment(JSON.parse(cached) as LessonAssignment);
          setOfflineNotice("Offline lesson loaded from this device.");
        } else {
          setError(err instanceof Error ? err.message : "Unable to load lesson.");
        }
      } finally {
        setLoading(false);
      }
    }
    void loadLesson();
  }, [assignmentId]);

  const activeAssignment = (() => {
    if (!assignment) return null;
    if (!interventionMission) return assignment;
    return {
      ...assignment,
      subject: interventionMission.subject,
      title: interventionMission.title,
      skillFocus: interventionSkill ?? assignment.skillFocus,
      items: normalizeLessonContentItems(interventionMission.items, {
        contentType: interventionMission.subject,
        subject: interventionMission.subject,
        topic: interventionMission.title,
        skillFocus: interventionSkill ?? assignment.skillFocus ?? interventionMission.badge,
        difficulty: assignment.difficulty ?? 1,
      }),
    };
  })();

  useEffect(() => {
    if (!activeAssignment || tutorEngineLoadedRef.current) return;
    tutorEngineLoadedRef.current = true;
    tutorEngine.dispatch({
      name: "ASSIGNMENT_LOADED",
      data: { assignmentId: activeAssignment.id, itemCount: activeAssignment.items.length },
    });
  }, [activeAssignment, tutorEngine]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const profileId = profile?.id;
    if (!profileId) return;
    try {
      const raw = window.localStorage.getItem(`starliz:warmup:last:${profileId}`);
      if (raw) {
        window.setTimeout(() => {
          setLastWarmupMemory(JSON.parse(raw) as { mood: WarmupMood; date: string });
        }, 0);
      }
    } catch {
      // ignore
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!online || !assignmentId) return;
    const pending = window.localStorage.getItem(pendingProgressKey(assignmentId));
    if (!pending) return;
    fetch("/api/student/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: pending,
    })
      .then((response) => {
        if (response.ok) window.localStorage.removeItem(pendingProgressKey(assignmentId));
      })
      .catch(() => undefined);
  }, [assignmentId, online]);
  const lessonItems = useMemo(() => activeAssignment?.items ?? [], [activeAssignment]);

  const currentItem = lessonItems[index] ?? null;
  const currentSection = currentItem ? getItemSection(currentItem, activeAssignment?.subject ?? "spelling") : "spelling";
  const currentSubjectBadge = lessonSubjectBadge(activeAssignment?.subject);
  const progress = lessonItems.length ? Math.round((records.length / lessonItems.length) * 100) : 0;
  const correctCount = records.filter((record) => record.correct).length;
  const incorrectCount = records.length - correctCount;
  const score = computeAttemptWeightedScore(questionAttemptSummary);
  const attemptIndicator = Math.min(3, Math.max(1, attemptCount + 1));
  const questionFormula = currentItem
    ? buildQuestionFormulaScaffold({ item: currentItem, section: currentSection, subjectLabel: currentSubjectBadge })
    : null;
  const resolvedQuestionVisual = questionFormula?.visual ?? fallbackVisualFromItem(currentItem);
  const currentQuestionOutcome = currentItem ? questionAttemptSummary[questionStatusKey(currentItem, index)] : null;
  const tutorSupportLevel = useMemo(() => {
    let nextLevel = 1;
    if (attemptCount >= 1 || coachOpenCount >= 1 || speechAttempts >= 1) nextLevel = 2;
    if (attemptCount >= 2 || coachOpenCount >= 2) nextLevel = 3;
    if (attemptCount >= 2 && speechAttempts >= 1) nextLevel = 4;
    if (feedbackMode === "retry" || feedbackMode === "skip_choice") nextLevel = Math.max(nextLevel, 5);
    if (warmupResult?.confidence === "low" || warmupResult?.mood === "confused") nextLevel = Math.max(nextLevel, 6);
    if (speechLastMatchResult === "no-speech") nextLevel = Math.max(nextLevel, 7);
    if (attemptCount >= 3) nextLevel = Math.max(nextLevel, 8);
    if (attemptCount >= 3 && speechAttempts >= 2) nextLevel = 9;
    return nextLevel;
  }, [attemptCount, coachOpenCount, feedbackMode, speechAttempts, speechLastMatchResult, warmupResult?.confidence, warmupResult?.mood]);
  const simplifiedQuestion = currentItem
    ? [
      "Given:",
      ...(questionFormula?.keyInformation?.length
        ? questionFormula.keyInformation
        : [getPrompt(currentItem, currentSection)]),
      "Need:",
      "Find the missing answer.",
    ].join("\n")
    : "";
  const guidedQuestion = currentItem
    ? [
      "Which value is given?",
      "What are we trying to find?",
      "Which formula or rule fits this question?",
    ].join("\n")
    : "";
  const recoveryPrompt = currentItem
    ? [
      "Recovery mode:",
      "1) Identify one key value.",
      "2) Match it to the formula/rule.",
      "3) Solve one step only.",
    ].join("\n")
    : "";
  const coachPromptText = currentItem
    ? tutorSupportLevel >= 8
      ? `${recoveryPrompt}\n\n${buildCoachSupportMessage({ section: currentSection, item: currentItem, prompt: getPrompt(currentItem, currentSection) })}`
      : tutorSupportLevel >= 5
        ? `${guidedQuestion}\n\n${buildCoachSupportMessage({ section: currentSection, item: currentItem, prompt: getPrompt(currentItem, currentSection) })}`
        : tutorSupportLevel >= 2
          ? `${simplifiedQuestion}\n\n${buildCoachSupportMessage({ section: currentSection, item: currentItem, prompt: getPrompt(currentItem, currentSection) })}`
          : buildCoachSupportMessage({ section: currentSection, item: currentItem, prompt: getPrompt(currentItem, currentSection) })
    : "";
  const childLevel = levelFromXp(profile?.xp ?? 0);
  const childName = useMemo(() => {
    const raw = String(profile?.name ?? "").trim();
    return raw || "there";
  }, [profile?.name]);
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
  const interventionLevel = Math.min(3, 1 + Math.floor(correctCount / 2));

  const practicingNow = feedbackMode === "retry" || feedbackMode === "skip_choice";
  const speechDebugEnabled = process.env.NODE_ENV === "development" && searchParams.get("debugSpeech") === "1";
  const microphoneVisible = started && currentSection === "spelling" && !feedback && (lessonStage === "ASSESS_SPEECH" || lessonStage === "TEACH_RETRY");
  const hasMultipleChoiceOptions = Boolean(currentItem && getOptions(currentItem).length > 0 && currentSection !== "spelling");
  const tutorPrompt = buildTutorPanelPrompt({
    voiceEnabled,
    microphoneVisible,
    speechListening,
    coachOpen,
    feedbackMode: feedbackMode === "none" ? null : feedbackMode,
    hasAnswerOptions: hasMultipleChoiceOptions,
    answerSubmitted: Boolean(feedback),
    correctAnswerVisible: feedbackMode === "continue" && Boolean(feedback),
  });

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = performance.now();
  }, []);

  const welcomeLine = useMemo(
    () => `Hi ${childName}. I'm Star, your learning coach today. How are you feeling today? Tap the microphone and tell me how you feel.`,
    [childName],
  );
  const needsGentleStart = Boolean(warmupResult && (warmupResult.supportLevel === "extra" || warmupResult.confidence === "low"));

  function stopRecognition(updateState = true) {
    const recognition = recognitionRef.current;
    if (!recognition) {
      if (updateState) setSpeechListening(false);
      return;
    }
    recognitionStoppingRef.current = true;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort?.();
    } catch {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    }
    recognitionRef.current = null;
    if (updateState) setSpeechListening(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }
  }

  function getTutorVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const preferredNames = ["Google UK English Female", "Microsoft Sonia", "Microsoft Libby"];
    const exact = voices.find((voice) => preferredNames.some((name) => voice.name.toLowerCase().includes(name.toLowerCase())));
    if (exact) return exact;
    return voices.find((voice) => voice.lang.toLowerCase().startsWith("en-gb"))
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
      ?? voices[0]
      ?? null;
  }

  function preloadTutorVoices(): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceUnavailable(VOICE_UNAVAILABLE_MESSAGE);
      return Promise.resolve();
    }
    if (window.speechSynthesis.getVoices().length) {
      voicesReadyRef.current = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const finish = () => {
        voicesReadyRef.current = true;
        window.speechSynthesis.onvoiceschanged = null;
        resolve();
      };
      window.speechSynthesis.onvoiceschanged = finish;
      window.setTimeout(finish, 700);
    });
  }

  function unlockTutorVoice(): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceUnavailable(VOICE_UNAVAILABLE_MESSAGE);
      return Promise.resolve();
    }
    if (speechUnlockedRef.current) return Promise.resolve();
    if (voiceUnlockPromiseRef.current) return voiceUnlockPromiseRef.current;
    setVoiceUnavailable("");
    voiceUnlockPromiseRef.current = new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(".");
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.cancel();
        speechUnlockedRef.current = true;
        resolve();
      };
      utterance.volume = 0.01;
      utterance.onstart = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      window.setTimeout(finish, 250);
    });
    return voiceUnlockPromiseRef.current;
  }

  async function unlockTutorSpeech() {
    await unlockTutorVoice();
    await preloadTutorVoices();
  }

  function cancelTutorSpeech() {
    stopVoicePlayback();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      currentUtteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
  }

  async function speakTutor(line: string): Promise<void> {
    const cleanLine = decodeLessonText(line).trim();
    if (!cleanLine) return;
    setLastTutorMessage(cleanLine);
    setVoiceLine(cleanLine);
    if (!voiceEnabled) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceUnavailable(VOICE_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!speechUnlockedRef.current) {
      return;
    }
    setVoiceUnavailable("");
    setTutorState("thinking");
    stopRecognition();
    await preloadTutorVoices();
    cancelTutorSpeech();
    currentUtteranceRef.current = null;
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(cleanLine);
    currentUtteranceRef.current = utterance;
    const voice = getTutorVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-GB";
    }
    utterance.rate = 0.88;
    utterance.pitch = 1.1;
    utterance.volume = 1;
    if (process.env.NODE_ENV === "development") {
      console.log("[Star Speech]", cleanLine);
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      let startedSpeaking = false;
      let retried = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (currentUtteranceRef.current === utterance) currentUtteranceRef.current = null;
        setTutorState((current) => current === "thinking" ? "idle" : current);
        resolve();
      };
      const timeout = window.setTimeout(finish, Math.min(10000, Math.max(2500, cleanLine.length * 80)));
      const startSpeech = () => {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        window.setTimeout(() => {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        }, 50);
      };
      const watchdog = window.setTimeout(() => {
        if (startedSpeaking || retried || settled) return;
        retried = true;
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const retryUtterance = new SpeechSynthesisUtterance(cleanLine);
        currentUtteranceRef.current = retryUtterance;
        if (voice) {
          retryUtterance.voice = voice;
          retryUtterance.lang = voice.lang;
        } else {
          retryUtterance.lang = "en-GB";
        }
        retryUtterance.rate = utterance.rate;
        retryUtterance.pitch = utterance.pitch;
        retryUtterance.volume = utterance.volume;
        retryUtterance.onstart = () => { startedSpeaking = true; };
        retryUtterance.onend = () => {
          window.clearTimeout(timeout);
          finish();
        };
        retryUtterance.onerror = () => {
          window.clearTimeout(timeout);
          finish();
        };
        window.setTimeout(() => {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(retryUtterance);
        }, 50);
      }, 1000);
      utterance.onstart = () => {
        startedSpeaking = true;
      };
      utterance.onend = () => {
        window.clearTimeout(timeout);
        window.clearTimeout(watchdog);
        finish();
      };
      utterance.onerror = () => {
        window.clearTimeout(timeout);
        window.clearTimeout(watchdog);
        finish();
      };
      startSpeech();
    });
  }

  function speakTutorLine(line: string) {
    void speakTutor(line);
  }

  async function startTalkingWithStar() {
    markActivity();
    if (welcomeSpeechFinished) return;
    setWelcomeVoiceStarted(true);
    setWelcomeSpeechFinished(false);
    setWarmupStatus("Star is speaking...");
    setVoiceStatus("Star is speaking...");
    if (!voiceEnabled) {
      setVoiceStatus("");
      setWarmupStatus("Tap the microphone and tell me how you feel.");
      setWelcomeSpeechFinished(true);
      return;
    }
    await unlockTutorVoice();
    await preloadTutorVoices();
    await speakTutor(welcomeLine);
    setVoiceStatus("");
    setWarmupStatus("Tap the microphone and tell me how you feel.");
    setWelcomeSpeechFinished(true);
  }
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      void preloadTutorVoices();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition(false);
      cancelTutorSpeech();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LESSON_VOICE_KEY, String(voiceEnabled));
    if (!voiceEnabled) cancelTutorSpeech();
  }, [voiceEnabled]);

  useEffect(() => {
    if (!assignmentId || !activeAssignment || restoreCheckedRef.current) return;
    restoreCheckedRef.current = true;
    if (typeof window === "undefined") {
      setTimeout(() => setSessionHydrated(true), 0);
      return;
    }
    window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(lessonSessionKey(assignmentId));
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<LessonSessionSnapshot>;
        if (saved.assignmentId !== assignmentId || saved.completed) {
          window.localStorage.removeItem(lessonSessionKey(assignmentId));
          return;
        }
        const itemCount = activeAssignment.items.length;
        const savedIndex = Number(saved.currentQuestionIndex);
        if (!Number.isInteger(savedIndex) || savedIndex < 0 || savedIndex >= Math.max(1, itemCount)) {
          window.localStorage.removeItem(lessonSessionKey(assignmentId));
          return;
        }

        setStarted(Boolean(saved.started));
        setLessonPhase(saved.lessonPhase ?? "warmup");
        setWelcomeVoiceStarted(Boolean(saved.welcomeVoiceStarted));
        setWelcomeSpeechFinished(Boolean(saved.welcomeSpeechFinished));
        startedAtRef.current = performance.now();
        setIndex(savedIndex);
        setLessonStage(saved.lessonStage ?? "ASSESS_SPEECH");
        setAnswer(String(saved.answer ?? ""));
        setFeedback(String(saved.feedback ?? ""));
        setFeedbackMode(saved.feedbackMode ?? "none");
        setAttemptCount(Number(saved.attemptCount ?? 0));
        setSpeechAttempts(Number(saved.speechAttempts ?? 0));
        setSpokenAnswer(String(saved.spokenAnswer ?? ""));
        setSpeechStatusMessage(String(saved.speechStatusMessage ?? ""));
        setSpeechWeakQuestionKeys(Array.isArray(saved.speechWeakQuestionKeys) ? saved.speechWeakQuestionKeys : []);
        setSpeechLastMatchResult(saved.speechLastMatchResult ?? null);
        setRecords(Array.isArray(saved.records) ? saved.records : []);
        setReviewQueue(Array.isArray(saved.reviewQueue) ? saved.reviewQueue : []);
        setIsReviewRound(Boolean(saved.isReviewRound));
        setReviewPointer(Number(saved.reviewPointer ?? 0));
        setReviewNotice(String(saved.reviewNotice ?? ""));
        setMemoryFeedback(String(saved.memoryFeedback ?? ""));
        setSkippedQuestionKeys(Array.isArray(saved.skippedQuestionKeys) ? saved.skippedQuestionKeys : []);
        setQuestionStatuses(saved.questionStatuses && typeof saved.questionStatuses === "object" ? saved.questionStatuses : {});
        setQuestionAttemptSummary(saved.questionAttemptSummary && typeof saved.questionAttemptSummary === "object" ? saved.questionAttemptSummary as Record<string, QuestionAttemptSummary> : {});
        setLessonMasteryReady(Boolean(saved.lessonMasteryReady));
        setShowReviewIntro(Boolean(saved.showReviewIntro));
        setShowReviewComplete(Boolean(saved.showReviewComplete));
        setReviewImproved(Boolean(saved.reviewImproved));
        setPendingRecordsAfterReview(Array.isArray(saved.pendingRecordsAfterReview) ? saved.pendingRecordsAfterReview : null);
        setWarmupResult(saved.adaptiveSessionPlan ?? null);
        setWarmupTranscript(String(saved.warmupTranscript ?? saved.transcript ?? ""));
        setWarmupPrompt(String(saved.warmupPrompt ?? "How are you feeling today?"));
        setWarmupPhase(saved.warmupPhase ?? "idle");
        setWarmupStatus(String(saved.warmupStatus ?? ""));
        setBossStage(saved.bossStage ?? "transition");
        setBossQuestions(Array.isArray(saved.bossQuestions) ? saved.bossQuestions : []);
        setBossQuestionIndex(Number(saved.bossQuestionIndex ?? 0));
        setBossCorrectAnswers(Number(saved.bossCorrectAnswers ?? 0));
        setBossHeartsLeft(Number(saved.bossHeartsLeft ?? 3));
        setBossAnswer(String(saved.bossAnswer ?? ""));
        setBossQuestionMisses(saved.bossQuestionMisses && typeof saved.bossQuestionMisses === "object" ? saved.bossQuestionMisses : {});
        setBossResult(saved.bossResult ?? null);
        const localVoiceOverride = window.localStorage.getItem(LESSON_VOICE_KEY);
        setVoiceEnabled(localVoiceOverride === "false" ? false : (saved.voiceEnabled ?? true));
        setVoiceLine(decodeLessonText(String(saved.tutorMessage ?? saved.lastTutorMessage ?? "I am ready when you are.")));
        setLastTutorMessage(decodeLessonText(String(saved.lastTutorMessage ?? saved.tutorMessage ?? "I am ready when you are.")));
        setRestoredMessage(buildRestoredLessonMessage());
      } catch {
        window.localStorage.removeItem(lessonSessionKey(assignmentId));
      } finally {
        setSessionHydrated(true);
      }
    }, 0);
  }, [activeAssignment, assignmentId]);

  useEffect(() => {
    if (!assignmentId || !activeAssignment || !restoreCheckedRef.current || completed) return;
    if (typeof window === "undefined") return;
    const mood = warmupResult?.mood ?? "neutral";
    const confidence = warmupResult?.confidenceEstimate ?? 60;
    const confidenceLevel = warmupResult?.confidence ?? "medium";
    const energyLevel = warmupResult?.energy ?? "medium";
    const supportLevel = warmupResult?.supportLevel ?? "standard";
    const engagementLevel = warmupResult
      ? warmupResult.energyEstimate >= 75 ? "high" : warmupResult.energyEstimate <= 40 ? "low" : "steady"
      : "steady";
    const snapshot: LessonSessionSnapshot = {
      assignmentId,
      lessonPhase,
      started,
      welcomeVoiceStarted,
      welcomeSpeechFinished,
      lessonStage,
      currentQuestionIndex: index,
      currentSubject: currentSection,
      progress,
      tutorMessage: voiceLine,
      lastTutorMessage,
      transcript: warmupTranscript,
      voiceEnabled,
      answer,
      feedback,
      feedbackMode,
      attemptCount,
      speechAttempts,
      spokenAnswer,
      speechStatusMessage,
      speechWeakQuestionKeys,
      speechLastMatchResult,
      records,
      reviewQueue,
      isReviewRound,
      reviewPointer,
      reviewNotice,
      memoryFeedback,
      skippedQuestionKeys,
      questionStatuses,
      questionAttemptSummary,
      lessonMasteryReady,
      showReviewIntro,
      showReviewComplete,
      reviewImproved,
      pendingRecordsAfterReview,
      adaptiveSessionPlan: warmupResult,
      warmupTranscript,
      warmupPrompt,
      warmupPhase,
      warmupStatus,
      lastChildResponse: spokenAnswer || warmupTranscript,
      mood,
      confidence,
      confidenceLevel,
      energyLevel,
      supportLevel,
      engagementLevel,
      currentItemSnapshot: currentItem,
      rewardsEarned: saveResult?.rewards ?? null,
      bossStage,
      bossQuestions,
      bossQuestionIndex,
      bossCorrectAnswers,
      bossHeartsLeft,
      bossAnswer,
      bossQuestionMisses,
      bossResult,
      timeSpentSeconds: startedAtRef.current ? Math.round((performance.now() - startedAtRef.current) / 1000) : 0,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(lessonSessionKey(assignmentId), JSON.stringify(snapshot));
    } catch {
      // Storage can be full or disabled; the lesson should continue.
    }
  }, [
    activeAssignment,
    answer,
    assignmentId,
    bossAnswer,
    bossCorrectAnswers,
    bossHeartsLeft,
    bossQuestionIndex,
    bossQuestionMisses,
    bossQuestions,
    bossResult,
    bossStage,
    attemptCount,
    completed,
    currentItem,
    currentSection,
    feedback,
    feedbackMode,
    index,
    isReviewRound,
    lastTutorMessage,
    lessonPhase,
    lessonMasteryReady,
    lessonStage,
    memoryFeedback,
    pendingRecordsAfterReview,
    progress,
    questionStatuses,
    questionAttemptSummary,
    records,
    reviewImproved,
    reviewNotice,
    reviewPointer,
    reviewQueue,
    saveResult?.rewards,
    showReviewComplete,
    showReviewIntro,
    skippedQuestionKeys,
    speechAttempts,
    speechLastMatchResult,
    speechStatusMessage,
    speechWeakQuestionKeys,
    spokenAnswer,
    started,
    voiceEnabled,
    voiceLine,
    warmupPhase,
    warmupPrompt,
    warmupResult,
    warmupStatus,
    warmupTranscript,
    welcomeSpeechFinished,
    welcomeVoiceStarted,
  ]);

  useEffect(() => {
    if (!assignmentId || !completed || typeof window === "undefined") return;
    window.localStorage.removeItem(lessonSessionKey(assignmentId));
  }, [assignmentId, completed]);

  useEffect(() => {
    if (!restoredMessage || restoredReplayRef.current || !started || completed || !lastTutorMessage) return;
    restoredReplayRef.current = true;
    const timer = window.setTimeout(() => {
      void speakTutor(lastTutorMessage);
    }, 450);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, lastTutorMessage, restoredMessage, started]);

  useEffect(() => {
    if (!started || completed) return;
    const timer = window.setInterval(() => {
      if (performance.now() - lastActivityAtRef.current < 25000) return;
      lastActivityAtRef.current = performance.now();
      const line = buildTutorPanelPrompt({
        voiceEnabled,
        microphoneVisible,
        speechListening,
        coachOpen,
        feedbackMode: feedbackMode === "none" ? null : feedbackMode,
        hasAnswerOptions: hasMultipleChoiceOptions,
        answerSubmitted: Boolean(feedback),
        correctAnswerVisible: feedbackMode === "continue" && Boolean(feedback),
      });
      void speakTutor(line);
    }, 5000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, coachOpen, feedback, feedbackMode, hasMultipleChoiceOptions, microphoneVisible, speechListening, started, voiceEnabled]);

  function questionStatusKey(item: LessonItem, itemIndex: number): string {
    return String(item.id ?? `index-${itemIndex}`);
  }

  function clearFeedbackForRetry() {
    setFeedback("");
    setFeedbackMode("none");
    setTutorState("thinking");
    setVoiceLine("Take your time. You can do this.");
    setCoachOpen(false);
  }

  function goToQuestion(nextIndex: number) {
    setIndex(nextIndex);
    setAttemptCount(0);
    setCoachOpenCount(0);
    setCoachOpen(false);
    setFeedback("");
    setFeedbackMode("none");
    setAnswer("");
    setLessonStage("ASSESS_SPEECH");
    setSpeechAttempts(0);
    setSpeechListening(false);
    setSpeechButtonState("idle");
    setSpokenAnswer("");
    setSpeechStatusMessage("");
    setSpeechFallbackReason(null);
    setSpeechLastMatchResult(null);
  }

  function findGentleStartIndex(): number {
    if (!needsGentleStart) return 0;
    const easyIndex = lessonItems.findIndex((item) => {
      const section = getItemSection(item, activeAssignment?.subject ?? "spelling");
      const answerText = getAnswer(item);
      return section === "spelling" && (isAlphabetLessonItem(item) || answerText.length <= 3);
    });
    return easyIndex >= 0 ? easyIndex : 0;
  }

  function lessonLabelText(): string {
    const skill = assignment?.skillFocus ? String(assignment.skillFocus) : "Core practice";
    const hasBasicSpelling = lessonItems.some((item) => {
      const section = getItemSection(item, assignment?.subject ?? "spelling");
      if (section !== "spelling") return false;
      const word = getAnswer(item).trim();
      return isAlphabetLessonItem(item) || (word.length > 0 && word.length <= 3);
    });

    if (hasBasicSpelling && childLevel >= 6) {
      const reviewItem = lessonItems.find((item) => getItemSection(item, assignment?.subject ?? "spelling") === "spelling");
      return `Level ${childLevel} • Review: ${reviewReason(reviewItem ?? lessonItems[0] ?? { questionType: "generic", question: "", options: [], correctAnswer: "", explanation: "", hint: "", coachSteps: [], guidedSteps: [], workedSolution: "", visuals: { required: false, type: "none", title: "", altText: "", body: [], prompt: "" }, learningFocus: "", retryPrompts: [], reviewPrompt: "", weakSkillTags: [], difficulty: 1, masterySignals: { firstTryCorrect: false, retryCorrect: false, attemptCount: 0, hintsUsed: 0, mastered: false, reviewed: false } })}`;
    }

    return `Level ${childLevel} • Challenge: ${skill}`;
  }

  function questionContextLabel(item: LessonItem): string {
    const section = getItemSection(item, assignment?.subject ?? "spelling");
    const word = getAnswer(item).trim();
    const isBasicSpelling = section === "spelling" && (isAlphabetLessonItem(item) || (word.length > 0 && word.length <= 3));
    const isReviewContent = isReviewRound || (isBasicSpelling && childLevel >= 6);
    const tag: LevelTag = isReviewContent
      ? (isReviewRound ? "repair" : "review")
      : "challenge";
    if (tag === "repair") return `Level ${childLevel} • Repair: ${reviewReason(item)}`;
    if (tag === "review") return `Level ${childLevel} • Review: ${reviewReason(item)}`;
    return `Level ${childLevel} • Challenge`;
  }

  const buildBossQuestionsFromRuntime = useCallback((): BossQuestion[] => {
    const used = new Set<string>();
    const weakIndexes = Object.entries(questionAttemptSummary)
      .filter(([, summary]) => summary.outcome === "final_wrong" || summary.score === 0)
      .map(([key]) => lessonItems.findIndex((item, itemIndex) => questionStatusKey(item, itemIndex) === key))
      .filter((itemIndex) => itemIndex >= 0);
    const uniqueWeakIndexes = Array.from(new Set(weakIndexes));

    const pick = (
      slot: BossQuestion["slot"],
      slotLabel: string,
      predicate: (item: LessonItem, itemIndex: number) => boolean,
    ): BossQuestion => {
      let selectedIndex = -1;
      for (let itemIndex = 0; itemIndex < lessonItems.length; itemIndex += 1) {
        const item = lessonItems[itemIndex];
        const candidateId = toBossQuestionId(item, itemIndex);
        if (used.has(candidateId)) continue;
        if (!predicate(item, itemIndex)) continue;
        selectedIndex = itemIndex;
        break;
      }

      if (selectedIndex < 0) {
        for (let itemIndex = 0; itemIndex < lessonItems.length; itemIndex += 1) {
          const item = lessonItems[itemIndex];
          const candidateId = toBossQuestionId(item, itemIndex);
          if (used.has(candidateId)) continue;
          selectedIndex = itemIndex;
          break;
        }
      }

      const source = selectedIndex >= 0 ? lessonItems[selectedIndex] : (lessonItems[0] ?? null);
      const sourceId = source ? toBossQuestionId(source, Math.max(0, selectedIndex)) : `${slot}-fallback`;
      if (source) used.add(sourceId);

      const sourceItem = source ?? {
        id: `${slot}-fallback`,
        type: "spelling",
        word: "cat",
        answer: "cat",
        prompt: "Spell the word cat",
        options: ["cat", "cot", "cut"],
      };
      const sourceSection = getItemSection(sourceItem, activeAssignment?.subject ?? "spelling");
      const item = buildBossChallengeItem(sourceSection, slot, sourceItem);

      return {
        id: `${slot}-${sourceId}`,
        slot,
        slotLabel,
        item,
        section: sourceSection,
      };
    };

    return [
      pick("warmup", "Question 1/5 • Warm-up", (_, itemIndex) => !uniqueWeakIndexes.includes(itemIndex)),
      pick("focus", "Question 2/5 • Focus Skill", (item) => {
        const skill = String(item.skillFocus ?? "").toLowerCase();
        return Boolean(activeAssignment?.skillFocus) && skill.includes(String(activeAssignment?.skillFocus ?? "").toLowerCase());
      }),
      pick("weak", "Question 3/5 • Weak Area", (_, itemIndex) => uniqueWeakIndexes.includes(itemIndex)),
      pick("mixed", "Question 4/5 • Mixed Review", (item) => {
        const section = getItemSection(item, activeAssignment?.subject ?? "spelling");
        return section === "math" || section === "reading";
      }),
      pick("final", "Question 5/5 • Final Boss", () => true),
    ];
  }, [activeAssignment?.skillFocus, activeAssignment?.subject, lessonItems, questionAttemptSummary]);

  function activateBossBattle() {
    const questions = buildBossQuestionsFromRuntime();
    setBossQuestions(questions);
    setBossQuestionIndex(0);
    setBossCorrectAnswers(0);
    setBossHeartsLeft(3);
    setBossAnswer("");
    setBossQuestionMisses({});
    setBossResult(null);
    setBossStage("transition");
    setLessonPhase("boss_battle");
    setTutorState("thinking");
  }

  useEffect(() => {
    if (!requestedBossPhase || bossEntryHandledRef.current) return;
    if (!activeAssignment || lessonItems.length === 0) return;
    bossEntryHandledRef.current = true;
    const questions = buildBossQuestionsFromRuntime();
    const timer = window.setTimeout(() => {
      setStarted(true);
      setCompleted(true);
      setLessonMasteryReady(true);
      setBossQuestions(questions);
      setBossQuestionIndex(0);
      setBossCorrectAnswers(0);
      setBossHeartsLeft(3);
      setBossAnswer("");
      setBossQuestionMisses({});
      setBossResult(null);
      setBossStage("transition");
      setLessonPhase("boss_battle");
      setTutorState("thinking");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeAssignment, buildBossQuestionsFromRuntime, lessonItems.length, requestedBossPhase]);

  async function completeBossBattle(finalCorrect: number, finalHearts: number, answeredCount: number) {
    setBossSubmitting(true);
    try {
      const response = await fetch("/api/student/boss-battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          correctAnswers: finalCorrect,
          heartsLeft: finalHearts,
          questionsAnswered: answeredCount,
        }),
      });
      const payload = (await response.json()) as BossCompletePayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete Boss Battle.");
      }

      setBossResult({
        win: Boolean(payload.win),
        perfectWin: Boolean(payload.perfectWin),
        rewards: {
          xpEarned: payload.rewards?.xpEarned ?? 0,
          coinsEarned: payload.rewards?.coinsEarned ?? 0,
          starsEarned: payload.rewards?.starsEarned ?? 0,
        },
        badge: payload.badge ?? null,
      });
      setBossStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete Boss Battle.");
    } finally {
      setBossSubmitting(false);
    }
  }

  function submitBossAnswer(selected?: string) {
    const currentQuestion = bossQuestions[bossQuestionIndex] ?? null;
    if (!currentQuestion) return;
    const expected = pickBossAnswer(currentQuestion.item);
    const given = (selected ?? bossAnswer).trim();
    if (!given) return;

    const correct = normalise(given) === normalise(expected);
    const nextCorrectAnswers = correct ? bossCorrectAnswers + 1 : bossCorrectAnswers;
    const nextHeartsLeft = correct ? bossHeartsLeft : Math.max(0, bossHeartsLeft - 1);
    const nextIndex = bossQuestionIndex + 1;
    const answeredCount = nextIndex;
    const currentQuestionId = currentQuestion.id;

    if (!correct) {
      setBossQuestionMisses((current) => ({ ...current, [currentQuestionId]: (current[currentQuestionId] ?? 0) + 1 }));
    }

    setBossCorrectAnswers(nextCorrectAnswers);
    setBossHeartsLeft(nextHeartsLeft);
    setBossAnswer("");

    const isOver = nextIndex >= bossQuestions.length || nextHeartsLeft <= 0;
    if (isOver) {
      void completeBossBattle(nextCorrectAnswers, nextHeartsLeft, answeredCount);
      return;
    }

    setBossQuestionIndex(nextIndex);
  }

  function startReviewRoundIfNeeded(): boolean {
    if (!reviewQueue.length) return false;
    tutorEngine.dispatch({ name: "REVIEW_TRIGGERED", data: { reviewQueue: [...reviewQueue] } });
    setLessonPhase("review");
    setShowReviewIntro(true);
    return true;
  }

  function beginReviewRound() {
    markActivity();
    if (!reviewQueue.length) return;
    setShowReviewIntro(false);
    setLessonPhase("review");
    setIsReviewRound(true);
    tutorEngine.dispatch({ name: "REVIEW_BEGAN", data: { itemCount: reviewQueue.length } });
    setReviewPointer(0);
    goToQuestion(reviewQueue[0] ?? 0);
    setReviewNotice("Let's fix the tricky ones before we finish.");
    setTutorState("thinking");
  }

  function finishLesson(nextRecords: AnswerRecord[]) {
    markActivity();
    setCompleted(true);
    setLessonPhase("complete");
    const finalScore = computeAttemptWeightedScore(questionAttemptSummary);
    tutorEngine.dispatch({ name: "LESSON_COMPLETED", data: { finalScore, masteryReady: lessonMasteryReady } });
    const line = interventionMission
      ? interventionMission.outroLine
      : finalScore === 100
        ? "Perfect score! You're getting stronger every day!"
        : "Lesson complete. Amazing work!";
    setVoiceLine(line);
    void speakTutor(line);
    void saveProgress(nextRecords);
  }

  function advanceAfterResolved(nextRecords: AnswerRecord[]) {
    setFeedback("");
    setFeedbackMode("none");
    setAnswer("");
    setAttemptCount(0);
    setTutorState("thinking");

    if (isReviewRound) {
      const nextPointer = reviewPointer + 1;
      if (nextPointer < reviewQueue.length) {
        setReviewPointer(nextPointer);
        goToQuestion(reviewQueue[nextPointer] ?? 0);
        setReviewNotice("Let us keep fixing these together.");
        return;
      }
      setReviewNotice("");
      // Count how many skipped items were corrected during review
      const fixedCount = skippedQuestionKeys.filter(
        (key) => questionStatuses[key] === "reteach_complete"
      ).length;
      const improved = fixedCount > 0 || reviewQueue.length > 0;
      setReviewImproved(improved);
      tutorEngine.dispatch({ name: "REVIEW_COMPLETE", data: { improved } });
      setMemoryFeedback(
        improved
          ? "You've improved these tricky questions!"
          : "We'll practise these again tomorrow."
      );
      setPendingRecordsAfterReview(nextRecords);
      setShowReviewComplete(true);
      return;
    }

    if (index + 1 < lessonItems.length) {
      tutorEngine.dispatch({ name: "NEXT_ITEM", data: { currentIndex: index, nextIndex: index + 1 } });
      goToQuestion(index + 1);
      return;
    }

    if (startReviewRoundIfNeeded()) {
      return;
    }

    finishLesson(nextRecords);
  }

  async function speakCurrent() {
    markActivity();
    await unlockTutorSpeech();
    if (!currentItem || !voiceEnabled) return;
    const passage = currentSection === "reading" && currentItem.passage ? `Passage. ${decodeLessonText(String(currentItem.passage))} ` : "";
    let spellLine: string;
    if (currentSection === "spelling") {
      if (lessonStage === "ASSESS_SPEECH") {
        spellLine = getAssessmentPrompt(currentItem);
      } else if (lessonStage === "TEACH_RETRY") {
        spellLine = getSupportPrompt(currentItem);
      } else if (lessonStage === "TAP_SELECT" && isAlphabetLessonItem(currentItem)) {
        spellLine = getSpellingConversationTitle(currentItem, "TAP_SELECT");
      } else {
        spellLine = "Now type the word.";
      }
    } else {
      spellLine = getPrompt(currentItem, currentSection);
    }
    const line = `${passage}${spellLine}`;
    setVoiceLine(line);
    await speakTutor(line);
  }

  useEffect(() => {
    if (!started || completed || !currentItem || !voiceEnabled) return;
    const timer = window.setTimeout(() => { void speakCurrent(); }, 300);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, completed, currentItem?.id, index, voiceEnabled, lessonStage]);

  async function handleSpeechAssessmentResult(transcript: string, source: "speech" | "manual" = "speech") {
    markActivity();
    if (!currentItem || !activeAssignment) return;
    const target = getAnswer(currentItem);
    const isAlphabet = isAlphabetLessonItem(currentItem);
    const normalizedTranscript = normalizeSpokenText(transcript);
    if (!normalizedTranscript) {
      setSpeechListening(false);
      setSpeechButtonState("try_again");
      setSpokenAnswer("");
      setSpeechStatusMessage("I could not hear you. Try again.");
      setSpeechLastMatchResult("no-speech");
      setSpeechFallbackReason(null);
      return;
    }

    const matchResult = classifySpokenVsTarget(transcript, target, isAlphabet);
    const attempts = speechAttempts + 1;
    const skillFocus = String(currentItem.skillFocus ?? activeAssignment.skillFocus ?? currentSection);
    const derivedSkillCode = skillFocusToCode(skillFocus);

    setSpeechAttempts(attempts);
    setSpokenAnswer(transcript);
    setSpeechListening(false);
    setSpeechButtonState("idle");
    setSpeechFallbackReason(null);
    setSpeechLastMatchResult(matchResult);

    const attemptSyncResult = await syncAttemptToServer({
      studentId: activeAssignment.studentId || profile?.id || "",
      subject: "spelling",
      spellingMode: isAlphabet ? "alphabet_assess" : "word_assess",
      assignmentId: activeAssignment.id,
      contentId: activeAssignment.contentId,
      skillFocus,
      questionText: target,
      answerGiven: normalizedTranscript,
      correctAnswer: target,
      correct: matchResult === "exact",
      responseTimeMs: 0,
      hintsUsed: Math.max(0, attempts - 1),
      difficulty: Math.max(1, Math.min(5, activeAssignment.difficulty ?? 1)),
      skills: derivedSkillCode ? serializeSkills([derivedSkillCode]) : undefined,
      pronunciationAttempted: source === "speech",
      pronunciationPassed: matchResult === "exact",
      spokenText: transcript,
      targetText: target,
      errorType: matchResult === "exact" ? undefined : matchResult === "close" ? "close_match" : "spoken_mismatch",
    });
    if ((attemptSyncResult.status === "unauthorized" || attemptSyncResult.status === "unauthorized_paused") && !offlineNotice) {
      setOfflineNotice("Your session changed, so answers are being saved on this device for now.");
    }

    if (matchResult === "exact") {
      setSpeechStatusMessage("");
      const targetDescription = describeTargetForTutor(currentItem);
      const line = `Yes, that's ${targetDescription}. Well done.`;
      setTutorState("celebrate");
      setVoiceLine(line);
      setLessonStage("TAP_SELECT");
      if (voiceEnabled) speakTutorLine(line);
      return;
    }

    if (matchResult === "close") {
      const closeLine = `I think you said ${target}. Let's try once more. Say ${target} clearly.`;
      setSpeechStatusMessage(closeLine);
      setTutorState("try_again");
      setVoiceLine(closeLine);
      // Stay in ASSESS_SPEECH — big word is still visible, mic button still prominent
      if (voiceEnabled) speakTutorLine(closeLine);
      return;
    }

    // matchResult === "wrong"
    setSpeechStatusMessage(`I heard: ${transcript}`);
    const statusKey = questionStatusKey(currentItem, index);
    if (attempts >= 3) {
      setSpeechWeakQuestionKeys((current) => (current.includes(statusKey) ? current : [...current, statusKey]));
    }
    const supportLine = attempts >= 3
      ? `${getSupportPrompt(currentItem)} ${interventionMission ? "Now use the visual clue." : `Say ${target} with me.`}`
      : getSupportPrompt(currentItem);
    setTutorState("try_again");
    setVoiceLine(supportLine);
    setLessonStage(interventionMission && attempts >= 3 ? "TAP_SELECT" : "TEACH_RETRY");
    if (voiceEnabled) speakTutorLine(supportLine);
  }

  async function startListening() {
    markActivity();
    await unlockTutorSpeech();
    if (!currentItem || currentSection !== "spelling") return;
    if (typeof window === "undefined") return;
    stopRecognition();
    cancelTutorSpeech();
    beginStudentTurn("lesson_mic_start");

    const win = window as Window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const RecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!RecognitionCtor) {
      setSpeechListening(false);
      setSpeechButtonState("try_again");
      setSpeechStatusMessage("Voice input is not available in this browser. Please use Chrome or Edge.");
      setSpeechFallbackReason("unsupported");
      return;
    }

    const isSecureOrigin = window.isSecureContext || window.location.hostname === "localhost";
    if (!isSecureOrigin) {
      setSpeechListening(false);
      setSpeechButtonState("try_again");
      setSpeechStatusMessage("Voice input is not available in this browser. Please use Chrome or Edge.");
      setSpeechFallbackReason("unsupported");
      return;
    }

    const recognition = new RecognitionCtor();
    recognitionRef.current = recognition;
    recognitionStoppingRef.current = false;
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    setSpeechListening(true);
    setSpeechButtonState("listening");
    setSpeechFallbackReason(null);
    setSpeechStatusMessage(isAlphabetLessonItem(currentItem) ? "Listening now... say the letter." : "Listening now... say the word.");

    recognition.onresult = (event) => {
      const transcript = decodeLessonText(event.results[0]?.[0]?.transcript ?? "");
      setSpeechButtonState("idle");
      void handleSpeechAssessmentResult(transcript, "speech");
    };

    recognition.onerror = (event: { error?: string }) => {
      endStudentTurn("lesson_mic_error");
      recognitionRef.current = null;
      setSpeechListening(false);
      const code = event?.error ?? "unknown";
      if (code === "not-allowed") {
        setSpeechButtonState("try_again");
        setSpeechStatusMessage("Please allow microphone access so Star can hear you.");
        setSpeechFallbackReason("not-allowed");
        return;
      }
      if (code === "no-speech") {
        setSpeechButtonState("try_again");
        setSpeechStatusMessage("I couldn't hear you. Tap Try again and say it clearly.");
        setSpeechFallbackReason(null);
        return;
      }
      if (code === "audio-capture") {
        setSpeechButtonState("try_again");
        setSpeechStatusMessage("I can't find a microphone. Please check it, then try again.");
        setSpeechFallbackReason(null);
        return;
      }
      if (code === "network") {
        if (interventionMission) {
          setSpeechButtonState("try_again");
          setSpeechStatusMessage("Voice service is busy. Let's keep practising with the visual clue.");
          setSpeechFallbackReason(null);
          setLessonStage("TAP_SELECT");
          return;
        }
        setSpeechButtonState("try_again");
        setSpeechStatusMessage("Voice service is not available right now. Please try again, or use parent/teacher continue.");
        setSpeechFallbackReason("network");
        return;
      }
      setSpeechButtonState("try_again");
      setSpeechStatusMessage("I couldn't hear you. Tap Try again and say it clearly.");
      setSpeechFallbackReason(null);
    };

    recognition.onend = () => {
      endStudentTurn("lesson_mic_end");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      recognitionStoppingRef.current = false;
      setSpeechListening(false);
      setSpeechButtonState((current) => current === "listening" ? "idle" : current);
      window.speechSynthesis.resume();
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setSpeechListening(false);
      setSpeechButtonState("try_again");
      setSpeechStatusMessage("Voice input is not ready. Tap Try again.");
    }
  }

  async function startLesson(startedAtMs = 0) {
    markActivity();
    if (!warmupResult) {
      setWarmupStatus("Tell Star how you feel first.");
      return;
    }
    setStarted(true);
    setLessonPhase("lesson");
    startedAtRef.current = startedAtMs;
    const firstIndex = findGentleStartIndex();
    tutorEngine.dispatch({ name: "LESSON_STARTED", data: { startIndex: firstIndex, gentleStart: needsGentleStart } });
    if (firstIndex !== index) {
      goToQuestion(firstIndex);
    }
    setTutorState("thinking");
    const line = interventionMission?.introLine
      ?? (warmupResult ? `Great work, ${childName}. ${warmupResult.tutorReply} Let's begin your mission.` : welcomeLine);
    setVoiceLine(line);
  }

  async function startWarmupListening(startAtMs = 0) {
    markActivity();
    if (!welcomeSpeechFinished) {
      setWarmupStatus("Start talking with Star first.");
      return;
    }
    if (typeof window === "undefined") return;
    stopRecognition();
    cancelTutorSpeech();
    beginStudentTurn("lesson_warmup_start");

    const win = window as Window & {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const RecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setWarmupStatus("Voice input is not available in this browser. Please use Chrome or Edge.");
      return;
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setWarmupStatus("Voice input is not available in this browser. Please use Chrome or Edge.");
      return;
    }

    setWarmupPhase("listening");
    setWarmupStatus("Listening...");
    setWarmupTranscript("");
    const startAt = startAtMs;
    const recognition = new RecognitionCtor();
    let heardWarmup = false;
    recognitionRef.current = recognition;
    recognitionStoppingRef.current = false;
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = decodeLessonText(event.results[0]?.[0]?.transcript?.trim() ?? "");
      const confidenceCandidate = Number(event.results[0]?.[0]?.confidence);
      const confidence = Number.isFinite(confidenceCandidate) ? confidenceCandidate : null;
      heardWarmup = Boolean(transcript);
      setWarmupTranscript(transcript);
      setWarmupPhase("thinking");
      setWarmupStatus("Thinking...");

      const completeness = assessWarmupTranscript({ transcript, confidence });
      if (!completeness.complete) {
        setWarmupResult(null);
        setWarmupPhase("idle");
        setWarmupFailedAttempts((current) => current + 1);
        setWarmupStatus(completeness.prompt);
        setVoiceLine(completeness.prompt);
        if (voiceEnabled) {
          void speakTutor(completeness.prompt);
        }
        return;
      }

      const result = detectWarmupMood(transcript, childName);
      result.hesitationMs = Math.max(0, (event.timeStamp ?? startAt) - startAt);

      window.setTimeout(() => {
        setWarmupResult(result);
        setWarmupSkipped(false);
        setWarmupPhase("responding");
        setWarmupStatus("Responding...");
        const readyReply = withWarmupReadyInstruction(result.tutorReply);
        setVoiceLine(readyReply);
        void speakTutor(readyReply).then(() => {
          setWarmupPhase("celebrating");
          setWarmupStatus("Warmup complete");
        });
      }, 450);
    };
    recognition.onerror = (event: { error?: string }) => {
      endStudentTurn("lesson_warmup_error");
      recognitionRef.current = null;
      setWarmupPhase("idle");
      setWarmupFailedAttempts((current) => current + 1);
      setWarmupStatus(event.error === "not-allowed" ? "Please allow microphone access so Star can hear you." : "Could not hear clearly. Try again.");
    };
    recognition.onend = () => {
      endStudentTurn("lesson_warmup_end");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      recognitionStoppingRef.current = false;
      window.speechSynthesis.resume();
      if (!heardWarmup && warmupPhase === "listening") {
        setWarmupFailedAttempts((current) => current + 1);
        setWarmupStatus("Could not hear clearly. Try again.");
        setWarmupPhase("idle");
      }
    };
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setWarmupPhase("idle");
      setWarmupStatus("Voice input is not ready. Try again.");
    }
  }

  async function skipWarmup() {
    markActivity();
    const reply = `That's okay, ${childName}. We'll start gently and I'll help you.`;
    const readyReply = withWarmupReadyInstruction(reply);
    const skippedPlan: WarmupResult = {
      mood: "neutral",
      confidenceEstimate: 60,
      energyEstimate: 55,
      confidence: "medium",
      energy: "medium",
      supportLevel: "standard",
      pace: "balanced",
      warmupResponse: "",
      hesitationMs: 0,
      adaptation: {
        pacing: "balanced",
        hintStyle: "standard",
        sessionMode: "standard",
      },
      tutorReply: reply,
    };
    setWarmupResult(skippedPlan);
    setWarmupSkipped(true);
    setWarmupStatus("Warm-up skipped. Your lesson is ready.");
    setWarmupPhase("responding");
    setVoiceLine(readyReply);
    await speakTutor(readyReply);
    setWarmupPhase("celebrating");
  }

  useEffect(() => {
    if (!interventionMission || !activeAssignment || started || completed) return;
    const t = window.setTimeout(() => { void startLesson(performance.now()); }, 0);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAssignment, completed, interventionMission, started]);

  useEffect(() => {
    if (interventionMission || !pendingIntervention || !assignmentId || !completed || saving) return;
    if (interventionLaunchStarted) return;
    const t = window.setTimeout(() => {
      setInterventionLaunchStarted(true);
    }, 0);
    router.replace(buildInterventionPath({
      assignmentId,
      skill: pendingIntervention.skill,
      supportSkill: pendingIntervention.supportSkill,
      accuracy: pendingIntervention.accuracy,
    }));
    return () => window.clearTimeout(t);
  }, [assignmentId, buildInterventionPath, completed, interventionLaunchStarted, interventionMission, pendingIntervention, router, saving]);

  async function saveProgress(finalRecords: AnswerRecord[]) {
    if (!assignment || !activeAssignment || !assignmentId) return;
    setSaving(true);
    const weakRecords = finalRecords.filter((record) => !record.correct);
    const speechWeakWords = speechWeakQuestionKeys
      .map((key) => {
        const matchedIndex = lessonItems.findIndex((item, itemIndex) => questionStatusKey(item, itemIndex) === key);
        if (matchedIndex < 0) return "";
        const matchedItem = lessonItems[matchedIndex] ?? {};
        return getAnswer(matchedItem) || getPrompt(matchedItem, "spelling");
      })
      .filter(Boolean);
    const weakWords = Array.from(new Set([
      ...weakRecords.map((record) => getAnswer(record.item) || getPrompt(record.item, record.section)).filter(Boolean),
      ...speechWeakWords,
    ]));
    const weakSkills = Array.from(new Set(weakRecords.map((record) => String(record.item.skillFocus ?? activeAssignment?.skillFocus ?? record.section)).filter(Boolean)));
    const finalCorrect = finalRecords.filter((record) => record.correct).length;
    const finalIncorrect = finalRecords.length - finalCorrect;
    const masteryResult = computeMasteryReady(questionStatuses, skippedQuestionKeys, questionAttemptSummary);
    const { masteryReady, unresolvedSkipped, firstTryCorrect, retryCorrect, skippedCount, finalScore } = masteryResult;
    setLessonMasteryReady(masteryReady);
    const normalizedWeakSkill = weakSkills[0] ?? String(activeAssignment.skillFocus ?? "");
    const primarySkillCode = skillFocusToCode(normalizedWeakSkill)
      ?? (activeAssignment.subject === "reading"
        ? "reading_fluency"
        : activeAssignment.subject === "math"
          ? "addition_basic"
          : "letter_sound");
    const supportSkillCode = skillFocusToCode(weakSkills[1] ?? String(activeAssignment.skillFocus ?? "")) ?? primarySkillCode;
    const shouldAutoLaunchIntervention = !interventionMission
      && isInterventionEligibleSkill(primarySkillCode)
      && (finalScore < 80 || finalIncorrect > 0 || weakSkills.length > 0);
    if (shouldAutoLaunchIntervention) {
      setPendingIntervention({
        skill: primarySkillCode,
        supportSkill: supportSkillCode,
        accuracy: finalScore,
      });
    }

    const interventionPayload = interventionMission
      ? {
        mode: true,
        launchedAt: interventionLaunchedAt ?? null,
        completedAt: new Date().toISOString(),
        primarySkill: interventionSkill ?? primarySkillCode,
        supportSkill: interventionSupportSkill ?? supportSkillCode,
        baselineAccuracy: Number.isFinite(interventionAccuracy) ? interventionAccuracy : null,
        improvementPct: Number.isFinite(interventionAccuracy) ? finalScore - interventionAccuracy : null,
      }
      : shouldAutoLaunchIntervention
        ? {
          mode: false,
          launchedAt: new Date().toISOString(),
          primarySkill: primarySkillCode,
          supportSkill: supportSkillCode,
          baselineAccuracy: finalScore,
          weakDetected: true,
        }
        : null;

    const payload = JSON.stringify({
      assignmentId,
      contentId: assignment.contentId,
      studentId: assignment.studentId || profile?.id,
      subject: activeAssignment.subject || "ai_daily",
      type: "ai_daily",
      skillFocus: activeAssignment.skillFocus ?? "Daily lesson",
      score: finalScore,
      correct: finalCorrect,
      incorrect: finalIncorrect,
      attempts: finalRecords.length,
      weakWords,
      weakSkills,
      firstTryCorrect,
      retryCorrect,
      skippedCount,
      unresolvedSkipped,
      masteryReady,
      intervention: interventionPayload,
          warmup: warmupResult
        ? {
          prompt: warmupPrompt,
          transcript: warmupTranscript,
          warmupResponse: warmupResult.warmupResponse,
          phase: warmupPhase,
          mood: warmupResult.mood,
          confidence: warmupResult.confidence,
          energy: warmupResult.energy,
          supportLevel: warmupResult.supportLevel,
          pace: warmupResult.pace,
          confidenceEstimate: warmupResult.confidenceEstimate,
          energyEstimate: warmupResult.energyEstimate,
          hesitationMs: warmupResult.hesitationMs,
          adaptation: warmupResult.adaptation,
        }
        : null,
      timeSpent: Math.round((performance.now() - startedAtRef.current) / 1000),
    });

    try {
      if (!online && typeof window !== "undefined") {
        window.localStorage.setItem(pendingProgressKey(assignmentId), payload);
        setOfflineNotice("Progress saved on this device. It will sync when you are back online.");
        return;
      }
      const response = await fetch("/api/student/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: payload,
      });
      if (response.ok) {
        setSaveResult((await response.json()) as ProgressSaveResponse);
        if (warmupResult && typeof window !== "undefined") {
          const profileId = profile?.id;
          if (profileId) {
            window.localStorage.setItem(`starliz:warmup:last:${profileId}`, JSON.stringify({
              mood: warmupResult.mood,
              date: new Date().toISOString().slice(0, 10),
            }));
          }
        }
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem(pendingProgressKey(assignmentId), payload);
        setOfflineNotice("Progress is saved locally and will sync when the server is available.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswer(selected?: string) {
    markActivity();
    if (!currentItem || !activeAssignment) return;
    const given = selected ?? answer;
    const expected = getAnswer(currentItem);
    const correct = normalise(given) === normalise(expected);
    const attemptSubject = getItemSection(currentItem, activeAssignment.subject || currentSection);
    const skillFocus = String(currentItem.skillFocus ?? activeAssignment.skillFocus ?? currentSection);
    const derivedSkillCode = skillFocusToCode(skillFocus);
    const attemptSyncResult = await syncAttemptToServer({
      studentId: activeAssignment.studentId || profile?.id || "",
      subject: attemptSubject,
      assignmentId: activeAssignment.id,
      contentId: activeAssignment.contentId,
      skillFocus,
      questionText: getPrompt(currentItem, currentSection),
      answerGiven: given,
      correctAnswer: expected,
      correct,
      responseTimeMs: 0,
      hintsUsed: 0,
      difficulty: Math.max(1, Math.min(5, activeAssignment.difficulty ?? 1)),
      skills: derivedSkillCode ? serializeSkills([derivedSkillCode]) : undefined,
    });
    if ((attemptSyncResult.status === "unauthorized" || attemptSyncResult.status === "unauthorized_paused") && !offlineNotice) {
      setOfflineNotice("Your session changed, so answers are being saved on this device for now.");
    }

    const spellingQuestion = currentSection === "spelling";
    const statusKey = questionStatusKey(currentItem, index);

    tutorEngine.dispatch({ name: "ANSWER_SUBMITTED", data: { questionIndex: index, answer: given, attemptNumber: attemptCount + 1 } });

    if (!correct) {
      const nextAttempt = attemptCount + 1;
      setAttemptCount(nextAttempt);
      setQuestionAttemptSummary((current) => ({
        ...current,
        [statusKey]: {
          attempts: nextAttempt,
          outcome: current[statusKey]?.outcome ?? "pending",
          score: current[statusKey]?.score ?? null,
          usedHints: nextAttempt > 1,
        },
      }));
      const teachLine = buildTeachMessage({
        section: currentSection,
        item: currentItem,
        expected,
        attempt: nextAttempt,
        inReviewRound: isReviewRound,
      });
      const retryVoice = getTutorToneLine("retry");

      setTutorState("try_again");
      setVoiceLine(retryVoice);

      if (interventionMission && nextAttempt >= 3) {
        const guidedLine = `${getSupportPrompt(currentItem)} ${isAlphabetLessonItem(currentItem) ? "Now tap the right letter." : "Now choose the right word."}`;
        cancelTutorSpeech();
        if (voiceEnabled) {
          speakTutorLine(guidedLine);
        }
        setFeedback("Let us slow down and use the visual clue. You need to get this one right before we move on.");
        setFeedbackMode("retry");
        setCoachOpen(false);
        setQuestionStatuses((current) => ({ ...current, [statusKey]: "wrong_retrying" }));
        setLessonStage("TAP_SELECT");
        setSpeechStatusMessage("Use the visual clue, then answer again.");
        tutorEngine.dispatch({ name: "ANSWER_WRONG_RETRY", data: { questionIndex: index, attemptNumber: nextAttempt } });
        return;
      }

      if (!isReviewRound && nextAttempt >= 3) {
        const skippedRecord: AnswerRecord = {
          item: currentItem,
          section: currentSection,
          correct: false,
          given,
        };
        const nextRecords = [...records, skippedRecord];
        const finalReveal = buildFinalRevealMessage({
          section: currentSection,
          item: currentItem,
          prompt: getPrompt(currentItem, currentSection),
          expected,
        });
        cancelTutorSpeech();
        if (voiceEnabled) {
          speakTutorLine(finalReveal);
        }
        setRecords(nextRecords);
        setFeedback(finalReveal);
        setFeedbackMode("continue");
        setQuestionStatuses((current) => ({ ...current, [statusKey]: "skipped_needs_reteach" }));
        setQuestionAttemptSummary((current) => ({
          ...current,
          [statusKey]: {
            attempts: nextAttempt,
            outcome: "final_wrong",
            score: scoreForResolvedQuestion(nextAttempt, false),
            usedHints: true,
          },
        }));
        setSkippedQuestionKeys((current) => (current.includes(statusKey) ? current : [...current, statusKey]));
        setReviewQueue((current) => (current.includes(index) ? current : [...current, index]));
        setAnswer("");
        setCoachOpen(false);
        tutorEngine.dispatch({ name: "ANSWER_FINAL_WRONG", data: { questionIndex: index, attemptNumber: nextAttempt } });
        return;
      }

      if (voiceEnabled) {
        speakTutorLine(retryVoice);
      }
      setFeedback(teachLine);
      setFeedbackMode("retry");
      setCoachOpen(false);
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "wrong_retrying" }));
      tutorEngine.dispatch({ name: "ANSWER_WRONG_RETRY", data: { questionIndex: index, attemptNumber: nextAttempt } });
      return;
    }

    const priorStatus = questionStatuses[statusKey];
    const keepOriginalSkipScore = isReviewRound && priorStatus === "skipped_needs_reteach";
    const nextRecords = keepOriginalSkipScore ? records : [...records, { item: currentItem, section: currentSection, correct, given }];
    const resolvedAttempts = Math.min(3, Math.max(1, attemptCount + 1));
    setRecords(nextRecords);
    setAttemptCount(0);

    const learnedLine = spellingQuestion && priorStatus !== "wrong_retrying" && priorStatus !== "skipped_needs_reteach"
      ? getTutorToneLine("correct_first_try")
      : buildWorkedSuccessMessage({
          section: currentSection,
          item: currentItem,
          prompt: getPrompt(currentItem, currentSection),
          expected,
        });

    if ((priorStatus === "wrong_retrying" || priorStatus === "skipped_needs_reteach") && correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "reteach_complete" }));
    } else if (isReviewRound && correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "reteach_complete" }));
    } else if (correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "correct" }));
    }

    setQuestionAttemptSummary((current) => ({
      ...current,
      [statusKey]: {
        attempts: resolvedAttempts,
        outcome: "correct",
        score: scoreForResolvedQuestion(resolvedAttempts, true),
        usedHints: resolvedAttempts > 1,
      },
    }));
    setCoachOpen(false);
    setFeedback(learnedLine);
    setFeedbackMode("continue");
    setTutorState(correct ? "celebrate" : "try_again");
    setVoiceLine(learnedLine);
    if (voiceEnabled) speakTutorLine(learnedLine);
    setAnswer("");
    tutorEngine.dispatch({
      name: "ANSWER_CORRECT",
      data: { questionIndex: index, firstTry: attemptCount === 0, score: scoreForResolvedQuestion(resolvedAttempts, true) },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function skipForNow() {
    markActivity();
    if (!currentItem) return;
    const statusKey = questionStatusKey(currentItem, index);
    const skippedRecord: AnswerRecord = {
      item: currentItem,
      section: currentSection,
      correct: false,
      given: answer,
    };
    const nextRecords = [...records, skippedRecord];
    setRecords(nextRecords);
    setQuestionStatuses((current) => ({ ...current, [statusKey]: "skipped_needs_reteach" }));
    setQuestionAttemptSummary((current) => ({
      ...current,
      [statusKey]: {
        attempts: Math.max(3, current[statusKey]?.attempts ?? 3),
        outcome: "final_wrong",
        score: scoreForResolvedQuestion(3, false),
        usedHints: true,
      },
    }));
    setSkippedQuestionKeys((current) => (current.includes(statusKey) ? current : [...current, statusKey]));
    setReviewQueue((current) => (current.includes(index) ? current : [...current, index]));
    setAnswer("");
    advanceAfterResolved(nextRecords);
  }

  function continueLesson() {
    markActivity();
    if (feedbackMode === "retry") {
      clearFeedbackForRetry();
      if (interventionMission && currentSection === "spelling") {
        setLessonStage("ASSESS_SPEECH");
      }
      return;
    }
    advanceAfterResolved(records);
  }

  if (profileLoading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
          <section className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-between gap-4 px-4 py-8">
            <p className="text-lg font-semibold text-slate-500">Loading your learning profile...</p>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !voiceEnabled;
                setVoiceEnabled(nextEnabled);
                if (!nextEnabled) {
                  cancelTutorSpeech();
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700"
            >
              {voiceEnabled ? "Voice on" : "Voice off"}
            </button>
          </section>
        </main>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
          <section className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4 py-8">
            <p className="text-lg font-semibold text-rose-600">Unable to load your learning profile.</p>
          </section>
        </main>
      </>
    );
  }

  if (loading || (assignment && !sessionHydrated)) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-[#f6f8ff] text-slate-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-10">
            <div className="text-slate-600">Loading lesson...</div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !voiceEnabled;
                setVoiceEnabled(nextEnabled);
                if (!nextEnabled) {
                  cancelTutorSpeech();
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700"
            >
              {voiceEnabled ? "Voice on" : "Voice off"}
            </button>
          </div>
        </main>
      </>
    );
  }

  if (error || !assignment || !activeAssignment) {
    return (<><Navbar /><main className="min-h-screen bg-[#f6f8ff]"><div className="mx-auto max-w-4xl px-6 py-10 text-rose-600">{error || "Lesson not found."}</div></main></>);
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f6f8ff] text-slate-950">
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
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-indigo-500">{interventionMission ? interventionMission.badge : "Today's Lesson"}</p>
              <h1 className="mt-2 text-4xl font-black">{decodeLessonText(activeAssignment.title || "Daily practice")}</h1>
              <p className="mt-1 text-sm font-black text-indigo-700">{interventionMission ? `Level ${interventionLevel} • ${decodeLessonText(String(activeAssignment.skillFocus ?? "Sound Builder Mission"))}` : lessonLabelText()}</p>
              <p className="mt-2 text-slate-600">{interventionMission ? "Voice-led repair mission with visual cues and repeat-until-correct practice." : "Spelling, maths and reading in one focused session."}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !voiceEnabled;
                setVoiceEnabled(nextEnabled);
                if (!nextEnabled) {
                  cancelTutorSpeech();
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700"
            >
              {voiceEnabled ? "Voice on" : "Voice off"}
            </button>
          </div>
          {voiceUnavailable ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              {voiceUnavailable}
            </div>
          ) : null}
          {voiceStatus ? (
            <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-800">
              {voiceStatus}
            </div>
          ) : null}
          {restoredMessage ? (
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-900">
              {restoredMessage}
            </div>
          ) : null}
          {!online || offlineNotice ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              {!online ? "You are offline. Lesson mode is using saved content where available." : offlineNotice}
            </div>
          ) : null}

          <div className="mt-8">
            <progress
              value={completed ? 100 : progress}
              max={100}
              className="h-3 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-linear-to-r [&::-webkit-progress-value]:from-indigo-500 [&::-webkit-progress-value]:to-cyan-400 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-linear-to-r [&::-moz-progress-bar]:from-indigo-500 [&::-moz-progress-bar]:to-cyan-400"
            />
          </div>

          {!started ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_14rem]">
              <div className="rounded-3xl bg-slate-50 p-6">
                <h2 className="text-3xl font-black">Hi {childName}! 👋</h2>
                <p className="mt-3 text-slate-700">
                  {"How are you feeling today?"}
                </p>
                <p className="mt-1 text-slate-700">{"Tap the microphone and tell me how you feel."}</p>
                {lastWarmupMemory ? (
                  <p className="mt-1 font-bold text-indigo-700">
                    Last time you told me you felt <span className="capitalize">{lastWarmupMemory.mood.replace(/_/g, " ")}</span>
                    {lastWarmupMemory.date === new Date().toISOString().slice(0, 10) ? " earlier today" : ` on ${new Date(lastWarmupMemory.date).toLocaleDateString("en-GB", { weekday: "long" })}`}! How are you feeling today?
                  </p>
                ) : null}

                <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-700">{"Today's Mission"}</p>
                  <p className="mt-2 text-sm font-bold text-indigo-900">
                    {interventionMission
                      ? "We're going to strengthen this tricky skill step by step and build confidence."
                      : "We're going to master letter sounds, sharpen maths thinking, and grow reading confidence."}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black ${warmupPhase === "listening" ? "bg-emerald-100 text-emerald-800" : warmupPhase === "thinking" ? "bg-amber-100 text-amber-800" : warmupPhase === "responding" ? "bg-indigo-100 text-indigo-800" : warmupPhase === "celebrating" ? "bg-cyan-100 text-cyan-800" : "bg-slate-200 text-slate-700"}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${warmupPhase === "listening" ? "animate-pulse bg-emerald-500" : warmupPhase === "thinking" ? "animate-pulse bg-amber-500" : warmupPhase === "responding" ? "animate-pulse bg-indigo-500" : warmupPhase === "celebrating" ? "animate-pulse bg-cyan-500" : "bg-slate-500"}`} />
                    {warmupPhase === "idle" ? "Idle" : warmupPhase === "listening" ? "Listening" : warmupPhase === "thinking" ? "Thinking" : warmupPhase === "responding" ? "Responding" : "Celebrating"}
                  </span>
                  {!welcomeVoiceStarted ? (
                    <button
                      type="button"
                      onClick={() => void startTalkingWithStar()}
                      className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 font-black text-white shadow-md transition hover:bg-indigo-500"
                    >
                      Start talking with Star
                    </button>
                  ) : welcomeSpeechFinished ? (
                    <button
                      type="button"
                      onClick={(event) => void startWarmupListening(event.timeStamp)}
                      className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-white px-6 py-3 font-black text-indigo-700 shadow-md transition hover:bg-indigo-50"
                    >
                      Tap the microphone
                    </button>
                  ) : null}
                </div>

                {warmupStatus ? <p className="mt-3 text-sm font-bold text-slate-600">{warmupStatus}</p> : null}
                {!warmupResult && warmupFailedAttempts > 0 ? (
                  <p className="mt-2 text-sm font-bold text-amber-700">Tell Star how you feel first.</p>
                ) : null}
                {warmupTranscript ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Transcription</p>
                    <p className="mt-1 text-sm text-slate-800">“{warmupTranscript}”</p>
                  </div>
                ) : null}

                {warmupResult ? (
                  <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Adaptive Session Plan</p>
                    <p className="mt-1 text-sm font-bold text-cyan-900">
                      Mood: {warmupResult.mood} · Confidence: {warmupResult.confidence} · Energy: {warmupResult.energy}
                    </p>
                    <p className="mt-1 text-sm text-cyan-900">
                      Pace: {warmupResult.pace} · Support: {warmupResult.supportLevel} · Hints: {warmupResult.adaptation.hintStyle}{warmupSkipped ? " · Skipped warm-up" : ""}
                    </p>
                  </div>
                ) : null}

                {warmupFailedAttempts >= 2 && !warmupResult ? (
                  <button
                    type="button"
                    onClick={() => void skipWarmup()}
                    className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 font-black text-amber-800 hover:bg-amber-100"
                  >
                    Skip warm-up
                  </button>
                ) : null}

                <button
                  onClick={(event) => void startLesson(event.timeStamp)}
                  disabled={!warmupResult || warmupPhase !== "celebrating"}
                  className={`mt-6 rounded-2xl px-6 py-4 font-black text-white ${warmupResult && warmupPhase === "celebrating" ? "bg-indigo-600 hover:bg-indigo-500" : "cursor-not-allowed bg-slate-400"}`}
                >
                  Begin my lesson
                </button>
              </div>
              <div className="rounded-3xl bg-indigo-950 p-6 text-center text-white">
                <TutorAvatar state={tutorState} />
                <p className="mt-4 text-sm font-black text-indigo-100">
                  {warmupResult ? "I understand" : welcomeSpeechFinished ? "Listening for you" : "Ready"}
                </p>
                <p className="mt-2 text-sm text-indigo-100">
                  {warmupResult ? "Click Begin my lesson when you're ready." : welcomeSpeechFinished ? "Tap the microphone and tell me how you feel." : "Start talking with Star."}
                </p>
              </div>
            </div>
          ) : showReviewIntro ? (
            <div className="mt-8 rounded-3xl bg-slate-50 p-8 text-center">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-cyan-600">Review Round</p>
              <h2 className="mt-3 text-4xl font-black text-slate-950">Nice work so far!</h2>
                <p className="mt-3 text-slate-700">{"Let's look at the tricky question before we finish."}</p>
              <p className="mt-2 font-bold text-slate-700">You got {reviewQueue.length} question{reviewQueue.length === 1 ? "" : "s"} to practise again.</p>
              <button onClick={beginReviewRound} className="mt-6 rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500">
                Start Review
              </button>
            </div>
          ) : showReviewComplete ? (
            <div className="mt-8 rounded-3xl bg-emerald-50 p-8 text-center">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">Review Complete</p>
              <h2 className="mt-3 text-4xl font-black text-slate-950">
                {reviewImproved ? "Great job fixing those tricky questions!" : "Good work practising those questions!"}
              </h2>
              <p className="mt-3 text-lg text-slate-700">{"Now you're ready."}</p>
              {memoryFeedback ? (
                <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
                  {memoryFeedback}
                </p>
              ) : null}
              <button
                onClick={() => {
                  setShowReviewComplete(false);
                  finishLesson(pendingRecordsAfterReview ?? records);
                }}
                className="mt-6 rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white hover:bg-emerald-500"
              >
                Continue to Results
              </button>
            </div>
          ) : lessonPhase === "boss_battle" ? (
            <div className="mt-8 rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-orange-50 to-white p-8">
              {bossStage === "transition" ? (
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-rose-700">Boss Battle Activated</p>
                  <h2 className="mt-3 text-4xl font-black text-slate-950">Mastery Mode: Final Challenge</h2>
                  <p className="mx-auto mt-3 max-w-2xl text-slate-700">
                    You completed your lesson. This final phase targets your weak areas with mastery-pressure questions.
                  </p>
                  <div className="mx-auto mt-5 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Strengths</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">{correctCount} strong answers in lesson phase.</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Mastery Warning</p>
                      <p className="mt-2 text-sm font-semibold text-slate-700">Hints are shorter. Accuracy expectations are higher.</p>
                    </div>
                  </div>
                  <p className="mt-5 text-sm font-bold text-rose-800">You have this. Stay calm, think clearly, and finish strong.</p>
                  <button
                    type="button"
                    onClick={() => setBossStage("battle")}
                    className="mt-6 rounded-2xl bg-rose-600 px-6 py-4 font-black text-white hover:bg-rose-500"
                  >
                    Start Boss Battle
                  </button>
                </div>
              ) : null}

              {bossStage === "battle" ? (() => {
                const currentBossQuestion = bossQuestions[bossQuestionIndex] ?? null;
                if (!currentBossQuestion) {
                  return (
                    <div className="text-center">
                      <p className="text-sm font-bold text-rose-700">No boss questions available.</p>
                      <button
                        type="button"
                        onClick={() => setLessonPhase("complete")}
                        className="mt-4 rounded-2xl bg-indigo-600 px-5 py-3 font-black text-white"
                      >
                        Back to Results
                      </button>
                    </div>
                  );
                }

                const options = getOptions(currentBossQuestion.item);
                const misses = bossQuestionMisses[currentBossQuestion.id] ?? 0;
                const bossHp = Math.max(0, 100 - bossCorrectAnswers * 20);
                const tutorLine = misses >= 2
                  ? "Recovery mode: identify the key value first, then answer in one step."
                  : misses === 1
                    ? "Good effort. One short hint: focus on what the question is asking for."
                    : "Mastery mode: quick thinking, clear steps, confident answer.";

                return (
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-700">Boss Battle</p>
                    <h2 className="mt-2 text-3xl font-black text-slate-950">{currentBossQuestion.slotLabel}</h2>
                    <div className="mt-4 rounded-2xl bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-black text-slate-700">Boss HP: {bossHp}%</p>
                        <p className="text-sm font-black text-slate-700">Hearts: {heartsLabel(bossHeartsLeft)}</p>
                      </div>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-3 rounded-full bg-gradient-to-r from-rose-600 to-orange-400" style={{ width: `${bossHp}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-5">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">Tutor</p>
                      <p className="mt-2 text-sm font-bold text-slate-700">{tutorLine}</p>
                      {currentBossQuestion.section === "reading" && currentBossQuestion.item.passage ? (
                        <div className="mt-4 rounded-2xl bg-slate-50 p-4 italic text-slate-700">{String(currentBossQuestion.item.passage)}</div>
                      ) : null}
                      <h3 className="mt-4 text-2xl font-black text-slate-950">{getPrompt(currentBossQuestion.item, currentBossQuestion.section)}</h3>

                      {options.length > 0 ? (
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          {options.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => submitBossAnswer(option)}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left font-bold text-slate-800 hover:bg-slate-100"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                          <input
                            value={bossAnswer}
                            onChange={(event) => setBossAnswer(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && bossAnswer.trim()) submitBossAnswer();
                            }}
                            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg font-bold outline-none ring-indigo-400 focus:ring-2"
                            placeholder="Type your answer"
                          />
                          <button
                            type="button"
                            onClick={() => submitBossAnswer()}
                            disabled={!bossAnswer.trim()}
                            className="rounded-2xl bg-indigo-600 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Submit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : null}

              {bossStage === "result" && bossResult ? (
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-600">
                    {bossResult.win ? "Boss Defeated" : "Boss Battle Complete"}
                  </p>
                  <h2 className="mt-3 text-5xl font-black text-slate-950">
                    {bossResult.win ? "Victory!" : "Strong effort!"}
                  </h2>
                  <p className="mt-3 text-lg font-bold text-slate-700">
                    {bossResult.win ? "You handled mastery pressure brilliantly." : "You pushed through the final challenge and learned more."}
                  </p>
                  <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-indigo-50 p-4 font-black text-indigo-700">+{bossResult.rewards.xpEarned} XP</div>
                    <div className="rounded-2xl bg-amber-50 p-4 font-black text-amber-700">+{bossResult.rewards.coinsEarned} Coins</div>
                    <div className="rounded-2xl bg-rose-50 p-4 font-black text-rose-700">+{bossResult.rewards.starsEarned} Stars</div>
                  </div>
                  {bossResult.badge ? (
                    <p className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 font-black text-violet-700">+1 rare badge unlocked: Boss Slayer</p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setLessonPhase("complete")}
                      className="rounded-2xl bg-slate-200 px-5 py-3 font-black text-slate-800 hover:bg-slate-300"
                    >
                      Review Results
                    </button>
                    <Link href="/student/dashboard" className="rounded-2xl bg-indigo-600 px-6 py-3 font-black text-white">
                      Continue to Dashboard
                    </Link>
                  </div>
                </div>
              ) : null}

              {bossSubmitting ? <p className="mt-4 text-sm text-slate-500">Saving battle rewards...</p> : null}
            </div>
          ) : completed ? (
            <div className="mt-8 rounded-3xl bg-slate-50 p-8 text-center">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">{interventionMission ? "Mission Complete" : "Lesson Complete"}</p>
              <h2 className="mt-3 text-5xl font-black">{score}%</h2>
              <p className="mt-3 text-slate-600">{correctCount} correct, {incorrectCount} to practise again.</p>
              <p className="mt-2 text-base font-black text-indigo-700">
                {interventionMission ? interventionMission.outroLine : score === 100 ? "Perfect score! You're getting stronger every day!" : "Amazing work!"}
              </p>
              {saveResult?.rewards ? (
                <div className="mx-auto mt-4 grid max-w-xl gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-white p-3 font-black text-indigo-700">+{saveResult.rewards.xpEarned} XP</div>
                  <div className="rounded-2xl bg-white p-3 font-black text-cyan-700">+{saveResult.rewards.coinsEarned} Coins</div>
                  <div className="rounded-2xl bg-white p-3 font-black text-amber-700">+{saveResult.rewards.starsEarned} Stars</div>
                  <div className="rounded-2xl bg-white p-3 font-black text-rose-700">{saveResult.rewards.streak} Day Streak</div>
                </div>
              ) : null}
              {saveResult?.notification ? (
                <p className="mt-3 text-sm text-slate-500">
                  Parent notification {saveResult.notification.ok ? "sent" : "queued for setup"}.
                </p>
              ) : null}
              {incorrectCount > 0 ? (
                <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  Follow-up practice is ready to generate from Admin Assignments.
                </p>
              ) : null}
              {memoryFeedback ? (
                <p className="mx-auto mt-4 max-w-xl rounded-2xl bg-cyan-50 p-4 text-sm font-bold text-cyan-900">{memoryFeedback}</p>
              ) : null}
              <Link href="/student/dashboard" className="mt-6 inline-flex rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white">
                Back to Dashboard
              </Link>
              {lessonMasteryReady ? (
                <>
                  <p className="mt-4 text-sm font-black text-rose-700">{"You've mastered today's lesson. Ready to challenge the Boss?"}</p>
                  <button
                    type="button"
                    onClick={activateBossBattle}
                    disabled={saving || bossSubmitting}
                    className="mt-3 inline-flex rounded-2xl bg-rose-600 px-6 py-4 font-black text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Finalizing lesson..." : "Start Boss Battle"}
                  </button>
                </>
              ) : (
                <button type="button" disabled className="mt-3 inline-flex cursor-not-allowed rounded-2xl bg-amber-200 px-6 py-4 font-black text-amber-800">
                  Complete Review First
                </button>
              )}
              {saving ? <p className="mt-3 text-sm text-slate-500">Saving progress...</p> : null}
            </div>
          ) : currentItem ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_14rem]">
              <StarLizQuestionCard
                subjectBadge={
                  <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-black text-indigo-700">
                    {currentSubjectBadge}
                  </span>
                }
                attemptNumber={attemptIndicator}
                maxAttempts={3}
                progressLabel={
                  isReviewRound
                    ? `${reviewPointer + 1}/${reviewQueue.length} (Review)`
                    : `${index + 1}/${lessonItems.length}`
                }
                contextLabel={questionContextLabel(currentItem)}
                reviewNotice={reviewNotice || null}
                learningFocus={questionFormula?.learningFocus ?? null}
                keyInformation={questionFormula?.keyInformation ?? []}
                hint={
                  questionFormula?.hint ??
                  (currentItem.hint
                    ? decodeLessonText(String(currentItem.hint))
                    : needsGentleStart && index === findGentleStartIndex()
                      ? getSupportPrompt(currentItem)
                      : null)
                }
                unitReminder={questionFormula?.unitLabel ?? null}
                visual={resolvedQuestionVisual}
                aboveQuestionSlot={
                  interventionMission && currentSection === "spelling" ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-black">
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Sound Builder Mission</span>
                      <span className="rounded-full bg-cyan-100 px-3 py-1 text-cyan-700">Level {interventionLevel}</span>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                        {decodeLessonText(String(currentItem.missionGroup ?? "Targeted practice"))}
                      </span>
                    </div>
                  ) : null
                }
                passageSlot={
                  currentSection === "reading" && currentItem.passage ? (
                    <div className="mt-6 space-y-3">
                      {currentItem.bridgeWord ? (
                        <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">
                          {currentItem.bridgeMode === "weak_recovery"
                            ? <><span className="text-emerald-600">Recovery word:</span> {decodeLessonText(String(currentItem.bridgeWord))}. Read carefully and spot it in the story.</>
                            : <>⭐ You learned this word in spelling: <span className="text-emerald-600">{decodeLessonText(String(currentItem.bridgeWord))}</span> — now find it in the story!</>}
                        </p>
                      ) : null}
                      <div className="rounded-3xl bg-indigo-950 p-6 text-white">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Passage</p>
                        <p className="mt-3 text-lg leading-8">{decodeLessonText(String(currentItem.passage))}</p>
                      </div>
                    </div>
                  ) : null
                }
                visualRequiredSlot={null}
                coachButtonLabel={currentSection === "math" ? "Coach me" : "Help me understand"}
                coachOpen={coachOpen}
                onToggleCoach={hasMultipleChoiceOptions ? () => {
                  setCoachOpen((current) => {
                    const next = !current;
                    if (next) setCoachOpenCount((count) => count + 1);
                    return next;
                  });
                } : undefined}
                coachPanel={hasMultipleChoiceOptions ? (
                  <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold text-cyan-950">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Coach me • Level {tutorSupportLevel}</p>
                    <p className="mt-2 whitespace-pre-line">{coachPromptText}</p>
                  </div>
                ) : null}
                questionPrompt={
                  currentSection === "spelling"
                    ? getSpellingConversationTitle(currentItem, lessonStage)
                    : getPrompt(currentItem, currentSection)
                }
                questionInstruction={
                  currentSection === "spelling" ? (
                    <p className="mt-3 text-lg text-slate-600">
                      {lessonStage === "ASSESS_SPEECH"
                        ? needsGentleStart
                          ? "Say this one when you are ready."
                          : interventionMission
                            ? "Listen to the tutor, say it aloud, then keep going until you get it right."
                            : "Say the letter or word you see on the screen."
                        : lessonStage === "TEACH_RETRY"
                          ? "Listen to the tutor, then try saying it again."
                          : interventionMission
                            ? "Use the visual clue to lock it in, then answer correctly to continue."
                            : "Now choose or type the answer."}
                    </p>
                  ) : null
                }
                gentleStartNotice={
                  needsGentleStart && index === findGentleStartIndex() ? (
                    <p className="mt-3 rounded-2xl bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
                      {"Let's start gently. Take your time, and I can help if you get stuck."}
                    </p>
                  ) : null
                }
                customAnswerArea={
                  currentSection === "spelling" ? (
                    <>
                      {(lessonStage === "ASSESS_SPEECH" || lessonStage === "TEACH_RETRY") && (
                        <div className="flex flex-col items-center gap-4 rounded-3xl bg-indigo-50 p-6 text-center">
                          <div className="text-[140px] font-black leading-none text-slate-950 md:text-[180px]">
                            {decodeLessonText(String(currentItem.word ?? currentItem.answer ?? ""))}
                          </div>
                          <button
                            type="button"
                            onClick={() => void startListening()}
                            className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500"
                          >
                            {speechButtonState === "listening" ? "Listening..." : speechButtonState === "try_again" ? "Try again" : "Say it out loud"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void speakCurrent()}
                            className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700"
                          >
                            Repeat prompt
                          </button>
                          <p className="text-xs font-bold text-slate-500">Microphone ready. Click Say it out loud.</p>
                          {speechStatusMessage ? (
                            <p className="text-sm font-bold text-slate-700">{speechStatusMessage}</p>
                          ) : null}
                          {speechFallbackReason && !interventionMission ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLessonStage("TAP_SELECT");
                                setSpeechFallbackReason(null);
                                setSpeechListening(false);
                                setSpeechStatusMessage("Parent/teacher continue enabled for this step.");
                              }}
                              className="rounded-2xl bg-amber-500 px-5 py-3 font-black text-amber-950 hover:bg-amber-400"
                            >
                              Parent/Teacher Continue
                            </button>
                          ) : null}
                          {lessonStage === "TEACH_RETRY" ? (
                            <p className="max-w-xl text-sm font-bold text-amber-700">{getSupportPrompt(currentItem)}</p>
                          ) : null}
                          {speechDebugEnabled ? (
                            <div className="mt-2 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-left font-mono text-xs text-amber-900">
                              <p className="font-black uppercase tracking-wide">Dev: Speech Debug</p>
                              <p>Target: {getAnswer(currentItem)}</p>
                              <p>Heard: {spokenAnswer || "(none)"}</p>
                              <p>Match: {speechLastMatchResult ?? "—"}</p>
                              <p>Attempts: {speechAttempts}/3</p>
                              <p>Service: {speechListening ? "listening" : (speechFallbackReason ?? "ready")}</p>
                            </div>
                          ) : null}
                        </div>
                      )}
                      {lessonStage === "TAP_SELECT" && isAlphabetLessonItem(currentItem) && (
                        <div className="flex flex-col gap-4 rounded-3xl bg-cyan-50 p-6">
                          <p className="text-sm font-black uppercase tracking-[0.15em] text-cyan-700">Tap the letter</p>
                          {getOptions(currentItem).length ? (
                            <div className="grid gap-3">
                              {getOptions(currentItem).map((option, optionIndex) => (
                                <button
                                  key={`${option}-${optionIndex}`}
                                  onClick={() => submitAnswer(option)}
                                  className="rounded-2xl bg-cyan-500 px-5 py-4 text-left font-black text-white hover:bg-cyan-400"
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <input
                                value={answer}
                                onChange={(event) => setAnswer(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void submitAnswer();
                                }}
                                className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-indigo-400"
                                placeholder="Type the letter"
                                autoFocus
                              />
                              <button
                                onClick={() => void submitAnswer()}
                                className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500"
                              >
                                Submit
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {lessonStage === "TAP_SELECT" && !isAlphabetLessonItem(currentItem) && (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void submitAnswer();
                            }}
                            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-indigo-400"
                            placeholder="Type the word"
                            autoFocus
                          />
                          <button
                            onClick={() => void submitAnswer()}
                            className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500"
                          >
                            Submit
                          </button>
                        </div>
                      )}
                    </>
                  ) : null
                }
                answerOptions={currentSection !== "spelling" ? getOptions(currentItem) : undefined}
                onSelectAnswer={(option) => submitAnswer(option)}
                answerValue={answer}
                onAnswerChange={(value) => setAnswer(value)}
                onAnswerKeyDown={(event) => {
                  if (event.key === "Enter") void submitAnswer();
                }}
                onSubmit={() => void submitAnswer()}
                belowAnswerSlot={
                  currentSection !== "spelling" ? (
                    <button
                      onClick={() => void speakCurrent()}
                      className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700"
                    >
                      Repeat voice
                    </button>
                  ) : null
                }
                feedback={feedback || null}
                feedbackMode={feedbackMode}
                isFinalWrong={currentQuestionOutcome?.outcome === "final_wrong"}
                onContinue={continueLesson}
              />

              <aside className="rounded-3xl bg-indigo-950 p-6 text-center text-white">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Tutor</p>
                <div className="mt-6">
                  <TutorAvatar state={tutorState} />
                </div>
                <p className="mt-4 text-sm text-indigo-100">
                  {feedbackMode === "none"
                    ? (tutorState === "thinking" ? tutorPrompt : decodeLessonText(voiceLine))
                    : tutorPrompt}
                </p>
                <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">
                  {practicingNow
                    ? "Progress: practising"
                    : `Score now: ${score}%`}
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </section>
    </main>
    </>
  );
}
