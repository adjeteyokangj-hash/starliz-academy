import test from "node:test";
import assert from "node:assert/strict";

import type { ChildProfile } from "../src/lib/store";
import { saveProfiles } from "../src/lib/store";
import {
  composeTutorSpeakInstructions,
  getOrPinTutorIdentity,
  getVoiceMode,
  peekPinnedBrowserVoiceForTests,
  peekSessionTutorVoicePinForTests,
  resetSessionTutorVoicePinForTests,
  resolveTutorOpenAiVoice,
  resolveTutorStyleInstructions,
  speakWithContext,
  type TutorSpeakContext,
} from "../src/lib/voice";

type TtsCall = { text: string; voice: string; instructions: string };
type BrowserSpeak = { text: string; voiceName: string | null; lang: string };

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

function profileWithStyle(voiceStyle: ChildProfile["settings"]["voiceStyle"], id = "voice-lock-child"): ChildProfile {
  const nowIso = new Date().toISOString();
  const dayKey = nowIso.slice(0, 10);
  return {
    id,
    name: "Voice Lock Child",
    avatar: "🦊",
    ageRange: "5-7",
    ageYears: 6,
    startLevelChoice: "Beginner",
    level: "Beginner",
    yearGroup: "Year 1",
    keyStageLevel: "KS1",
    subjectLevels: { spelling: 1, math: 1, reading: 1 },
    stars: 0,
    xp: 0,
    coins: 200,
    weekStreak: 1,
    streakShields: 1,
    petStage: 1,
    petEmotion: "calm",
    petMoodUpdatedAt: nowIso,
    inventory: [],
    weeklyRewardClaimedAt: null,
    dailyGoal: 3,
    weeklyTarget: 18,
    usageLimitMinutes: 45,
    usageTodayMinutes: 0,
    usageDayKey: dayKey,
    lastActiveDay: dayKey,
    adaptive: {
      spellingDifficulty: 1,
      mathDifficulty: 1,
      readingDifficulty: 1,
      spellingStreak: 0,
      weakAreas: [],
      nextBestActivity: "Math Quest",
      lastVoiceMessage: "You are doing great!",
    },
    learnerInsights: {
      spelling: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      math: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      reading: { level: 1, attempts: 0, correct: 0, hintsUsed: 0, avgResponseMs: 0, strengths: [], needsSupport: [], repeatedMistakes: [], audioSupportNeeded: false },
      updatedAt: nowIso,
    },
    levelDecisions: [],
    dailySubjectProgress: {
      dayKey,
      targets: { spelling: 15, math: 10, reading: 5 },
      completed: { spelling: 0, math: 0, reading: 0 },
      weakItems: { spelling: [], math: [], reading: [] },
    },
    masteryTags: { spelling: {}, math: {}, reading: {} },
    weaknessMap: {},
    spellingPatterns: {},
    mathSkills: {},
    literacySupport: { spellingCompetency: 100, readingCompetency: 100, oralReadingScore: 100, mode: "balanced", interventions: [], updatedAt: nowIso },
    mathSupport: { mathCompetency: 100, weakOperations: [], mode: "standard", interventions: [], updatedAt: nowIso },
    settings: {
      voiceEnabled: true,
      sfxEnabled: true,
      volume: 1,
      voiceStyle,
      coachingStyle: "balanced",
      reduceMotion: true,
      largeText: false,
      highContrast: false,
    },
    theme: "default",
    hubPins: ["math"],
    hubOrder: ["spelling", "math", "reading", "pet", "rewards", "profiles"],
    createdAt: nowIso,
  } as ChildProfile;
}

