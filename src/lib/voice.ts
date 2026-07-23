import { ChildProfile, getProfile } from "@/lib/store";
import { VOICE_STYLE_OPTIONS } from "@/lib/voice_options";

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MODE — stored in sessionStorage so it persists across page navigations
// within a session but resets on fresh login. Falls back to "browser" when
// there is no API key (the TTS route returns 503 on first request).
// ─────────────────────────────────────────────────────────────────────────────
export type VoiceMode = "human" | "browser";

const VOICE_MODE_KEY = "starliz_voice_mode";
const VOICE_TURN_STATE_KEY = "starliz_voice_turn_state";

export type VoiceTurnActor = "tutor" | "student" | "idle";

export type VoiceTurnState = {
  actor: VoiceTurnActor;
  lastTutorTurnAt: number | null;
  lastStudentTurnAt: number | null;
  interruptionCount: number;
  lastReason: string | null;
};

function defaultVoiceTurnState(): VoiceTurnState {
  return {
    actor: "idle",
    lastTutorTurnAt: null,
    lastStudentTurnAt: null,
    interruptionCount: 0,
    lastReason: null,
  };
}

function readVoiceTurnState(): VoiceTurnState {
  if (typeof window === "undefined") return defaultVoiceTurnState();
  try {
    const raw = window.sessionStorage.getItem(VOICE_TURN_STATE_KEY);
    if (!raw) return defaultVoiceTurnState();
    const parsed = JSON.parse(raw) as Partial<VoiceTurnState>;
    return {
      actor: parsed.actor === "tutor" || parsed.actor === "student" || parsed.actor === "idle" ? parsed.actor : "idle",
      lastTutorTurnAt: typeof parsed.lastTutorTurnAt === "number" ? parsed.lastTutorTurnAt : null,
      lastStudentTurnAt: typeof parsed.lastStudentTurnAt === "number" ? parsed.lastStudentTurnAt : null,
      interruptionCount: typeof parsed.interruptionCount === "number" ? Math.max(0, parsed.interruptionCount) : 0,
      lastReason: typeof parsed.lastReason === "string" ? parsed.lastReason : null,
    };
  } catch {
    return defaultVoiceTurnState();
  }
}

function writeVoiceTurnState(state: VoiceTurnState): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(VOICE_TURN_STATE_KEY, JSON.stringify(state));
}

export function getVoiceTurnState(): VoiceTurnState {
  return readVoiceTurnState();
}

export function beginTutorTurn(reason?: string): void {
  const state = readVoiceTurnState();
  writeVoiceTurnState({
    ...state,
    actor: "tutor",
    lastTutorTurnAt: Date.now(),
    lastReason: reason ?? state.lastReason,
  });
}

export function beginStudentTurn(reason?: string): void {
  const state = readVoiceTurnState();
  const interruptedTutor = state.actor === "tutor";
  ++playbackToken;
  stopCurrentAudio();
  writeVoiceTurnState({
    ...state,
    actor: "student",
    lastStudentTurnAt: Date.now(),
    interruptionCount: interruptedTutor ? state.interruptionCount + 1 : state.interruptionCount,
    lastReason: reason ?? state.lastReason,
  });
}

export function endStudentTurn(reason?: string): void {
  const state = readVoiceTurnState();
  writeVoiceTurnState({
    ...state,
    actor: "idle",
    lastReason: reason ?? state.lastReason,
  });
}

export function getVoiceMode(): VoiceMode {
  if (typeof window === "undefined") return "browser";
  const stored = window.sessionStorage.getItem(VOICE_MODE_KEY);
  if (stored === "browser" || stored === "human") return stored;
  // Default to "human" — will auto-fallback if key absent
  return "human";
}

export function setVoiceMode(mode: VoiceMode): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(VOICE_MODE_KEY, mode);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO CACHE — key: `${voice}:${text}` → Blob URL
// Limited to 60 entries; oldest evicted first.
// ─────────────────────────────────────────────────────────────────────────────
const AUDIO_CACHE = new Map<string, string>();
const CACHE_MAX = 60;

