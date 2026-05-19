import { useCallback, useEffect, useState } from "react";

type VoiceResultAlternative = {
  transcript: string;
  confidence?: number;
};

type VoiceRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<VoiceResultAlternative>>;
  timeStamp?: number;
};

type VoiceRecognitionErrorEvent = {
  error?: string;
};

export type SpeechSynthesisVoiceLike = {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
};

type SpeechSynthesisUtteranceLike = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
  voice: SpeechSynthesisVoiceLike | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechSynthesisUtteranceCtor = new (text: string) => SpeechSynthesisUtteranceLike;

type BrowserSpeechSynthesisLike = {
  onvoiceschanged: (() => void) | null;
  getVoices: () => SpeechSynthesisVoiceLike[];
  speak: (utterance: SpeechSynthesisUtteranceLike) => void;
  cancel: () => void;
  resume: () => void;
};

type BrowserSpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null;
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionLike;

type BrowserWindowLike = {
  speechSynthesis?: BrowserSpeechSynthesisLike;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceCtor;
  SpeechRecognition?: BrowserSpeechRecognitionCtor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  isSecureContext?: boolean;
  location?: {
    hostname?: string;
  };
  setTimeout: (handler: () => void, timeout?: number) => number;
  clearTimeout: (id: number) => void;
};

type VoiceIOEnvironment = {
  getWindow: () => BrowserWindowLike | undefined;
};

export type VoiceIOCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onRecognitionStart?: () => void;
  onRecognitionResult?: (event: VoiceRecognitionResultEvent) => void;
  onRecognitionError?: (event: VoiceRecognitionErrorEvent) => void;
  onRecognitionEnd?: () => void;
};

export type UseVoiceIOOptions = VoiceIOCallbacks & {
  preferredVoiceNames?: string[];
  preferredLanguage?: string;
  recognitionLanguage?: string;
  environment?: VoiceIOEnvironment;
};

export type VoiceIOSnapshot = {
  availableVoices: SpeechSynthesisVoiceLike[];
  isListening: boolean;
  isSpeaking: boolean;
  recognitionSupported: boolean;
  speechSupported: boolean;
};

export type VoiceIOController = {
  getSnapshot: () => VoiceIOSnapshot;
  subscribe: (listener: (snapshot: VoiceIOSnapshot) => void) => () => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  startListening: () => Promise<boolean>;
  stopListening: () => void;
  unlockVoice: () => Promise<void>;
  preloadVoices: () => Promise<SpeechSynthesisVoiceLike[]>;
  dispose: () => void;
};

const DEFAULT_PREFERRED_VOICE_NAMES = ["Google UK English Female", "Microsoft Sonia", "Microsoft Libby"];

function createDefaultEnvironment(): VoiceIOEnvironment {
  return {
    getWindow() {
      if (typeof window === "undefined") {
        return undefined;
      }
      return window as unknown as BrowserWindowLike;
    },
  };
}

function createFallbackUtterance(text: string): SpeechSynthesisUtteranceLike {
  return {
    text,
    lang: "en-GB",
    rate: 1,
    pitch: 1,
    volume: 1,
    voice: null,
    onstart: null,
    onend: null,
    onerror: null,
  };
}

function createUtterance(win: BrowserWindowLike | undefined, text: string): SpeechSynthesisUtteranceLike {
  if (win?.SpeechSynthesisUtterance) {
    return new win.SpeechSynthesisUtterance(text);
  }
  return createFallbackUtterance(text);
}

function resolveSpeechSupport(win: BrowserWindowLike | undefined): boolean {
  return Boolean(win?.speechSynthesis);
}

function resolveRecognitionCtor(win: BrowserWindowLike | undefined): BrowserSpeechRecognitionCtor | null {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null;
}

function resolveRecognitionSupport(win: BrowserWindowLike | undefined): boolean {
  return Boolean(resolveRecognitionCtor(win));
}

function isSecureForRecognition(win: BrowserWindowLike | undefined): boolean {
  if (!win) return false;
  if (win.isSecureContext) return true;
  return win.location?.hostname === "localhost";
}

function selectVoice(
  voices: SpeechSynthesisVoiceLike[],
  preferredVoiceNames: string[],
  preferredLanguage: string,
): SpeechSynthesisVoiceLike | null {
  if (!voices.length) {
    return null;
  }

  const lowerNames = preferredVoiceNames.map((name) => name.toLowerCase());
  const exact = voices.find((voice) => lowerNames.some((name) => voice.name.toLowerCase().includes(name)));
  if (exact) return exact;

  const lowerLang = preferredLanguage.toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(lowerLang))
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
    ?? voices[0]
    ?? null;
}

