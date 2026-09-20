import { randomBytes, randomInt } from "crypto";
import {
  isNormalizedUsernameValid,
  normalizeLoginIdentifier,
} from "@/lib/login-identity";

export const CHILD_SYNTHETIC_EMAIL_DOMAIN = "child.starliz.local";
export const CHILD_PASSWORD_MIN_LENGTH = 8;

/** Characters safe for child-readable generated passwords (no ambiguous 0/O/1/l). */
const GENERATED_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function buildChildSyntheticEmail(username: string): string {
  return `${username}@${CHILD_SYNTHETIC_EMAIL_DOMAIN}`;
}

/**
 * Derive a base username from a child display name using Slice 2 username rules.
 * Non-alphanumeric runs become a single dot; leading/trailing dots stripped.
 */
export function deriveUsernameBaseFromChildName(name: string): string {
  const lowered = name.trim().toLowerCase();
  const collapsed = lowered
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");

  let candidate = collapsed.slice(0, 24);
  if (!candidate || !/^[a-z0-9]/.test(candidate)) {
    candidate = `learner${candidate}`.replace(/[^a-z0-9._-]/g, "").slice(0, 24);
  }
  if (candidate.length < 3) {
    candidate = `${candidate}kid`.slice(0, 24);
  }
  if (!isNormalizedUsernameValid(candidate)) {
    candidate = `learner${randomInt(100, 999)}`;
  }
  return candidate;
}

export async function allocateUniqueUsername(
  base: string,
  isTaken: (username: string) => Promise<boolean>,
  maxAttempts = 32,
): Promise<string> {
  const normalizedBase = normalizeLoginIdentifier(base);
  const seed =
    normalizedBase?.kind === "username" && isNormalizedUsernameValid(normalizedBase.value)
      ? normalizedBase.value
      : deriveUsernameBaseFromChildName(base);

  if (!(await isTaken(seed))) {
    return seed;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const suffix = attempt <= 9 ? String(attempt) : String(randomInt(10, 99));
    const truncated = seed.slice(0, Math.max(3, 32 - suffix.length));
    const candidate = `${truncated}${suffix}`;
    if (!isNormalizedUsernameValid(candidate)) continue;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  const fallback = `learner${randomBytes(3).toString("hex")}`.slice(0, 32);
  if (await isTaken(fallback)) {
    throw new Error("Unable to allocate a unique child username.");
  }
  return fallback;
}

export function generateChildPassword(length = 12): string {
  const size = Math.max(CHILD_PASSWORD_MIN_LENGTH, Math.min(32, length));
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += GENERATED_PASSWORD_ALPHABET[bytes[i]! % GENERATED_PASSWORD_ALPHABET.length];
  }
  return out;
}

export type ChildPasswordValidation =
  | { ok: true }
  | { ok: false; error: string };

/** Align with existing signup/admin password floor: minimum 8 characters. */
export function validateChildAccountPassword(password: string): ChildPasswordValidation {
  if (typeof password !== "string" || password.length < CHILD_PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Password must be at least ${CHILD_PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > 128) {
    return { ok: false, error: "Password must be 128 characters or fewer." };
  }
  return { ok: true };
}

export type ChildUsernameValidation =
  | { ok: true; username: string }
  | { ok: false; error: string };

export function validateManualChildUsername(raw: string): ChildUsernameValidation {
  const normalized = normalizeLoginIdentifier(raw);
  if (!normalized || normalized.kind !== "username") {
    return { ok: false, error: "Enter a username, not an email address." };
  }
  if (!isNormalizedUsernameValid(normalized.value)) {
    return {
      ok: false,
      error: "Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.",
    };
  }
  return { ok: true, username: normalized.value };
}
