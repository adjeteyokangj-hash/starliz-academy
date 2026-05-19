type RefreshResult = {
  ok: boolean;
  status: number;
};

let refreshInFlight: Promise<RefreshResult> | null = null;

async function executeRefreshOnce(): Promise<RefreshResult> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
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

export async function fetchWithRefreshRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const first = await fetch(input, init);
  if (first.status !== 401) {
    return first;
  }

  const refreshResult = await refreshAuthSession({ retryOnce: true });
  if (!refreshResult.ok) {
    return first;
  }

  return fetch(input, init);
}