function installLessonVoiceHarness() {
  const ttsCalls: TtsCall[] = [];
  const browserSpeaks: BrowserSpeak[] = [];
  let failNextHuman = false;

  const sessionStorage = memoryStorage();
  const voices = [
    {
      name: "Google US English",
      lang: "en-US",
      localService: true,
      default: true,
      voiceURI: "Google US English",
    },
    {
      name: "Microsoft Sonia Online (Natural)",
      lang: "en-GB",
      localService: false,
      default: false,
      voiceURI: "Microsoft Sonia Online (Natural)",
    },
    {
      name: "Google UK English Female",
      lang: "en-GB",
      localService: true,
      default: false,
      voiceURI: "Google UK English Female",
    },
  ];

  class FakeUtterance {
    text: string;
    rate = 1;
    pitch = 1;
    volume = 1;
    lang = "en-US";
    voice: SpeechSynthesisVoice | null = null;
    onend: ((ev?: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }

  const speechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null as (() => void) | null,
    getVoices: () => voices as unknown as SpeechSynthesisVoice[],
    cancel: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    speak: (utterance: FakeUtterance) => {
      browserSpeaks.push({
        text: utterance.text,
        voiceName: utterance.voice?.name ?? null,
        lang: utterance.lang,
      });
      queueMicrotask(() => utterance.onend?.(undefined));
    },
  };

  class FakeAudio {
    volume = 1;
    src = "";
    onended: ((ev?: unknown) => void) | null = null;
    onerror: ((ev?: unknown) => void) | null = null;
    pause() {
      return undefined;
    }
    play() {
      queueMicrotask(() => this.onended?.(undefined));
      return Promise.resolve();
    }
  }

  const previous = {
    window: (globalThis as { window?: unknown }).window,
    fetch: globalThis.fetch,
    Audio: (globalThis as { Audio?: unknown }).Audio,
    URL: globalThis.URL,
    SpeechSynthesisUtterance: (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance,
  };

  (globalThis as { window: unknown }).window = {
    sessionStorage,
    speechSynthesis,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;
  (globalThis as { Audio: unknown }).Audio = FakeAudio;
  globalThis.URL.createObjectURL = () => "blob:voice-lock-test";
  globalThis.URL.revokeObjectURL = () => undefined;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as TtsCall;
    ttsCalls.push(body);
    if (failNextHuman) {
      failNextHuman = false;
      return {
        ok: false,
        status: 503,
        blob: async () => new Blob(),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])]),
    } as Response;
  }) as typeof fetch;

  return {
    ttsCalls,
    browserSpeaks,
    forceBrowserFallback() {
      failNextHuman = true;
    },
    restore() {
      if (previous.window === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous.window;
      }
      globalThis.fetch = previous.fetch;
      if (previous.Audio === undefined) {
        delete (globalThis as { Audio?: unknown }).Audio;
      } else {
        (globalThis as { Audio: unknown }).Audio = previous.Audio;
      }
      if (previous.SpeechSynthesisUtterance === undefined) {
        delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
      } else {
        (globalThis as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = previous.SpeechSynthesisUtterance;
      }
      if (previous.URL) {
        globalThis.URL = previous.URL;
      }
    },
  };
}

const LESSON_BEATS: Array<{ label: string; context: TutorSpeakContext; text: string }> = [
  { label: "welcome", context: "encouragement", text: "Welcome to Maths Quest. Let us begin." },
  { label: "question", context: "math_problem", text: "What is 1 plus 1?" },
  { label: "hint", context: "math_hint", text: "Count on your fingers and try again." },
  { label: "correct", context: "encouragement", text: "Correct. 1 plus 1 equals 2." },
  { label: "encouragement", context: "encouragement", text: "Amazing job. You are getting stronger!" },
];

