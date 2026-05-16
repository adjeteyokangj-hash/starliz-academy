"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import { getProfile } from "@/lib/store";
import { beginStudentTurn, endStudentTurn, stopVoicePlayback } from "@/lib/voice";
import { syncAttemptToServer } from "@/lib/server_sync";
import { serializeSkills, skillFocusToCode } from "@/lib/skills";
import { getTutorToneLine } from "@/lib/tutorVoice";
import { classifySpeechMatch, type SpeechMatchResult } from "@/lib/speechCheck";
import { levelFromXp } from "@/lib/level_system";
import { buildInterventionMission, isInterventionEligibleSkill } from "@/lib/interventionMission";

type LessonItem = Record<string, unknown> & {
  id?: string;
  type?: string;
  word?: string;
  prompt?: string;
  question?: string;
  passage?: string;
  answer?: unknown;
  options?: unknown[];
  choices?: unknown[];
  hint?: string;
  skillFocus?: string;
  assessmentPrompt?: string;
  supportPrompt?: string;
  tapPrompt?: string;
  missionGroup?: string;
};

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

type QuestionLearningStatus = "correct" | "wrong_retrying" | "skipped_needs_reteach" | "reteach_complete";
type FeedbackMode = "none" | "continue" | "retry" | "skip_choice";
type LevelTag = "challenge" | "review" | "repair";
type LessonStage = "ASSESS_SPEECH" | "TEACH_RETRY" | "TAP_SELECT" | "COMPLETE";
type SpeechFallbackReason = "network" | "not-allowed" | "unsupported" | null;
type WarmupPhase = "idle" | "listening" | "thinking" | "responding" | "celebrating";
type WarmupMood = "happy" | "excited" | "tired" | "sad" | "not_well" | "nervous" | "confused" | "neutral";
type WarmupLevel = "low" | "medium" | "high";
type SupportLevel = "standard" | "extra" | "challenge";
type SpeechButtonState = "idle" | "listening" | "try_again";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>>; timeStamp?: number }) => void) | null;
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
  timeSpentSeconds: number;
  savedAt: string;
};

function decodeLessonText(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
}

function lessonSessionKey(assignmentId: string) {
  return `starliz_lesson_${assignmentId}`;
}

const LESSON_VOICE_KEY = "lessonVoiceEnabled";
const VOICE_UNAVAILABLE_MESSAGE = "Voice tutor unavailable on this device.";
const WARMUP_READY_INSTRUCTION = "When you're ready, click Begin my lesson to start.";

function withWarmupReadyInstruction(reply: string): string {
  return `${reply} ${WARMUP_READY_INSTRUCTION}`;
}

