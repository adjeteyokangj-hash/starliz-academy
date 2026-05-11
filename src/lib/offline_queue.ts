import { ProgressEventPayload } from "@/lib/server_sync";

const KEY = "starliz.offlineQueue";

export type QueueStatus = "pending" | "sent" | "failed";

export type QueuedEvent = {
  id: string;
  childId: string;
  payload: ProgressEventPayload;
  status: QueueStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  error: string | null;
};

type ReplaySummary = {
  attempted: number;
  sent: number;
  failed: number;
};

function readQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedEvent[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-800)));
}

async function sendQueuedEvent(entry: QueuedEvent): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/progress/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry.payload),
    credentials: "include",
  });

  if (response.ok) {
    return { ok: true };
  }

  let error = `sync-failed-${response.status}`;
  try {
    const body = await response.json() as { error?: string };
    error = body.error ?? error;
  } catch {
    // Leave fallback error intact.
  }
  return { ok: false, error };
}

export function queueOfflineEvent(payload: ProgressEventPayload): void {
  const queue = readQueue();
  queue.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    childId: payload.childId,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    syncedAt: null,
    error: null,
  });
  writeQueue(queue);
}

export function getOfflineQueueCount(): number {
  return readQueue().filter((item) => item.status === "pending" || item.status === "failed").length;
}

export function clearOfflineQueue(): void {
  writeQueue([]);
}

export function getOfflineQueueSnapshot(): { pending: number; sent: number; failed: number; total: number } {
  const queue = readQueue();
  const pending = queue.filter((item) => item.status === "pending").length;
  const sent = queue.filter((item) => item.status === "sent").length;
  const failed = queue.filter((item) => item.status === "failed").length;
  return { pending, sent, failed, total: queue.length };
}

export async function replayOfflineQueue(
  transport?: (entry: QueuedEvent) => Promise<{ ok: boolean; error?: string }>
): Promise<ReplaySummary> {
  const queue = readQueue();
  const summary: ReplaySummary = { attempted: 0, sent: 0, failed: 0 };
  if (!queue.length) return summary;

  const sender = transport ?? sendQueuedEvent;
  const nextQueue: QueuedEvent[] = [];

  for (const entry of queue) {
    if (entry.status === "sent") {
      nextQueue.push(entry);
      continue;
    }

    summary.attempted += 1;
    const now = new Date().toISOString();
    try {
      const result = await sender(entry);
      if (result.ok) {
        nextQueue.push({
          ...entry,
          status: "sent",
          attempts: entry.attempts + 1,
          lastAttemptAt: now,
          syncedAt: now,
          error: null,
        });
        summary.sent += 1;
      } else {
        nextQueue.push({
          ...entry,
          status: "failed",
          attempts: entry.attempts + 1,
          lastAttemptAt: now,
          error: result.error ?? "sync-failed",
        });
        summary.failed += 1;
      }
    } catch (error) {
      nextQueue.push({
        ...entry,
        status: "failed",
        attempts: entry.attempts + 1,
        lastAttemptAt: now,
        error: error instanceof Error ? error.message : "sync-error",
      });
      summary.failed += 1;
    }
  }

  writeQueue(nextQueue);
  return summary;
}
