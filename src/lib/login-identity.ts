/**
 * Login identifier helpers for parent email and student username authentication.
 * Synthetic child emails stay internal; children authenticate with username.
 */

export type LoginIdentifierKind = "email" | "username";

export type NormalizedLoginIdentifier = {
  kind: LoginIdentifierKind;
  value: string;
};

const EMAIL_MARKER = "@";

/** Username: 3–32 chars, lowercase letters/digits/._- after normalization. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const LOGIN_INVALID_CREDENTIALS_ERROR = "Invalid email, username, or password.";

/**
 * Classify and normalize a login identifier.
 * Any value containing "@" is treated as an email (case-insensitive).
 * Otherwise it is a username (trimmed, lowercased). Empty after trim returns null.
 */
export function normalizeLoginIdentifier(raw: string): NormalizedLoginIdentifier | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.includes(EMAIL_MARKER)) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }

  return { kind: "username", value: trimmed.toLowerCase() };
}

export function isNormalizedUsernameValid(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export type LoginUserRecord = {
  id: string;
  email: string;
  username: string | null;
  passwordHash: string;
  name: string | null;
  role: string;
};

export type FindLoginUserDeps = {
  findByEmail: (email: string) => Promise<LoginUserRecord | null>;
  findByUsername: (username: string) => Promise<LoginUserRecord | null>;
};

/**
 * Resolve the user for login. Unknown email/username both return null so callers
 * can emit the same invalid-credentials response (no account enumeration).
 */
export async function findUserForLoginIdentifier(
  rawIdentifier: string,
  deps: FindLoginUserDeps,
): Promise<LoginUserRecord | null> {
  const normalized = normalizeLoginIdentifier(rawIdentifier);
  if (!normalized) return null;

  if (normalized.kind === "email") {
    return deps.findByEmail(normalized.value);
  }

  if (!isNormalizedUsernameValid(normalized.value)) {
    return null;
  }

  return deps.findByUsername(normalized.value);
}
