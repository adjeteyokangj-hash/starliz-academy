/** Client-safe Short Learning copy and policy constants. Do not import Prisma here. */

export const SHORT_LEARNING_HONESTY_POLICY_VERSION = "short-learning-ai-led-v1";

export const SHORT_LEARNING_PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

export const SHORT_LEARNING_CHECKBOX =
  "I understand that Short Learning is AI-led and that human tutor support depends on availability.";

/** Students can join from this many minutes before `startsAt`. */
export const SHORT_LEARNING_EARLY_ENTRY_MINUTES = 5;

export const SHORT_LEARNING_ALLOWED_DURATIONS = [90, 120] as const;

/** Known local/E2E parent used for manual Short Learning schedule testing. */
export const DEFAULT_SHORT_LEARNING_TEST_PARENT_EMAILS = [
  "e2e.parent+assigned@starliz.local",
] as const;

/**
 * Whether this parent may book daytime / already-started (not yet ended) slots
 * for manual UAT. Non-production includes the default E2E parent; production
 * requires SHORT_LEARNING_TEST_PARENT_EMAILS.
 */
export function isShortLearningTestParentEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const fromEnv = (process.env.SHORT_LEARNING_TEST_PARENT_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allow =
    process.env.NODE_ENV === "production"
      ? fromEnv
      : [...DEFAULT_SHORT_LEARNING_TEST_PARENT_EMAILS, ...fromEnv];
  return allow.includes(normalized);
}