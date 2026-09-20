/** Client-safe Short Learning copy and policy constants. Do not import Prisma here. */

export const SHORT_LEARNING_HONESTY_POLICY_VERSION = "short-learning-ai-led-v1";

export const SHORT_LEARNING_PROMISE =
  "AI teaching is guaranteed. Human support is a safety net when available — not a private 1:1 tutor booking.";

export const SHORT_LEARNING_CHECKBOX =
  "I understand that Short Learning is AI-led and that human tutor support depends on availability.";

/** Students can join from this many minutes before `startsAt`. */
export const SHORT_LEARNING_EARLY_ENTRY_MINUTES = 5;

export const SHORT_LEARNING_ALLOWED_DURATIONS = [90, 120] as const;