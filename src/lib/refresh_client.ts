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

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

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
  const signal = init?.signal ?? undefined;
  throwIfAborted(signal);
  const first = await fetch(input, init);
  if (first.status !== 401) {
    return first;
  }

  const refreshResult = await raceWithAbort(
    refreshAuthSession({ retryOnce: true }),
    signal,
  );
  if (!refreshResult.ok) {
    return first;
  }

  throwIfAborted(signal);
  return fetch(input, init);
}