function detectWarmupMood(transcript: string, childName = "Learner"): WarmupResult {
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

function getItemSection(item: LessonItem, fallback: string): "spelling" | "math" | "reading" {
  const type = String(item.type ?? fallback).toLowerCase();
  if (
    type === "math" ||
    type === "maths" ||
    type === "times-tables" ||
    type === "gcse-maths" ||
    type === "science" ||
    type === "gcse-science"
  ) return "math";
  if (
    type === "reading" ||
    type === "english-language" ||
    type === "english-literature" ||
    type === "gcse-english" ||
    type === "vocabulary" ||
    item.passage
  ) return "reading";
  return "spelling";
}

function getPrompt(item: LessonItem, section: string): string {
  if (section === "spelling") return decodeLessonText(String(item.word ?? item.answer ?? item.prompt ?? ""));
  return decodeLessonText(String(item.prompt ?? item.question ?? item.word ?? ""));
}

function getAnswer(item: LessonItem): string {
  return decodeLessonText(String(item.answer ?? item.word ?? "")).trim();
}

function getOptions(item: LessonItem): string[] {
  const options = Array.isArray(item.options) ? item.options : Array.isArray(item.choices) ? item.choices : [];
  return options.map((option) => decodeLessonText(String(option))).filter(Boolean);
}

function getSpellingConversationTitle(
  item: LessonItem,
  step: LessonStage,
): string {
  const isAlphabet = isAlphabetLessonItem(item);
  const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  const customAssessmentPrompt = decodeLessonText(String(item.assessmentPrompt ?? "")).trim();
  const customSupportPrompt = decodeLessonText(String(item.supportPrompt ?? "")).trim();
  const customTapPrompt = decodeLessonText(String(item.tapPrompt ?? "")).trim();
  if (step === "ASSESS_SPEECH" && customAssessmentPrompt) return customAssessmentPrompt;
  if (step === "ASSESS_SPEECH") return isAlphabet ? "What letter do you see on the screen?" : "What word do you see on the screen?";
  if (step === "TEACH_RETRY" && customSupportPrompt) return customSupportPrompt;
  if (step === "TEACH_RETRY") return "Good try. Look again.";
  if (step === "TAP_SELECT") {
    if (customTapPrompt) return customTapPrompt;
    if (isAlphabet) {
      const targetName = target && target === target.toLowerCase() ? `lowercase ${target}` : `capital ${target}`;
      return `Now tap ${targetName}.`;
    }
    return "Now type the word.";
  }
  return "Complete";
}

function normalizeSpokenText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function describeTargetForTutor(item: LessonItem): string {
  const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  if (!target) return "that";
  if (!isAlphabetLessonItem(item)) return target;
  const lower = target === target.toLowerCase() && target !== target.toUpperCase();
  return lower ? `lowercase ${target}` : `capital ${target}`;
}

function classifySpokenVsTarget(spoken: string, target: string, isAlphabet: boolean): SpeechMatchResult {
  const base = classifySpeechMatch(spoken, target);
  if (base === "exact") return "exact";

  // For alphabet items, also accept "lowercase a" / "capital A" / "uppercase a" as exact
  if (isAlphabet) {
    const s = spoken.toLowerCase().trim().replace(/[.,!?'"]/g, "").trim();
    const t = target.toLowerCase().trim();
    const alphaVariants = [`lowercase ${t}`, `capital ${t}`, `uppercase ${t}`];
    if (alphaVariants.includes(s)) return "exact";
  }

  return base;
}

function isAlphabetLessonItem(item: LessonItem): boolean {
  const word = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
  const skillFocus = decodeLessonText(String(item.skillFocus ?? "")).toLowerCase();
  const alphabetWord = word.length === 1 && /^[a-zA-Z]$/.test(word);
  const alphabetSkill = skillFocus.includes("letter_sound") || skillFocus.includes("letter sounds") || skillFocus.includes("letter_recognition") || skillFocus.includes("letter recognition");
  return alphabetWord || alphabetSkill;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function soundForLetter(letter: string): string {
  const lower = letter.toLowerCase();
  const map: Record<string, string> = {
    a: "/a/",
    e: "/e/",
    i: "/i/",
    o: "/o/",
    u: "/u/",
  };
  return map[lower] ?? `/${lower}/`;
}

function phonicsExampleForLetter(letter: string): string {
  const lower = letter.toLowerCase();
  const map: Record<string, string> = {
    a: "apple",
    m: "moon",
    c: "cat",
    d: "dog",
    t: "tap",
    s: "sun",
  };
  return map[lower] ?? "sun";
}

function buildSpellingTeachMessage(expected: string, attempt: number, isAlphabet: boolean, inReviewRound: boolean): string {
  const clean = expected.trim().toLowerCase();
  if (!clean) return "Good try. Let us learn it together, then try again.";

  if (isAlphabet) {
    const letter = clean[0] ?? "a";
    const opener = attempt >= 2 || inReviewRound ? "Let us practise this carefully." : "Good try.";
    return `${opener}\n\nThis is lowercase ${letter}.\n${letter} says ${soundForLetter(letter)} like ${phonicsExampleForLetter(letter)}.\n\nTap ${letter} again.`;
  }

  const letters = clean.split("").join("-");
  const sounds = clean
    .split("")
    .map((letter) => `${letter} says ${soundForLetter(letter)}`)
    .join("\n");
  const opener = attempt >= 2 || inReviewRound
    ? "That one is tricky. Let us break it down together."
    : `Good try. The word is ${clean}.`;

  return `${opener}\n\nLet us learn it:\n${letters}\n${sounds}\n\nTogether: ${clean}\n\nNow type ${clean} again.`;
}

function buildMathTeachMessage(prompt: string, expected: string, attempt: number, inReviewRound: boolean): string {
  const opener = attempt >= 2 || inReviewRound
    ? "That one is tricky. Let us solve it slowly together."
    : "Good try. Let us solve it step by step.";
  const cleanPrompt = prompt.trim();
  const cleanExpected = expected.trim();

  return `${opener}\n\nQuestion: ${cleanPrompt || "Maths question"}\nFind the numbers and signs first.\nSolve one small step at a time.\n\nAnswer: ${cleanExpected}\n\nNow try ${cleanExpected} again.`;
}

function buildReadingTeachMessage(item: LessonItem, expected: string, attempt: number, inReviewRound: boolean): string {
  const opener = attempt >= 2 || inReviewRound
    ? "This one needs careful reading. Let us work it out together."
    : "Good try. Let us learn how to find the best answer.";
  const passage = String(item.passage ?? "").trim();
  const excerpt = passage ? `\n\nRe-read this part:\n${passage.slice(0, 180)}${passage.length > 180 ? "..." : ""}` : "";
  const cleanExpected = expected.trim();

  return `${opener}${excerpt}\n\nLook for key words in the question.\nMatch them to the passage.\n\nBest answer: ${cleanExpected}\n\nNow choose ${cleanExpected} again.`;
}

function buildTeachMessage(input: {
  section: "spelling" | "math" | "reading";
  item: LessonItem;
  expected: string;
  attempt: number;
  inReviewRound: boolean;
}): string {
  if (input.section === "spelling") {
    return buildSpellingTeachMessage(input.expected, input.attempt, isAlphabetLessonItem(input.item), input.inReviewRound);
  }

  if (input.section === "math") {
    return buildMathTeachMessage(getPrompt(input.item, input.section), input.expected, input.attempt, input.inReviewRound);
  }

  return buildReadingTeachMessage(input.item, input.expected, input.attempt, input.inReviewRound);
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
  const [assignment, setAssignment] = useState<LessonAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [error, setError] = useState("");
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
    const profileId = getProfile()?.id;
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
  }, []);

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

  const activeAssignment = useMemo(() => {
    if (!assignment) return null;
    if (!interventionMission) return assignment;
    return {
      ...assignment,
      subject: interventionMission.subject,
      title: interventionMission.title,
      skillFocus: interventionSkill ?? assignment.skillFocus,
      items: interventionMission.items,
    };
  }, [assignment, interventionMission, interventionSkill]);
  const lessonItems = useMemo(() => activeAssignment?.items ?? [], [activeAssignment]);
  const currentItem = lessonItems[index] ?? null;
  const currentSection = currentItem ? getItemSection(currentItem, activeAssignment?.subject ?? "spelling") : "spelling";
  const progress = lessonItems.length ? Math.round((records.length / lessonItems.length) * 100) : 0;
  const correctCount = records.filter((record) => record.correct).length;
  const incorrectCount = records.length - correctCount;
  const score = records.length ? Math.round((correctCount / records.length) * 100) : 0;
  const attemptIndicator = Math.min(3, Math.max(1, attemptCount + 1));
  const childLevel = levelFromXp(getProfile()?.xp ?? 0);
  const childName = useMemo(() => {
    const raw = String(getProfile()?.name ?? "").trim();
    return raw || "Learner";
  }, []);
  const interventionLevel = Math.min(3, 1 + Math.floor(correctCount / 2));

  const practicingNow = feedbackMode === "retry" || feedbackMode === "skip_choice";
  const speechDebugEnabled = process.env.NODE_ENV === "development" && searchParams.get("debugSpeech") === "1";

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

  async function speakTutor(line: string, force = false): Promise<void> {
    const cleanLine = decodeLessonText(line).trim();
    if (!cleanLine) return;
    setLastTutorMessage(cleanLine);
    setVoiceLine(cleanLine);
    if (!force && !voiceEnabled) return;
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
    await unlockTutorVoice();
    await preloadTutorVoices();
    await speakTutor(welcomeLine, true);
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
        setVoiceEnabled(saved.voiceEnabled ?? window.localStorage.getItem(LESSON_VOICE_KEY) !== "false");
        setVoiceLine(decodeLessonText(String(saved.tutorMessage ?? saved.lastTutorMessage ?? "I am ready when you are.")));
        setLastTutorMessage(decodeLessonText(String(saved.lastTutorMessage ?? saved.tutorMessage ?? "I am ready when you are.")));
        setRestoredMessage("Welcome back — your lesson has been restored.");
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
    attemptCount,
    completed,
    currentItem,
    currentSection,
    feedback,
    feedbackMode,
    index,
    isReviewRound,
    lastTutorMessage,
    lessonMasteryReady,
    lessonStage,
    memoryFeedback,
    pendingRecordsAfterReview,
    progress,
    questionStatuses,
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
      const line = speechListening ? "Let's try this together." : "Need help? Tap the microphone and talk to me.";
      void speakTutor(line);
    }, 5000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, speechListening, started]);

  function questionStatusKey(item: LessonItem, itemIndex: number): string {
    return String(item.id ?? `index-${itemIndex}`);
  }

  function clearFeedbackForRetry() {
    setFeedback("");
    setFeedbackMode("none");
    setTutorState("thinking");
    setVoiceLine("Take your time. You can do this.");
  }

  function goToQuestion(nextIndex: number) {
    setIndex(nextIndex);
    setAttemptCount(0);
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

  function reviewReason(item: LessonItem): string {
    const skill = String(item.skillFocus ?? "").toLowerCase();
    if (skill.includes("vowel") || skill.includes("cvc")) return "short vowel practice";
    if (skill.includes("letter") || isAlphabetLessonItem(item)) return "letter sound repair";
    if (skill.includes("read")) return "reading comprehension repair";
    if (skill.includes("math")) return "maths strategy repair";
    return "targeted skill repair";
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
      return `Level ${childLevel} • Review: ${reviewReason(lessonItems.find((item) => getItemSection(item, assignment?.subject ?? "spelling") === "spelling") ?? {})}`;
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

  function startReviewRoundIfNeeded(): boolean {
    if (!reviewQueue.length) return false;
    setShowReviewIntro(true);
    return true;
  }

  function beginReviewRound() {
    markActivity();
    if (!reviewQueue.length) return;
    setShowReviewIntro(false);
    setIsReviewRound(true);
    setReviewPointer(0);
    goToQuestion(reviewQueue[0] ?? 0);
    setReviewNotice("Let's fix the tricky ones before we finish.");
    setTutorState("thinking");
  }

  function finishLesson(nextRecords: AnswerRecord[]) {
    markActivity();
    setCompleted(true);
    const finalCorrect = nextRecords.filter((record) => record.correct).length;
    const finalScore = nextRecords.length ? Math.round((finalCorrect / nextRecords.length) * 100) : 0;
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
      goToQuestion(index + 1);
      return;
    }

    if (startReviewRoundIfNeeded()) {
      return;
    }

    finishLesson(nextRecords);
  }

  function getAssessmentPrompt(item: LessonItem): string {
    const customPrompt = decodeLessonText(String(item.assessmentPrompt ?? "")).trim();
    if (customPrompt) return customPrompt;
    return isAlphabetLessonItem(item)
      ? "What letter do you see on the screen?"
      : "What word do you see on the screen?";
  }

  function getSupportPrompt(item: LessonItem): string {
    const customPrompt = decodeLessonText(String(item.supportPrompt ?? "")).trim();
    if (customPrompt) return customPrompt;
    const target = decodeLessonText(String(item.word ?? item.answer ?? "")).trim();
    const targetDescription = describeTargetForTutor(item);
    return isAlphabetLessonItem(item)
      ? `Good try. Look again. This is the letter ${targetDescription}. Say ${target}.`
      : `Good try. Look again. This is the word ${target}. Say ${target}.`;
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

    await syncAttemptToServer({
      studentId: activeAssignment.studentId || getProfile()?.id || "",
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
    startedAtRef.current = startedAtMs;
    const firstIndex = findGentleStartIndex();
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
      heardWarmup = Boolean(transcript);
      setWarmupTranscript(transcript);
      setWarmupPhase("thinking");
      setWarmupStatus("Thinking...");

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
    const finalScore = finalRecords.length ? Math.round((finalCorrect / finalRecords.length) * 100) : 0;
    const unresolvedSkipped = Object.values(questionStatuses).filter((status) => status === "skipped_needs_reteach").length;
    const firstTryCorrect = Object.values(questionStatuses).filter((status) => status === "correct").length;
    const retryCorrect = Object.values(questionStatuses).filter((status) => status === "reteach_complete").length;
    const skippedCount = skippedQuestionKeys.length;
    const masteryReady = unresolvedSkipped === 0 && skippedCount === 0 && finalScore >= 80;
    setLessonMasteryReady(masteryReady);
    const profile = getProfile();

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
          const profileId = getProfile()?.id;
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
    const skillFocus = String(currentItem.skillFocus ?? activeAssignment.skillFocus ?? currentSection);
    const derivedSkillCode = skillFocusToCode(skillFocus);
    await syncAttemptToServer({
      studentId: activeAssignment.studentId || getProfile()?.id || "",
      subject: currentSection,
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

    const spellingQuestion = currentSection === "spelling";
    const statusKey = questionStatusKey(currentItem, index);

    if (!correct) {
      const nextAttempt = attemptCount + 1;
      setAttemptCount(nextAttempt);
      const teachLine = buildTeachMessage({
        section: currentSection,
        item: currentItem,
        expected,
        attempt: nextAttempt,
        inReviewRound: isReviewRound,
      });
      const retryVoice = nextAttempt >= 3
        ? getTutorToneLine("skip") + " Try once more first, or skip for now."
        : getTutorToneLine("retry");

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
        setQuestionStatuses((current) => ({ ...current, [statusKey]: "wrong_retrying" }));
        setLessonStage("TAP_SELECT");
        setSpeechStatusMessage("Use the visual clue, then answer again.");
        return;
      }

      if (!isReviewRound && nextAttempt >= 3) {
        cancelTutorSpeech();
        if (voiceEnabled) {
          speakTutorLine(getTutorToneLine("skip") + " Try once more first, or skip for now.");
        }
        setFeedback("That one is tricky. We will come back to it at the end. You can try once more or skip for now.");
        setFeedbackMode("skip_choice");
        setQuestionStatuses((current) => ({ ...current, [statusKey]: "skipped_needs_reteach" }));
        setReviewQueue((current) => (current.includes(index) ? current : [...current, index]));
        return;
      }

      if (voiceEnabled) {
        speakTutorLine(retryVoice);
      }
      setFeedback(teachLine);
      setFeedbackMode("retry");
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "wrong_retrying" }));
      return;
    }

    const priorStatus = questionStatuses[statusKey];
    const keepOriginalSkipScore = isReviewRound && priorStatus === "skipped_needs_reteach";
    const nextRecords = keepOriginalSkipScore ? records : [...records, { item: currentItem, section: currentSection, correct, given }];
    setRecords(nextRecords);
    setAttemptCount(0);

    const learnedLine = priorStatus === "wrong_retrying" || priorStatus === "skipped_needs_reteach"
      ? spellingQuestion
        ? `Great! Now you know ${expected.trim().toLowerCase()}.`
        : currentSection === "math"
          ? `Great! You solved it. The answer is ${expected.trim()}.`
          : "Great! You found the best answer by reading carefully."
      : getTutorToneLine("correct_first_try");

    if ((priorStatus === "wrong_retrying" || priorStatus === "skipped_needs_reteach") && correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "reteach_complete" }));
    } else if (isReviewRound && correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "reteach_complete" }));
    } else if (correct) {
      setQuestionStatuses((current) => ({ ...current, [statusKey]: "correct" }));
    }

    setFeedback(learnedLine);
    setFeedbackMode("continue");
    setTutorState(correct ? "celebrate" : "try_again");
    setVoiceLine(learnedLine);
    if (voiceEnabled) speakTutorLine(learnedLine);
    setAnswer("");
  }

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

  if (loading || (assignment && !sessionHydrated)) {
    return (<><Navbar /><main className="min-h-screen bg-[#f6f8ff]"><div className="mx-auto max-w-4xl px-6 py-10 text-slate-600">Loading lesson...</div></main></>);
  }

  if (error || !assignment || !activeAssignment) {
    return (<><Navbar /><main className="min-h-screen bg-[#f6f8ff]"><div className="mx-auto max-w-4xl px-6 py-10 text-rose-600">{error || "Lesson not found."}</div></main></>);
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#f6f8ff] text-slate-950">
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
                setVoiceEnabled((enabled) => !enabled);
                if (voiceEnabled) stopVoicePlayback();
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
                  <Link href="/games/boss-battle" className="mt-3 inline-flex rounded-2xl bg-rose-600 px-6 py-4 font-black text-white">
                    Start Boss Battle
                  </Link>
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
              <div className="rounded-3xl bg-slate-50 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-black capitalize text-indigo-700">{currentSection}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-800">
                      Attempt {attemptIndicator}/3
                    </span>
                    <span className="text-sm font-bold text-slate-500">
                      {isReviewRound ? `${reviewPointer + 1}/${reviewQueue.length} (Review)` : `${index + 1}/${lessonItems.length}`}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs font-black uppercase tracking-[0.15em] text-indigo-700">{questionContextLabel(currentItem)}</p>

                {reviewNotice ? (
                  <p className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-bold text-cyan-900">{reviewNotice}</p>
                ) : null}

                {interventionMission && currentSection === "spelling" ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-black">
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Sound Builder Mission</span>
                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-cyan-700">Level {interventionLevel}</span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{decodeLessonText(String(currentItem.missionGroup ?? "Targeted practice"))}</span>
                  </div>
                ) : null}

                {currentSection === "reading" && currentItem.passage ? (
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
                ) : null}

                <h2 className="mt-6 text-3xl font-black">
                  {currentSection === "spelling"
                    ? getSpellingConversationTitle(currentItem, lessonStage)
                    : getPrompt(currentItem, currentSection)}
                </h2>

                {currentSection === "spelling" ? (
                  <p className="mt-3 text-lg text-slate-600">
                    {lessonStage === "ASSESS_SPEECH"
                      ? needsGentleStart ? "Say this one when you are ready." : interventionMission ? "Listen to the tutor, say it aloud, then keep going until you get it right." : "Say the letter or word you see on the screen."
                      : lessonStage === "TEACH_RETRY"
                        ? "Listen to the tutor, then try saying it again."
                        : interventionMission ? "Use the visual clue to lock it in, then answer correctly to continue." : "Now choose or type the answer."}
                  </p>
                ) : null}

                {needsGentleStart && index === findGentleStartIndex() ? (
                  <p className="mt-3 rounded-2xl bg-cyan-50 p-4 text-sm font-bold text-cyan-900">
                    {"Let's start gently. Take your time, and I can help if you get stuck."}
                  </p>
                ) : null}
                {(currentItem.hint || (needsGentleStart && index === findGentleStartIndex())) ? (
                  <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    {currentItem.hint ? decodeLessonText(String(currentItem.hint)) : getSupportPrompt(currentItem)}
                  </p>
                ) : null}

                {!feedback ? (
                  <div className="mt-6 space-y-4">
                    {currentSection === "spelling" ? (
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
                                  Check
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
                              Check
                            </button>
                          </div>
                        )}
                      </>
                    ) : getOptions(currentItem).length ? (
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
                          className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-5 py-4 text-lg outline-none focus:border-indigo-400"
                          placeholder="Type your answer"
                        />
                        <button onClick={() => submitAnswer()} className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500">
                          Check
                        </button>
                      </div>
                    )}
                    {currentSection !== "spelling" && (
                      <button onClick={() => void speakCurrent()} className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700">
                        Repeat voice
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
                    <p className="whitespace-pre-line text-lg font-black">{feedback}</p>
                    {feedbackMode === "skip_choice" ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button onClick={clearFeedbackForRetry} className="rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500">
                          Try again
                        </button>
                        {!interventionMission ? (
                          <button onClick={skipForNow} className="rounded-2xl bg-amber-500 px-6 py-4 font-black text-amber-950 hover:bg-amber-400">
                            Skip for now
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <button onClick={continueLesson} className="mt-4 rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white hover:bg-indigo-500">
                        {feedbackMode === "retry" ? "Try again" : "Continue"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <aside className="rounded-3xl bg-indigo-950 p-6 text-center text-white">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-200">Tutor</p>
                <div className="mt-6">
                  <TutorAvatar state={tutorState} />
                </div>
                <p className="mt-4 text-sm text-indigo-100">{tutorState === "thinking" ? "Star is thinking..." : decodeLessonText(voiceLine)}</p>
                <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm">
                  {practicingNow
                    ? "Progress: practising"
                    : `Score now: ${records.length ? Math.round((correctCount / records.length) * 100) : 0}%`}
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