function cacheSet(key: string, url: string): void {
  if (AUDIO_CACHE.size >= CACHE_MAX) {
    const firstKey = AUDIO_CACHE.keys().next().value;
    if (firstKey !== undefined) {
      const oldUrl = AUDIO_CACHE.get(firstKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      AUDIO_CACHE.delete(firstKey);
    }
  }
  AUDIO_CACHE.set(key, url);
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAP PREVENTION — only one audio source plays at a time
// ─────────────────────────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;
let playbackToken = 0;

function stopCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function stopVoicePlayback(): void {
  const state = readVoiceTurnState();
  ++playbackToken;
  stopCurrentAudio();
  writeVoiceTurnState({
    ...state,
    actor: "idle",
    interruptionCount: state.actor === "tutor" ? state.interruptionCount + 1 : state.interruptionCount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HUMAN VOICE — fetches from /api/voice/tts, caches result, falls back to
// browser speechSynthesis on any error or 503.
// ─────────────────────────────────────────────────────────────────────────────
export type PlayHumanVoiceOptions = {
  /** OpenAI voice name. Defaults to "nova" (warm female). */
  voice?: "nova" | "shimmer" | "alloy" | "echo" | "fable" | "onyx";
  /** Optional accent/tone instructions for TTS rendering. */
  instructions?: string;
  /** Profile to use if we must fall back to browser TTS. */
  fallbackProfile?: ChildProfile | null;
  /** Volume 0–1. Defaults to 1. */
  volume?: number;
  /** Called when playback ends. */
  onEnd?: () => void;
};

type AccentProfile = {
  lang: string;
  hints: string[];
  ttsInstruction: string;
};

const ACCENT_PROFILES: Record<VoiceStyle, AccentProfile> = {
  friendly_coach: {
    lang: "en-US",
    hints: ["us", "american", "jenny", "aria", "google us english"],
    ttsInstruction: "Use a clear US English accent with a warm coaching tone.",
  },
  cheerful_kid: {
    lang: "en-AU",
    hints: ["au", "australian", "australia"],
    ttsInstruction: "Use a bright Australian English accent with cheerful energy.",
  },
  calm_reader: {
    lang: "en-GB",
    hints: ["uk", "british", "england", "google uk english female", "sonia"],
    ttsInstruction: "Use a soft British English accent and read calmly.",
  },
  fun_robot: {
    lang: "en-US",
    hints: ["us", "american", "robot"],
    ttsInstruction: "Use a playful US English accent with a light robotic character.",
  },
  storyteller: {
    lang: "en-GB",
    hints: ["uk", "british", "england", "fable"],
    ttsInstruction: "Use a rich British storytelling accent with expressive narration.",
  },
  little_helper: {
    lang: "en-NZ",
    hints: ["nz", "new zealand", "kiwi"],
    ttsInstruction: "Use a friendly New Zealand English accent with playful support.",
  },
  superhero_coach: {
    lang: "en-US",
    hints: ["us", "american", "heroic", "onyx"],
    ttsInstruction: "Use a confident US English accent with heroic coach energy.",
  },
  soft_encourager: {
    lang: "en-IE",
    hints: ["ie", "irish", "ireland"],
    ttsInstruction: "Use a gentle Irish English accent and very encouraging tone.",
  },
  accent_american: {
    lang: "en-US",
    hints: ["us", "american", "en-us", "google us english", "jenny", "aria"],
    ttsInstruction: "Use a clear modern American English accent with warm classroom confidence.",
  },
  accent_british: {
    lang: "en-GB",
    hints: ["uk", "british", "england", "en-gb", "google uk english female", "sonia", "libby"],
    ttsInstruction: "Use a polished British English accent with calm expressive storytelling.",
  },
  accent_irish: {
    lang: "en-IE",
    hints: ["ie", "irish", "ireland", "en-ie"],
    ttsInstruction: "Use a natural Irish English accent with supportive friendly rhythm.",
  },
  accent_south_african: {
    lang: "en-ZA",
    hints: ["za", "south africa", "south african", "en-za"],
    ttsInstruction: "Use a clear South African English accent with energetic coaching tone.",
  },
  accent_australian: {
    lang: "en-AU",
    hints: ["au", "australian", "australia", "en-au"],
    ttsInstruction: "Use a bright Australian English accent with upbeat child-friendly pacing.",
  },
  accent_canadian: {
    lang: "en-CA",
    hints: ["ca", "canadian", "canada", "en-ca"],
    ttsInstruction: "Use a clean Canadian English accent with kind and clear pronunciation.",
  },
  accent_indian: {
    lang: "en-IN",
    hints: ["india", "indian", "en-in", "google hindi", "heera"],
    ttsInstruction: "Use a clear Indian English accent with precise educational articulation and warm tone.",
  },
  accent_new_zealand: {
    lang: "en-NZ",
    hints: ["nz", "new zealand", "kiwi", "en-nz"],
    ttsInstruction: "Use a friendly New Zealand English accent with gentle encouragement.",
  },
};

function getAccentProfile(style: VoiceStyle): AccentProfile {
  return ACCENT_PROFILES[style] ?? ACCENT_PROFILES.friendly_coach;
}

const VALID_VOICE_STYLES = new Set<string>(VOICE_STYLE_OPTIONS.map((option) => option.value));

function sanitizeVoiceStyle(style: unknown): VoiceStyle {
  if (typeof style === "string" && VALID_VOICE_STYLES.has(style)) {
    return style as VoiceStyle;
  }
  return "friendly_coach";
}

function getVoiceStyle(profile: ChildProfile | null): VoiceStyle {
  return sanitizeVoiceStyle(profile?.settings.voiceStyle);
}

const STYLE_TO_OPENAI_VOICE: Record<VoiceStyle, NonNullable<PlayHumanVoiceOptions["voice"]>> = {
  friendly_coach: "nova",
  cheerful_kid: "shimmer",
  calm_reader: "fable",
  fun_robot: "onyx",
  storyteller: "echo",
  little_helper: "alloy",
  superhero_coach: "alloy",
  soft_encourager: "nova",
  accent_american: "nova",
  accent_british: "fable",
  accent_irish: "shimmer",
  accent_south_african: "onyx",
  accent_australian: "alloy",
  accent_canadian: "nova",
  accent_indian: "shimmer",
  accent_new_zealand: "alloy",
};

/** Stable OpenAI voice id for a voiceStyle (store-equipped tutor identity). */
export function resolveTutorOpenAiVoice(style: VoiceStyle): NonNullable<PlayHumanVoiceOptions["voice"]> {
  return STYLE_TO_OPENAI_VOICE[sanitizeVoiceStyle(style)] ?? "nova";
}

/** Stable style/accent persona instructions for a voiceStyle. */
export function resolveTutorStyleInstructions(style: VoiceStyle): string {
  return getAccentProfile(sanitizeVoiceStyle(style)).ttsInstruction;
}

function resolveHumanVoice(profile: ChildProfile | null): NonNullable<PlayHumanVoiceOptions["voice"]> {
  return resolveTutorOpenAiVoice(getVoiceStyle(profile));
}

function resolveHumanVoiceInstructions(profile: ChildProfile | null): string {
  return resolveTutorStyleInstructions(getVoiceStyle(profile));
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION TUTOR IDENTITY — one voice persona per equipped voiceStyle for the
// browser session. Context only changes delivery pacing, not who is speaking.
// Equipping a new store voice changes voiceStyle and re-pins.
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_TUTOR_IDENTITY_KEY = "starliz_session_tutor_identity";

export type SessionTutorIdentity = {
  voiceStyle: VoiceStyle;
  openaiVoice: NonNullable<PlayHumanVoiceOptions["voice"]>;
  styleInstructions: string;
};

let pinnedTutorIdentity: SessionTutorIdentity | null = null;

function readStoredTutorIdentity(): SessionTutorIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_TUTOR_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionTutorIdentity>;
    const voiceStyle = sanitizeVoiceStyle(parsed.voiceStyle);
    const openaiVoice = typeof parsed.openaiVoice === "string" ? parsed.openaiVoice : null;
    const styleInstructions = typeof parsed.styleInstructions === "string" ? parsed.styleInstructions : null;
    if (!openaiVoice || !styleInstructions) return null;
    const expectedVoice = resolveTutorOpenAiVoice(voiceStyle);
    const expectedInstructions = resolveTutorStyleInstructions(voiceStyle);
    // Re-pin if stored voice/instructions drifted from the style mapping.
    if (openaiVoice !== expectedVoice || styleInstructions !== expectedInstructions) {
      return {
        voiceStyle,
        openaiVoice: expectedVoice,
        styleInstructions: expectedInstructions,
      };
    }
    return {
      voiceStyle,
      openaiVoice: expectedVoice,
      styleInstructions: expectedInstructions,
    };
  } catch {
    return null;
  }
}

function writeStoredTutorIdentity(identity: SessionTutorIdentity): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_TUTOR_IDENTITY_KEY, JSON.stringify(identity));
}

/** Resolve and pin the session tutor identity from the equipped voiceStyle. */
export function getOrPinTutorIdentity(profile: ChildProfile | null): SessionTutorIdentity {
  const voiceStyle = getVoiceStyle(profile);
  if (pinnedTutorIdentity?.voiceStyle === voiceStyle) {
    return pinnedTutorIdentity;
  }

  const stored = readStoredTutorIdentity();
  if (stored?.voiceStyle === voiceStyle) {
    pinnedTutorIdentity = stored;
    writeStoredTutorIdentity(stored);
    return stored;
  }

  const identity: SessionTutorIdentity = {
    voiceStyle,
    openaiVoice: resolveTutorOpenAiVoice(voiceStyle),
    styleInstructions: resolveTutorStyleInstructions(voiceStyle),
  };
  pinnedTutorIdentity = identity;
  writeStoredTutorIdentity(identity);
  return identity;
}

/** Test helper: clear session tutor/browser pins and restore human TTS for a fresh lesson. */
export function resetSessionTutorVoicePinForTests(): void {
  pinnedTutorIdentity = null;
  pinnedBrowserVoice = null;
  _humanVoiceDisabled = false;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SESSION_TUTOR_IDENTITY_KEY);
    window.sessionStorage.removeItem(VOICE_MODE_KEY);
  }
}

