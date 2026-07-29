/** Allowed scopes for StarLiz outbound API keys. */
export const API_SCOPES = ["api:read", "api:write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}

/** Parse scopesJson (JSON array string) into validated ApiScope[]. */
export function parseScopesJson(raw: string | null | undefined): ApiScope[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isApiScope);
  } catch {
    return [];
  }
}

/** Validate and normalise a scopes input array. Throws on invalid scopes. */
export function validateScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) {
    throw new Error("Scopes must be an array.");
  }
  const unique = new Set<ApiScope>();
  for (const item of input) {
    if (!isApiScope(item)) {
      throw new Error(`Invalid scope: ${String(item)}. Allowed: ${API_SCOPES.join(", ")}`);
    }
    unique.add(item);
  }
  if (unique.size === 0) {
    throw new Error("At least one scope is required.");
  }
  return API_SCOPES.filter((s) => unique.has(s));
}

export function scopesToJson(scopes: ApiScope[]): string {
  return JSON.stringify(scopes);
}

/** Returns true if the key's scopes include every required scope. */
export function hasRequiredScopes(granted: readonly string[], required: readonly string[]): boolean {
  const set = new Set(granted);
  return required.every((s) => set.has(s));
}
