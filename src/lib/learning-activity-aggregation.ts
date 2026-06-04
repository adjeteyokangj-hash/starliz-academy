import { parseQuickLevelFinderBaselineDiagnostic } from "@/lib/academic-intelligence/quickLevelFinderBaseline";

type AttemptInput = {
  id: string;
  studentId: string;
  subject: string;
  skillFocus: string | null;
  correct: boolean;
  createdAt: Date | string;
};

type ProgressRecordInput = {
  id: string;
  childId: string;
  activityType: string;
  activityName: string;
  correct: boolean | null;
  completed: boolean;
  score: number | null;
  accuracy: number | null;
  createdAt: Date | string;
};

type AssignmentInput = {
  id: string;
  studentId: string;
  status: string;
  updatedAt: Date | string;
  completedAt?: Date | string | null;
};

type WeakAreaInput = {
  studentId: string;
  skillFocus: string;
  status: string;
  accuracy?: number | null;
  attemptsCount?: number | null;
  lastDetectedAt?: Date | string | null;
};

type StudentSkillInput = {
  studentId: string;
  skill: string;
  status: string;
  accuracy: number;
  attempts: number;
  updatedAt: Date | string;
};

type ProfileInput = {
  studentId: string;
  aiLearningProfileJson: string | null;
};

export type LearningActivityEvent = {
  id: string;
  studentId: string;
  source: "attempt" | "progress_record" | "assignment" | "quick_level_finder";
  topic: string;
  subject: string;
  correct: boolean | null;
  completed: boolean;
  score: number | null;
  createdAt: string;
};

export type StudentLearningActivitySummary = {
  studentId: string;
  totalEvents: number;
  attemptCount: number;
  progressRecordCount: number;
  assignmentCount: number;
  completedAssignments: number;
  correctCount: number;
  accuracy: number | null;
  activeToday: boolean;
  lastActivityAt: string | null;
  hasQuickLevelFinderPlacement: boolean;
  weakAreas: Array<{ skillFocus: string; status: string; accuracy: number | null; attemptsCount: number | null }>;
  studentSkills: Array<{ skill: string; status: string; accuracy: number; attempts: number }>;
  events: LearningActivityEvent[];
};

