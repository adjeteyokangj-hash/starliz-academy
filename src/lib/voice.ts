import { ChildProfile, getProfile } from "@/lib/store";
import { VOICE_STYLE_OPTIONS } from "@/lib/voice_options";

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MODE — stored in sessionStorage so it persists across page navigations
// within a session but resets on fresh login. Falls back to "browser" when
// there is no API key (the TTS route returns 503 on first request).
// ─────────────────────────────────────────────────────────────────────────────
export type VoiceMode = "human" | "browser";

const VOICE_MODE_KEY = "starliz_voice_mode";

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
  ++playbackToken;
  stopCurrentAudio();
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

function resolveHumanVoice(profile: ChildProfile | null): NonNullable<PlayHumanVoiceOptions["voice"]> {
  const style = getVoiceStyle(profile);
  const styleToVoice: Record<VoiceStyle, NonNullable<PlayHumanVoiceOptions["voice"]>> = {
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
  return styleToVoice[style] ?? "nova";
}

function resolveHumanVoiceInstructions(profile: ChildProfile | null): string {
  const style = getVoiceStyle(profile);
  return getAccentProfile(style).ttsInstruction;
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

function selectBestVoice(preferredLang: string, accentHints: string[]): { voice: SpeechSynthesisVoice | null; poor: boolean } {
  const voices = getVoicesSafe();
  if (!voices.length) {
    return { voice: null, poor: true };
  }

  const preferred = voices.filter((voice) => voice.lang.toLowerCase() === preferredLang.toLowerCase());
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const candidates = preferred.length ? preferred : english.length ? english : voices;
  const sorted = [...candidates].sort((a, b) => scoreVoice(b, preferredLang, accentHints) - scoreVoice(a, preferredLang, accentHints));
  const top = sorted[0] ?? null;
  if (!top) return { voice: null, poor: true };

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

  const style = getVoiceStyle(profile);
  const accentProfile = getAccentProfile(style);
  const preset = STYLE_PRESETS[style] ?? STYLE_PRESETS.friendly_coach;
  const pacedLines = paceMessage(message);
  if (!pacedLines.length) return false;

  const voicePick = selectBestVoice(accentProfile.lang, accentProfile.hints);
  const fallbackRate = Math.min(0.84, (preset.rate ?? 0.9) - 0.04);
  const fallbackPitch = Math.max(1.0, (preset.pitch ?? 1) - 0.06);
  const rate = voicePick.poor ? fallbackRate : (preset.rate ?? 0.9);
  const pitch = voicePick.poor ? fallbackPitch : (preset.pitch ?? 1);
  const volume = Math.max(0, Math.min(1, profile?.settings.volume ?? 1));

  window.speechSynthesis.cancel();

  let idx = 0;
  const speakNext = () => {
    if (idx >= pacedLines.length) return;
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
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(message, {
      voice: resolveHumanVoice(profile),
      instructions: resolveHumanVoiceInstructions(profile),
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
  const volume = opts.volume ?? profile?.settings.volume ?? 1;
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    await playHumanVoice(text, {
      ...opts,
      voice: opts.voice ?? resolveHumanVoice(profile),
      instructions: opts.instructions ?? resolveHumanVoiceInstructions(profile),
      volume,
    });
  } else {
    speakWithSettings(text, profile, opts.onEnd);
  }
}

export function speakProfileFeedback(profile: ChildProfile, event: VoiceEvent, suffix?: string): boolean {
  const msg = `${getVoiceReaction(event)}${suffix ? ` ${suffix}` : ""}`;
  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(msg, {
      voice: resolveHumanVoice(profile),
      instructions: resolveHumanVoiceInstructions(profile),
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

export function previewShopVoicePack(profile: ChildProfile, packId: string): boolean {
  const config = SHOP_VOICE_PREVIEWS[packId];
  if (!config) {
    return previewVoiceStyle(profile, profile.settings.voiceStyle);
  }

  const previewProfile: ChildProfile = {
    ...profile,
    settings: {
      ...profile.settings,
      voiceStyle: config.style,
      voiceEnabled: true,
    },
  };

  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    void playHumanVoice(config.line, {
      voice: config.voice,
      instructions: getAccentProfile(config.style).ttsInstruction,
      fallbackProfile: previewProfile,
      volume: previewProfile.settings.volume ?? 1,
    });
    return true;
  }

  return speakWithSettings(config.line, previewProfile);
}

/** Preview the human AI voice in parent settings. */
export async function previewHumanVoice(): Promise<void> {
  await playHumanVoice("Hello! Welcome to StarLiz Academy. I am your child's friendly learning coach!", { voice: "nova", volume: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// TUTOR CONTEXT — context-aware TTS instructions so the AI sounds like a real
// teacher adapting their voice to the activity, not just reading text aloud.
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

const TUTOR_CONTEXT_INSTRUCTIONS: Record<TutorSpeakContext, string> = {
  spelling_dictation:
    "You are a kind primary school teacher giving a spelling dictation to a child aged 5-10. " +
    "Say the word slowly and very clearly, emphasising each sound so the child can hear every letter. " +
    "Pause naturally after saying the word the first time, then say it again a second time at the same slow pace. " +
    "Sound warm, patient, and encouraging — like you genuinely believe the child can spell it.",

  spelling_sentence:
    "You are a primary school teacher reading a sentence aloud so a child can spot the spelling word inside it. " +
    "Read the whole sentence naturally and expressively, as if telling a short story. " +
    "When you reach the end, pause briefly, then say the target spelling word slowly and clearly on its own. " +
    "Be warm and encouraging.",

  spelling_instruction:
    "You are a friendly, energetic teacher giving a quick task instruction to a young child. " +
    "Keep it upbeat, clear, and brief — like you are excited for them to try. " +
    "Do not drag it out; just tell them what to do in a lively, encouraging way.",

  spelling_slow:
    "You are a patient primary school teacher helping a child who is struggling to hear the sounds in a word. " +
    "Say the word very slowly, stretching out and emphasising each individual sound (phoneme) so the child can hear every part. " +
    "Draw out the sounds — do not spell letter names, just speak the word phonetically at a very slow pace. " +
    "Then say the whole word once more at a normal speed. " +
    "Be warm, calm, and encouraging throughout.",

  spelling_syllables:
    "You are a kind teacher helping a child hear the parts of a word. " +
    "Say each syllable clearly and separately with a short pause between each one — like clapping out the beats. " +
    "After all syllables, say the full word together smoothly at a normal pace. " +
    "Sound gentle and encouraging, as if you are sharing a fun trick for remembering the word.",

  reading_passage:
    "You are a warm, expressive storyteller reading a passage to children aged 5-10. " +
    "Bring the text to life with natural intonation, gentle drama, and well-placed pauses. " +
    "Vary your pace to match the mood — slow down for important moments, speed up for exciting ones. " +
    "Sound like you are sharing a story you genuinely love.",

  reading_question:
    "You are a curious, encouraging teacher asking a child a question about something they just read. " +
    "Sound genuinely interested in what they think. " +
    "Use a warm, inviting tone with a slightly rising inflection at the end to signal it is their turn. " +
    "Give them space — do not rush or sound impatient.",

  math_problem:
    "You are an enthusiastic maths teacher presenting a problem to a young child. " +
    "Say any numbers and symbols clearly and precisely — pause slightly between key values. " +
    "Make the problem sound like an exciting puzzle worth figuring out. " +
    "Be warm and encouraging, as if you already believe they can solve it.",

  math_hint:
    "You are a patient, gentle maths teacher giving a helpful clue to a child who is stuck. " +
    "Sound encouraging and nurturing — never frustrated. " +
    "Guide them towards the answer step by step without giving it away. " +
    "Make them feel capable, not stuck.",

  encouragement:
    "You are a warm, enthusiastic teacher celebrating a child's achievement. " +
    "Be genuinely excited and expressive — vary your energy to match the win. " +
    "Sound like you are truly proud of them. " +
    "Keep it short, punchy, and uplifting.",
};

/**
 * Speak text with a specific tutor context so the AI voice adapts its delivery
 * to the activity — dictation sounds like dictation, stories sound like stories,
 * maths problems sound like a teacher presenting a challenge.
 *
 * The context instruction is combined with the child's chosen accent/style
 * instruction so both personality and activity are preserved.
 */
export async function speakWithContext(
  text: string,
  context: TutorSpeakContext,
  opts: Omit<PlayHumanVoiceOptions, "instructions"> = {},
): Promise<void> {
  const profile = getProfile();
  if (profile && !profile.settings.voiceEnabled) return;
  const volume = opts.volume ?? profile?.settings.volume ?? 1;

  const contextInstruction = TUTOR_CONTEXT_INSTRUCTIONS[context];
  const accentInstruction = resolveHumanVoiceInstructions(profile);
  // Combine: activity behaviour first, accent flavour second.
  const combinedInstruction = `${contextInstruction} ${accentInstruction}`;

  if (getVoiceMode() === "human" && !_humanVoiceDisabled) {
    await playHumanVoice(text, {
      ...opts,
      voice: opts.voice ?? resolveHumanVoice(profile),
      instructions: combinedInstruction,
      volume,
    });
  } else {
    speakWithSettings(text, profile, opts.onEnd);
  }
}
