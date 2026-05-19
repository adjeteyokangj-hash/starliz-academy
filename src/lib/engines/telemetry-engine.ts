/**
 * engines/telemetry-engine.ts
 *
 * Passive runtime telemetry foundation.
 * Owns: typed event contracts, in-memory emission pipeline, offline-safe queueing.
 *
 * Architecture layer: Tutor Runtime Engine -> Telemetry Engine
 * No React, no persistence, no network, no database access.
 */

export type TelemetryCategory =
  | "lifecycle"
  | "warmup"
  | "question"
  | "speech"
  | "review"
  | "mastery"
  | "intervention"
  | "voice"
  | "runtime_error";

export type TutorTelemetryEventName =
  | "SESSION_CREATED"
  | "SESSION_STARTED"
  | "SESSION_COMPLETED"
  | "WARMUP_STARTED"
  | "WARMUP_COMPLETED"
  | "QUESTION_PRESENTED"
  | "QUESTION_ANSWERED"
  | "QUESTION_RESOLVED"
  | "SPEECH_LISTEN_STARTED"
  | "SPEECH_RESULT_RECEIVED"
  | "SPEECH_LISTEN_FAILED"
  | "REVIEW_STARTED"
  | "REVIEW_COMPLETED"
  | "MASTERY_EVALUATED"
  | "INTERVENTION_TRIGGERED"
  | "INTERVENTION_STARTED"
  | "VOICE_SPEAK_STARTED"
  | "VOICE_SPEAK_ENDED"
  | "RUNTIME_ERROR_RECORDED";

export type HesitationPattern = {
  classification: "none" | "mild" | "moderate" | "high";
  firstResponseMs: number;
  repeatedPromptCount: number;
  speechRetries: number;
  questionIndex?: number;
  skillCode?: string;
};

export type SkillSignalSummary = {
  skillCode: string;
  attempts: number;
  correct: number;
  incorrect: number;
  averageHesitationMs: number;
  hesitationPattern?: HesitationPattern;
};

export type SessionTelemetrySummary = {
  sessionId: string;
  totalEvents: number;
  startedAt: number | null;
  endedAt: number | null;
  categoryCounts: Partial<Record<TelemetryCategory, number>>;
  skillSignals: SkillSignalSummary[];
};

export type TelemetryEvent = {
  id: string;
  fingerprint: string;
  category: TelemetryCategory;
  name: TutorTelemetryEventName;
  sessionId: string;
  assignmentId?: string;
  childId?: string;
  questionIndex?: number;
  skillCode?: string;
  source: "tutor-runtime" | "voice-runtime" | "lesson-runtime" | "telemetry-runtime";
  payload?: Record<string, unknown>;
  timestamp: number;
};

export type TelemetryEventInput = Omit<TelemetryEvent, "id" | "fingerprint" | "timestamp"> & {
  dedupeKey?: string;
  timestamp?: number | string | Date;
};

export type TelemetryEmitResult =
  | {
      ok: true;
      event: TelemetryEvent;
      queueSize: number;
      droppedOldest: number;
    }
  | {
      ok: false;
      reason: string;
      queueSize: number;
    };

export type TelemetryBatchResult = {
  accepted: TelemetryEvent[];
  rejected: number;
  droppedOldest: number;
  queueSize: number;
};

const MAX_TELEMETRY_QUEUE_SIZE = 500;

const CATEGORY_BY_EVENT: Record<TutorTelemetryEventName, TelemetryCategory> = {
  SESSION_CREATED: "lifecycle",
  SESSION_STARTED: "lifecycle",
  SESSION_COMPLETED: "lifecycle",
  WARMUP_STARTED: "warmup",
  WARMUP_COMPLETED: "warmup",
  QUESTION_PRESENTED: "question",
  QUESTION_ANSWERED: "question",
  QUESTION_RESOLVED: "question",
  SPEECH_LISTEN_STARTED: "speech",
  SPEECH_RESULT_RECEIVED: "speech",
  SPEECH_LISTEN_FAILED: "speech",
  REVIEW_STARTED: "review",
  REVIEW_COMPLETED: "review",
  MASTERY_EVALUATED: "mastery",
  INTERVENTION_TRIGGERED: "intervention",
  INTERVENTION_STARTED: "intervention",
  VOICE_SPEAK_STARTED: "voice",
  VOICE_SPEAK_ENDED: "voice",
  RUNTIME_ERROR_RECORDED: "runtime_error",
};

let telemetryQueue: TelemetryEvent[] = [];
const queuedFingerprints = new Set<string>();

function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === "development";
}