test("end-to-end session voice lock: Voice A, browser fallback, then Voice B", async () => {
  const harness = installLessonVoiceHarness();
  try {
    resetSessionTutorVoicePinForTests();
    saveProfiles([profileWithStyle("friendly_coach")]);

    // --- Lesson with Voice A (human TTS) ---
    for (const beat of LESSON_BEATS) {
      await speakWithContext(beat.text, beat.context);
    }

    assert.equal(harness.ttsCalls.length, LESSON_BEATS.length, "each lesson beat should hit human TTS");
    const voiceA = resolveTutorOpenAiVoice("friendly_coach");
    const styleA = resolveTutorStyleInstructions("friendly_coach");
    for (const call of harness.ttsCalls) {
      assert.equal(call.voice, voiceA, "Voice A OpenAI id must stay fixed across lesson beats");
      assert.ok(call.instructions.startsWith(styleA), "Voice A persona must stay fixed across lesson beats");
      assert.match(call.instructions, /same single teacher/i);
      assert.doesNotMatch(call.instructions, /You are an? (enthusiastic|patient|warm|kind)/i);
    }
    assert.equal(peekSessionTutorVoicePinForTests()?.openaiVoice, voiceA);
    assert.equal(peekSessionTutorVoicePinForTests()?.voiceStyle, "friendly_coach");

    // --- Force browser TTS fallback mid-session ---
    const browserBefore = harness.browserSpeaks.length;
    harness.forceBrowserFallback();
    await speakWithContext("Let us keep going with the next puzzle.", "math_problem");
    assert.equal(getVoiceMode(), "browser", "503 should lock the session onto browser TTS");
    assert.ok(harness.browserSpeaks.length > browserBefore, "fallback must speak via speechSynthesis");

    const pinnedBrowserA = peekPinnedBrowserVoiceForTests();
    assert.ok(pinnedBrowserA, "browser voice should pin on first fallback speak");
    assert.equal(pinnedBrowserA?.key, "friendly_coach");

    for (const beat of [
      { context: "math_hint" as const, text: "Break the problem into smaller steps." },
      { context: "encouragement" as const, text: "Nice persistence. Keep shining!" },
    ]) {
      await speakWithContext(beat.text, beat.context);
    }

    const browserAfterFallback = harness.browserSpeaks.filter((speak) => speak.voiceName);
    assert.ok(browserAfterFallback.length >= 3, "fallback lesson beats should use a concrete browser voice");
    const uniqueBrowserVoices = new Set(browserAfterFallback.map((speak) => `${speak.voiceName}|${speak.lang}`));
    assert.equal(uniqueBrowserVoices.size, 1, "browser fallback must reuse one pinned tutor voice");
    assert.equal(peekPinnedBrowserVoiceForTests()?.name, pinnedBrowserA?.name);

    // Finish lesson / equip Voice B from the store (voiceStyle change)
    saveProfiles([profileWithStyle("accent_british")]);
    resetSessionTutorVoicePinForTests(); // brand-new lesson after finishing (fresh speak session helpers)
    // New lesson still starts with human mode available after reset.
    assert.equal(getVoiceMode(), "human");

    const ttsBeforeB = harness.ttsCalls.length;
    const browserBeforeB = harness.browserSpeaks.length;
    for (const beat of LESSON_BEATS) {
      await speakWithContext(beat.text, beat.context);
    }

    const voiceBCalls = harness.ttsCalls.slice(ttsBeforeB);
    assert.equal(voiceBCalls.length, LESSON_BEATS.length);
    const voiceB = resolveTutorOpenAiVoice("accent_british");
    const styleB = resolveTutorStyleInstructions("accent_british");
    assert.notEqual(voiceB, voiceA);
    for (const call of voiceBCalls) {
      assert.equal(call.voice, voiceB, "Voice B OpenAI id must stay fixed for the new lesson");
      assert.ok(call.instructions.startsWith(styleB), "Voice B persona must stay fixed for the new lesson");
    }
    assert.equal(peekSessionTutorVoicePinForTests()?.voiceStyle, "accent_british");
    assert.equal(peekSessionTutorVoicePinForTests()?.openaiVoice, voiceB);

    // Force fallback again on Voice B and confirm the new browser pin is British-leaning and stable
    harness.forceBrowserFallback();
    await speakWithContext("One more try together.", "math_hint");
    assert.equal(getVoiceMode(), "browser");
    const pinnedBrowserB = peekPinnedBrowserVoiceForTests();
    assert.ok(pinnedBrowserB);
    assert.equal(pinnedBrowserB?.key, "accent_british");
    assert.notEqual(pinnedBrowserB?.name, pinnedBrowserA?.name, "Voice B should select a different browser engine voice");

    await speakWithContext("You solved it!", "encouragement");
    const voiceBBrowser = harness.browserSpeaks.slice(browserBeforeB).filter((speak) => speak.voiceName);
    const uniqueB = new Set(voiceBBrowser.map((speak) => `${speak.voiceName}|${speak.lang}`));
    assert.equal(uniqueB.size, 1, "Voice B browser fallback must stay consistent for the new session");
  } finally {
    resetSessionTutorVoicePinForTests();
    harness.restore();
  }
});

test("composeTutorSpeakInstructions keeps Voice A persona across the checklist contexts", () => {
  const style = resolveTutorStyleInstructions("friendly_coach");
  const contexts: TutorSpeakContext[] = ["encouragement", "math_problem", "math_hint", "encouragement"];
  const composed = contexts.map((context) => composeTutorSpeakInstructions(style, context));
  for (const text of composed) {
    assert.equal(text.slice(0, style.length), style);
  }
  assert.equal(getOrPinTutorIdentity(profileWithStyle("friendly_coach")).openaiVoice, "nova");
});
