export type RecoveryGovernanceLiveEventType =
  | "run_status_change"
  | "execution_progress"
  | "retry"
  | "rollback"
  | "guardrail_failure";

export type RecoveryGovernanceLiveEvent = {
  eventType: RecoveryGovernanceLiveEventType;
  runId: string;
  schoolId: string;
  action: string;
  createdAt: string;
  status: string;
  progressPercent: number;
  lastExecutionError: string | null;
};

export type RecoveryGovernanceLiveEnvelope = {
  generatedAt: string;
  events: RecoveryGovernanceLiveEvent[];
};

export type RecoveryGovernanceTransport = "sse" | "polling";

type BridgeOptions = {
  sseUrl: string;
  pollingUrl: string;
  pollingIntervalMs?: number;
  onUpdate: (input: { transport: RecoveryGovernanceTransport; envelope: RecoveryGovernanceLiveEnvelope }) => void;
  onStatus?: (input: { transport: RecoveryGovernanceTransport; state: "connecting" | "connected" | "error"; error?: string }) => void;
};

export function startRecoveryGovernanceLiveBridge(options: BridgeOptions): () => void {
  const pollingIntervalMs = Math.max(5000, options.pollingIntervalMs ?? 15000);
  let stopped = false;
  let eventSource: EventSource | null = null;
  let pollingTimer: number | null = null;
  let activeAbort: AbortController | null = null;

  function teardown() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (pollingTimer !== null) {
      window.clearTimeout(pollingTimer);
      pollingTimer = null;
    }
  }

  async function startPolling() {
    if (stopped) return;
    options.onStatus?.({ transport: "polling", state: "connecting" });

    const tick = async () => {
      if (stopped) return;
      try {
        activeAbort = new AbortController();
        const response = await fetch(options.pollingUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: activeAbort.signal,
        });
        if (!response.ok) {
          throw new Error(`Polling failed (${response.status})`);
        }
        const payload = (await response.json()) as RecoveryGovernanceLiveEnvelope;
        options.onUpdate({ transport: "polling", envelope: payload });
        options.onStatus?.({ transport: "polling", state: "connected" });
      } catch (error) {
        options.onStatus?.({
          transport: "polling",
          state: "error",
          error: error instanceof Error ? error.message : "Polling failed",
        });
      } finally {
        if (!stopped) {
          pollingTimer = window.setTimeout(() => void tick(), pollingIntervalMs);
        }
      }
    };

    await tick();
  }

  function startSse() {
    if (stopped) return;
    options.onStatus?.({ transport: "sse", state: "connecting" });

    eventSource = new EventSource(options.sseUrl, { withCredentials: true });

    eventSource.onopen = () => {
      options.onStatus?.({ transport: "sse", state: "connected" });
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as RecoveryGovernanceLiveEnvelope;
        options.onUpdate({ transport: "sse", envelope: payload });
      } catch (error) {
        options.onStatus?.({
          transport: "sse",
          state: "error",
          error: error instanceof Error ? error.message : "Invalid SSE payload",
        });
      }
    };

    eventSource.onerror = () => {
      options.onStatus?.({ transport: "sse", state: "error", error: "SSE stream closed" });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      void startPolling();
    };
  }

  startSse();

  return () => {
    stopped = true;
    teardown();
  };
}
