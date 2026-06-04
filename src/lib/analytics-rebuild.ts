import { updateLearningDnaFromAttempt } from "@/lib/learning_dna";
import { parseSkills, skillFocusToCode } from "@/lib/skills";

type RebuildAttempt = {
  id: string;
  studentId: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  skillFocus: string;
  contentId: string | null;
  assignmentId: string | null;
  questionText: string | null;
  correctAnswer: string | null;
  answerGiven: string | null;
  correct: boolean;
  responseTimeMs: number;
  hintsUsed: number;
  difficulty: number;
  skills: string | null;
  createdAt: Date;
};

type ExistingWeakArea = {
  id: string;
  studentId: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  skillFocus: string;
  accuracy: number;
  attemptsCount: number;
  status: string;
  weaknessType: string;
  currentDifficulty: number;
  metadataJson: string | null;
};

type ExistingStudentSkill = {
  id: string;
  studentId: string;
  skill: string;
  attempts: number;
  correct: number;
  accuracy: number;
  status: string;
};

type ExistingProfile = {
  childId: string;
  aiLearningProfileJson: string | null;
};

type ExistingAssignment = {
  id: string;
  studentId: string;
  contentId: string;
  status: string;
  completedAt: Date | null;
  content: { contentType: string; contentJson: string };
};

export type WeakAreaRebuildTarget = {
  studentId: string;
  subject: string;
  skillFocus: string;
  keyStage: string | null;
  yearGroup: string | null;
  weaknessType: string;
  accuracy: number;
  attemptsCount: number;
  currentDifficulty: number;
  status: string;
  metadataJson: string;
  changed: boolean;
  before: ExistingWeakArea | null;
};

export type StudentSkillRebuildTarget = {
  studentId: string;
  skill: string;
  attempts: number;
  correct: number;
  accuracy: number;
  status: "weak" | "improving" | "mastered";
  changed: boolean;
  before: ExistingStudentSkill | null;
};

export type LearningDnaRebuildTarget = {
  studentId: string;
  changed: boolean;
  beforeTotalAttempts: number | null;
  afterTotalAttempts: number;
  nextProfileJson: string;
};

export type AssignmentRebuildTarget = {
  assignmentId: string;
  studentId: string;
  fromStatus: string;
  toStatus: "completed";
  completedAt: string;
  linkedCorrectAttempts: number;
};

export type AssignmentNeedsReviewTarget = {
  assignmentId: string;
  studentId: string;
  reason: "missing_items" | "unparseable_content_json" | "insufficient_evidence";
  linkedCorrectAttempts: number;
};

export type AnalyticsRebuildPlan = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  studentsConsidered: number;
  evidence: {
    complete: boolean;
    note: string;
  };
  homeworkBackfill: { available: boolean; note: string };
  weakAreas: WeakAreaRebuildTarget[];
  studentSkills: StudentSkillRebuildTarget[];
  learningDna: LearningDnaRebuildTarget[];
  assignments: AssignmentRebuildTarget[];
  assignmentsNeedsReview: AssignmentNeedsReviewTarget[];
  academicSnapshots: Array<{ studentId: string; reason: "manual_refresh"; wouldRefresh: true }>;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readLearningDnaTotal(raw: string | null | undefined): number | null {
  const learningDna = parseJson(raw).learningDna;
  if (!learningDna || typeof learningDna !== "object" || Array.isArray(learningDna)) return null;
  const total = Number((learningDna as Record<string, unknown>).totalAttempts);
  return Number.isFinite(total) ? total : null;
}

function statusFromAccuracy(accuracy: number, recentAttempts: RebuildAttempt[]): "active" | "improving" | "resolved" {
  const recentTwoStrong = recentAttempts.slice(0, 2).length === 2 && recentAttempts.slice(0, 2).every((attempt) => attempt.correct);
  if (accuracy >= 80 && recentTwoStrong) return "resolved";
  if (accuracy >= 60) return "improving";
  return "active";
}

