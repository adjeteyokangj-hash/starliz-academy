import { fetchWithRefreshRetry, refreshAuthSession } from "./refresh_client";

export function isRetryablePinNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

export async function fetchPinRequest(input: string, init?: RequestInit): Promise<Response> {
  const run = (requestInit?: RequestInit) => fetchWithRefreshRetry(input, requestInit);

  try {
    return await run(init);
  } catch (error) {
    if (!isRetryablePinNetworkError(error)) {
      throw error;
    }
    await refreshAuthSession({ retryOnce: true });
    const retryInit = init ? { ...init } : {};
    delete retryInit.signal;
    return run(retryInit);
  }
}

export async function postParentPinVerify(pin: string): Promise<Response> {
  return fetchPinRequest("/api/pin/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ pin }),
  });
}