export function createVoiceIOController(options: UseVoiceIOOptions = {}): VoiceIOController {
  const environment = options.environment ?? createDefaultEnvironment();
  const preferredVoiceNames = options.preferredVoiceNames ?? DEFAULT_PREFERRED_VOICE_NAMES;
  const preferredLanguage = options.preferredLanguage ?? "en-GB";
  const recognitionLanguage = options.recognitionLanguage ?? "en-GB";
  const listeners = new Set<(snapshot: VoiceIOSnapshot) => void>();

  let recognition: BrowserSpeechRecognitionLike | null = null;
  let voiceUnlockPromise: Promise<void> | null = null;
  let voiceUnlockSettled = false;
  let currentUtterance: SpeechSynthesisUtteranceLike | null = null;
  let speakingFallbackTimer: number | null = null;
  let voicesChangedCleanup: (() => void) | null = null;
  let disposed = false;

  let snapshot: VoiceIOSnapshot = {
    availableVoices: [],
    isListening: false,
    isSpeaking: false,
    recognitionSupported: resolveRecognitionSupport(environment.getWindow()),
    speechSupported: resolveSpeechSupport(environment.getWindow()),
  };

  function setSnapshot(next: Partial<VoiceIOSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener(snapshot));
  }

  function clearSpeakingFallbackTimer(): void {
    const win = environment.getWindow();
    if (!win || speakingFallbackTimer === null) return;
    win.clearTimeout(speakingFallbackTimer);
    speakingFallbackTimer = null;
  }

  function resolveVoicesFromBrowser(): SpeechSynthesisVoiceLike[] {
    const win = environment.getWindow();
    if (!win?.speechSynthesis) return [];
    return win.speechSynthesis.getVoices();
  }

  async function preloadVoices(): Promise<SpeechSynthesisVoiceLike[]> {
    const win = environment.getWindow();
    const speech = win?.speechSynthesis;
    if (!speech) {
      setSnapshot({ speechSupported: false, availableVoices: [] });
      return [];
    }

    setSnapshot({ speechSupported: true });
    const immediateVoices = resolveVoicesFromBrowser();
    if (immediateVoices.length > 0) {
      setSnapshot({ availableVoices: immediateVoices });
      return immediateVoices;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved || disposed) return;
        resolved = true;
        const loadedVoices = resolveVoicesFromBrowser();
        setSnapshot({ availableVoices: loadedVoices });
        if (voicesChangedCleanup) {
          voicesChangedCleanup();
          voicesChangedCleanup = null;
        }
        resolve(loadedVoices);
      };

      const previous = speech.onvoiceschanged;
      speech.onvoiceschanged = () => {
        previous?.();
        finish();
      };
      voicesChangedCleanup = () => {
        speech.onvoiceschanged = previous ?? null;
      };

      const timeoutId = win.setTimeout(() => {
        finish();
      }, 700);

      const previousCleanup = voicesChangedCleanup;
      voicesChangedCleanup = () => {
        win.clearTimeout(timeoutId);
        previousCleanup?.();
      };
    });
  }

  async function unlockVoice(): Promise<void> {
    const win = environment.getWindow();
    const speech = win?.speechSynthesis;
    if (!speech) {
      setSnapshot({ speechSupported: false });
      return;
    }

    setSnapshot({ speechSupported: true });
    if (voiceUnlockSettled) {
      return;
    }
    if (voiceUnlockPromise) {
      return voiceUnlockPromise;
    }

    voiceUnlockPromise = new Promise((resolve) => {
      const utterance = createUtterance(win, ".");
      utterance.volume = 0.01;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        voiceUnlockSettled = true;
        speech.cancel();
        resolve();
      };

      utterance.onstart = finish;
      utterance.onend = finish;
      utterance.onerror = finish;
      speech.cancel();
      speech.resume();
      speech.speak(utterance);
      win.setTimeout(finish, 250);
    });

    await voiceUnlockPromise;
  }

  function stopSpeaking(): void {
    const win = environment.getWindow();
    clearSpeakingFallbackTimer();
    currentUtterance = null;
    if (win?.speechSynthesis) {
      win.speechSynthesis.cancel();
    }
    if (snapshot.isSpeaking) {
      setSnapshot({ isSpeaking: false });
      options.onSpeechEnd?.();
    }
  }

  async function speak(text: string): Promise<void> {
    const line = text.trim();
    if (!line) return;
    const win = environment.getWindow();
    const speech = win?.speechSynthesis;
    if (!speech) {
      setSnapshot({ speechSupported: false });
      return;
    }

    setSnapshot({ speechSupported: true });
    stopListening();
    stopSpeaking();
    await preloadVoices();

    const utterance = createUtterance(win, line);
    currentUtterance = utterance;
    utterance.lang = preferredLanguage;
    utterance.rate = 0.88;
    utterance.pitch = 1.1;
    utterance.volume = 1;
    utterance.voice = selectVoice(snapshot.availableVoices, preferredVoiceNames, preferredLanguage);

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled || disposed) return;
        settled = true;
        clearSpeakingFallbackTimer();
        if (snapshot.isSpeaking) {
          setSnapshot({ isSpeaking: false });
          options.onSpeechEnd?.();
        }
        if (currentUtterance === utterance) {
          currentUtterance = null;
        }
        resolve();
      };

      utterance.onstart = () => {
        if (!snapshot.isSpeaking) {
          setSnapshot({ isSpeaking: true });
          options.onSpeechStart?.();
        }
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      speakingFallbackTimer = win.setTimeout(finish, Math.min(10000, Math.max(2500, line.length * 80)));

      speech.resume();
      speech.speak(utterance);
    });
  }

  function stopListening(updateState = true): void {
    const win = environment.getWindow();
    if (!recognition) {
      if (updateState && snapshot.isListening) {
        setSnapshot({ isListening: false });
      }
      return;
    }

    const active = recognition;
    recognition = null;
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
    try {
      active.abort?.();
    } catch {
      try {
        active.stop();
      } catch {
        // no-op
      }
    }

    if (updateState && snapshot.isListening) {
      setSnapshot({ isListening: false });
      options.onRecognitionEnd?.();
    }

    win?.speechSynthesis?.resume();
  }

  async function startListening(): Promise<boolean> {
    const win = environment.getWindow();
    const recognitionCtor = resolveRecognitionCtor(win);
    const recognitionSupported = Boolean(recognitionCtor) && isSecureForRecognition(win);
    setSnapshot({
      recognitionSupported,
      speechSupported: resolveSpeechSupport(win),
    });

    if (!recognitionCtor || !isSecureForRecognition(win)) {
      stopListening(false);
      return false;
    }

    stopListening(false);
    stopSpeaking();

    const nextRecognition = new recognitionCtor();
    recognition = nextRecognition;
    nextRecognition.lang = recognitionLanguage;
    nextRecognition.interimResults = false;
    nextRecognition.continuous = false;
    nextRecognition.maxAlternatives = 1;

    nextRecognition.onresult = (event) => {
      options.onRecognitionResult?.(event);
    };

    nextRecognition.onerror = (event) => {
      if (recognition === nextRecognition) {
        recognition = null;
      }
      if (snapshot.isListening) {
        setSnapshot({ isListening: false });
      }
      options.onRecognitionError?.(event);
    };

    nextRecognition.onend = () => {
      if (recognition === nextRecognition) {
        recognition = null;
      }
      if (snapshot.isListening) {
        setSnapshot({ isListening: false });
        options.onRecognitionEnd?.();
      }
      win?.speechSynthesis?.resume();
    };

    try {
      nextRecognition.start();
      setSnapshot({ isListening: true });
      options.onRecognitionStart?.();
      return true;
    } catch {
      if (recognition === nextRecognition) {
        recognition = null;
      }
      setSnapshot({ isListening: false });
      return false;
    }
  }

  function dispose(): void {
    disposed = true;
    stopListening(false);
    stopSpeaking();
    if (voicesChangedCleanup) {
      voicesChangedCleanup();
      voicesChangedCleanup = null;
    }
    listeners.clear();
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    speak,
    stopSpeaking,
    startListening,
    stopListening: () => stopListening(true),
    unlockVoice,
    preloadVoices,
    dispose,
  };
}

export function useVoiceIO(options: UseVoiceIOOptions = {}) {
  const [controller] = useState(() => createVoiceIOController(options));
  const [snapshot, setSnapshot] = useState<VoiceIOSnapshot>(controller.getSnapshot());

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  const speak = useCallback((text: string) => controller.speak(text), [controller]);
  const stopSpeaking = useCallback(() => controller.stopSpeaking(), [controller]);
  const startListening = useCallback(() => controller.startListening(), [controller]);
  const stopListening = useCallback(() => controller.stopListening(), [controller]);
  const unlockVoice = useCallback(() => controller.unlockVoice(), [controller]);
  const preloadVoices = useCallback(() => controller.preloadVoices(), [controller]);

  return {
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    unlockVoice,
    preloadVoices,
    availableVoices: snapshot.availableVoices,
    isListening: snapshot.isListening,
    isSpeaking: snapshot.isSpeaking,
    recognitionSupported: snapshot.recognitionSupported,
    speechSupported: snapshot.speechSupported,
  };
}