/** Test helper: peek current in-memory tutor identity pin. */
export function peekSessionTutorVoicePinForTests(): SessionTutorIdentity | null {
  return pinnedTutorIdentity;
}

/** Test helper: peek pinned browser SpeechSynthesis voice for the session. */
export function peekPinnedBrowserVoiceForTests(): { key: string; name: string; lang: string } | null {
  return pinnedBrowserVoice;
}

let _humanVoiceDisabled = false; // flipped to true after first 503 so we stop hammering

function disableHumanVoiceForSession(): void {
  _humanVoiceDisabled = true;
  setVoiceMode("browser");
}

export async function playHumanVoice(
  text: string,
  options: PlayHumanVoiceOptions = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  const { voice = "nova", instructions, fallbackProfile, volume = 1, onEnd } = options;
  const token = ++playbackToken;
  beginTutorTurn("human_voice");

  const playBrowserFallback = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      const spoken = speakWithSettings(text, fallbackProfile ?? getProfile(), () => {
        onEnd?.();
        resolve();
      });
      if (!spoken) {
        onEnd?.();
        resolve();
      }
    });
  };

  stopCurrentAudio();

  if (_humanVoiceDisabled || getVoiceMode() === "browser") {
    await playBrowserFallback();
    return;
  }

  const cacheKey = `${voice}:${instructions ?? ""}:${text}`;
  let blobUrl = AUDIO_CACHE.get(cacheKey);

  if (!blobUrl) {
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, instructions }),
      });

      if (token !== playbackToken) {
        return;
      }

      if (response.status === 503 || response.status === 401) {
        // No API key or auth/session issue — switch to browser this session
        disableHumanVoiceForSession();
        await playBrowserFallback();
        return;
      }

      if (!response.ok) {
        // Prevent mixed voices by locking to one mode for the rest of the session.
        disableHumanVoiceForSession();
        await playBrowserFallback();
        return;
      }

      const blob = await response.blob();
      if (token !== playbackToken) {
        return;
      }
      blobUrl = URL.createObjectURL(blob);
      cacheSet(cacheKey, blobUrl);
    } catch {
      if (token !== playbackToken) {
        return;
      }
      // Transient network/TTS errors should not cause random voice changes later.
      disableHumanVoiceForSession();
      await playBrowserFallback();
      return;
    }
  }

  if (token !== playbackToken) {
    return;
  }

  const audio = new Audio(blobUrl);
  audio.volume = Math.max(0, Math.min(1, volume));
  currentAudio = audio;

  await new Promise<void>((resolve) => {
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      writeVoiceTurnState({ ...readVoiceTurnState(), actor: "idle" });
      onEnd?.();
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      if (token !== playbackToken) {
        resolve();
        return;
      }
      disableHumanVoiceForSession();
      void playBrowserFallback().then(resolve);
    };
    void audio.play().catch(() => {
      if (currentAudio === audio) currentAudio = null;
      if (token !== playbackToken) {
        resolve();
        return;
      }
      disableHumanVoiceForSession();
      void playBrowserFallback().then(resolve);
    });
  });
}