function debugTrace(message: string, payload: unknown): void {
  if (!isDevelopmentMode()) {
    return;
  }

  console.debug(`[telemetry] ${message}`, payload);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimestamp(input?: number | string | Date): number {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.floor(input);
  }

  if (typeof input === "string") {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  if (input instanceof Date) {
    const parsed = input.getTime();
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return Date.now();
}

function createFingerprint(input: TelemetryEventInput, timestamp: number): string {
  const payloadKey = input.payload ? JSON.stringify(input.payload) : "";
  const dedupeKey = input.dedupeKey?.trim();
  if (dedupeKey) {
    return `${input.sessionId}:${dedupeKey}`;
  }

  return [
    input.category,
    input.name,
    input.sessionId,
    input.assignmentId ?? "",
    input.childId ?? "",
    input.questionIndex ?? "",
    input.skillCode ?? "",
    timestamp,
    payloadKey,
  ].join("|");
}

function createEventId(fingerprint: string): string {
  const compact = fingerprint.replace(/[^a-zA-Z0-9|:_-]/g, "");
  return `telemetry:${compact}`;
}

function validateTelemetryInput(input: TelemetryEventInput): string | null {
  if (!input || typeof input !== "object") {
    return "Telemetry input must be an object.";
  }

  if (!input.sessionId || !input.sessionId.trim()) {
    return "Telemetry event requires a sessionId.";
  }

  if (CATEGORY_BY_EVENT[input.name] !== input.category) {
    return `Telemetry category ${input.category} does not match event ${input.name}.`;
  }

  if (input.payload !== undefined && !isPlainRecord(input.payload)) {
    return "Telemetry payload must be a plain object when provided.";
  }

  if (input.questionIndex !== undefined && (!Number.isInteger(input.questionIndex) || input.questionIndex < 0)) {
    return "Telemetry questionIndex must be a non-negative integer.";
  }

  return null;
}

export function createTelemetryEvent(input: TelemetryEventInput): TelemetryEvent | null {
  const validationError = validateTelemetryInput(input);
  if (validationError) {
    debugTrace("reject:create", { reason: validationError, input });
    return null;
  }

  const timestamp = normalizeTimestamp(input.timestamp);
  const fingerprint = createFingerprint(input, timestamp);

  return {
    ...input,
    id: createEventId(fingerprint),
    fingerprint,
    payload: input.payload ? { ...input.payload } : undefined,
    timestamp,
  };
}

function enqueueTelemetryEvent(event: TelemetryEvent): TelemetryEmitResult {
  if (queuedFingerprints.has(event.fingerprint)) {
    debugTrace("reject:duplicate", { fingerprint: event.fingerprint, event });
    return {
      ok: false,
      reason: "Duplicate telemetry event rejected.",
      queueSize: telemetryQueue.length,
    };
  }

  let droppedOldest = 0;
  while (telemetryQueue.length >= MAX_TELEMETRY_QUEUE_SIZE) {
    const shifted = telemetryQueue.shift();
    if (!shifted) {
      break;
    }
    queuedFingerprints.delete(shifted.fingerprint);
    droppedOldest += 1;
  }

  telemetryQueue.push(event);
  queuedFingerprints.add(event.fingerprint);
  debugTrace("enqueue", { event, queueSize: telemetryQueue.length, droppedOldest });
  return {
    ok: true,
    event,
    queueSize: telemetryQueue.length,
    droppedOldest,
  };
}

export function queueOfflineTelemetry(input: TelemetryEvent | TelemetryEventInput): TelemetryEmitResult {
  if (!("fingerprint" in input)) {
    const validationError = validateTelemetryInput(input);
    if (validationError) {
      return {
        ok: false,
        reason: validationError,
        queueSize: telemetryQueue.length,
      };
    }
  }

  const event = "fingerprint" in input ? input : createTelemetryEvent(input);
  if (!event) {
    return {
      ok: false,
      reason: "Malformed telemetry event rejected.",
      queueSize: telemetryQueue.length,
    };
  }

  return enqueueTelemetryEvent(event);
}

export function emitTelemetryEvent(input: TelemetryEvent | TelemetryEventInput): TelemetryEmitResult {
  return queueOfflineTelemetry(input);
}

export function emitTelemetryBatch(inputs: Array<TelemetryEvent | TelemetryEventInput>): TelemetryBatchResult {
  const accepted: TelemetryEvent[] = [];
  let rejected = 0;
  let droppedOldest = 0;

  for (const input of inputs) {
    const result = emitTelemetryEvent(input);
    if (result.ok) {
      accepted.push(result.event);
      droppedOldest += result.droppedOldest;
    } else {
      rejected += 1;
    }
  }

  return {
    accepted,
    rejected,
    droppedOldest,
    queueSize: telemetryQueue.length,
  };
}

export function flushTelemetryQueue(limit = telemetryQueue.length): TelemetryEvent[] {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  const flushed = telemetryQueue.splice(0, limit);
  for (const event of flushed) {
    queuedFingerprints.delete(event.fingerprint);
  }
  debugTrace("flush", { count: flushed.length, remaining: telemetryQueue.length });
  return flushed;
}

export function __resetTelemetryQueueForTests(): void {
  telemetryQueue = [];
  queuedFingerprints.clear();
}

export function __getTelemetryQueueSnapshotForTests(): TelemetryEvent[] {
  return [...telemetryQueue];
}
