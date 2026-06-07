import type {
  AcademicSourceData,
  CoverageEntry,
  CurriculumCoverageStatus,
  MasteryMapEntry,
  MasteryStatus,
  MasterySummary,
  TopicSignal,
} from "@/lib/academic-intelligence/types";
import {
  isCanonicalCompletedStatus,
  isCanonicalProgressCompleted,
} from "@/lib/canonical-completion-accessor";

const REVISION_OVERDUE_DAYS = 21;

type TopicAggregate = TopicSignal & {
  topicKey: string;
  assignmentsTotal: number;
  assignmentsCompleted: number;
  lessonRecordsTotal: number;
  lessonRecordsCompleted: number;
  attemptCount: number;
  scoreSum: number;
  scoredAttempts: number;
  correctCount: number;
  wrongCount: number;
  repeatedMistakes: number;
  hintsUsedSum: number;
  coachUsageCount: number;
  weakAreaActive: boolean;
  dictionaryWeaknessCount: number;
  lastPractisedAt: string | null;
};

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSubject(value: string | null | undefined): string {
  const normalized = normalizeValue(value);
  if (!normalized) return "general";
  if (normalized === "maths") return "math";
  return normalized;
}

function topicKey(input: TopicSignal): string {
  return [
    normalizeSubject(input.subject),
    normalizeValue(input.topic),
    normalizeValue(input.subtopic),
    normalizeValue(input.skill),
  ].join("|");
}

function latestIso(first: string | null, second: string | null): string | null {
  if (!first) return second;
  if (!second) return first;
  return new Date(first).getTime() >= new Date(second).getTime() ? first : second;
}

function daysSinceIso(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const elapsed = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(elapsed / (1000 * 60 * 60 * 24)));
}

function safeAverage(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(sum / count);
}

function buildAggregate(data: AcademicSourceData): Map<string, TopicAggregate> {
  const map = new Map<string, TopicAggregate>();

  const ensure = (signal: TopicSignal): TopicAggregate => {
    const key = topicKey(signal);
    const existing = map.get(key);
    if (existing) return existing;
    const next: TopicAggregate = {
      topicKey: key,
      subject: signal.subject,
      topic: signal.topic ?? null,
      subtopic: signal.subtopic ?? null,
      skill: signal.skill ?? null,
      learningObjective: signal.learningObjective ?? null,
      keyStage: signal.keyStage ?? data.keyStage ?? null,
      yearGroup: signal.yearGroup ?? data.yearGroup ?? null,
      examBoard: signal.examBoard ?? data.examBoard ?? null,
      foundationTier: signal.foundationTier ?? null,
      higherTier: signal.higherTier ?? null,
      assignmentsTotal: 0,
      assignmentsCompleted: 0,
      lessonRecordsTotal: 0,
      lessonRecordsCompleted: 0,
      attemptCount: 0,
      scoreSum: 0,
      scoredAttempts: 0,
      correctCount: 0,
      wrongCount: 0,
      repeatedMistakes: 0,
      hintsUsedSum: 0,
      coachUsageCount: 0,
      weakAreaActive: false,
      dictionaryWeaknessCount: 0,
      lastPractisedAt: null,
    };
    map.set(key, next);
    return next;
  };

  for (const assignment of data.assignments) {
    const row = ensure(assignment);
    row.assignmentsTotal += 1;
    if (isCanonicalCompletedStatus(assignment.status)) row.assignmentsCompleted += 1;
    row.lastPractisedAt = latestIso(row.lastPractisedAt, assignment.updatedAt ?? assignment.createdAt);
  }

  for (const progress of data.progressRecords) {
    const row = ensure(progress);
    row.lessonRecordsTotal += 1;
    if (isCanonicalProgressCompleted(progress.completed)) row.lessonRecordsCompleted += 1;
    row.lastPractisedAt = latestIso(row.lastPractisedAt, progress.createdAt);
    if (typeof progress.score === "number") {
      row.scoreSum += progress.score;
      row.scoredAttempts += 1;
    } else if (typeof progress.accuracy === "number") {
      row.scoreSum += progress.accuracy;
      row.scoredAttempts += 1;
    }
  }

  for (const attempt of data.attempts) {
    const row = ensure(attempt);
    row.attemptCount += 1;
    row.hintsUsedSum += Math.max(0, attempt.hintsUsed ?? 0);
    row.lastPractisedAt = latestIso(row.lastPractisedAt, attempt.createdAt);
    if (attempt.correct) {
      row.correctCount += 1;
    } else {
      row.wrongCount += 1;
      row.repeatedMistakes += 1;
    }
    if (typeof attempt.score === "number") {
      row.scoreSum += attempt.score;
      row.scoredAttempts += 1;
    }
  }

  for (const weakArea of data.weakAreas) {
    const row = ensure(weakArea);
    if (weakArea.status === "active") row.weakAreaActive = true;
    row.lastPractisedAt = latestIso(row.lastPractisedAt, weakArea.lastDetectedAt);
    if (typeof weakArea.accuracy === "number") {
      row.scoreSum += weakArea.accuracy;
      row.scoredAttempts += 1;
    }
    if (typeof weakArea.attemptsCount === "number") {
      row.repeatedMistakes += Math.max(0, weakArea.attemptsCount - 1);
    }
  }

  for (const coach of data.coachUsage) {
    const row = ensure(coach);
    row.coachUsageCount += 1;
    row.lastPractisedAt = latestIso(row.lastPractisedAt, coach.createdAt);
  }

  for (const dictionary of data.dictionarySignals) {
    const row = ensure(dictionary);
    if (dictionary.difficult || dictionary.weak) {
      row.dictionaryWeaknessCount += 1;
    }
  }

  for (const skill of data.studentSkills) {
    const row = ensure({ subject: "general", skill: skill.skill });
    if (skill.status === "weak") row.weakAreaActive = true;
    row.attemptCount += Math.max(0, skill.attempts);
    row.correctCount += Math.max(0, skill.correct);
    row.wrongCount += Math.max(0, skill.attempts - skill.correct);
    row.scoreSum += Math.max(0, Math.min(100, skill.accuracy));
    row.scoredAttempts += 1;
    row.lastPractisedAt = latestIso(row.lastPractisedAt, skill.updatedAt);
  }

  return map;
}

