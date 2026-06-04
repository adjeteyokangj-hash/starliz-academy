#!/usr/bin/env tsx

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { PrismaClient } from "@prisma/client";
import { buildAnalyticsRebuildPlan } from "../src/lib/analytics-rebuild";
import { buildLearningActivitySummaries } from "../src/lib/learning-activity-aggregation";

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const name = trimmed.slice(0, idx).trim();
      const rawValue = trimmed.slice(idx + 1).trim();
      process.env[name] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const SAMPLE_LIMIT = 12;
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const AUDIT_LIMITS = {
  assignments: 5000,
  attemptsForAssignments: 10000,
  attemptsForVisibility: 20000,
  progressForVisibility: 20000,
  weakAreas: 10000,
  studentSkills: 10000,
  studentProfiles: 10000,
  attemptSkillScan: 20000,
} as const;
let prismaClient: PrismaClient | null = null;

type StudentSample = {
  studentId: string;
  detail?: string;
};

type AuditSection = {
  count: number;
  samples: StudentSample[];
  note?: string;
};

function sample(ids: Array<string | StudentSample>, limit = SAMPLE_LIMIT): StudentSample[] {
  return ids.slice(0, limit).map((item) => (typeof item === "string" ? { studentId: item } : item));
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

function hasQuickLevelFinderOrPlacement(profileJson: string | null | undefined): boolean {
  const parsed = parseJson(profileJson);
  const qlf = parsed.quickLevelFinder;
  const placement = parsed.quickLevelFinderPlacementRecommendation;
  return Boolean(
    (qlf && typeof qlf === "object")
    || (placement && typeof placement === "object")
  );
}

function hasCompletedQlfOrPlacement(profileJson: string | null | undefined): boolean {
  const parsed = parseJson(profileJson);
  const qlf = parsed.quickLevelFinder;
  const placement = parsed.quickLevelFinderPlacementRecommendation;
  const status = qlf && typeof qlf === "object" ? (qlf as Record<string, unknown>).status : null;
  return status === "completed" || Boolean(placement && typeof placement === "object");
}

function readSnapshotStatus(profileJson: string | null | undefined, now = new Date()): "missing" | "stale" | "fresh" | "invalid" {
  const parsed = parseJson(profileJson);
  const snapshot = parsed.academicIntelligenceSnapshot;
  if (!snapshot) return "missing";
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "invalid";
  const lastCalculatedAt = (snapshot as Record<string, unknown>).lastCalculatedAt;
  if (typeof lastCalculatedAt !== "string") return "invalid";
  const parsedAt = Date.parse(lastCalculatedAt);
  if (!Number.isFinite(parsedAt)) return "invalid";
  return now.getTime() - parsedAt > SNAPSHOT_TTL_MS ? "stale" : "fresh";
}

function key(...parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part ?? "").trim().toLowerCase()).join("::");
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "P2021" || maybe.code === "P2022") return true;
  const message = String(maybe.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("not found in the current database");
}

async function readOnlyQuery<T>(label: string, query: () => Promise<T>, fallback: T, unavailable: string[]): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingTableError(error)) {
      unavailable.push(label);
      return fallback;
    }
    throw error;
  }
}