export type VoiceEvent = "correct" | "wrong" | "level-up" | "daily-quest" | "reward-earned" | "streak-saved" | "greeting";
type VoiceStyle = ChildProfile["settings"]["voiceStyle"];

type VoicePreset = {
  pitch: number;
  rate: number;
};

const REACTIONS: Record<VoiceEvent, string[]> = {
  correct: ["Amazing job!", "You are getting stronger!", "Wow, you solved that quickly!"],
  wrong: ["That is okay, try again.", "You are learning. Keep going!", "Let us slow down and try one more."],
  "level-up": ["Level up! You just unlocked a harder challenge!", "You are leveling up like a champion!"],
  "daily-quest": ["Daily quest progress updated!", "Great progress on your mission!"],
  "reward-earned": ["Reward earned! You did it!", "Awesome work. New rewards unlocked!"],
  "streak-saved": ["Your streak is safe. Great consistency!", "Streak protected. Keep shining!"],
  greeting: ["Hello superstar! Welcome to StarLiz Academy!", "Hi friend! Let us learn and play together!"],
};

const STYLE_PRESETS: Record<VoiceStyle, VoicePreset> = {
  friendly_coach: { pitch: 1.15, rate: 0.9 },
  cheerful_kid: { pitch: 1.25, rate: 1.02 },
  calm_reader: { pitch: 1.03, rate: 0.82 },
  fun_robot: { pitch: 0.9, rate: 1.05 },
  storyteller: { pitch: 1.08, rate: 0.86 },
  little_helper: { pitch: 1.2, rate: 0.92 },
  superhero_coach: { pitch: 1.1, rate: 0.98 },
  soft_encourager: { pitch: 1.04, rate: 0.8 },
  accent_american: { pitch: 1.04, rate: 0.9 },
  accent_british: { pitch: 1.0, rate: 0.84 },
  accent_irish: { pitch: 1.08, rate: 0.88 },
  accent_south_african: { pitch: 0.98, rate: 0.92 },
  accent_australian: { pitch: 1.12, rate: 0.94 },
  accent_canadian: { pitch: 1.03, rate: 0.9 },
  accent_indian: { pitch: 1.0, rate: 0.93 },
  accent_new_zealand: { pitch: 1.06, rate: 0.89 },
};

const PREFERRED_EXACT = [
  "Google UK English Female",
  "Google US English",
  "Microsoft Sonia Online (Natural)",
  "Microsoft Libby Online (Natural)",
  "Microsoft Aria Online (Natural)",
  "Microsoft Jenny Online (Natural)",
];