function evaluateMastery(row: TopicAggregate): { status: MasteryStatus; confidence: number; revisionOverdue: boolean } {
  const assignmentCompletionPct = row.assignmentsTotal > 0
    ? Math.round((row.assignmentsCompleted / row.assignmentsTotal) * 100)
    : 0;
  const lessonCompletionPct = row.lessonRecordsTotal > 0
    ? Math.round((row.lessonRecordsCompleted / row.lessonRecordsTotal) * 100)
    : 0;
  const attemptScore = row.attemptCount > 0
    ? Math.round((row.correctCount / row.attemptCount) * 100)
    : null;
  const score = safeAverage(row.scoreSum, row.scoredAttempts) ?? attemptScore ?? null;

  const hintsRate = row.attemptCount > 0 ? row.hintsUsedSum / row.attemptCount : 0;
  const daysSincePractice = daysSinceIso(row.lastPractisedAt);
  const revisionOverdue = daysSincePractice > REVISION_OVERDUE_DAYS;

  let confidence = Math.round(
    (score ?? 50) * 0.6
      + assignmentCompletionPct * 0.2
      + lessonCompletionPct * 0.1
      + Math.max(0, 100 - row.repeatedMistakes * 8) * 0.1,
  );
  if (row.weakAreaActive) confidence -= 15;
  if (hintsRate >= 2) confidence -= 8;
  if (row.coachUsageCount >= 8) confidence -= 8;
  if (row.dictionaryWeaknessCount >= 3) confidence -= 4;
  confidence = Math.max(0, Math.min(100, confidence));

  const hasActivity = row.assignmentsTotal + row.lessonRecordsTotal + row.attemptCount > 0;
  if (!hasActivity) {
    return { status: "not_started", confidence, revisionOverdue: false };
  }

  if (row.weakAreaActive && confidence < 85) {
    return { status: "needs_catch_up", confidence, revisionOverdue };
  }

  if ((score ?? 0) < 55 || row.repeatedMistakes >= 4) {
    return { status: "needs_catch_up", confidence, revisionOverdue };
  }

  if (revisionOverdue && (score ?? 0) >= 70) {
    return { status: "needs_revision", confidence, revisionOverdue };
  }

  if ((score ?? 0) >= 88 && row.attemptCount >= 6 && assignmentCompletionPct >= 70 && !row.weakAreaActive) {
    return { status: "mastered", confidence, revisionOverdue };
  }

  if ((score ?? 0) >= 75 && row.attemptCount >= 3) {
    return { status: "nearly_secure", confidence, revisionOverdue };
  }

  if (row.attemptCount <= 2 && assignmentCompletionPct < 30) {
    return { status: "started", confidence, revisionOverdue };
  }

  return { status: "practising", confidence, revisionOverdue };
}

function coverageStatusFromMastery(status: MasteryStatus, row: TopicAggregate, revisionOverdue: boolean): CurriculumCoverageStatus {
  const activityCount = row.assignmentsTotal + row.lessonRecordsTotal + row.attemptCount;
  if (activityCount === 0) return "not_covered";
  if (revisionOverdue || status === "needs_revision") return "overdue_revision";
  if (status === "needs_catch_up") return "gap_detected";
  if (status === "mastered" || status === "nearly_secure") return "covered";
  return "partially_covered";
}

