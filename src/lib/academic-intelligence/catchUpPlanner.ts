import type {
  AcademicIntelligenceOutput,
  AcademicPriority,
  CatchUpRecommendation,
  CatchUpStatus,
  CatchUpTaskType,
  CatchUpTrigger,
  CatchUpTriggerType,
  CoverageEntry,
  MasteryMapEntry,
} from "@/lib/academic-intelligence/types";

const MAX_STUDENT_TASKS = 6;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildId(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function daysSince(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}

function priorityScore(priority: AcademicPriority): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function triggerPriority(triggerType: CatchUpTriggerType): AcademicPriority {
  if (
    triggerType === "active_weak_area"
    || triggerType === "low_attempt_score"
    || triggerType === "assessment_below_readiness"
    || triggerType === "gcse_coverage_gap"
  ) {
    return "high";
  }
  if (
    triggerType === "high_coach_usage"
    || triggerType === "high_hint_usage"
    || triggerType === "overdue_revision"
    || triggerType === "repeated_wrong_answers"
  ) {
    return "medium";
  }
  return "low";
}

function supportiveReason(triggerType: CatchUpTriggerType): string {
  switch (triggerType) {
    case "low_attempt_score":
    case "low_quiz_score":
      return "This will help you feel more confident on this topic.";
    case "repeated_wrong_answers":
      return "Let's practise this again with a simpler step-by-step path.";
    case "active_weak_area":
      return "You are close. A short recap will help.";
    case "high_coach_usage":
    case "high_hint_usage":
      return "A guided recap can make this feel easier next time.";
    case "overdue_revision":
    case "topic_not_practised_recently":
      return "A quick refresh will keep this skill strong.";
    case "difficult_dictionary_term":
      return "A short word review can make this topic clearer.";
    case "assessment_below_readiness":
      return "Let's build confidence before the next assessment.";
    case "gcse_coverage_gap":
      return "A focused GCSE catch-up will strengthen exam readiness.";
    default:
      return "This topic needs a little more practice.";
  }
}

function mapTriggerToTask(triggerType: CatchUpTriggerType, subject: string): CatchUpTaskType {
  const normalizedSubject = normalize(subject);
  if (triggerType === "difficult_dictionary_term") return "dictionary_review";
  if (triggerType === "high_coach_usage") return "coach_led_support";
  if (triggerType === "high_hint_usage") return "targeted_practice";
  if (triggerType === "unfinished_assignment") return "assignment_follow_up";
  if (triggerType === "unfinished_lesson") return "recap_lesson";
  if (triggerType === "overdue_revision" || triggerType === "topic_not_practised_recently") return "short_revision";
  if (triggerType === "gcse_coverage_gap" || triggerType === "assessment_below_readiness") return "gcse_improve_my_answer";
  if (triggerType === "missed_homework") return "homework_adjustment";
  if (triggerType === "low_quiz_score") return "quiz_retry";
  if (normalizedSubject.includes("reading")) return "reading_support";
  if (normalizedSubject.includes("math")) return "maths_method_practice";
  if (normalizedSubject.includes("language")) return "language_pronunciation_retry";
  if (normalizedSubject.includes("spelling")) return "spelling_review";
  return "targeted_practice";
}

function taskMinutes(taskType: CatchUpTaskType): number {
  switch (taskType) {
    case "short_revision":
      return 12;
    case "dictionary_review":
      return 10;
    case "quiz_retry":
      return 15;
    case "assignment_follow_up":
    case "recap_lesson":
      return 20;
    case "gcse_improve_my_answer":
      return 25;
    default:
      return 18;
  }
}

export function detectCatchUpTriggers(input: {
  masteryMap: MasteryMapEntry[];
  coverageMap: CoverageEntry[];
  nowIso?: string;
}): CatchUpTrigger[] {
  const now = input.nowIso ?? new Date().toISOString();
  const triggers: CatchUpTrigger[] = [];

  for (const entry of input.masteryMap) {
    const subject = entry.subject;
    const topic = entry.topic ?? "General";
    const skill = entry.skill ?? null;

    if (entry.assignmentCompletionPct < 100 && entry.assignmentCompletionPct > 0) {
      triggers.push({
        triggerType: "unfinished_assignment",
        subject,
        topic,
        skill,
        source: "assignment",
        evidenceSummary: `${entry.assignmentCompletionPct}% of assignment tasks completed for ${topic}.`,
        priority: triggerPriority("unfinished_assignment"),
        detectedAt: now,
      });
    }

    if (entry.lessonCompletionPct < 100 && entry.lessonCompletionPct > 0) {
      triggers.push({
        triggerType: "unfinished_lesson",
        subject,
        topic,
        skill,
        source: "lesson_progress",
        evidenceSummary: `${entry.lessonCompletionPct}% of lesson activity complete for ${topic}.`,
        priority: triggerPriority("unfinished_lesson"),
        detectedAt: now,
      });
    }

    if (entry.attemptsCount > 0 && (entry.averageScore ?? 0) < 55) {
      triggers.push({
        triggerType: "low_attempt_score",
        subject,
        topic,
        skill,
        source: "attempts",
        evidenceSummary: `Average score is ${entry.averageScore ?? 0}% for ${topic}.`,
        priority: triggerPriority("low_attempt_score"),
        detectedAt: now,
      });
    }

    if (entry.repeatedMistakes >= 3) {
      triggers.push({
        triggerType: "repeated_wrong_answers",
        subject,
        topic,
        skill,
        source: "attempts",
        evidenceSummary: `${entry.repeatedMistakes} repeated wrong answers detected on ${topic}.`,
        priority: triggerPriority("repeated_wrong_answers"),
        detectedAt: now,
      });
    }

    if (entry.weakAreaActive) {
      triggers.push({
        triggerType: "active_weak_area",
        subject,
        topic,
        skill,
        source: "weak_area",
        evidenceSummary: `Active weak area still open for ${topic}.`,
        priority: triggerPriority("active_weak_area"),
        detectedAt: now,
      });
    }

    if (entry.dictionaryWeaknessCount > 0) {
      triggers.push({
        triggerType: "difficult_dictionary_term",
        subject,
        topic,
        skill,
        source: "dictionary",
        evidenceSummary: `${entry.dictionaryWeaknessCount} difficult dictionary terms linked to ${topic}.`,
        priority: triggerPriority("difficult_dictionary_term"),
        detectedAt: now,
      });
    }

    if (entry.coachUsageCount >= 6) {
      triggers.push({
        triggerType: "high_coach_usage",
        subject,
        topic,
        skill,
        source: "coach",
        evidenceSummary: `Coach support used ${entry.coachUsageCount} times on ${topic}.`,
        priority: triggerPriority("high_coach_usage"),
        detectedAt: now,
      });
    }

    if (entry.hintUsageRate >= 2) {
      triggers.push({
        triggerType: "high_hint_usage",
        subject,
        topic,
        skill,
        source: "attempts",
        evidenceSummary: `Average hint use is ${entry.hintUsageRate.toFixed(1)} per attempt on ${topic}.`,
        priority: triggerPriority("high_hint_usage"),
        detectedAt: now,
      });
    }

    if (entry.revisionOverdue) {
      triggers.push({
        triggerType: "overdue_revision",
        subject,
        topic,
        skill,
        source: "revision_window",
        evidenceSummary: `${topic} has not been practised recently and needs revision.`,
        priority: triggerPriority("overdue_revision"),
        detectedAt: now,
      });
    }

    if (daysSince(entry.lastPractisedAt) > 14 && entry.attemptsCount > 0) {
      triggers.push({
        triggerType: "topic_not_practised_recently",
        subject,
        topic,
        skill,
        source: "activity",
        evidenceSummary: `${topic} has not been practised for over two weeks.`,
        priority: triggerPriority("topic_not_practised_recently"),
        detectedAt: now,
      });
    }
  }

  for (const coverage of input.coverageMap) {
    const isGcse = normalize(coverage.keyStage) === "ks4" || normalize(coverage.yearGroup).includes("year 10") || normalize(coverage.yearGroup).includes("year 11");
    if (isGcse && coverage.coverageStatus === "gap_detected") {
      triggers.push({
        triggerType: "gcse_coverage_gap",
        subject: coverage.subject,
        topic: coverage.topic,
        skill: coverage.skill,
        source: "curriculum_coverage",
        evidenceSummary: `GCSE coverage gap detected for ${coverage.topic ?? "this topic"}.`,
        priority: triggerPriority("gcse_coverage_gap"),
        detectedAt: now,
      });
    }
  }

  const deduped = new Map<string, CatchUpTrigger>();
  for (const trigger of triggers) {
    const key = `${trigger.triggerType}|${normalize(trigger.subject)}|${normalize(trigger.topic)}|${normalize(trigger.skill)}`;
    const existing = deduped.get(key);
    if (!existing || priorityScore(trigger.priority) > priorityScore(existing.priority)) {
      deduped.set(key, trigger);
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const byPriority = priorityScore(right.priority) - priorityScore(left.priority);
    if (byPriority !== 0) return byPriority;
    return left.detectedAt.localeCompare(right.detectedAt);
  });
}

export function buildCatchUpRecommendations(input: {
  triggers: CatchUpTrigger[];
  existingStatuses?: Record<string, CatchUpStatus>;
  maxTasks?: number;
}): CatchUpRecommendation[] {
  const maxTasks = input.maxTasks ?? MAX_STUDENT_TASKS;
  const recommendations: CatchUpRecommendation[] = input.triggers.map((trigger, index) => {
    const taskType = mapTriggerToTask(trigger.triggerType, trigger.subject);
    const id = buildId([
      trigger.triggerType,
      trigger.subject,
      trigger.topic ?? "topic",
      trigger.skill ?? "skill",
      String(index + 1),
    ]);
    const currentStatus = input.existingStatuses?.[id] ?? "recommended";
    const dueDate = trigger.priority === "high"
      ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      : trigger.priority === "medium"
        ? new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const status: CatchUpStatus = dueDate && new Date(dueDate).getTime() < Date.now() && (currentStatus === "recommended" || currentStatus === "active")
      ? "overdue"
      : currentStatus;

    return {
      id,
      title: `${(trigger.topic ?? "This topic").trim()} catch-up`,
      subject: trigger.subject,
      topic: trigger.topic,
      skill: trigger.skill,
      reason: trigger.evidenceSummary,
      studentFriendlyReason: supportiveReason(trigger.triggerType),
      taskType,
      estimatedMinutes: taskMinutes(taskType),
      priority: trigger.priority,
      status,
      dueDate,
      sourceTrigger: trigger.triggerType,
      recommendedAction: "Start a short targeted practice now.",
      routeTarget: "/student/dashboard",
    };
  });

  recommendations.sort((left, right) => {
    const priorityDiff = priorityScore(right.priority) - priorityScore(left.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.estimatedMinutes - right.estimatedMinutes;
  });

  return recommendations.slice(0, maxTasks);
}

export function unresolvedAcademicGapsFromCatchUp(output: Pick<AcademicIntelligenceOutput, "catchUpRecommendations" | "catchUpTriggers">): string[] {
  const fromTasks = output.catchUpRecommendations
    .filter((task) => task.status !== "completed" && task.status !== "waived")
    .map((task) => `${task.subject}: ${task.topic ?? task.skill ?? "General"} (${task.status})`);
  const highTriggers = output.catchUpTriggers
    .filter((trigger) => trigger.priority === "high")
    .map((trigger) => `${trigger.subject}: ${trigger.topic ?? trigger.skill ?? "General"} (${trigger.triggerType})`);

  return Array.from(new Set([...fromTasks, ...highTriggers])).slice(0, 10);
}
