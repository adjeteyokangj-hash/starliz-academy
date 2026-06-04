import type {
  AcademicOrchestration,
  CoachHeartbeatSignalSummary,
  CoachTutorAuditIntent,
  CoachTutorOrchestrationAudit,
  CoachUsageRecord,
  ProgressRecord,
  RecommendationTarget,
} from "@/lib/academic-intelligence/types";

type AuditInput = {
  orchestration: AcademicOrchestration;
  coachHeartbeatSignals?: CoachHeartbeatSignalSummary | null;
  coachUsage?: CoachUsageRecord[];
  progressRecords?: ProgressRecord[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function labelFromSkill(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function topFromRecords(records: CoachUsageRecord[], key: "subject" | "topic" | "skill"): string | null {
  const counts = new Map<string, { value: string; count: number }>();
  for (const record of records) {
    const raw = record[key];
    const normalized = normalize(raw);
    if (!normalized || normalized === "general") continue;
    const existing = counts.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(normalized, { value: raw as string, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))[0]?.value ?? null;
}

function unresolvedTutorSkippedCount(input: {
  coachUsage: CoachUsageRecord[];
  progressRecords: ProgressRecord[];
}): number {
  const coachSkipped = input.coachUsage.filter((record) => {
    const mode = normalize(record.mode);
    return mode.includes("skip") || mode.includes("unresolved") || mode.includes("wrong_skipped");
  }).length;
  const progressSkipped = input.progressRecords.filter((record) => {
    const haystack = `${record.activityType} ${record.activityName ?? ""}`.toLowerCase();
    return haystack.includes("skip") || haystack.includes("unresolved") || haystack.includes("wrong_skipped");
  }).length;
  return coachSkipped + progressSkipped;
}

function targetFromSignals(input: {
  topSubject: string | null;
  topTopic: string | null;
  topSkillId: string | null;
  topSkillLabel: string | null;
}): RecommendationTarget {
  return {
    subject: input.topSubject,
    topic: input.topTopic,
    skill: input.topSkillId,
    label: input.topTopic ?? input.topSkillLabel ?? input.topSubject ?? "Coach/Tutor signal target missing",
  };
}

function targetHasFocus(target: RecommendationTarget): boolean {
  return Boolean(normalize(target.topic) || normalize(target.skill) || normalize(target.subject));
}

function targetsMatch(left: RecommendationTarget, right: RecommendationTarget): boolean {
  const leftSkill = normalize(left.skill);
  const rightSkill = normalize(right.skill);
  if (leftSkill && rightSkill && leftSkill === rightSkill) return true;

  const leftFocus = normalize(left.topic ?? left.skill ?? left.label);
  const rightFocus = normalize(right.topic ?? right.skill ?? right.label);
  const leftSubject = normalize(left.subject);
  const rightSubject = normalize(right.subject);
  if (!leftFocus || !rightFocus) return false;
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return false;
  return leftFocus === rightFocus;
}

function intentFromSignals(input: {
  signals: CoachHeartbeatSignalSummary | null | undefined;
  unresolvedTutorSkippedCount: number;
  orchestration: AcademicOrchestration;
}): CoachTutorAuditIntent {
  if (input.signals?.needsLiveTutorSupportCount || input.signals?.hasTutorEscalationSignal) return "tutor_support";
  if (input.signals?.needsCatchUpCount || input.signals?.hasCatchUpSignal || input.unresolvedTutorSkippedCount > 0) return "catch_up";
  if (input.signals?.stillStrugglingCount || input.signals?.needsDifferentExplanationStyleCount) return "maintain";
  if (input.signals && input.signals.totalCoachSignals > 0 && input.orchestration.nextAction === "progression") return "advance";
  if (input.signals && input.signals.totalCoachSignals > 0) return "maintain";
  return "unknown";
}

export function buildCoachTutorOrchestrationAudit(input: AuditInput): CoachTutorOrchestrationAudit {
  const signals = input.coachHeartbeatSignals ?? null;
  const coachUsage = input.coachUsage ?? [];
  const progressRecords = input.progressRecords ?? [];
  const recentCoachHelpCount = signals?.totalCoachSignals ?? coachUsage.length;
  const skippedCount = unresolvedTutorSkippedCount({ coachUsage, progressRecords });
  const topSubject = signals?.topSubjects[0]?.value ?? topFromRecords(coachUsage, "subject");
  const topTopic = topFromRecords(coachUsage, "topic") ?? signals?.topStrands[0]?.value ?? null;
  const topSkillId = signals?.topSkillTopics[0]?.value ?? topFromRecords(coachUsage, "skill");
  const topSkillLabel = labelFromSkill(topSkillId);
  const target = targetFromSignals({ topSubject, topTopic, topSkillId, topSkillLabel });
  const intent = intentFromSignals({ signals, unresolvedTutorSkippedCount: skippedCount, orchestration: input.orchestration });
  const missingTarget = !targetHasFocus(target);

  if (recentCoachHelpCount === 0 && skippedCount === 0) {
    return {
      recentCoachHelpCount,
      stillStrugglingCount: 0,
      needsCatchUpCount: 0,
      liveTutorSupportCount: 0,
      differentExplanationStyleCount: 0,
      topSubject,
      topTopic,
      topSkillId,
      topSkillLabel,
      unresolvedTutorSkippedCount: skippedCount,
      intent: "unknown",
      target,
      status: "informational",
      reason: "No recent Coach/Tutor concern signals are available.",
      adminAction: "No Coach/Tutor orchestration action required.",
    };
  }

  if (missingTarget) {
    return {
      recentCoachHelpCount,
      stillStrugglingCount: signals?.stillStrugglingCount ?? 0,
      needsCatchUpCount: signals?.needsCatchUpCount ?? 0,
      liveTutorSupportCount: signals?.needsLiveTutorSupportCount ?? 0,
      differentExplanationStyleCount: signals?.needsDifferentExplanationStyleCount ?? 0,
      topSubject,
      topTopic,
      topSkillId,
      topSkillLabel,
      unresolvedTutorSkippedCount: skippedCount,
      intent,
      target,
      status: "informational",
      reason: "Coach/Tutor signals exist but do not include a safe subject, topic, or skill target.",
      adminAction: "Review Coach/Tutor context before changing the learning path.",
    };
  }

  const orchestrationIsIntervention = input.orchestration.nextAction === "catch_up" || input.orchestration.status === "blocked";
  const orchestrationAllowsProgression = input.orchestration.nextAction === "progression";
  const targetMatches = targetsMatch(target, input.orchestration.canonicalTarget);
  const status =
    intent === "tutor_support"
      ? orchestrationIsIntervention && targetMatches ? "aligned" : "mismatch"
      : intent === "catch_up"
        ? orchestrationIsIntervention && targetMatches ? "aligned" : orchestrationAllowsProgression ? "mismatch" : "mismatch"
        : "informational";

  const reason = status === "aligned"
    ? `Coach/Tutor signals agree with the orchestrated ${input.orchestration.nextAction} target.`
    : status === "mismatch" && intent === "tutor_support"
      ? "Coach/Tutor signals indicate live tutor support, but orchestration has not locked an intervention for that target."
      : status === "mismatch"
        ? "Coach/Tutor signals indicate catch-up, but orchestration is not aligned to that target."
        : "Coach/Tutor usage is present without an unresolved struggle signal.";

  const adminAction = status === "aligned"
    ? "Keep Coach/Tutor support aligned with the current orchestrated action."
    : status === "mismatch" && intent === "tutor_support"
      ? `Review tutor intervention for ${target.label} before progression.`
      : status === "mismatch"
        ? `Review whether ${target.label} should become the canonical catch-up target.`
        : "Monitor Coach/Tutor usage; no orchestration lock required.";

  return {
    recentCoachHelpCount,
    stillStrugglingCount: signals?.stillStrugglingCount ?? 0,
    needsCatchUpCount: signals?.needsCatchUpCount ?? 0,
    liveTutorSupportCount: signals?.needsLiveTutorSupportCount ?? 0,
    differentExplanationStyleCount: signals?.needsDifferentExplanationStyleCount ?? 0,
    topSubject,
    topTopic,
    topSkillId,
    topSkillLabel,
    unresolvedTutorSkippedCount: skippedCount,
    intent,
    target,
    status,
    reason,
    adminAction,
  };
}
