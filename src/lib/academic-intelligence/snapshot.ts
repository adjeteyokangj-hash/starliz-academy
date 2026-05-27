import { prisma } from "@/lib/db";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import { listCatchUpTasks } from "@/lib/academic-intelligence/catchUpTasks";
import { listHomeworkTasks } from "@/lib/academic-intelligence/homeworkTasks";
import type { AcademicIntelligenceOutput, LearningTwinProfile, MasterySummary } from "@/lib/academic-intelligence/types";

const SNAPSHOT_KEY = "academicIntelligenceSnapshot";
const PENDING_REFRESH_REASON_KEY = "academicIntelligenceSnapshotRefreshReason";
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

export type AcademicIntelligenceSnapshotReason =
  | "missing_snapshot"
  | "stale_snapshot"
  | "level_finder_completed"
  | "lesson_completed"
  | "quiz_or_test_completed"
  | "catch_up_task_completed"
  | "admin_assignment_update"
  | "manual_refresh";

export type AcademicIntelligenceSnapshot = {
  version: 1;
  studentId: string;
  masterMapSummary: MasterySummary;
  smartCatchUpSummary: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    highPriority: number;
    topPriorityTopics: string[];
  };
  progressionRecommendationSummary: {
    needsSupport: number;
    readyToAdvance: number;
    reviewNeeded: number;
    headline: string;
  };
  learningTwinSummary: {
    hasEnoughData: boolean;
    bestExplanationStyle: LearningTwinProfile["explanationDNA"]["bestExplanationStyle"];
    confidenceBand: LearningTwinProfile["explanationDNA"]["confidenceBand"];
    coachSupportSignal: LearningTwinProfile["explanationDNA"]["coachSupportSignal"];
    todayApproach: string;
  };
  examReadinessSummary: {
    score: number;
    band: AcademicIntelligenceOutput["examReadinessProfile"]["band"];
    headline: string;
    blockerCount: number;
  };
  generatedAt: string;
  lastCalculatedAt: string;
  refreshReason: AcademicIntelligenceSnapshotReason;
};

type ParsedProfileJson = Record<string, unknown>;

function parseProfileJson(raw: string | null | undefined): ParsedProfileJson {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ParsedProfileJson;
  } catch {
    // Keep the caller resilient to old or malformed profile JSON.
  }
  return {};
}

function isSnapshot(value: unknown): value is AcademicIntelligenceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.version === 1
    && typeof row.studentId === "string"
    && typeof row.lastCalculatedAt === "string"
    && Boolean(row.masterMapSummary)
    && Boolean(row.smartCatchUpSummary)
    && Boolean(row.learningTwinSummary)
    && Boolean(row.examReadinessSummary);
}

export function readAcademicIntelligenceSnapshot(profileJson: string | null | undefined): AcademicIntelligenceSnapshot | null {
  const parsed = parseProfileJson(profileJson);
  const snapshot = parsed[SNAPSHOT_KEY];
  return isSnapshot(snapshot) ? snapshot : null;
}

export function upsertAcademicIntelligenceSnapshotJson(
  profileJson: string | null | undefined,
  snapshot: AcademicIntelligenceSnapshot,
): string {
  const parsed = parseProfileJson(profileJson);
  delete parsed[PENDING_REFRESH_REASON_KEY];
  return JSON.stringify({
    ...parsed,
    [SNAPSHOT_KEY]: snapshot,
  });
}

export function removeAcademicIntelligenceSnapshotJson(
  profileJson: string | null | undefined,
  reason?: AcademicIntelligenceSnapshotReason,
): string {
  const parsed = parseProfileJson(profileJson);
  delete parsed[SNAPSHOT_KEY];
  if (reason) parsed[PENDING_REFRESH_REASON_KEY] = reason;
  return JSON.stringify(parsed);
}

function readPendingRefreshReason(profileJson: string | null | undefined): AcademicIntelligenceSnapshotReason | null {
  const value = parseProfileJson(profileJson)[PENDING_REFRESH_REASON_KEY];
  if (
    value === "missing_snapshot"
    || value === "stale_snapshot"
    || value === "level_finder_completed"
    || value === "lesson_completed"
    || value === "quiz_or_test_completed"
    || value === "catch_up_task_completed"
    || value === "admin_assignment_update"
    || value === "manual_refresh"
  ) {
    return value;
  }
  return null;
}

export function isAcademicIntelligenceSnapshotStale(
  snapshot: AcademicIntelligenceSnapshot | null,
  now: Date = new Date(),
): boolean {
  if (!snapshot) return true;
  const calculatedAt = Date.parse(snapshot.lastCalculatedAt);
  if (!Number.isFinite(calculatedAt)) return true;
  return now.getTime() - calculatedAt > SNAPSHOT_TTL_MS;
}

