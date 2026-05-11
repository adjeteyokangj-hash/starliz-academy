export function evaluateSuspiciousLoginRisk(input: {
  failureCount: number;
  ipChanged: boolean;
  userAgentChanged: boolean;
}) {
  const suspicious = input.failureCount >= 3 || (input.ipChanged && input.userAgentChanged);

  return {
    suspicious,
    reason: input.failureCount >= 3
      ? "multiple_recent_failures"
      : input.ipChanged && input.userAgentChanged
        ? "new_device_and_network"
        : null,
  } as const;
}

export function evaluateCommunicationEligibility(input: {
  linkStatus: string;
  canMessageTeachers: boolean;
  consentGivenAt: string | null;
  consentWithdrawnAt: string | null;
  optedOutAt: string | null;
  safeguardingLockedAt: string | null;
  hasOpenSafeguardingLock: boolean;
  safeguardingOverride: boolean;
}) {
  if (input.linkStatus !== "active") {
    return { allowed: false, reason: "inactive_link" } as const;
  }

  if (!input.canMessageTeachers) {
    return { allowed: false, reason: "school_policy_disabled" } as const;
  }

  if (!input.consentGivenAt || input.consentWithdrawnAt) {
    return { allowed: false, reason: "missing_consent" } as const;
  }

  if (input.optedOutAt) {
    return { allowed: false, reason: "parent_opted_out" } as const;
  }

  if ((input.safeguardingLockedAt || input.hasOpenSafeguardingLock) && !input.safeguardingOverride) {
    return { allowed: false, reason: "safeguarding_lock" } as const;
  }

  return { allowed: true, reason: null } as const;
}

export function canResolveIncident(input: {
  acknowledgements: Array<{ userId: string }>;
  actorUserId: string;
}) {
  return input.acknowledgements.some((entry) => entry.userId === input.actorUserId);
}
