export type HomeworkPhase1GSignal =
  | "homework_generated"
  | "homework_pending"
  | "homework_started"
  | "homework_submitted"
  | "homework_completed"
  | "homework_overdue"
  | "low_homework_score"
  | "review_needed"
  | "parent_admin_override"
  | "homework_excused"
  | "catch_up_recap_needed";

export type HomeworkSignalContext = {
  subject: string | null;
  topic: string | null;
  skill: string | null;
  yearGroup?: string | null;
};

export type HomeworkHeartbeatSignalRecord = {
  action: "heartbeat.signal.updated";
  entityType: "StudentSignal";
  entityId: string;
  metadata: {
    subject: string | null;
    strand: string | null;
    skillTopic: string | null;
    yearGroup: string | null;
    questionId: string | null;
    lessonItemId: string | null;
    understoodAfterHelp: boolean;
    stillStruggling: boolean;
    repeatedWeakArea: boolean;
    needsCatchUp: boolean;
    needsDifferentExplanationStyle: boolean;
    needsLiveTutorSupport: boolean;
    homeworkSignal: HomeworkPhase1GSignal;
    homeworkStatus: string;
    scorePercent: number | null;
    reviewNeededCount: number;
    requiresRecap: boolean;
    atIso: string;
  };
};

export type HomeworkMasteryTarget = {
  subject: string;
  skillFocus: string;
};

export type HomeworkMasteryPlan = {
  resolveTargets: HomeworkMasteryTarget[];
  activateTargets: Array<HomeworkMasteryTarget & { reason: string; accuracy: number }>;
  recapOnlyPath: boolean;
  homeworkHelpedProgress: boolean | null;
};