const PREFERRED_HINTS = [
  "jenny",
  "aria",
  "sonia",
  "libby",
  "google uk english female",
  "google us english",
  "natural",
  "enhanced",
  "premium",
  "neural",
];

const ROBOTIC_HINTS = ["default", "david", "zira", "desktop", "espeak", "sam"];
/** Browser TTS pin keyed by equipped voiceStyle so the same engine voice is reused for the session. */
let pinnedBrowserVoice: { key: VoiceStyle; name: string; lang: string } | null = null;

function getVoicesSafe(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

function scoreVoice(voice: SpeechSynthesisVoice, preferredLang: string, accentHints: string[]): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  const preferredLangLower = preferredLang.toLowerCase();
  let score = 0;

  if (lang.startsWith("en")) score += 40;
  if (lang === preferredLangLower) score += 60;
  if (preferredLangLower.startsWith("en-") && lang.startsWith(preferredLangLower.slice(0, 4))) score += 20;
  if (voice.localService) score += 4;

  const exactIndex = PREFERRED_EXACT.findIndex((pref) => pref.toLowerCase() === name);
  if (exactIndex >= 0) score += 200 - exactIndex * 5;

  PREFERRED_HINTS.forEach((hint, idx) => {
    if (name.includes(hint)) score += 80 - idx;
  });

  accentHints.forEach((hint, idx) => {
    if (name.includes(hint.toLowerCase())) score += 70 - idx;
  });

  ROBOTIC_HINTS.forEach((hint) => {
    if (name.includes(hint)) score -= 30;
  });

  return score;
}

function selectBestVoice(
  voiceStyle: VoiceStyle,
  preferredLang: string,
  accentHints: string[],
): { voice: SpeechSynthesisVoice | null; poor: boolean } {
  const voices = getVoicesSafe();
  if (!voices.length) {
    return { voice: null, poor: true };
  }

  const pinKey = sanitizeVoiceStyle(voiceStyle);
  if (pinnedBrowserVoice?.key === pinKey) {
    const pinned = voices.find((voice) => voice.name === pinnedBrowserVoice?.name && voice.lang === pinnedBrowserVoice?.lang) ?? null;
    if (pinned) {
      const pinnedScore = scoreVoice(pinned, preferredLang, accentHints);
      const pinnedName = pinned.name.toLowerCase();
      return {
        voice: pinned,
        poor: ROBOTIC_HINTS.some((hint) => pinnedName.includes(hint)) || pinnedScore < 45,
      };
    }
  }

  const preferred = voices.filter((voice) => voice.lang.toLowerCase() === preferredLang.toLowerCase());
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const candidates = preferred.length ? preferred : english.length ? english : voices;
  const sorted = [...candidates].sort((a, b) => scoreVoice(b, preferredLang, accentHints) - scoreVoice(a, preferredLang, accentHints));
  const top = sorted[0] ?? null;
  if (!top) return { voice: null, poor: true };

  pinnedBrowserVoice = { key: pinKey, name: top.name, lang: top.lang };
  const topName = top.name.toLowerCase();
  const poor = ROBOTIC_HINTS.some((hint) => topName.includes(hint)) || scoreVoice(top, preferredLang, accentHints) < 45;
  return { voice: top, poor };
}

function paceMessage(message: string): string[] {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return [];

  const primary = compact
    .split(/(?<=[.!?])\s+/)
    .flatMap((line) => line.split(/(?<=[,;:])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const line of primary) {
    if (line.length <= 90) {
      chunks.push(line);
      continue;
    }

    let cursor = 0;
    while (cursor < line.length) {
      const slice = line.slice(cursor, cursor + 90);
      const lastSpace = slice.lastIndexOf(" ");
      const end = lastSpace > 30 ? cursor + lastSpace : Math.min(line.length, cursor + 90);
      chunks.push(line.slice(cursor, end).trim());
      cursor = end;
      while (line[cursor] === " ") cursor += 1;
    }
  }

  return chunks;
}

function randomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? "Great work!";
}

export function getVoiceReaction(event: VoiceEvent): string {
  return randomLine(REACTIONS[event]);
}