function skillStatus(accuracy: number): "weak" | "improving" | "mastered" {
  if (accuracy >= 80) return "mastered";
  if (accuracy >= 60) return "improving";
  return "weak";
}

function weaknessType(accuracy: number, hintUsage: number, avgResponse: number, studentAvgResponse: number): string {
  if (accuracy < 60) return "weak";
  if (hintUsage >= 0.5) return "needs support";
  if (studentAvgResponse > 0 && avgResponse > studentAvgResponse * 1.35) return "slow recall";
  return "improving";
}

function latestByCreatedAt(attempts: RebuildAttempt[]): RebuildAttempt[] {
  return [...attempts].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function assignmentItemsResult(contentJson: string): { items: Array<Record<string, unknown>>; parseFailed: boolean } {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      return {
        items: parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)),
        parseFailed: false,
      };
    }
    return { items: [], parseFailed: false };
  } catch {
    return { items: [], parseFailed: true };
  }
}

function attemptMatchesItem(attempt: RebuildAttempt, item: Record<string, unknown>): boolean {
  const possibleValues = [
    item.id,
    item.word,
    item.question,
    item.questionText,
    item.prompt,
    item.answer,
    item.correctAnswer,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalize);
  const attemptValues = [attempt.questionText, attempt.correctAnswer, attempt.answerGiven].map(normalize).filter(Boolean);
  return possibleValues.some((value) => attemptValues.includes(value));
}

function profileWithoutLearningDna(profileJson: string | null): string {
  const profile = parseJson(profileJson);
  delete profile.learningDna;
  return JSON.stringify(profile);
}

