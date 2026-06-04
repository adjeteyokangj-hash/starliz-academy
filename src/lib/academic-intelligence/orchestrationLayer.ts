import type {
  AcademicOrchestration,
  CatchUpStatus,
  HeartbeatPrimaryAction,
  HomeworkStatus,
  MasteryMapEntry,
  OrchestrationNextAction,
  OrchestrationTopicState,
  RecommendationEngineKey,
  RecommendationTarget,
} from "@/lib/academic-intelligence/types";

type OrchestrationInput = {
  heartbeatDecision: {
    primaryAction: HeartbeatPrimaryAction;
  };
  masteryMap: MasteryMapEntry[];
  catchUpRecommendations: Array<{
    status: CatchUpStatus;
    subject: string;
    topic?: string | null;
    skill?: string | null;
    title: string;
  }>;
  catchUpTasks: Array<{
    status: CatchUpStatus;
    subject: string;
    topic?: string | null;
    skill?: string | null;
    title: string;
  }>;
  homeworkTasks: Array<{
    status: HomeworkStatus;
    subject?: string | null;
    topic?: string | null;
    skill?: string | null;
    title: string;
  }>;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function targetFromEntry(entry: {
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
}, fallback: string): RecommendationTarget {
  return {
    subject: entry.subject ?? null,
    topic: entry.topic ?? null,
    skill: entry.skill ?? null,
    label: entry.topic ?? entry.skill ?? entry.subject ?? fallback,
  };
}

function targetsMatch(left: RecommendationTarget, right: RecommendationTarget): boolean {
  const leftSubject = normalize(left.subject);
  const rightSubject = normalize(right.subject);
  const leftFocus = normalize(left.topic ?? left.skill ?? left.label);
  const rightFocus = normalize(right.topic ?? right.skill ?? right.label);
  if (!leftFocus || !rightFocus) return false;
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return false;
  return leftFocus === rightFocus;
}

function isActiveCatchUp(status: CatchUpStatus | string): boolean {
  return !["completed", "waived", "skipped"].includes(normalize(status));
}

function isActiveHomework(status: HomeworkStatus | string): boolean {
  return status === "assigned" || status === "in_progress" || status === "overdue";
}

function heartbeatAllowsProgression(action: HeartbeatPrimaryAction): boolean {
  return action === "advance_student" || action === "maintain_level" || action === "generate_assessment";
}

function targetSpecificity(entry: {
  subject?: string | null;
  topic?: string | null;
  skill?: string | null;
}): number {
  const subject = normalize(entry.subject);
  const topic = normalize(entry.topic);
  const skill = normalize(entry.skill);
  let score = 0;
  if (subject && subject !== "general") score += 1;
  if (topic && topic !== "general") score += 2;
  if (skill && skill !== "general") score += 1;
  return score;
}

function mostSpecific(entries: MasteryMapEntry[]): MasteryMapEntry | null {
  return entries
    .slice()
    .sort((left, right) => targetSpecificity(right) - targetSpecificity(left))[0]
    ?? null;
}

function priorityMasteryEntry(output: Pick<OrchestrationInput, "masteryMap">): MasteryMapEntry | null {
  return mostSpecific(output.masteryMap.filter((entry) => entry.masteryStatus === "needs_catch_up" || entry.weakAreaActive))
    ?? mostSpecific(output.masteryMap.filter((entry) => entry.masteryStatus === "needs_revision"))
    ?? mostSpecific(output.masteryMap.filter((entry) => entry.masteryStatus === "nearly_secure" || entry.masteryStatus === "mastered"))
    ?? output.masteryMap[0]
    ?? null;
}

function topicStateForEntry(input: {
  entry: MasteryMapEntry | null;
  hasActiveCatchUp: boolean;
  hasCompletedCatchUp: boolean;
}): OrchestrationTopicState {
  if (!input.entry) return "unknown";
  if (input.entry.masteryStatus === "needs_catch_up" || input.entry.weakAreaActive) return "weak";
  if (input.hasCompletedCatchUp && (input.entry.masteryStatus === "nearly_secure" || input.entry.confidenceScore >= 70)) return "recovering";
  if (input.entry.masteryStatus === "mastered") return "mastered";
  if (input.entry.masteryStatus === "nearly_secure" || input.entry.confidenceScore >= 75) return "secure";
  if (input.hasActiveCatchUp) return "weak";
  return "unknown";
}

function nextActionForState(input: {
  topicState: OrchestrationTopicState;
  heartbeatAction: HeartbeatPrimaryAction;
  hasActiveCatchUp: boolean;
  hasAlignedHomework: boolean;
}): OrchestrationNextAction {
  if (input.heartbeatAction === "review_placement") return "review_placement";
  if (input.topicState === "weak" || input.hasActiveCatchUp) return input.hasAlignedHomework ? "catch_up" : "catch_up";
  if (input.topicState === "recovering") return "progression";
  if (input.topicState === "secure" || input.topicState === "mastered") return "progression";
  if (input.heartbeatAction === "generate_assessment") return "assessment";
  return "maintain";
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

export function buildAcademicOrchestration(
  output: OrchestrationInput,
): AcademicOrchestration {
  const activeCatchUp = output.catchUpTasks.find((task) => isActiveCatchUp(task.status))
    ?? output.catchUpRecommendations.find((recommendation) => isActiveCatchUp(recommendation.status));
  const completedCatchUp = output.catchUpTasks.find((task) => task.status === "completed")
    ?? output.catchUpRecommendations.find((recommendation) => recommendation.status === "completed");
  const masteryEntry = priorityMasteryEntry(output);
  const activeCatchUpTarget = activeCatchUp ? targetFromEntry(activeCatchUp, activeCatchUp.title) : null;
  const target = activeCatchUpTarget && targetSpecificity(activeCatchUpTarget) >= targetSpecificity(masteryEntry ?? {})
    ? activeCatchUpTarget
    : masteryEntry
      ? targetFromEntry(masteryEntry, "current topic")
      : targetFromEntry({}, "current learning");
  const topicState = topicStateForEntry({
    entry: masteryEntry,
    hasActiveCatchUp: Boolean(activeCatchUp),
    hasCompletedCatchUp: Boolean(completedCatchUp),
  });

  const activeHomework = output.homeworkTasks.find((task) => isActiveHomework(task.status));
  const homeworkTarget = activeHomework ? targetFromEntry(activeHomework, activeHomework.title) : null;
  const hasAlignedHomework = Boolean(homeworkTarget && targetsMatch(target, homeworkTarget));
  const hasMismatchedHomework = Boolean(activeHomework && !hasAlignedHomework && (topicState === "weak" || activeCatchUp));
  const hasWeakBlocker = topicState === "weak" || Boolean(activeCatchUp);
  const nextAction = nextActionForState({
    topicState,
    heartbeatAction: output.heartbeatDecision.primaryAction,
    hasActiveCatchUp: Boolean(activeCatchUp),
    hasAlignedHomework,
  });

  const gatedEngines: RecommendationEngineKey[] = [];
  const alignedEngines: RecommendationEngineKey[] = ["heartbeat", "mastery_map"];
  const mismatchedEngines: RecommendationEngineKey[] = [];

  if (hasWeakBlocker && !heartbeatAllowsProgression(output.heartbeatDecision.primaryAction)) {
    pushUnique(gatedEngines, "daily_journey");
    pushUnique(gatedEngines, "certificates");
  }

  if (activeCatchUp) {
    pushUnique(alignedEngines, "catch_up");
    pushUnique(alignedEngines, "assignments");
  }

  if (hasAlignedHomework) {
    pushUnique(alignedEngines, "homework");
  } else if (hasMismatchedHomework) {
    pushUnique(mismatchedEngines, "homework");
  }

  if (hasWeakBlocker) {
    pushUnique(gatedEngines, "daily_journey");
    pushUnique(gatedEngines, "certificates");
  } else {
    pushUnique(alignedEngines, "daily_journey");
    pushUnique(alignedEngines, "certificates");
  }

  const status = hasWeakBlocker
    ? "blocked"
    : mismatchedEngines.length > 0
      ? "warning"
      : "healthy";

  const reason = hasWeakBlocker
    ? `${target.label} remains the canonical recovery target until mastery improves.`
    : topicState === "recovering"
      ? `${target.label} is recovering; verify with assessment before full progression.`
      : topicState === "secure" || topicState === "mastered"
        ? `${target.label} is secure enough for progression without remediation duplication.`
        : "Insufficient evidence; maintain current learning while collecting more signals.";

  const adminAction = hasMismatchedHomework
    ? `Lock next recommendation to ${target.label} catch-up and align homework to the same target.`
    : hasWeakBlocker
      ? `Keep next action locked to ${target.label} catch-up.`
      : topicState === "secure" || topicState === "mastered"
        ? "Allow progression and avoid duplicate remediation."
        : "Review evidence before changing the learning path.";

  return {
    status,
    canonicalTarget: target,
    topicState,
    nextAction,
    gatedEngines,
    alignedEngines,
    mismatchedEngines,
    reason,
    adminAction,
  };
}