function speakWithSettings(message: string, profile: ChildProfile | null, onEnd?: () => void): boolean {
  if (typeof window === "undefined") return false;
  if (!window.speechSynthesis) return false;
  if (profile && !profile.settings.voiceEnabled) return false;

  // Keep tutor identity pinned even on browser/fallback path.
  const identity = getOrPinTutorIdentity(profile);
  const style = identity.voiceStyle;
  const accentProfile = getAccentProfile(style);
  const preset = STYLE_PRESETS[style] ?? STYLE_PRESETS.friendly_coach;
  const pacedLines = paceMessage(message);
  if (!pacedLines.length) return false;

  const volume = Math.max(0, Math.min(1, profile?.settings.volume ?? 1));
  beginTutorTurn("browser_tts");

  window.speechSynthesis.cancel();

  let idx = 0;
  const speakNext = () => {
    if (idx >= pacedLines.length) return;
    // Re-resolve each chunk so a late voiceschanged load can pin once, then reuse.
    const voicePick = selectBestVoice(style, accentProfile.lang, accentProfile.hints);
    const fallbackRate = Math.min(0.84, (preset.rate ?? 0.9) - 0.04);
    const fallbackPitch = Math.max(1.0, (preset.pitch ?? 1) - 0.06);
    const rate = voicePick.poor ? fallbackRate : (preset.rate ?? 0.9);
    const pitch = voicePick.poor ? fallbackPitch : (preset.pitch ?? 1);

    const utterance = new SpeechSynthesisUtterance(pacedLines[idx]);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (voicePick.voice) {
      utterance.voice = voicePick.voice;
      // Only force the accent lang when the selected voice actually supports it.
      // Forcing a mismatched lang (e.g. en-IN on a en-US voice) causes Chrome
      // to ignore the voice assignment and produce silence when no en-IN voice exists.
      const voiceLang = voicePick.voice.lang.toLowerCase();
      const accentLang = accentProfile.lang.toLowerCase();
      utterance.lang = voiceLang.startsWith(accentLang) || accentLang.startsWith(voiceLang.slice(0, 2))
        ? accentProfile.lang
        : voicePick.voice.lang;
    } else {
      utterance.lang = accentProfile.lang;
    }
    idx += 1;
    utterance.onend = () => {
      if (idx >= pacedLines.length && onEnd) onEnd();
      if (idx >= pacedLines.length) {
        writeVoiceTurnState({ ...readVoiceTurnState(), actor: "idle" });
      }
      speakNext();
    };
    window.speechSynthesis.speak(utterance);
  };

  if (!getVoicesSafe().length) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      speakNext();
    };
    // Some browsers never fire onvoiceschanged quickly; speak now with defaults.
    speakNext();
  } else {
    speakNext();
  }

  return true;
}

export function speakEncouragement(message: string): boolean {
  const profile = getProfile();
  const identity = getOrPinTutorIdentity(profile);
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(message, {
      voice: identity.openaiVoice,
      instructions: identity.styleInstructions,
      volume: profile?.settings.volume ?? 1,
    });
    return true;
  }
  return speakWithSettings(message, profile);
}

/** Speak text using whichever mode is active. Returns a Promise so callers can await it. */
export async function speak(text: string, opts: PlayHumanVoiceOptions = {}): Promise<void> {
  const profile = getProfile();
  if (profile && !profile.settings.voiceEnabled) return;
  const identity = getOrPinTutorIdentity(profile);
  const volume = opts.volume ?? profile?.settings.volume ?? 1;
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    await playHumanVoice(text, {
      ...opts,
      voice: opts.voice ?? identity.openaiVoice,
      instructions: opts.instructions ?? identity.styleInstructions,
      volume,
    });
  } else {
    speakWithSettings(text, profile, opts.onEnd);
  }
}

export function speakProfileFeedback(profile: ChildProfile, event: VoiceEvent, suffix?: string): boolean {
  const msg = `${getVoiceReaction(event)}${suffix ? ` ${suffix}` : ""}`;
  const identity = getOrPinTutorIdentity(profile);
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(msg, {
      voice: identity.openaiVoice,
      instructions: identity.styleInstructions,
      volume: profile.settings.volume ?? 1,
    });
    return true;
  }
  return speakWithSettings(msg, profile);
}

export function previewVoiceStyle(profile: ChildProfile, style: VoiceStyle): boolean {
  const previewProfile: ChildProfile = {
    ...profile,
    settings: {
      ...profile.settings,
      voiceStyle: style,
      voiceEnabled: true,
    },
  };
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice("Hello! I am your learning coach. Let us learn. Play. Grow.", {
      voice: resolveHumanVoice(previewProfile),
      instructions: resolveHumanVoiceInstructions(previewProfile),
      fallbackProfile: previewProfile,
      volume: previewProfile.settings.volume ?? 1,
    });
    return true;
  }
  return speakWithSettings("Hello! I am your learning coach. Let us learn. Play. Grow.", previewProfile);
}

