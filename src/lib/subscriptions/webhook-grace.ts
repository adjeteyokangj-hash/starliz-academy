import { addDays, PAST_DUE_GRACE_DAYS } from "./plans";

type GraceWindowInput = {
  status: string;
  existingGraceEndsAt?: Date | null;
  now?: Date;
};

export function resolveGraceEndsAt(input: GraceWindowInput): Date | null {
  const status = input.status.toLowerCase();
  if (status !== "past_due") {
    return null;
  }

  const now = input.now ?? new Date();
  const existing = input.existingGraceEndsAt ?? null;
  if (existing && existing.getTime() > now.getTime()) {
    return existing;
  }

  return addDays(now, PAST_DUE_GRACE_DAYS);
}
