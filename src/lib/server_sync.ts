import { queueOfflineEvent } from "@/lib/offline_queue";

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
    const response = await fetch("/api/progress/event", {
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

export async function syncAttemptToServer(payload: AttemptPayload): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!response.ok && process.env.NODE_ENV !== "production") {
      console.error("Attempt submission failed", await response.text());
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Attempt submission failed", error);
    }
  }
}
