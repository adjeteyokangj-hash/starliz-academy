import test from "node:test";
import assert from "node:assert/strict";

import {
  createVoiceIOController,
  type SpeechSynthesisVoiceLike,
} from "@/hooks/useVoiceIO";

type MockRecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>>;
};

type MockRecognitionErrorEvent = {
  error?: string;
};

type MockSpeechUtterance = {
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

type MockRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: MockRecognitionResultEvent) => void) | null;
  onerror: ((event: MockRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
  triggerResult: (transcript: string) => void;
  triggerError: (error: string) => void;
  triggerEnd: () => void;
};

type MockWindowConfig = {
  hasSpeech?: boolean;
  hasRecognition?: boolean;
  secure?: boolean;
  voices?: SpeechSynthesisVoiceLike[];
  immediateTimers?: boolean;
};

type MockWindow = {
  speechSynthesis?: {
    onvoiceschanged: (() => void) | null;
    getVoices: () => SpeechSynthesisVoiceLike[];
    speak: (utterance: MockSpeechUtterance) => void;
    cancel: () => void;
    resume: () => void;
    speakCalls: number;
    cancelCalls: number;
    resumeCalls: number;
  };
  SpeechSynthesisUtterance?: new (text: string) => MockSpeechUtterance;
  SpeechRecognition?: new () => MockRecognition;
  webkitSpeechRecognition?: new () => MockRecognition;
  isSecureContext?: boolean;
  location?: {
    hostname?: string;
  };
  setTimeout: (handler: () => void, timeout?: number) => number;
  clearTimeout: (_id: number) => void;
  latestRecognition: MockRecognition | null;
};

function createMockRecognition(): MockRecognition {
  const recognition: MockRecognition = {
    lang: "",
    interimResults: false,
    continuous: false,
    maxAlternatives: 1,
    onresult: null,
    onerror: null,
    onend: null,
    start: () => {
      // no-op
    },
    stop: () => {
      // no-op
    },
    abort: () => {
      // no-op
    },
    triggerResult: (transcript: string) => {
      recognition.onresult?.({
        results: [[{ transcript }]],
      });
    },
    triggerError: (error: string) => {
      recognition.onerror?.({ error });
    },
    triggerEnd: () => {
      recognition.onend?.();
    },
  };
  return recognition;
}

function createMockWindow(config: MockWindowConfig): MockWindow {
  const voices = config.voices ?? [];
  const immediateTimers = config.immediateTimers ?? true;
  const win: MockWindow = {
    isSecureContext: config.secure ?? true,
    location: { hostname: "localhost" },
    setTimeout(handler) {
      if (immediateTimers) {
        handler();
      }
      return 1;
    },
    clearTimeout() {
      // no-op
    },
    latestRecognition: null,
  };

  if (config.hasSpeech !== false) {
    win.SpeechSynthesisUtterance = class {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    };

    win.speechSynthesis = {
      onvoiceschanged: null,
      getVoices: () => voices,
      speakCalls: 0,
      cancelCalls: 0,
      resumeCalls: 0,
      speak: (utterance: MockSpeechUtterance) => {
        win.speechSynthesis!.speakCalls += 1;
        utterance.onstart?.();
        utterance.onend?.();
      },
      cancel: () => {
        win.speechSynthesis!.cancelCalls += 1;
      },
      resume: () => {
        win.speechSynthesis!.resumeCalls += 1;
      },
    };
  }

  if (config.hasRecognition !== false) {
    const RecognitionCtor = function MockSpeechRecognition(this: object) {
      const recognition = createMockRecognition();
      win.latestRecognition = recognition;
      return recognition;
    } as unknown as new () => MockRecognition;
    win.SpeechRecognition = RecognitionCtor;
  }

  return win;
}

test("unsupported browser fallback: speech and recognition stay unavailable safely", async () => {
  const controller = createVoiceIOController({
    environment: {
      getWindow: () => undefined,
    },
  });

  const unlockResult = controller.unlockVoice();
  const preloadResult = controller.preloadVoices();
  const listenResult = controller.startListening();

  await unlockResult;
  const voices = await preloadResult;
  const listening = await listenResult;

  assert.deepEqual(voices, []);
  assert.equal(listening, false);
  assert.equal(controller.getSnapshot().speechSupported, false);
  assert.equal(controller.getSnapshot().recognitionSupported, false);
  controller.dispose();
});

test("recognition state transitions fire callbacks and update snapshot", async () => {
  const win = createMockWindow({ hasSpeech: true, hasRecognition: true, secure: true });
  let started = 0;
  let ended = 0;
  let results = 0;

  const controller = createVoiceIOController({
    environment: {
      getWindow: () => win,
    },
    onRecognitionStart: () => {
      started += 1;
    },
    onRecognitionResult: () => {
      results += 1;
    },
    onRecognitionEnd: () => {
      ended += 1;
    },
  });

  const ok = await controller.startListening();
  assert.equal(ok, true);
  assert.equal(controller.getSnapshot().isListening, true);

  win.latestRecognition?.triggerResult("hello");
  assert.equal(results, 1);

  win.latestRecognition?.triggerEnd();
  assert.equal(controller.getSnapshot().isListening, false);
  assert.equal(started, 1);
  assert.equal(ended, 1);
  controller.dispose();
});

test("speech state transitions fire callbacks and stopSpeaking resets state", async () => {
  const win = createMockWindow({
    hasSpeech: true,
    hasRecognition: false,
    voices: [{ name: "Google UK English Female", lang: "en-GB" }],
    immediateTimers: false,
  });
  let speechStart = 0;
  let speechEnd = 0;

  const controller = createVoiceIOController({
    environment: {
      getWindow: () => win,
    },
    onSpeechStart: () => {
      speechStart += 1;
    },
    onSpeechEnd: () => {
      speechEnd += 1;
    },
  });

  await controller.speak("Hello there");
  assert.equal(speechStart, 1);
  assert.equal(speechEnd, 1);
  assert.equal(controller.getSnapshot().isSpeaking, false);

  controller.stopSpeaking();
  assert.equal(controller.getSnapshot().isSpeaking, false);
  assert.ok((win.speechSynthesis?.cancelCalls ?? 0) >= 1);
  controller.dispose();
});

test("cleanup behaviour: dispose stops recognition and speech", async () => {
  const win = createMockWindow({
    hasSpeech: true,
    hasRecognition: true,
    voices: [{ name: "Google UK English Female", lang: "en-GB" }],
  });

  const controller = createVoiceIOController({
    environment: {
      getWindow: () => win,
    },
  });

  await controller.startListening();
  await controller.speak("Cleanup test");
  controller.dispose();

  assert.equal(controller.getSnapshot().isListening, false);
  assert.equal(controller.getSnapshot().isSpeaking, false);
  assert.ok((win.speechSynthesis?.cancelCalls ?? 0) >= 1);
});

test("overlapping recognition prevention: second start replaces prior recognizer", async () => {
  const win = createMockWindow({ hasSpeech: true, hasRecognition: true, secure: true });
  const controller = createVoiceIOController({
    environment: {
      getWindow: () => win,
    },
  });

  const first = await controller.startListening();
  assert.equal(first, true);
  const firstRecognition = win.latestRecognition;

  const second = await controller.startListening();
  assert.equal(second, true);
  const secondRecognition = win.latestRecognition;

  assert.notEqual(firstRecognition, secondRecognition);

  // Ending the old recognition should not flip the currently active listener state.
  firstRecognition?.triggerEnd();
  assert.equal(controller.getSnapshot().isListening, true);

  secondRecognition?.triggerEnd();
  assert.equal(controller.getSnapshot().isListening, false);
  controller.dispose();
});
