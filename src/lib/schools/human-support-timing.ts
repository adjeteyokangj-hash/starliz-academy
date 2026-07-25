/**
 * Human Support Availability — pure timing / gating helpers.
 * Active session budgets are frozen at accept time and never shrink here.
 */

export type SupportPolicyNumbers = {
  minimumSessionMinutes: number;
  maximumSessionMinutes: number;
  closeoutReserveMinutes: number;
  transitionMinutes: number;
};

export type HumanSupportState =
  | "ai-only"
  | "tutor-available"
  | "tutors-busy"
  | "queued"
  | "human-session-active";

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function calculateSessionBudgetMinutes(input: {
  minutesUntilPeriodEnd: number;
  eligibleStudentCount: number;
  onlineTutorCount: number;
  policy: SupportPolicyNumbers;
  /** Optional tutor-specific expectation; clamped into policy range. */
  expectedTutorMinutes?: number | null;
}): number {
  const online = Math.max(0, Math.floor(input.onlineTutorCount));
  if (online === 0) return 0;

  const remainingSupportMinutes = Math.max(
    0,
    input.minutesUntilPeriodEnd - input.policy.closeoutReserveMinutes,
  );

  const eligible = Math.max(1, Math.floor(input.eligibleStudentCount));
  const supportWaves = Math.ceil(eligible / online);
  const transitionDrain = input.policy.transitionMinutes * Math.max(0, supportWaves - 1);
  const usable = Math.max(0, remainingSupportMinutes - transitionDrain);

  const calculated = Math.floor(usable / Math.max(supportWaves, 1));
  let budget = clamp(
    calculated,
    input.policy.minimumSessionMinutes,
    input.policy.maximumSessionMinutes,
  );

  if (input.expectedTutorMinutes != null && Number.isFinite(input.expectedTutorMinutes)) {
    const expected = clamp(
      input.expectedTutorMinutes,
      input.policy.minimumSessionMinutes,
      input.policy.maximumSessionMinutes,
    );
    // Prefer capacity plan, but never below minimum; blend toward expected without exceeding calculated max.
    budget = clamp(
      Math.round((budget + expected) / 2),
      input.policy.minimumSessionMinutes,
      Math.max(budget, input.policy.minimumSessionMinutes),
    );
    budget = clamp(budget, input.policy.minimumSessionMinutes, input.policy.maximumSessionMinutes);
  }

  return budget;
}

export function estimateWaitSeconds(input: {
  waitingAhead: number;
  onlineTutorCount: number;
  sessionBudgetMinutes: number;
  busyRemainingMinutesTotal?: number;
  minutesUntilPeriodEnd: number;
}): number {
  const online = Math.max(1, Math.floor(input.onlineTutorCount));
  const wavesAhead = Math.ceil((Math.max(0, input.waitingAhead) + 1) / online);
  const busyShare = (input.busyRemainingMinutesTotal ?? 0) / online;
  const minutes = wavesAhead * input.sessionBudgetMinutes + busyShare;
  const capped = Math.min(minutes, Math.max(0, input.minutesUntilPeriodEnd));
  return Math.max(0, Math.round(capped * 60));
}

/**
 * Queue exists only when at least one tutor is online (available/busy/paused with fresh heartbeat).
 * paused-only schools: treat as online for "someone is here" but not assignable.
 */
export function deriveHumanSupportSummary(input: {
  onlineTutorCount: number;
  availableTutorCount: number;
  busyTutorCount: number;
  studentQueued?: boolean;
  studentSessionActive?: boolean;
}): {
  state: HumanSupportState;
  label: string;
} {
  if (input.studentSessionActive) {
    return { state: "human-session-active", label: "Human support: session active" };
  }
  if (input.onlineTutorCount <= 0) {
    return { state: "ai-only", label: "Human support: AI only" };
  }
  if (input.studentQueued) {
    return { state: "queued", label: "Human support: queued" };
  }
  if (input.availableTutorCount > 0) {
    const n = input.availableTutorCount;
    return {
      state: "tutor-available",
      label: `Human support: ${n} tutor${n === 1 ? "" : "s"} available`,
    };
  }
  const busy = Math.max(input.busyTutorCount, input.onlineTutorCount);
  return {
    state: "tutors-busy",
    label: `Human support: ${busy} tutor${busy === 1 ? "" : "s"} busy · queue open`,
  };
}

export function shouldEnqueueStudent(input: {
  humanTutorEligible: boolean;
  /** On-shift tutors who can accept a student right now. */
  acceptReadyTutorCount: number;
}): boolean {
  return input.humanTutorEligible && input.acceptReadyTutorCount > 0;
}

export function canAssignImmediately(input: {
  humanTutorEligible: boolean;
  availableTutorCount: number;
}): boolean {
  return input.humanTutorEligible && input.availableTutorCount > 0;
}

/** Rolling median for capacity prediction — not a rush scoreboard. */
export function rollingMedian(values: number[]): number | null {
  const cleaned = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (cleaned.length === 0) return null;
  const mid = Math.floor(cleaned.length / 2);
  if (cleaned.length % 2 === 0) {
    return (cleaned[mid - 1]! + cleaned[mid]!) / 2;
  }
  return cleaned[mid]!;
}
