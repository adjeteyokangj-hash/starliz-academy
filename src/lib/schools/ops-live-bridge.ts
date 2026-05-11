export type OpsLiveTransport = "websocket" | "sse" | "polling";

export type OpsLiveSnapshot = {
  escalationQueueCount: number;
  unresolvedSafeguarding: number;
  communicationFailures24h: number;
  suspensionEvents24h: number;
  teacherInactivitySchools: number;
  authAnomalySignals: number;
};

export type OpsLiveEnvelope = {
  generatedAt: string;
  snapshot: OpsLiveSnapshot;
};

type BridgeOptions = {
  websocketUrl?: string;
  sseUrl: string;
  pollingUrl: string;
  pollingIntervalMs?: number;
  onUpdate: (input: { transport: OpsLiveTransport; envelope: OpsLiveEnvelope }) => void;
  onStatus?: (input: { transport: OpsLiveTransport; state: "connecting" | "connected" | "error"; error?: string }) => void;
};

export function startOpsLiveBridge(options: BridgeOptions): () => void {
  const order: OpsLiveTransport[] = options.websocketUrl ? ["websocket", "sse", "polling"] : ["sse", "polling"];
  const pollingIntervalMs = Math.max(5000, options.pollingIntervalMs ?? 15000);
  let stopped = false;

  let websocket: WebSocket | null = null;
  let eventSource: EventSource | null = null;
  let pollingTimer: number | null = null;
  let activeAbort: AbortController | null = null;

  function teardown() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    if (websocket) {
      websocket.close();
      websocket = null;
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
        const payload = (await response.json()) as OpsLiveEnvelope;
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
        const payload = JSON.parse(event.data) as OpsLiveEnvelope;
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

  function startWebSocket() {
    if (stopped || !options.websocketUrl) return;
    options.onStatus?.({ transport: "websocket", state: "connecting" });

    try {
      websocket = new WebSocket(options.websocketUrl);
    } catch (error) {
      options.onStatus?.({
        transport: "websocket",
        state: "error",
        error: error instanceof Error ? error.message : "WebSocket connection failed",
      });
      startSse();
      return;
    }

    websocket.onopen = () => {
      options.onStatus?.({ transport: "websocket", state: "connected" });
    };

    websocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as OpsLiveEnvelope;
        options.onUpdate({ transport: "websocket", envelope: payload });
      } catch (error) {
        options.onStatus?.({
          transport: "websocket",
          state: "error",
          error: error instanceof Error ? error.message : "Invalid WebSocket payload",
        });
      }
    };

    websocket.onerror = () => {
      options.onStatus?.({ transport: "websocket", state: "error", error: "WebSocket stream closed" });
    };

    websocket.onclose = () => {
      if (stopped) return;
      if (websocket) {
        websocket.close();
        websocket = null;
      }
      startSse();
    };
  }

  switch (order[0]) {
    case "websocket":
      startWebSocket();
      break;
    case "sse":
      startSse();
      break;
    default:
      void startPolling();
      break;
  }

  return () => {
    stopped = true;
    teardown();
  };
}