export function buildAnalyticsRebuildPlan(input: {
  mode?: "dry-run" | "apply";
  generatedAt?: Date;
  studentIds: string[];
  attempts: RebuildAttempt[];
  existingWeakAreas: ExistingWeakArea[];
  existingStudentSkills: ExistingStudentSkill[];
  existingProfiles: ExistingProfile[];
  assignments: ExistingAssignment[];
  homeworkTablesAvailable: boolean;
  evidenceComplete?: boolean;
  evidenceNote?: string;
}): AnalyticsRebuildPlan {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const mode = input.mode ?? "dry-run";
  const evidenceComplete = input.evidenceComplete ?? true;
  if (mode === "apply" && !evidenceComplete) {
    throw new Error(`Refusing apply mode with incomplete evidence: ${input.evidenceNote ?? "unknown"}`);
  }
  const studentSet = new Set(input.studentIds);
  const attempts = input.attempts.filter((attempt) => studentSet.has(attempt.studentId));
  const attemptsByStudent = new Map<string, RebuildAttempt[]>();
  const attemptsBySkillKey = new Map<string, RebuildAttempt[]>();
  const attemptsByAssignment = new Map<string, RebuildAttempt[]>();

  for (const attempt of attempts) {
    const studentAttempts = attemptsByStudent.get(attempt.studentId) ?? [];
    studentAttempts.push(attempt);
    attemptsByStudent.set(attempt.studentId, studentAttempts);

    const weakKey = `${attempt.studentId}::${normalize(attempt.subject)}::${normalize(attempt.skillFocus)}`;
    const weakAttempts = attemptsBySkillKey.get(weakKey) ?? [];
    weakAttempts.push(attempt);
    attemptsBySkillKey.set(weakKey, weakAttempts);

    if (attempt.assignmentId) {
      const assignmentAttempts = attemptsByAssignment.get(attempt.assignmentId) ?? [];
      assignmentAttempts.push(attempt);
      attemptsByAssignment.set(attempt.assignmentId, assignmentAttempts);
    }
  }

  const weakAreaByKey = new Map(input.existingWeakAreas.map((row) => [
    `${row.studentId}::${normalize(row.subject)}::${normalize(row.skillFocus)}`,
    row,
  ]));
  const weakAreas: WeakAreaRebuildTarget[] = [];
  for (const [groupKey, groupAttempts] of attemptsBySkillKey.entries()) {
    if (groupAttempts.length < 2) continue;
    const ordered = latestByCreatedAt(groupAttempts).slice(0, 12);
    const [first] = ordered;
    if (!first) continue;
    const correct = ordered.filter((attempt) => attempt.correct).length;
    const accuracy = Math.round((correct / ordered.length) * 100);
    const hintUsage = ordered.filter((attempt) => attempt.hintsUsed > 0).length / ordered.length;
    const avgResponse = Math.round(ordered.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / ordered.length);
    const studentAttempts = attemptsByStudent.get(first.studentId) ?? ordered;
    const studentAvgResponse = Math.round(studentAttempts.reduce((sum, attempt) => sum + attempt.responseTimeMs, 0) / Math.max(1, studentAttempts.length));
    const status = statusFromAccuracy(accuracy, ordered);
    const before = weakAreaByKey.get(groupKey) ?? null;
    const target: WeakAreaRebuildTarget = {
      studentId: first.studentId,
      subject: first.subject,
      skillFocus: first.skillFocus,
      keyStage: first.keyStage,
      yearGroup: first.yearGroup,
      weaknessType: weaknessType(accuracy, hintUsage, avgResponse, studentAvgResponse),
      accuracy,
      attemptsCount: ordered.length,
      currentDifficulty: first.difficulty,
      status,
      metadataJson: stableJson({ rebuiltFrom: "attempts", hintUsage, avgResponse }),
      changed: !before
        || before.accuracy !== accuracy
        || before.attemptsCount !== ordered.length
        || before.status !== status
        || before.weaknessType !== weaknessType(accuracy, hintUsage, avgResponse, studentAvgResponse)
        || before.currentDifficulty !== first.difficulty
        || String(before.metadataJson ?? "") !== stableJson({ rebuiltFrom: "attempts", hintUsage, avgResponse })
        || normalize(before.subject) !== normalize(first.subject)
        || normalize(before.skillFocus) !== normalize(first.skillFocus)
        || normalize(before.keyStage) !== normalize(first.keyStage)
        || normalize(before.yearGroup) !== normalize(first.yearGroup),
      before,
    };
    weakAreas.push(target);
  }

  const existingSkillByKey = new Map(input.existingStudentSkills.map((row) => [`${row.studentId}::${normalize(row.skill)}`, row]));
  const skillStats = new Map<string, { studentId: string; skill: string; attempts: number; correct: number }>();
  for (const attempt of attempts) {
    const codes = parseSkills(attempt.skills);
    const inferred = skillFocusToCode(attempt.skillFocus);
    const skills = [...new Set([...codes, ...(inferred ? [inferred] : [])])];
    for (const skill of skills) {
      const key = `${attempt.studentId}::${normalize(skill)}`;
      const current = skillStats.get(key) ?? { studentId: attempt.studentId, skill, attempts: 0, correct: 0 };
      current.attempts += 1;
      if (attempt.correct) current.correct += 1;
      skillStats.set(key, current);
    }
  }
  const studentSkills = [...skillStats.values()].map((stats) => {
    const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
    const status = skillStatus(accuracy);
    const before = existingSkillByKey.get(`${stats.studentId}::${normalize(stats.skill)}`) ?? null;
    return {
      ...stats,
      accuracy,
      status,
      changed: !before
        || before.attempts !== stats.attempts
        || before.correct !== stats.correct
        || Math.round(before.accuracy) !== accuracy
        || before.status !== status,
      before,
    };
  });

  const profileByStudent = new Map(input.existingProfiles.map((profile) => [profile.childId, profile]));
  const learningDna: LearningDnaRebuildTarget[] = [];
  for (const [studentId, rows] of attemptsByStudent.entries()) {
    let profileJson = profileWithoutLearningDna(profileByStudent.get(studentId)?.aiLearningProfileJson ?? null);
    for (const attempt of [...rows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
      const subject = attempt.subject === "maths" ? "math" : attempt.subject;
      if (subject !== "spelling" && subject !== "math" && subject !== "reading") continue;
      profileJson = updateLearningDnaFromAttempt(profileJson, {
        subject,
        skillFocus: attempt.skillFocus,
        correct: attempt.correct,
        responseTimeMs: attempt.responseTimeMs,
        hintsUsed: attempt.hintsUsed,
        difficulty: attempt.difficulty,
      }).nextProfileJson;
    }
    const beforeJson = profileByStudent.get(studentId)?.aiLearningProfileJson ?? null;
    const beforeTotalAttempts = readLearningDnaTotal(beforeJson);
    const afterTotalAttempts = readLearningDnaTotal(profileJson) ?? 0;
    learningDna.push({
      studentId,
      changed: beforeTotalAttempts !== afterTotalAttempts || !beforeJson || !parseJson(beforeJson).learningDna,
      beforeTotalAttempts,
      afterTotalAttempts,
      nextProfileJson: profileJson,
    });
  }

  const assignments: AssignmentRebuildTarget[] = [];
  const assignmentsNeedsReview: AssignmentNeedsReviewTarget[] = [];
  for (const assignment of input.assignments) {
    if (assignment.status === "completed") continue;
    const linkedAttempts = attemptsByAssignment.get(assignment.id)?.filter((attempt) => attempt.studentId === assignment.studentId && attempt.correct) ?? [];
    if (!linkedAttempts.length) continue;
    const parsedItems = assignmentItemsResult(assignment.content.contentJson);
    const items = parsedItems.items;
    if (parsedItems.parseFailed) {
      assignmentsNeedsReview.push({
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        reason: "unparseable_content_json",
        linkedCorrectAttempts: linkedAttempts.length,
      });
      continue;
    }
    if (!items.length) {
      assignmentsNeedsReview.push({
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        reason: "missing_items",
        linkedCorrectAttempts: linkedAttempts.length,
      });
      continue;
    }
    const completionProven = items.every((item) => linkedAttempts.some((attempt) => attemptMatchesItem(attempt, item)));
    if (!completionProven) continue;
    const latestCorrect = latestByCreatedAt(linkedAttempts)[0];
    assignments.push({
      assignmentId: assignment.id,
      studentId: assignment.studentId,
      fromStatus: assignment.status,
      toStatus: "completed",
      completedAt: (latestCorrect?.createdAt ?? new Date(generatedAt)).toISOString(),
      linkedCorrectAttempts: linkedAttempts.length,
    });
  }

  const studentIdsWithEvidence = new Set([
    ...attemptsByStudent.keys(),
    ...input.existingProfiles
      .filter((profile) => Boolean(parseJson(profile.aiLearningProfileJson).quickLevelFinder))
      .map((profile) => profile.childId),
  ]);

  return {
    generatedAt,
    mode,
    studentsConsidered: input.studentIds.length,
    evidence: {
      complete: evidenceComplete,
      note: input.evidenceNote ?? "complete evidence",
    },
    homeworkBackfill: {
      available: input.homeworkTablesAvailable,
      note: input.homeworkTablesAvailable
        ? "Homework evidence tables are available; this phase does not mutate homework rows."
        : "HomeworkBatch/HomeworkAnswer unavailable; homework DB backfill skipped safely.",
    },
    weakAreas: weakAreas.filter((target) => target.changed),
    studentSkills: studentSkills.filter((target) => target.changed),
    learningDna: learningDna.filter((target) => target.changed),
    assignments,
    assignmentsNeedsReview,
    academicSnapshots: [...studentIdsWithEvidence].map((studentId) => ({ studentId, reason: "manual_refresh", wouldRefresh: true as const })),
  };
}