export function buildAcademicIntelligenceSnapshot(
  output: AcademicIntelligenceOutput,
  reason: AcademicIntelligenceSnapshotReason,
): AcademicIntelligenceSnapshot {
  const catchUpTasks = output.catchUpTasks ?? [];
  const activeStatuses = new Set(["recommended", "scheduled", "active", "in_progress", "overdue"]);
  const smartCatchUpSummary = {
    total: catchUpTasks.length || output.catchUpRecommendations.length,
    active: catchUpTasks.filter((task) => activeStatuses.has(task.status)).length,
    completed: catchUpTasks.filter((task) => task.status === "completed").length,
    overdue: catchUpTasks.filter((task) => task.status === "overdue").length,
    highPriority: catchUpTasks.filter((task) => task.priority === "high").length
      || output.catchUpRecommendations.filter((task) => task.priority === "high").length,
    topPriorityTopics: (catchUpTasks.length ? catchUpTasks : output.catchUpRecommendations)
      .slice(0, 3)
      .map((task) => task.topic ?? task.skill ?? task.subject)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  };

  const needsSupport = output.summary.needsCatchUpCount;
  const readyToAdvance = output.masteryMap.filter((row) => row.masteryStatus === "mastered" || row.masteryStatus === "nearly_secure").length;
  const reviewNeeded = output.summary.needsRevisionCount;
  const headline = needsSupport > 0
    ? `${needsSupport} topic${needsSupport === 1 ? "" : "s"} need support before moving on.`
    : readyToAdvance > 0
      ? "Learning is secure enough for challenge work."
      : "Keep building learning evidence.";

  return {
    version: 1,
    studentId: output.studentId,
    masterMapSummary: output.summary,
    smartCatchUpSummary,
    progressionRecommendationSummary: {
      needsSupport,
      readyToAdvance,
      reviewNeeded,
      headline,
    },
    learningTwinSummary: {
      hasEnoughData: output.learningTwin.hasEnoughData,
      bestExplanationStyle: output.learningTwin.explanationDNA.bestExplanationStyle,
      confidenceBand: output.learningTwin.explanationDNA.confidenceBand,
      coachSupportSignal: output.learningTwin.explanationDNA.coachSupportSignal,
      todayApproach: output.learningTwin.explanationDNA.todayApproach,
    },
    examReadinessSummary: {
      score: output.examReadinessProfile.score,
      band: output.examReadinessProfile.band,
      headline: output.examReadinessProfile.headline,
      blockerCount: output.examReadinessProfile.blockers.length,
    },
    generatedAt: output.generatedAt,
    lastCalculatedAt: new Date().toISOString(),
    refreshReason: reason,
  };
}

export async function refreshAcademicIntelligenceSnapshot(input: {
  studentId: string;
  reason: AcademicIntelligenceSnapshotReason;
}): Promise<AcademicIntelligenceSnapshot | null> {
  const source = await buildAcademicSourceForStudent(input.studentId);
  if (!source) return null;

  const [existingCatchUpTasks, existingHomeworkTasks, profile] = await Promise.all([
    listCatchUpTasks(input.studentId),
    listHomeworkTasks(input.studentId),
    prisma.studentProfile.findUnique({
      where: { childId: input.studentId },
      select: { aiLearningProfileJson: true },
    }),
  ]);
  const output = buildAcademicIntelligence(source, { existingCatchUpTasks, existingHomeworkTasks });
  const snapshot = buildAcademicIntelligenceSnapshot(output, input.reason);
  const nextJson = upsertAcademicIntelligenceSnapshotJson(profile?.aiLearningProfileJson ?? null, snapshot);

  await prisma.studentProfile.upsert({
    where: { childId: input.studentId },
    create: {
      childId: input.studentId,
      aiLearningProfileJson: nextJson,
    },
    update: {
      aiLearningProfileJson: nextJson,
    },
  });

  return snapshot;
}

export async function getOrRefreshAcademicIntelligenceSnapshot(input: {
  studentId: string;
  forceRefresh?: boolean;
  reason?: AcademicIntelligenceSnapshotReason;
}): Promise<{ snapshot: AcademicIntelligenceSnapshot | null; refreshed: boolean }> {
  const profile = await prisma.studentProfile.findUnique({
    where: { childId: input.studentId },
    select: { aiLearningProfileJson: true },
  });
  const existing = readAcademicIntelligenceSnapshot(profile?.aiLearningProfileJson ?? null);
  const stale = isAcademicIntelligenceSnapshotStale(existing);
  if (existing && !input.forceRefresh && !stale) {
    return { snapshot: existing, refreshed: false };
  }
  const pendingReason = readPendingRefreshReason(profile?.aiLearningProfileJson ?? null);

  const snapshot = await refreshAcademicIntelligenceSnapshot({
    studentId: input.studentId,
    reason: input.reason ?? pendingReason ?? (existing ? "stale_snapshot" : "missing_snapshot"),
  });
  return { snapshot, refreshed: true };
}

export async function invalidateAcademicIntelligenceSnapshot(input: {
  studentId: string;
  reason: AcademicIntelligenceSnapshotReason;
}): Promise<void> {
  const profile = await prisma.studentProfile.findUnique({
    where: { childId: input.studentId },
    select: { aiLearningProfileJson: true },
  });
  const nextJson = removeAcademicIntelligenceSnapshotJson(profile?.aiLearningProfileJson ?? null, input.reason);
  await prisma.studentProfile.upsert({
    where: { childId: input.studentId },
    create: {
      childId: input.studentId,
      aiLearningProfileJson: nextJson,
    },
    update: {
      aiLearningProfileJson: nextJson,
    },
  });
}