const SHOP_VOICE_PREVIEWS: Record<string, { style: VoiceStyle; voice: NonNullable<PlayHumanVoiceOptions["voice"]>; line: string }> = {
  "voice-friendly-coach": { style: "friendly_coach", voice: "nova", line: "Hi champion. I am your friendly coach. Let us learn one step at a time." },
  "voice-cheerful-kid": { style: "cheerful_kid", voice: "shimmer", line: "Yay! Learning time is here. Let us play, practice, and grow together." },
  "voice-story-reader": { style: "storyteller", voice: "fable", line: "Once upon a learning day, you discovered a new word and smiled with pride." },
  "voice-gentle-reader": { style: "calm_reader", voice: "nova", line: "Take a calm breath. Read slowly and clearly. You are doing beautifully." },
  "voice-funny-robot": { style: "fun_robot", voice: "echo", line: "Beep boop. Robot mode activated. Correct answers charging to one hundred percent." },
  "voice-adventure-guide": { style: "little_helper", voice: "alloy", line: "Explorer ready. Your next challenge is a fun mission across letters and numbers." },
  "voice-superhero-coach": { style: "superhero_coach", voice: "onyx", line: "Hero power on. Focus your mind. You can solve this challenge like a legend." },
  "voice-calm-helper": { style: "calm_reader", voice: "alloy", line: "I am right here with you. We can solve each question together at your pace." },
  "voice-magic-fairy": { style: "soft_encourager", voice: "shimmer", line: "Sparkle, sparkle. Every answer you try adds a little magic to your learning journey." },
  "voice-premium-storyteller": { style: "storyteller", voice: "fable", line: "In a galaxy of stories, brave learners like you turn every page into progress." },
  "voice-accent-american": { style: "accent_american", voice: "nova", line: "Hey superstar. You are doing awesome. Let us tackle this challenge together." },
  "voice-accent-british": { style: "accent_british", voice: "fable", line: "Brilliant effort. Let us continue with confidence and curiosity." },
  "voice-accent-irish": { style: "accent_irish", voice: "shimmer", line: "You are doing grand today. Keep going, one bright step at a time." },
  "voice-accent-south-african": { style: "accent_south_african", voice: "onyx", line: "Excellent work, champ. Stay focused and you will master this quickly." },
  "voice-accent-australian": { style: "accent_australian", voice: "alloy", line: "You are smashing it, mate. Let us keep this learning streak going." },
  "voice-accent-canadian": { style: "accent_canadian", voice: "nova", line: "Great job, friend. You are making steady progress every single day." },
  "voice-accent-indian": { style: "accent_indian", voice: "shimmer", line: "Wonderful work today. Practice every day and watch yourself become amazing." },
  "voice-accent-new-zealand": { style: "accent_new_zealand", voice: "alloy", line: "Awesome learning today. You are doing a brilliant job step by step." },
};

function buildShopVoicePreviewProfile(base: ChildProfile | null, packId: string): { profile: ChildProfile; line: string; voice: NonNullable<PlayHumanVoiceOptions["voice"]>; style: VoiceStyle } {
  const config = SHOP_VOICE_PREVIEWS[packId];
  const style = config?.style ?? sanitizeVoiceStyle(base?.settings.voiceStyle);
  const line = config?.line ?? "Hello! I am your learning coach. Let us learn. Play. Grow.";
  const voice = config?.voice ?? resolveTutorOpenAiVoice(style);

  const profile: ChildProfile = {
    ...(base ?? ({} as ChildProfile)),
    settings: {
      voiceEnabled: true,
      sfxEnabled: true,
      volume: base?.settings.volume ?? 1,
      voiceStyle: style,
      coachingStyle: base?.settings.coachingStyle ?? "balanced",
      reduceMotion: false,
      largeText: false,
      highContrast: false,
    },
  };
  return { profile, line, voice, style };
}

export function previewShopVoicePack(profile: ChildProfile, packId: string): boolean {
  const resolvedPackId = packId.startsWith("admin-store-") ? packId.replace(/^admin-store-/, "") : packId;
  const { profile: previewProfile, line, voice, style } = buildShopVoicePreviewProfile(profile, resolvedPackId);

  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(line, {
      voice,
      instructions: getAccentProfile(style).ttsInstruction,
      fallbackProfile: previewProfile,
      volume: previewProfile.settings.volume ?? 1,
    });
    return true;
  }

  return speakWithSettings(line, previewProfile);
}

/**
 * Admin catalog preview — always uses browser TTS so samples work without
 * student session / OpenAI TTS credentials. Returns a Promise so the UI can await.
 */
export async function previewShopVoicePackById(packId: string): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;

  const resolvedPackId = packId.startsWith("admin-store-") ? packId.replace(/^admin-store-/, "") : packId;
  const config = SHOP_VOICE_PREVIEWS[resolvedPackId];
  const style = config?.style ?? "friendly_coach";
  const line = config?.line ?? `Hello! This is a preview of ${resolvedPackId.replace(/-/g, " ")}.`;
  const preset = STYLE_PRESETS[style] ?? STYLE_PRESETS.friendly_coach;

  // Ensure voices are loaded (Chrome often returns [] until voiceschanged).
  await new Promise<void>((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      resolve();
      return;
    }
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve();
    }, 700);
  });

  const voices = window.speechSynthesis.getVoices();
  const englishVoice =
    voices.find((v) => /en[-_]GB/i.test(v.lang) && /female|zira|susan|serena|martha|libby/i.test(v.name))
    ?? voices.find((v) => /en[-_]US/i.test(v.lang) && /female|zira|samantha|jenny|aria/i.test(v.name))
    ?? voices.find((v) => /^en/i.test(v.lang))
    ?? voices[0]
    ?? null;

  window.speechSynthesis.cancel();
  beginTutorTurn("browser_tts");

  const utterance = new SpeechSynthesisUtterance(line);
  utterance.rate = Math.min(0.95, preset.rate ?? 0.9);
  utterance.pitch = preset.pitch ?? 1;
  utterance.volume = 1;
  if (englishVoice) {
    utterance.voice = englishVoice;
    utterance.lang = englishVoice.lang;
  } else {
    utterance.lang = "en-GB";
  }

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    utterance.onstart = () => finish(true);
    utterance.onerror = () => finish(false);
    utterance.onend = () => finish(true);
    try {
      window.speechSynthesis.speak(utterance);
      // Some browsers never fire onstart; assume success if speak() didn't throw.
      window.setTimeout(() => finish(true), 250);
    } catch {
      finish(false);
    }
  });
}

