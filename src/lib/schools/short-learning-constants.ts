/** Client-safe Short Learning copy and policy constants. Do not import Prisma here. */

export const SHORT_LEARNING_HONESTY_POLICY_VERSION = "short-learning-ai-led-v1";

export const SHORT_LEARNING_PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

export const SHORT_LEARNING_CHECKBOX =
  "I understand that Short Learning is AI-led and that human tutor support depends on availability.";

/** Students can join from this many minutes before `startsAt`. */
export const SHORT_LEARNING_EARLY_ENTRY_MINUTES = 5;

/** Lengths parents and admins may choose for a new Short Learning session. */
export const SHORT_LEARNING_ALLOWED_DURATIONS = [45, 60, 70] as const;
export type ShortLearningAllowedDuration = (typeof SHORT_LEARNING_ALLOWED_DURATIONS)[number];

/** Standard complete session. 45 is the short session; 70 adds extra practice. */
export const SHORT_LEARNING_DEFAULT_DURATION: ShortLearningAllowedDuration = 60;

/**
 * Lengths that already exist on bookings, journeys, or generated sessions.
 * They stay readable and playable. They are not offered for new bookings.
 */
export const SHORT_LEARNING_LEGACY_DURATIONS = [90, 105, 120] as const;

export function isLegacyShortLearningDuration(minutes: number): boolean {
  return (SHORT_LEARNING_LEGACY_DURATIONS as readonly number[]).includes(minutes);
}

/** Display a stored length, including historical 90- and 120-minute bookings. */
export function formatShortLearningDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Short Learning session";
  return `${Math.round(minutes)} minutes`;
}

/**
 * A change may keep the booking's current historical length.
 * It may not switch onto a different retired length such as 90 → 120.
 */
export function canKeepExistingShortLearningDuration(nextDuration: number, currentDuration: number): boolean {
  if ((SHORT_LEARNING_ALLOWED_DURATIONS as readonly number[]).includes(nextDuration)) return true;
  return nextDuration === currentDuration && isLegacyShortLearningDuration(nextDuration);
}

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