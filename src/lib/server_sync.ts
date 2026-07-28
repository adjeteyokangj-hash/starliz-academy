import { queueOfflineEvent } from "@/lib/offline_queue";
import { fetchWithRefreshRetry } from "@/lib/refresh_client";

const ATTEMPT_QUEUE_KEY = "starliz.offlineAttemptQueue";
let attemptSyncUnauthorized = false;

type QueuedAttempt = {
  id: string;
  queuedAt: string;
  reason: "network" | "server" | "unauthorized" | "paused";
  payload: AttemptPayload;
};

function readOfflineAttemptQueue(): QueuedAttempt[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(ATTEMPT_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedAttempt[];
  } catch {
    return [];
  }
}

function writeOfflineAttemptQueue(queue: QueuedAttempt[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ATTEMPT_QUEUE_KEY, JSON.stringify(queue.slice(-500)));
}

function queueOfflineAttempt(payload: AttemptPayload, reason: QueuedAttempt["reason"]): void {
  if (typeof window === "undefined") return;
  const queue = readOfflineAttemptQueue();
  queue.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    queuedAt: new Date().toISOString(),
    reason,
    payload,
  });
  writeOfflineAttemptQueue(queue);
}

export type ProgressEventPayload = {
  childId: string;
  activityType: string;
  activityName: string;
  starsEarned: number;
  xpEarned: number;
  coinsEarned: number;
  score: number;
  correct: boolean;
  difficulty: number;
  notes?: string;
  accuracy: number;
  completed: boolean;
  questionId?: string;
  answeredCorrectly?: boolean;
};

export async function syncProgressEventToServer(payload: ProgressEventPayload): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const response = await fetchWithRefreshRetry("/api/progress/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });

    if (!response.ok) {
      queueOfflineEvent(payload);
    }
  } catch {
    queueOfflineEvent(payload);
  }
}

export type AttemptPayload = {
  studentId: string;
  subject: "spelling" | "math" | "reading";
  spellingMode?: string;
  keyStage?: string;
  yearGroup?: string;
  skillFocus: string;
  contentId?: string;
  assignmentId?: string;
  questionText?: string;
  answerGiven?: string;
  correctAnswer?: string;
  correct: boolean;
  responseTimeMs: number;
  hintsUsed: number;
  difficulty: number;
  skills?: string; // comma-separated skill codes
  pronunciationAttempted?: boolean;
  pronunciationPassed?: boolean;
  spokenText?: string;
  targetText?: string;
  errorType?: string;
};

export type AttemptSyncResult = {
  ok: boolean;
  status: "synced" | "network_queued" | "server_queued" | "unauthorized" | "unauthorized_paused";
};

export async function syncAttemptToServer(payload: AttemptPayload): Promise<AttemptSyncResult> {
  if (typeof window === "undefined") {
    return { ok: false, status: "network_queued" };
  }

  if (attemptSyncUnauthorized) {
    // Soft pause only briefly — keep-alive may restore the session.
    attemptSyncUnauthorized = false;
  }

  try {
    const response = await fetchWithRefreshRetry("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });

    if (response.ok) {
      attemptSyncUnauthorized = false;
      return { ok: true, status: "synced" };
    }

    if (response.status === 401 || response.status === 403) {
      attemptSyncUnauthorized = true;
      queueOfflineAttempt(payload, "unauthorized");
      return { ok: false, status: "unauthorized" };
    }

    queueOfflineAttempt(payload, "server");
    if (process.env.NODE_ENV !== "production") {
      console.warn("Attempt submission queued", response.status);
    }
    return { ok: false, status: "server_queued" };
  } catch {
    queueOfflineAttempt(payload, "network");
    return { ok: false, status: "network_queued" };
  }
}
