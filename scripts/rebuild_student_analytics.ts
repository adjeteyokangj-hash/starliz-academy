#!/usr/bin/env tsx

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { PrismaClient } from "@prisma/client";
import { buildAnalyticsRebuildPlan } from "../src/lib/analytics-rebuild";

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
      process.env[name] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "P2021" || maybe.code === "P2022") return true;
  const message = String(maybe.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("not found in the current database");
}

async function safeCount(label: string, query: () => Promise<number>): Promise<{ label: string; available: boolean; count: number }> {
  try {
    return { label, available: true, count: await query() };
  } catch (error) {
    if (isMissingTableError(error)) return { label, available: false, count: 0 };
    throw error;
  }
}

async function main() {
  loadLocalEnv();
  const apply = process.argv.includes("--apply");
  const fullDryRun = process.argv.includes("--full-dry-run");
  const DRY_RUN_LIMIT = 50000;
  const limit = apply || fullDryRun ? undefined : DRY_RUN_LIMIT;
  const { prisma } = await import("../src/lib/db") as { prisma: PrismaClient };

  const [attemptTotalCount, weakAreaTotalCount, studentSkillTotalCount, profileTotalCount, assignmentTotalCount] = await Promise.all([
    prisma.attempt.count(),
    prisma.weakArea.count(),
    prisma.studentSkill.count(),
    prisma.studentProfile.count(),
    prisma.assignment.count(),
  ]);

  const [students, attempts, weakAreas, studentSkills, profiles, assignments, homeworkBatchStatus, homeworkAnswerStatus] = await Promise.all([
    prisma.childProfile.findMany({ where: { archived: false }, select: { id: true }, orderBy: { createdAt: "asc" } }),
    prisma.attempt.findMany({
      orderBy: { createdAt: "asc" },
      ...(typeof limit === "number" ? { take: limit } : {}),
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
    }),
    prisma.weakArea.findMany({
      ...(typeof limit === "number" ? { take: limit } : {}),
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
      },
    }),
    prisma.studentSkill.findMany({
      ...(typeof limit === "number" ? { take: limit } : {}),
      select: { id: true, studentId: true, skill: true, attempts: true, correct: true, accuracy: true, status: true },
    }),
    prisma.studentProfile.findMany({
      ...(typeof limit === "number" ? { take: limit } : {}),
      select: { childId: true, aiLearningProfileJson: true },
    }),
    prisma.assignment.findMany({
      ...(typeof limit === "number" ? { take: limit } : {}),
      select: {
        id: true,
        studentId: true,
        contentId: true,
        status: true,
        completedAt: true,
        content: { select: { contentType: true, contentJson: true } },
      },
    }),
    safeCount("HomeworkBatch", () => prisma.homeworkBatch.count()),
    safeCount("HomeworkAnswer", () => prisma.homeworkAnswer.count()),
  ]);

  const homeworkTablesAvailable = homeworkBatchStatus.available && homeworkAnswerStatus.available;
  const cappedEntities = [
    { label: "Attempt", loaded: attempts.length, total: attemptTotalCount },
    { label: "WeakArea", loaded: weakAreas.length, total: weakAreaTotalCount },
    { label: "StudentSkill", loaded: studentSkills.length, total: studentSkillTotalCount },
    { label: "StudentProfile", loaded: profiles.length, total: profileTotalCount },
    { label: "Assignment", loaded: assignments.length, total: assignmentTotalCount },
  ].filter((entity) => entity.loaded < entity.total);
  const evidenceComplete = apply ? cappedEntities.length === 0 : true;
  const evidenceNote = cappedEntities.length
    ? `partial evidence (${cappedEntities.map((entity) => `${entity.label}:${entity.loaded}/${entity.total}`).join(", ")})`
    : "complete evidence";
  const plan = buildAnalyticsRebuildPlan({
    mode: apply ? "apply" : "dry-run",
    studentIds: students.map((student) => student.id),
    attempts,
    existingWeakAreas: weakAreas,
    existingStudentSkills: studentSkills,
    existingProfiles: profiles,
    assignments,
    homeworkTablesAvailable,
    evidenceComplete,
    evidenceNote,
  });

  const before = {
    weakAreasToChange: plan.weakAreas.length,
    studentSkillsToChange: plan.studentSkills.length,
    learningDnaProfilesToChange: plan.learningDna.length,
    assignmentsToComplete: plan.assignments.length,
    academicSnapshotsToRefresh: plan.academicSnapshots.length,
    homeworkEvidence: [homeworkBatchStatus, homeworkAnswerStatus],
    cappedEntities,
    dryRunSummaryMode: !apply && !fullDryRun,
    dryRunLimit: !apply && !fullDryRun ? DRY_RUN_LIMIT : null,
  };

  if (apply) {
    const { refreshAcademicIntelligenceSnapshot } = await import("../src/lib/academic-intelligence/snapshot");

    for (const target of plan.weakAreas) {
      await prisma.weakArea.upsert({
        where: {
          studentId_subject_skillFocus: {
            studentId: target.studentId,
            subject: target.subject,
            skillFocus: target.skillFocus,
          },
        },
        create: {
          studentId: target.studentId,
          subject: target.subject,
          keyStage: target.keyStage,
          yearGroup: target.yearGroup,
          skillFocus: target.skillFocus,
          weaknessType: target.weaknessType,
          accuracy: target.accuracy,
          attemptsCount: target.attemptsCount,
          currentDifficulty: target.currentDifficulty,
          status: target.status,
          metadataJson: target.metadataJson,
        },
        update: {
          keyStage: target.keyStage,
          yearGroup: target.yearGroup,
          weaknessType: target.weaknessType,
          accuracy: target.accuracy,
          attemptsCount: target.attemptsCount,
          currentDifficulty: target.currentDifficulty,
          status: target.status,
          lastDetectedAt: new Date(plan.generatedAt),
          metadataJson: target.metadataJson,
        },
      });
    }

    for (const target of plan.studentSkills) {
      await prisma.studentSkill.upsert({
        where: { studentId_skill: { studentId: target.studentId, skill: target.skill } },
        create: {
          studentId: target.studentId,
          skill: target.skill,
          attempts: target.attempts,
          correct: target.correct,
          accuracy: target.accuracy,
          status: target.status,
        },
        update: {
          attempts: target.attempts,
          correct: target.correct,
          accuracy: target.accuracy,
          status: target.status,
        },
      });
    }

    for (const target of plan.learningDna) {
      await prisma.studentProfile.upsert({
        where: { childId: target.studentId },
        create: { childId: target.studentId, aiLearningProfileJson: target.nextProfileJson },
        update: { aiLearningProfileJson: target.nextProfileJson },
      });
    }

    for (const target of plan.assignments) {
      await prisma.assignment.update({
        where: { id: target.assignmentId },
        data: { status: target.toStatus, completedAt: new Date(target.completedAt) },
      });
    }

    for (const target of plan.academicSnapshots) {
      await refreshAcademicIntelligenceSnapshot({ studentId: target.studentId, reason: target.reason });
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: plan.mode,
    evidence: plan.evidence,
    applyModeCreated: true,
    applyModeRun: apply,
    before,
    homeworkBackfill: plan.homeworkBackfill,
    assignmentsNeedsReview: plan.assignmentsNeedsReview,
    samples: {
      weakAreas: plan.weakAreas.slice(0, 10).map((target) => ({
        studentId: target.studentId,
        subject: target.subject,
        skillFocus: target.skillFocus,
        before: target.before ? { accuracy: target.before.accuracy, attemptsCount: target.before.attemptsCount, status: target.before.status } : null,
        after: { accuracy: target.accuracy, attemptsCount: target.attemptsCount, status: target.status },
      })),
      studentSkills: plan.studentSkills.slice(0, 10).map((target) => ({
        studentId: target.studentId,
        skill: target.skill,
        before: target.before ? { attempts: target.before.attempts, correct: target.before.correct, accuracy: target.before.accuracy, status: target.before.status } : null,
        after: { attempts: target.attempts, correct: target.correct, accuracy: target.accuracy, status: target.status },
      })),
      learningDna: plan.learningDna.slice(0, 10).map((target) => ({
        studentId: target.studentId,
        beforeTotalAttempts: target.beforeTotalAttempts,
        afterTotalAttempts: target.afterTotalAttempts,
      })),
      assignments: plan.assignments.slice(0, 10),
      assignmentsNeedsReview: plan.assignmentsNeedsReview.slice(0, 10),
      academicSnapshots: plan.academicSnapshots.slice(0, 10),
    },
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Student analytics rebuild failed.");
  console.error(error);
  process.exitCode = 1;
});