function nextStep(status: MasteryStatus): string {
  if (status === "mastered") return "Keep confidence high with spaced revision.";
  if (status === "nearly_secure") return "A short recap can secure this topic fully.";
  if (status === "needs_revision") return "Plan a brief revision session this week.";
  if (status === "needs_catch_up") return "Start targeted support and guided practice.";
  if (status === "started") return "Complete the first full lesson check.";
  if (status === "practising") return "Continue practice and review common mistakes.";
  return "Complete a lesson to build your mastery map.";
}

export function buildMasteryMap(data: AcademicSourceData): {
  masteryMap: MasteryMapEntry[];
  curriculumCoverage: CoverageEntry[];
  summary: MasterySummary;
} {
  const aggregate = buildAggregate(data);
  const masteryMap: MasteryMapEntry[] = [];
  const curriculumCoverage: CoverageEntry[] = [];

  for (const row of aggregate.values()) {
    const assignmentCompletionPct = row.assignmentsTotal > 0
      ? Math.round((row.assignmentsCompleted / row.assignmentsTotal) * 100)
      : 0;
    const lessonCompletionPct = row.lessonRecordsTotal > 0
      ? Math.round((row.lessonRecordsCompleted / row.lessonRecordsTotal) * 100)
      : 0;
    const averageScore = safeAverage(row.scoreSum, row.scoredAttempts) ?? (
      row.attemptCount > 0 ? Math.round((row.correctCount / row.attemptCount) * 100) : null
    );
    const hintUsageRate = row.attemptCount > 0 ? Number((row.hintsUsedSum / row.attemptCount).toFixed(2)) : 0;

    const evaluated = evaluateMastery(row);
    const masteryStatus = evaluated.status;
    const coverageStatus = coverageStatusFromMastery(masteryStatus, row, evaluated.revisionOverdue);

    masteryMap.push({
      topicKey: row.topicKey,
      subject: row.subject,
      topic: row.topic,
      subtopic: row.subtopic,
      skill: row.skill,
      learningObjective: row.learningObjective,
      keyStage: row.keyStage,
      yearGroup: row.yearGroup,
      examBoard: row.examBoard,
      foundationTier: row.foundationTier,
      higherTier: row.higherTier,
      assignmentCompletionPct,
      lessonCompletionPct,
      averageScore,
      attemptsCount: row.attemptCount,
      repeatedMistakes: row.repeatedMistakes,
      hintUsageRate,
      coachUsageCount: row.coachUsageCount,
      dictionaryWeaknessCount: row.dictionaryWeaknessCount,
      weakAreaActive: row.weakAreaActive,
      lastPractisedAt: row.lastPractisedAt,
      revisionOverdue: evaluated.revisionOverdue,
      masteryStatus,
      confidenceScore: evaluated.confidence,
    });

    curriculumCoverage.push({
      topicKey: row.topicKey,
      subject: row.subject,
      topic: row.topic,
      subtopic: row.subtopic,
      skill: row.skill,
      learningObjective: row.learningObjective,
      keyStage: row.keyStage,
      yearGroup: row.yearGroup,
      examBoard: row.examBoard,
      foundationTier: row.foundationTier,
      higherTier: row.higherTier,
      coverageStatus,
      masteryStatus,
      lastActivityAt: row.lastPractisedAt,
      recommendedNextStep: nextStep(masteryStatus),
    });
  }

  masteryMap.sort((left, right) => {
    if (left.masteryStatus === right.masteryStatus) return (left.topic ?? "").localeCompare(right.topic ?? "");
    const order: MasteryStatus[] = [
      "needs_catch_up",
      "needs_revision",
      "started",
      "practising",
      "nearly_secure",
      "mastered",
      "not_started",
    ];
    return order.indexOf(left.masteryStatus) - order.indexOf(right.masteryStatus);
  });

  const byStatus: Record<MasteryStatus, number> = {
    not_started: 0,
    started: 0,
    practising: 0,
    needs_catch_up: 0,
    nearly_secure: 0,
    mastered: 0,
    needs_revision: 0,
  };

  let scoredTopics = 0;
  let scoreTotal = 0;
  for (const row of masteryMap) {
    byStatus[row.masteryStatus] += 1;
    if (typeof row.averageScore === "number") {
      scoredTopics += 1;
      scoreTotal += row.averageScore;
    }
  }

  const summary: MasterySummary = {
    totalTopics: masteryMap.length,
    byStatus,
    needsCatchUpCount: byStatus.needs_catch_up,
    needsRevisionCount: byStatus.needs_revision,
    coveredCount: curriculumCoverage.filter((entry) => entry.coverageStatus === "covered").length,
    averageScore: scoredTopics > 0 ? Math.round(scoreTotal / scoredTopics) : 0,
  };

  return { masteryMap, curriculumCoverage, summary };
}