export type HomeworkVisibilitySummary = {
  homeworkHelpedLearningProgress: boolean | null;
  repeatedLowScoreOrMissedPattern: boolean;
  actionNeededReasons: string[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function uniqueTargets(targets: HomeworkMasteryTarget[]): HomeworkMasteryTarget[] {
  const seen = new Set<string>();
  const ordered: HomeworkMasteryTarget[] = [];
  for (const target of targets) {
    const subject = normalize(target.subject);
    const skillFocus = normalize(target.skillFocus);
    if (!subject || !skillFocus) continue;
    const key = `${subject.toLowerCase()}::${skillFocus.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push({ subject, skillFocus });
  }
  return ordered;
}

function severityFlags(signal: HomeworkPhase1GSignal): {
  understoodAfterHelp: boolean;
  stillStruggling: boolean;
  repeatedWeakArea: boolean;
  needsCatchUp: boolean;
  needsDifferentExplanationStyle: boolean;
  needsLiveTutorSupport: boolean;
} {
  if (signal === "homework_completed") {
    return {
      understoodAfterHelp: true,
      stillStruggling: false,
      repeatedWeakArea: false,
      needsCatchUp: false,
      needsDifferentExplanationStyle: false,
      needsLiveTutorSupport: false,
    };
  }

  if (signal === "homework_pending" || signal === "homework_started" || signal === "homework_submitted") {
    return {
      understoodAfterHelp: false,
      stillStruggling: false,
      repeatedWeakArea: false,
      needsCatchUp: false,
      needsDifferentExplanationStyle: false,
      needsLiveTutorSupport: false,
    };
  }

  if (signal === "homework_generated") {
    return {
      understoodAfterHelp: false,
      stillStruggling: false,
      repeatedWeakArea: false,
      needsCatchUp: true,
      needsDifferentExplanationStyle: false,
      needsLiveTutorSupport: false,
    };
  }

  if (signal === "parent_admin_override" || signal === "homework_excused") {
    return {
      understoodAfterHelp: true,
      stillStruggling: false,
      repeatedWeakArea: false,
      needsCatchUp: false,
      needsDifferentExplanationStyle: false,
      needsLiveTutorSupport: false,
    };
  }

  if (signal === "review_needed") {
    return {
      understoodAfterHelp: false,
      stillStruggling: true,
      repeatedWeakArea: true,
      needsCatchUp: true,
      needsDifferentExplanationStyle: true,
      needsLiveTutorSupport: true,
    };
  }

  if (signal === "homework_overdue") {
    return {
      understoodAfterHelp: false,
      stillStruggling: true,
      repeatedWeakArea: true,
      needsCatchUp: true,
      needsDifferentExplanationStyle: true,
      needsLiveTutorSupport: false,
    };
  }

  return {
    understoodAfterHelp: false,
    stillStruggling: true,
    repeatedWeakArea: true,
    needsCatchUp: true,
    needsDifferentExplanationStyle: true,
    needsLiveTutorSupport: false,
  };
}

export function buildHomeworkLifecycleSignals(input: {
  featureEnabled: boolean;
  status: string;
  scorePercent: number | null;
  reviewNeededCount: number;
  requiresRecap: boolean;
  includeParentAdminOverride?: boolean;
  includeExcused?: boolean;
}): HomeworkPhase1GSignal[] {
  if (!input.featureEnabled) return [];

  const status = input.status.trim().toUpperCase();
  const signals = new Set<HomeworkPhase1GSignal>();

  if (status === "GENERATED") {
    signals.add("homework_generated");
    signals.add("homework_pending");
  }
  if (status === "STARTED" || status === "IN_PROGRESS") {
    signals.add("homework_started");
    signals.add("homework_pending");
  }
  if (status === "SUBMITTED" || status === "MARKED" || status === "REVIEW_NEEDED") {
    signals.add("homework_submitted");
  }
  if (status === "COMPLETED") {
    signals.add("homework_completed");
  }
  if (status === "OVERDUE") {
    signals.add("homework_overdue");
  }
  if (input.includeParentAdminOverride || status === "OVERRIDDEN") {
    signals.add("parent_admin_override");
  }
  if (input.includeExcused || status === "EXCUSED") {
    signals.add("homework_excused");
  }

  if (typeof input.scorePercent === "number" && input.scorePercent < 50) {
    signals.add("low_homework_score");
  }
  if (input.reviewNeededCount > 0 || status === "REVIEW_NEEDED") {
    signals.add("review_needed");
  }
  if (input.requiresRecap || (typeof input.scorePercent === "number" && input.scorePercent < 50)) {
    signals.add("catch_up_recap_needed");
  }

  return Array.from(signals.values());
}

export function toHeartbeatSignalRecords(input: {
  featureEnabled: boolean;
  studentId: string;
  now: Date;
  status: string;
  scorePercent: number | null;
  reviewNeededCount: number;
  requiresRecap: boolean;
  context: HomeworkSignalContext;
  includeParentAdminOverride?: boolean;
  includeExcused?: boolean;
}): HomeworkHeartbeatSignalRecord[] {
  const signals = buildHomeworkLifecycleSignals({
    featureEnabled: input.featureEnabled,
    status: input.status,
    scorePercent: input.scorePercent,
    reviewNeededCount: input.reviewNeededCount,
    requiresRecap: input.requiresRecap,
    includeParentAdminOverride: input.includeParentAdminOverride,
    includeExcused: input.includeExcused,
  });

  return signals.map((signal) => {
    const severity = severityFlags(signal);
    return {
      action: "heartbeat.signal.updated",
      entityType: "StudentSignal",
      entityId: input.studentId,
      metadata: {
        subject: input.context.subject,
        strand: input.context.topic,
        skillTopic: input.context.skill,
        yearGroup: input.context.yearGroup ?? null,
        questionId: null,
        lessonItemId: null,
        ...severity,
        homeworkSignal: signal,
        homeworkStatus: input.status,
        scorePercent: input.scorePercent,
        reviewNeededCount: input.reviewNeededCount,
        requiresRecap: input.requiresRecap,
        atIso: input.now.toISOString(),
      },
    };
  });
}

export function buildHomeworkMasteryPlan(input: {
  featureEnabled: boolean;
  status: string;
  scorePercent: number | null;
  reviewNeededCount: number;
  requiresRecap: boolean;
  targets: HomeworkMasteryTarget[];
}): HomeworkMasteryPlan {
  const normalizedTargets = uniqueTargets(input.targets);
  if (!input.featureEnabled) {
    return {
      resolveTargets: [],
      activateTargets: [],
      recapOnlyPath: false,
      homeworkHelpedProgress: null,
    };
  }

  const status = input.status.trim().toUpperCase();
  const recapOnlyPath = input.requiresRecap || (typeof input.scorePercent === "number" && input.scorePercent < 50);
  const hasReviewNeeded = input.reviewNeededCount > 0 || status === "REVIEW_NEEDED";

  if (hasReviewNeeded) {
    return {
      resolveTargets: [],
      activateTargets: normalizedTargets.map((target) => ({
        ...target,
        reason: "review_needed",
        accuracy: 45,
      })),
      recapOnlyPath,
      homeworkHelpedProgress: false,
    };
  }

  if (status === "COMPLETED" && typeof input.scorePercent === "number" && input.scorePercent >= 75) {
    return {
      resolveTargets: normalizedTargets,
      activateTargets: [],
      recapOnlyPath,
      homeworkHelpedProgress: true,
    };
  }

  if (typeof input.scorePercent === "number" && input.scorePercent < 75) {
    const scorePercent = input.scorePercent;
    return {
      resolveTargets: [],
      activateTargets: normalizedTargets.map((target) => ({
        ...target,
        reason: scorePercent < 50 ? "low_score_recap" : "needs_practice",
        accuracy: Math.max(20, Math.min(60, scorePercent)),
      })),
      recapOnlyPath,
      homeworkHelpedProgress: scorePercent >= 60 ? null : false,
    };
  }

  return {
    resolveTargets: [],
    activateTargets: [],
    recapOnlyPath,
    homeworkHelpedProgress: null,
  };
}

export function buildHomeworkVisibilitySummary(input: {
  status: string;
  scorePercent: number | null;
  reviewNeededCount: number;
  recapOnly: boolean;
  sourceCompletedSessionCount: number;
  sourceStartedSessionCount: number;
}): HomeworkVisibilitySummary {
  const reasons: string[] = [];
  const status = input.status.trim().toUpperCase();
  const isOverdue = status === "OVERDUE";
  const hasLowScore = typeof input.scorePercent === "number" && input.scorePercent < 50;
  const hasReviewNeeded = input.reviewNeededCount > 0 || status === "REVIEW_NEEDED";

  if (isOverdue) reasons.push("overdue_homework");
  if (hasLowScore) reasons.push("low_homework_score");
  if (hasReviewNeeded) reasons.push("review_needed");
  if (input.recapOnly) reasons.push("recap_only_path");

  const missedSessions = Math.max(0, input.sourceStartedSessionCount - input.sourceCompletedSessionCount);
  const repeatedLowScoreOrMissedPattern = (hasLowScore || hasReviewNeeded || isOverdue)
    && (missedSessions >= 2 || input.recapOnly || (isOverdue && hasLowScore));

  const homeworkHelpedLearningProgress = status === "COMPLETED"
    ? (typeof input.scorePercent === "number"
      ? (input.scorePercent >= 70 && !hasReviewNeeded)
      : null)
    : null;

  return {
    homeworkHelpedLearningProgress,
    repeatedLowScoreOrMissedPattern,
    actionNeededReasons: reasons,
  };
}
