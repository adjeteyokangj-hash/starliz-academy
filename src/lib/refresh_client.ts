type RefreshResult = {
  ok: boolean;
  status: number;
};

let refreshInFlight: Promise<RefreshResult> | null = null;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function initWithoutAbortedSignal(init?: RequestInit): RequestInit | undefined {
  if (!init?.signal?.aborted) {
    return init;
  }
  const rest = { ...init };
  delete rest.signal;
  return rest;
}

async function executeRefreshOnce(): Promise<RefreshResult> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function refreshAuthSession(options?: { retryOnce?: boolean }): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = executeRefreshOnce().finally(() => {
      refreshInFlight = null;
    });
  }

  const first = await refreshInFlight;
  if (first.ok || options?.retryOnce === false) {
    return first;
  }

  if (first.status === 401 || first.status === 503 || first.status === 0) {
    return executeRefreshOnce();
  }

  return first;
}

export function shouldRefreshAfter401(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return true;
  }

  const record = payload as { valid?: unknown; error?: unknown; code?: unknown };
  if (record.valid === false) return false;
  if (record.code === "invalid_pin" || record.code === "pin_setup_required") return false;

  if (typeof record.error === "string") {
    const error = record.error.toLowerCase();
    if (
      error === "unauthorized"
      || error === "session expired"
      || error.includes("refresh token")
    ) {
      return true;
    }
    return false;
  }

  return true;
}

export async function fetchWithRefreshRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? undefined;
  throwIfAborted(signal);
  const first = await fetch(input, init);
  if (first.status !== 401) {
    return first;
  }

  const payload = await first.clone().json().catch(() => null);
  if (!shouldRefreshAfter401(payload)) {
    return first;
  }

  const refreshResult = await refreshAuthSession({ retryOnce: true });
  if (!refreshResult.ok) {
    return first;
  }

  return fetch(input, initWithoutAbortedSignal(init));
}
