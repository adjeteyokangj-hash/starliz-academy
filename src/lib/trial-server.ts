import { createHash, randomBytes } from "crypto";

export const TRIAL_COOKIE_NAME = "starliz_trial_token";
export const TRIAL_TOTAL_ACTIVITIES = 10;
export const TRIAL_DURATION_DAYS = 7;

export type TrialSubject = "spelling" | "reading" | "maths";

export function normalizeTrialEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createTrialSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashTrialSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getTrialExpiryDate(from: Date = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + TRIAL_DURATION_DAYS);
  return expires;
}

export function parseSubjectUsage(value: string | null | undefined): Record<TrialSubject, number> {
  if (!value) {
    return { spelling: 0, reading: 0, maths: 0 };
  }
  try {
    const parsed = JSON.parse(value) as Partial<Record<TrialSubject, number>>;
    return {
      spelling: Number.isFinite(parsed.spelling) ? Number(parsed.spelling) : 0,
      reading: Number.isFinite(parsed.reading) ? Number(parsed.reading) : 0,
      maths: Number.isFinite(parsed.maths) ? Number(parsed.maths) : 0,
    };
  } catch {
    return { spelling: 0, reading: 0, maths: 0 };
  }
}

export function serializeSubjectUsage(value: Record<TrialSubject, number>): string {
  return JSON.stringify(value);
}

export function toSubjectSummary(value: Record<TrialSubject, number>): string {
  const parts: string[] = [];
  if (value.spelling > 0) parts.push("spelling");
  if (value.reading > 0) parts.push("reading");
  if (value.maths > 0) parts.push("maths");
  return parts.join(",");
}

export function isTrialExpired(trial: { activitiesRemaining: number; trialExpiresAt: Date }, now: Date = new Date()): boolean {
  return trial.activitiesRemaining <= 0 || trial.trialExpiresAt.getTime() <= now.getTime();
}