/** Preview the human AI voice in parent settings. */
export async function previewHumanVoice(): Promise<void> {
  await playHumanVoice("Hello! Welcome to StarLiz Academy. I am your child's friendly learning coach!", { voice: "nova", volume: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// TUTOR CONTEXT — delivery pacing only. Persona/accent comes from the pinned
// voiceStyle so maths_problem / math_hint / encouragement stay the same teacher.
// ─────────────────────────────────────────────────────────────────────────────
export type TutorSpeakContext =
  | "spelling_dictation"   // Slow, clear word for spelling practice — say it twice
  | "spelling_sentence"    // Read a sentence naturally, then emphasise the target word
  | "spelling_instruction" // Quick task instruction (visual modes like build/choose)
  | "spelling_slow"        // Spell the word letter by letter, clearly and slowly
  | "spelling_syllables"   // Break the word into syllable chunks, then say the whole word
  | "reading_passage"      // Expressive storytelling of a passage
  | "reading_question"     // Curious teacher asking a comprehension question
  | "math_problem"         // Present a maths problem as an engaging puzzle
  | "math_hint"            // Patient hint guiding child towards the answer
  | "encouragement";       // Warm praise and celebration

/** Delivery-only cues — must not redefine who is speaking. */
const TUTOR_CONTEXT_DELIVERY_CUES: Record<TutorSpeakContext, string> = {
  spelling_dictation:
    "Say the spelling word slowly and clearly, emphasising each sound. " +
    "Pause briefly, then say the word a second time at the same slow pace.",

  spelling_sentence:
    "Read the sentence naturally, then pause and say the target spelling word slowly on its own.",

  spelling_instruction:
    "Keep the instruction brief, clear, and upbeat. Do not drag it out.",

  spelling_slow:
    "Say the word very slowly, stretching each sound (phoneme). " +
    "Do not spell letter names. Then say the whole word once at a normal pace.",

  spelling_syllables:
    "Say each syllable clearly with a short pause between them, then say the full word smoothly.",

  reading_passage:
    "Read with natural intonation and well-placed pauses. Match pace to the mood of the text.",

  reading_question:
    "Ask the question clearly with a warm inviting tone and a slight rise at the end. Do not rush.",

  math_problem:
    "Say numbers and symbols clearly, with a slight pause between key values.",

  math_hint:
    "Speak patiently and clearly while guiding step by step. Do not sound frustrated.",

  encouragement:
    "Keep praise short, warm, and uplifting. Stay the same teacher — only the energy of the win changes slightly.",
};

const TUTOR_IDENTITY_LOCK =
  "Stay as the same single teacher for the whole session. Do not change character, accent, age, or persona.";

/**
 * Compose TTS instructions: pinned style persona first, then delivery-only context cue.
 * Context must not change OpenAI voice id or the core persona.
 */
export function composeTutorSpeakInstructions(
  styleInstructions: string,
  context: TutorSpeakContext,
): string {
  const delivery = TUTOR_CONTEXT_DELIVERY_CUES[context] ?? "";
  return `${styleInstructions} ${TUTOR_IDENTITY_LOCK} ${delivery}`.replace(/\s+/g, " ").trim();
}

/** All tutor speak contexts — exported for regression tests. */
export const TUTOR_SPEAK_CONTEXTS: TutorSpeakContext[] = [
  "spelling_dictation",
  "spelling_sentence",
  "spelling_instruction",
  "spelling_slow",
  "spelling_syllables",
  "reading_passage",
  "reading_question",
  "math_problem",
  "math_hint",
  "encouragement",
];

/**
 * Speak text with a specific tutor context so delivery pacing fits the activity
 * (dictation slower, praise shorter) while the pinned voiceStyle persona stays fixed.
 */
export async function speakWithContext(
  text: string,
  context: TutorSpeakContext,
  opts: Omit<PlayHumanVoiceOptions, "instructions"> = {},
): Promise<void> {
  const profile = getProfile();
  if (profile && !profile.settings.voiceEnabled) return;
  const volume = opts.volume ?? profile?.settings.volume ?? 1;

  const identity = getOrPinTutorIdentity(profile);
  const combinedInstruction = composeTutorSpeakInstructions(identity.styleInstructions, context);

  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    await playHumanVoice(text, {
      ...opts,
      voice: opts.voice ?? identity.openaiVoice,
      instructions: combinedInstruction,
      volume,
    });
  } else {
    speakWithSettings(text, profile, opts.onEnd);
  }
}