type BuildLearningActivityInput = {
  studentIds: string[];
  attempts?: AttemptInput[];
  progressRecords?: ProgressRecordInput[];
  assignments?: AssignmentInput[];
  weakAreas?: WeakAreaInput[];
  studentSkills?: StudentSkillInput[];
  profiles?: ProfileInput[];
  today?: Date;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function scoreFromProgress(row: ProgressRecordInput): number | null {
  if (typeof row.accuracy === "number" && Number.isFinite(row.accuracy)) return Math.max(0, Math.min(100, Math.round(row.accuracy)));
  if (typeof row.score === "number" && Number.isFinite(row.score)) return Math.max(0, Math.min(100, Math.round(row.score)));
  if (row.correct === true) return 100;
  if (row.correct === false) return 0;
  return null;
}

function blankSummary(studentId: string): StudentLearningActivitySummary {
  return {
    studentId,
    totalEvents: 0,
    attemptCount: 0,
    progressRecordCount: 0,
    assignmentCount: 0,
    completedAssignments: 0,
    correctCount: 0,
    accuracy: null,
    activeToday: false,
    lastActivityAt: null,
    hasQuickLevelFinderPlacement: false,
    weakAreas: [],
    studentSkills: [],
    events: [],
  };
}

function activityDateKey(value: string): string {
  return value.slice(0, 10);
}

export function buildLearningActivitySummaries(input: BuildLearningActivityInput): Map<string, StudentLearningActivitySummary> {
  const todayKey = (input.today ?? new Date()).toISOString().slice(0, 10);
  const summaries = new Map<string, StudentLearningActivitySummary>();
  const ensure = (studentId: string) => {
    const existing = summaries.get(studentId);
    if (existing) return existing;
    const summary = blankSummary(studentId);
    summaries.set(studentId, summary);
    return summary;
  };

  for (const id of input.studentIds) ensure(id);

  const seen = new Set<string>();
  const addEvent = (event: LearningActivityEvent) => {
    const key = `${event.source}:${event.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    const summary = ensure(event.studentId);
    summary.events.push(event);
    summary.totalEvents += 1;
    if (event.source === "attempt") summary.attemptCount += 1;
    if (event.source === "progress_record") summary.progressRecordCount += 1;
    if (event.source === "assignment") summary.assignmentCount += 1;
    if (event.source === "assignment" && event.completed) summary.completedAssignments += 1;
    if (event.correct === true) summary.correctCount += 1;
    if (activityDateKey(event.createdAt) === todayKey) summary.activeToday = true;
    if (!summary.lastActivityAt || event.createdAt > summary.lastActivityAt) {
      summary.lastActivityAt = event.createdAt;
    }
  };

  for (const attempt of input.attempts ?? []) {
    const createdAt = toIso(attempt.createdAt);
    if (!createdAt) continue;
    addEvent({
      id: attempt.id,
      studentId: attempt.studentId,
      source: "attempt",
      topic: attempt.skillFocus || attempt.subject || "General",
      subject: attempt.subject || "general",
      correct: attempt.correct,
      completed: true,
      score: attempt.correct ? 100 : 0,
      createdAt,
    });
  }

  for (const row of input.progressRecords ?? []) {
    const createdAt = toIso(row.createdAt);
    if (!createdAt) continue;
    const score = scoreFromProgress(row);
    addEvent({
      id: row.id,
      studentId: row.childId,
      source: "progress_record",
      topic: row.activityName || row.activityType || "General",
      subject: row.activityType || "general",
      correct: row.correct,
      completed: row.completed,
      score,
      createdAt,
    });
  }

  for (const assignment of input.assignments ?? []) {
    const status = assignment.status.trim().toLowerCase();
    const timestamp = toIso(assignment.completedAt ?? assignment.updatedAt);
    if (!timestamp) continue;
    addEvent({
      id: assignment.id,
      studentId: assignment.studentId,
      source: "assignment",
      topic: "Assignment",
      subject: "assignment",
      correct: null,
      completed: status === "completed",
      score: null,
      createdAt: timestamp,
    });
  }

  for (const profile of input.profiles ?? []) {
    const baseline = parseQuickLevelFinderBaselineDiagnostic(profile.aiLearningProfileJson);
    if (!baseline) continue;
    const completedAt = toIso(baseline.completedAt);
    if (!completedAt) continue;
    const summary = ensure(profile.studentId);
    summary.hasQuickLevelFinderPlacement = true;
    addEvent({
      id: `${profile.studentId}:quick-level-finder:${completedAt}`,
      studentId: profile.studentId,
      source: "quick_level_finder",
      topic: "Quick Level Finder placement",
      subject: "placement",
      correct: null,
      completed: true,
      score: null,
      createdAt: completedAt,
    });
  }

  for (const weakArea of input.weakAreas ?? []) {
    ensure(weakArea.studentId).weakAreas.push({
      skillFocus: weakArea.skillFocus,
      status: weakArea.status,
      accuracy: weakArea.accuracy ?? null,
      attemptsCount: weakArea.attemptsCount ?? null,
    });
  }

  for (const skill of input.studentSkills ?? []) {
    ensure(skill.studentId).studentSkills.push({
      skill: skill.skill,
      status: skill.status,
      accuracy: skill.accuracy,
      attempts: skill.attempts,
    });
  }

  for (const summary of summaries.values()) {
    const scored = summary.events.filter((event) => typeof event.score === "number");
    summary.accuracy = scored.length
      ? Math.round(scored.reduce((sum, event) => sum + (event.score ?? 0), 0) / scored.length)
      : null;
    summary.events.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  return summaries;
}

export function learningActivityTopicBuckets(events: LearningActivityEvent[]): Array<{ topic: string; accuracy: number; attempts: number }> {
  const buckets = new Map<string, { total: number; scoreTotal: number }>();
  for (const event of events) {
    if (typeof event.score !== "number") continue;
    const existing = buckets.get(event.topic) ?? { total: 0, scoreTotal: 0 };
    existing.total += 1;
    existing.scoreTotal += event.score;
    buckets.set(event.topic, existing);
  }
  return [...buckets.entries()]
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.total ? Math.round(stats.scoreTotal / stats.total) : 0,
      attempts: stats.total,
    }))
    .sort((left, right) => right.accuracy - left.accuracy);
}