async function main() {
  const { prisma } = await import("../src/lib/db") as { prisma: PrismaClient };
  prismaClient = prisma;
  const now = new Date();
  const unavailableModels: string[] = [];
  const partialSections: Array<{ section: string; loaded: number; limit: number }> = [];

  const students = await readOnlyQuery("ChildProfile", () => prisma.childProfile.findMany({
      where: { archived: false },
      select: { id: true, parentId: true, name: true },
      orderBy: { createdAt: "asc" },
    }), [], unavailableModels);
  const attemptGroups = await readOnlyQuery("Attempt", () => prisma.attempt.groupBy({ by: ["studentId"], _count: { _all: true } }), [], unavailableModels);
  const progressGroups = await readOnlyQuery("ProgressRecord", () => prisma.progressRecord.groupBy({ by: ["childId"], _count: { _all: true } }), [], unavailableModels);
  const homeworkBatchGroups = await readOnlyQuery("HomeworkBatch", () => prisma.homeworkBatch.groupBy({
      by: ["studentId"],
      where: {
        OR: [
          { submittedAt: { not: null } },
          { completedAt: { not: null } },
          { status: { in: ["SUBMITTED", "MARKED", "REVIEW_NEEDED", "COMPLETED"] } },
        ],
      },
      _count: { _all: true },
    }), [], unavailableModels);
  const homeworkAnswerGroups = await readOnlyQuery("HomeworkAnswer", () => prisma.homeworkAnswer.groupBy({
      by: ["studentId"],
      where: {
        OR: [
          { submittedAt: { not: null } },
          { isAnswered: true },
        ],
      },
      _count: { _all: true },
    }), [], unavailableModels);
  const assignments = await readOnlyQuery("Assignment", () => prisma.assignment.findMany({
      where: { status: { in: ["in_progress", "completed"] } },
      select: {
        id: true,
        studentId: true,
        contentId: true,
        status: true,
        completedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: AUDIT_LIMITS.assignments,
    }), [], unavailableModels);
  const assignmentAttemptGroups = await readOnlyQuery("Attempt.assignmentId groups", () => prisma.attempt.groupBy({
      by: ["assignmentId"],
      where: { assignmentId: { not: null } },
      _count: { _all: true },
    }), [], unavailableModels);
  const attemptsForAssignments = await readOnlyQuery("Attempt linked assignments", () => prisma.attempt.findMany({
      where: { assignmentId: { not: null } },
      select: {
        id: true,
        studentId: true,
        assignmentId: true,
        contentId: true,
        subject: true,
        skillFocus: true,
        correct: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: AUDIT_LIMITS.attemptsForAssignments,
    }), [], unavailableModels);
  const attemptsForVisibility = await readOnlyQuery("Attempt admin visibility scan", () => prisma.attempt.findMany({
      select: {
        id: true,
        studentId: true,
        subject: true,
        skillFocus: true,
        correct: true,
        createdAt: true,
      },
      take: AUDIT_LIMITS.attemptsForVisibility,
    }), [], unavailableModels);
  const progressForVisibility = await readOnlyQuery("ProgressRecord admin visibility scan", () => prisma.progressRecord.findMany({
      select: {
        id: true,
        childId: true,
        activityType: true,
        activityName: true,
        correct: true,
        completed: true,
        score: true,
        accuracy: true,
        createdAt: true,
      },
      take: AUDIT_LIMITS.progressForVisibility,
    }), [], unavailableModels);
  const weakAreas = await readOnlyQuery("WeakArea", () => prisma.weakArea.findMany({
      select: {
        id: true,
        studentId: true,
        subject: true,
        keyStage: true,
        yearGroup: true,
        skillFocus: true,
        accuracy: true,
        attemptsCount: true,
        status: true,
        weaknessType: true,
        currentDifficulty: true,
        metadataJson: true,
        updatedAt: true,
      },
      take: AUDIT_LIMITS.weakAreas,
    }), [], unavailableModels);
  const studentSkills = await readOnlyQuery("StudentSkill", () => prisma.studentSkill.findMany({
      select: {
        id: true,
        studentId: true,
        skill: true,
        attempts: true,
        correct: true,
        accuracy: true,
        status: true,
        updatedAt: true,
      },
      take: AUDIT_LIMITS.studentSkills,
    }), [], unavailableModels);
  const studentProfiles = await readOnlyQuery("StudentProfile", () => prisma.studentProfile.findMany({
      select: { childId: true, aiLearningProfileJson: true, updatedAt: true },
      take: AUDIT_LIMITS.studentProfiles,
    }), [], unavailableModels);

  const markPartial = (section: string, loaded: number, limit: number) => {
    if (loaded >= limit) partialSections.push({ section, loaded, limit });
  };
  markPartial("Assignment", assignments.length, AUDIT_LIMITS.assignments);
  markPartial("Attempt linked assignments", attemptsForAssignments.length, AUDIT_LIMITS.attemptsForAssignments);
  markPartial("Attempt admin visibility scan", attemptsForVisibility.length, AUDIT_LIMITS.attemptsForVisibility);
  markPartial("ProgressRecord admin visibility scan", progressForVisibility.length, AUDIT_LIMITS.progressForVisibility);
  markPartial("WeakArea", weakAreas.length, AUDIT_LIMITS.weakAreas);
  markPartial("StudentSkill", studentSkills.length, AUDIT_LIMITS.studentSkills);
  markPartial("StudentProfile", studentProfiles.length, AUDIT_LIMITS.studentProfiles);

  const studentIds = new Set(students.map((student) => student.id));
  const attemptCounts = new Map(attemptGroups.map((row) => [row.studentId, row._count._all]));
  const progressCounts = new Map(progressGroups.map((row) => [row.childId, row._count._all]));
  const homeworkBatchCounts = new Map(homeworkBatchGroups.map((row) => [row.studentId, row._count._all]));
  const homeworkAnswerCounts = new Map(homeworkAnswerGroups.map((row) => [row.studentId, row._count._all]));
  const attemptStudentIds = [...attemptCounts.keys()].filter((id) => studentIds.has(id));
  const progressStudentIds = [...progressCounts.keys()].filter((id) => studentIds.has(id));

  const attemptsNoProgress = attemptStudentIds.filter((id) => !progressCounts.has(id));
  const progressNoAttempts = progressStudentIds.filter((id) => !attemptCounts.has(id));
  const visibilitySummaries = buildLearningActivitySummaries({
    studentIds: students.map((student) => student.id),
    attempts: attemptsForVisibility,
    progressRecords: progressForVisibility,
  });
  const attemptOnlyMissingAdminVisibility = attemptsNoProgress.filter((id) => {
    const summary = visibilitySummaries.get(id);
    return !summary || summary.attemptCount === 0 || summary.totalEvents === 0;
  });

  const homeworkStudentIds = new Set([
    ...homeworkBatchCounts.keys(),
    ...homeworkAnswerCounts.keys(),
  ].filter((id) => studentIds.has(id)));
  const homeworkNoGeneric = [...homeworkStudentIds].filter((id) => !attemptCounts.has(id) && !progressCounts.has(id));
  const homeworkNoProgress = [...homeworkStudentIds].filter((id) => !progressCounts.has(id));

  const assignmentAttemptCount = new Map(assignmentAttemptGroups
    .filter((row) => row.assignmentId)
    .map((row) => [row.assignmentId as string, row._count._all]));
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const assignmentAttemptsByAssignment = new Map<string, typeof attemptsForAssignments>();
  for (const attempt of attemptsForAssignments) {
    if (!attempt.assignmentId) continue;
    const rows = assignmentAttemptsByAssignment.get(attempt.assignmentId) ?? [];
    rows.push(attempt);
    assignmentAttemptsByAssignment.set(attempt.assignmentId, rows);
  }

  const assignmentIssues: StudentSample[] = [];
  for (const assignment of assignments) {
    const linkedAttempts = assignmentAttemptsByAssignment.get(assignment.id) ?? [];
    if (!linkedAttempts.length) {
      assignmentIssues.push({ studentId: assignment.studentId, detail: `${assignment.status} assignment ${assignment.id} has no linked attempts` });
      continue;
    }
    const mismatchedStudent = linkedAttempts.find((attempt) => attempt.studentId !== assignment.studentId);
    if (mismatchedStudent) {
      assignmentIssues.push({ studentId: assignment.studentId, detail: `assignment ${assignment.id} has attempt ${mismatchedStudent.id} for student ${mismatchedStudent.studentId}` });
    }
    const mismatchedContent = linkedAttempts.find((attempt) => attempt.contentId && attempt.contentId !== assignment.contentId);
    if (mismatchedContent) {
      assignmentIssues.push({ studentId: assignment.studentId, detail: `assignment ${assignment.id} has attempt ${mismatchedContent.id} for content ${mismatchedContent.contentId}` });
    }
    if (assignment.status === "completed" && !linkedAttempts.some((attempt) => attempt.correct)) {
      assignmentIssues.push({ studentId: assignment.studentId, detail: `completed assignment ${assignment.id} has no correct linked attempts` });
    }
  }

  const qlfStudents = studentProfiles
    .filter((profile) => studentIds.has(profile.childId) && hasQuickLevelFinderOrPlacement(profile.aiLearningProfileJson));
  const qlfCompletedRows = qlfStudents.filter((profile) => hasCompletedQlfOrPlacement(profile.aiLearningProfileJson));
  const qlfActivityPending = qlfCompletedRows.filter((profile) => {
    const hasLearningActivity = (attemptCounts.get(profile.childId) ?? 0) > 0
      || (progressCounts.get(profile.childId) ?? 0) > 0;
    return !hasLearningActivity && readSnapshotStatus(profile.aiLearningProfileJson, now) === "fresh";
  });
  const qlfMissingAdminSignals = qlfCompletedRows.filter((profile) => {
    if (!hasCompletedQlfOrPlacement(profile.aiLearningProfileJson)) return false;
    const hasActivity = (attemptCounts.get(profile.childId) ?? 0) > 0
      || (progressCounts.get(profile.childId) ?? 0) > 0
      || (assignmentAttemptCount.size > 0 && assignments.some((assignment) => assignment.studentId === profile.childId))
      || weakAreas.some((area) => area.studentId === profile.childId)
      || studentSkills.some((skill) => skill.studentId === profile.childId);
    const snapshotStatus = readSnapshotStatus(profile.aiLearningProfileJson, now);
    return snapshotStatus !== "fresh" || (!hasActivity && snapshotStatus !== "fresh");
  });

  const snapshotStatusByStudent = studentProfiles
    .filter((profile) => studentIds.has(profile.childId))
    .map((profile) => ({ studentId: profile.childId, status: readSnapshotStatus(profile.aiLearningProfileJson, now) }));
  const missingSnapshots = snapshotStatusByStudent.filter((row) => row.status === "missing");
  const staleSnapshots = snapshotStatusByStudent.filter((row) => row.status === "stale" || row.status === "invalid");

  const attemptsByStudentSubjectSkill = new Map<string, { total: number; correct: number }>();
  const attemptsForSkillScan = await readOnlyQuery("Attempt full skill scan", () => prisma.attempt.findMany({
    select: {
      id: true,
      studentId: true,
      subject: true,
      keyStage: true,
      yearGroup: true,
      skillFocus: true,
      contentId: true,
      assignmentId: true,
      questionText: true,
      correctAnswer: true,
      answerGiven: true,
      correct: true,
      responseTimeMs: true,
      hintsUsed: true,
      difficulty: true,
      skills: true,
      createdAt: true,
    },
    take: AUDIT_LIMITS.attemptSkillScan,
  }), [], unavailableModels);
  markPartial("Attempt full skill scan", attemptsForSkillScan.length, AUDIT_LIMITS.attemptSkillScan);
  for (const attempt of attemptsForSkillScan) {
    const id = key(attempt.studentId, attempt.subject, attempt.skillFocus);
    const current = attemptsByStudentSubjectSkill.get(id) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (attempt.correct) current.correct += 1;
    attemptsByStudentSubjectSkill.set(id, current);
  }

  const heuristicWeakAreaMisalignments = weakAreas.filter((area) => {
    const stats = attemptsByStudentSubjectSkill.get(key(area.studentId, area.subject, area.skillFocus));
    if (!stats) return true;
    const accuracy = Math.round((stats.correct / Math.max(1, stats.total)) * 100);
    return Math.abs(accuracy - area.accuracy) > 15 || Math.abs(stats.total - area.attemptsCount) > 2;
  });

  const skillsByStudent = new Map<string, typeof studentSkills>();
  for (const row of studentSkills) {
    const rows = skillsByStudent.get(row.studentId) ?? [];
    rows.push(row);
    skillsByStudent.set(row.studentId, rows);
  }
  const heuristicStudentSkillMisalignments = studentSkills.filter((skill) => {
    const matchingAttemptStats = [...attemptsByStudentSubjectSkill.entries()]
      .filter(([attemptKey]) => attemptKey.startsWith(`${skill.studentId.toLowerCase()}::`) && attemptKey.includes(skill.skill.toLowerCase()))
      .reduce((sum, [, stats]) => ({ total: sum.total + stats.total, correct: sum.correct + stats.correct }), { total: 0, correct: 0 });
    if (matchingAttemptStats.total === 0) return true;
    return Math.abs(matchingAttemptStats.total - skill.attempts) > 3;
  });
  const rebuildPlan = buildAnalyticsRebuildPlan({
    mode: "dry-run",
    studentIds: students.map((student) => student.id),
    attempts: attemptsForSkillScan,
    existingWeakAreas: weakAreas,
    existingStudentSkills: studentSkills,
    existingProfiles: studentProfiles,
    assignments: [],
    homeworkTablesAvailable: !unavailableModels.includes("HomeworkBatch") && !unavailableModels.includes("HomeworkAnswer"),
    evidenceComplete: partialSections.length === 0,
    evidenceNote: partialSections.length
      ? `Partial audit evidence: ${partialSections.map((section) => section.section).join(", ")}`
      : "complete evidence",
  });
  const weakAreaMisalignments = rebuildPlan.weakAreas;
  const studentSkillMisalignments = rebuildPlan.studentSkills;

  const orphanAttemptStudentIds = [...attemptCounts.keys()].filter((id) => !studentIds.has(id));
  const orphanProgressChildIds = [...progressCounts.keys()].filter((id) => !studentIds.has(id));
  const assignmentStudentMismatchAttempts = attemptsForAssignments.filter((attempt) => {
    if (!attempt.assignmentId) return false;
    const assignment = assignmentById.get(attempt.assignmentId);
    return Boolean(assignment && assignment.studentId !== attempt.studentId);
  });

  const report: {
    generatedAt: string;
    mode: "read-only";
    canonicalLearnerId: "ChildProfile.id";
    totals: Record<string, number>;
    definitions: Record<string, string>;
    sections: Record<string, AuditSection>;
    partial: {
      isPartial: boolean;
      reasons: Array<{ section: string; loaded: number; limit: number }>;
    };
  } = {
    generatedAt: now.toISOString(),
    mode: "read-only",
    canonicalLearnerId: "ChildProfile.id",
    partial: {
      isPartial: partialSections.length > 0,
      reasons: partialSections,
    },
    totals: {
      activeStudents: students.length,
      studentsWithAttempts: attemptStudentIds.length,
      studentsWithProgressRecords: progressStudentIds.length,
      studentsWithHomeworkSubmissions: homeworkStudentIds.size,
      inProgressOrCompletedAssignmentsAudited: assignments.length,
      studentProfilesAudited: studentProfiles.length,
      unavailableModelQueries: unavailableModels.length,
      partialSectionCount: partialSections.length,
    },
    definitions: {
      genericAnalyticsVisibility: "At least one Attempt or ProgressRecord row for the canonical ChildProfile.id.",
      adminReadinessSignals: "Completed QLF/placement plus fresh academic snapshot and at least one activity, assignment, weak-area, or skill signal.",
      staleSnapshot: `academicIntelligenceSnapshot missing/invalid or older than ${SNAPSHOT_TTL_MS / 60000} minutes.`,
      identityRisk: "Rows whose studentId/childId/assignment.studentId do not resolve to the same ChildProfile.id.",
    },
    sections: {
      unavailableModelQueries: {
        count: unavailableModels.length,
        samples: sample(unavailableModels.map((label) => ({ studentId: "n/a", detail: label }))),
        note: "Missing tables/models were treated as unavailable evidence; no writes were attempted.",
      },
      partialEvidenceWarnings: {
        count: partialSections.length,
        samples: sample(partialSections.map((item) => ({
          studentId: "n/a",
          detail: `${item.section} reached cap ${item.loaded}/${item.limit}`,
        }))),
        note: partialSections.length
          ? "This report is partial because one or more capped queries reached their limit."
          : "No capped query reached its limit.",
      },
      attemptsButNoProgressRecords: {
        count: attemptsNoProgress.length,
        samples: sample(attemptsNoProgress),
      },
      attemptOnlyStudentsMissingAdminVisibility: {
        count: attemptOnlyMissingAdminVisibility.length,
        samples: sample(attemptOnlyMissingAdminVisibility),
        note: "Attempt-only students should be visible through the shared learning activity aggregation helper.",
      },
      progressRecordsButNoAttempts: {
        count: progressNoAttempts.length,
        samples: sample(progressNoAttempts),
      },
      homeworkSubmissionsNoGenericAnalyticsVisibility: {
        count: homeworkNoGeneric.length,
        samples: sample(homeworkNoGeneric.map((id) => ({
          studentId: id,
          detail: `${homeworkBatchCounts.get(id) ?? 0} submitted/completed homework batch(es), ${homeworkAnswerCounts.get(id) ?? 0} answered/submitted homework answer(s), no Attempt/ProgressRecord rows`,
        }))),
        note: `${homeworkNoProgress.length} homework student(s) have no ProgressRecord rows even if they may have Attempt rows.`,
      },
      assignmentsCompletedOrInProgressWithMissingOrInconsistentAttempts: {
        count: assignmentIssues.length,
        samples: sample(assignmentIssues),
      },
      qlfPlacementDataMissingAdminReadinessSignals: {
        count: qlfMissingAdminSignals.length,
        samples: sample(qlfMissingAdminSignals.map((profile) => ({
          studentId: profile.childId,
          detail: `snapshot=${readSnapshotStatus(profile.aiLearningProfileJson, now)}, attempts=${attemptCounts.get(profile.childId) ?? 0}, progress=${progressCounts.get(profile.childId) ?? 0}`,
        }))),
        note: "QLF rows with fresh snapshots and no learning activity are reported separately as activity pending.",
      },
      qlfCompleteActivityPending: {
        count: qlfActivityPending.length,
        samples: sample(qlfActivityPending.map((profile) => ({
          studentId: profile.childId,
          detail: "QLF complete, activity pending",
        }))),
      },
      missingAcademicIntelligenceSnapshots: {
        count: missingSnapshots.length,
        samples: sample(missingSnapshots),
      },
      staleOrInvalidAcademicIntelligenceSnapshots: {
        count: staleSnapshots.length,
        samples: sample(staleSnapshots.map((row) => ({ studentId: row.studentId, detail: row.status }))),
      },
      weakAreasPossiblyOutOfSyncWithAttempts: {
        count: weakAreaMisalignments.length,
        samples: sample(weakAreaMisalignments.map((target) => ({
          studentId: target.studentId,
          detail: `${target.subject}/${target.skillFocus} before=${target.before?.accuracy ?? "missing"}%/${target.before?.attemptsCount ?? 0} attempt(s), rebuild=${target.accuracy}%/${target.attemptsCount} attempt(s)`,
        }))),
        note: rebuildPlan.weakAreas.length === 0 && heuristicWeakAreaMisalignments.length > 0
          ? "Suppressed heuristic drift because rebuild dry-run reports weakAreasToChange=0."
          : "Uses the same rebuild planner as the approved historical rebuild script.",
      },
      studentSkillsPossiblyOutOfSyncWithAttempts: {
        count: studentSkillMisalignments.length,
        samples: sample(studentSkillMisalignments.map((target) => ({
          studentId: target.studentId,
          detail: `${target.skill} before=${target.before?.attempts ?? 0} attempt(s), rebuild=${target.attempts} attempt(s), ${Math.round(target.accuracy)}% accuracy`,
        }))),
        note: rebuildPlan.studentSkills.length === 0 && heuristicStudentSkillMisalignments.length > 0
          ? "Suppressed heuristic drift because rebuild dry-run reports studentSkillsToChange=0."
          : "Uses the same rebuild planner as the approved historical rebuild script.",
      },
      identityMismatchRisks: {
        count: orphanAttemptStudentIds.length + orphanProgressChildIds.length + assignmentStudentMismatchAttempts.length,
        samples: sample([
          ...orphanAttemptStudentIds.map((id) => ({ studentId: id, detail: "Attempt.studentId does not match an active ChildProfile.id" })),
          ...orphanProgressChildIds.map((id) => ({ studentId: id, detail: "ProgressRecord.childId does not match an active ChildProfile.id" })),
          ...assignmentStudentMismatchAttempts.map((attempt) => ({
            studentId: attempt.studentId,
            detail: `Attempt ${attempt.id} assignmentId=${attempt.assignmentId} differs from assignment.studentId=${assignmentById.get(attempt.assignmentId ?? "")?.studentId}`,
          })),
        ]),
      },
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("Read-only global analytics audit failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaClient?.$disconnect();
  });
