/**
 * DB loader for Assessment & Misconception Analytics v1.
 * Reads Attempt, CoachInteractionLog, HumanSupportSession, Learning DNA, WordProgress.
 * Does not write to Human Tutor Queue & Sessions.
 */

import { prisma } from "@/lib/db";
import { aggregateMisconceptionAnalytics } from "@/lib/misconception-analytics/aggregate";
import type {
  AggregateMisconceptionInput,
  MisconceptionCohortSummary,
  MisconceptionStudentSummary,
} from "@/lib/misconception-analytics/types";

export type LoadMisconceptionAnalyticsInput = {
  studentIds: string[];
  windowDays?: number;
  schoolId?: string | null;
  now?: Date;
};

export async function loadMisconceptionAnalyticsInput(
  input: LoadMisconceptionAnalyticsInput,
): Promise<AggregateMisconceptionInput> {
  const windowDays = Math.min(365, Math.max(1, input.windowDays ?? 30));
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const studentIds = Array.from(new Set(input.studentIds.filter(Boolean)));

  if (studentIds.length === 0) {
    return {
      attempts: [],
      aiHelpTurns: [],
      humanSessions: [],
      learningDna: [],
      spellingMistakes: [],
      studentNames: {},
      nowIso: now.toISOString(),
      windowDays,
      schoolId: input.schoolId ?? null,
    };
  }

  const [children, attempts, aiHelpTurns, humanSessions, profiles, spellingMistakes] = await Promise.all([
    prisma.childProfile.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    }),
    prisma.attempt.findMany({
      where: { studentId: { in: studentIds }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        studentId: true,
        subject: true,
        skillFocus: true,
        correct: true,
        questionText: true,
        answerGiven: true,
        hintsUsed: true,
        createdAt: true,
      },
    }),
    prisma.coachInteractionLog.findMany({
      where: {
        childId: { in: studentIds },
        createdAt: { gte: since },
        mode: { in: ["daytime_tutor", "mistake_recovery"] },
      },
      orderBy: { createdAt: "desc" },
      take: 4000,
      select: {
        id: true,
        childId: true,
        subject: true,
        skillFocus: true,
        questionText: true,
        hintLevel: true,
        mode: true,
        createdAt: true,
      },
    }),
    prisma.humanSupportSession.findMany({
      where: {
        childId: { in: studentIds },
        ...(input.schoolId ? { schoolId: input.schoolId } : {}),
        OR: [
          { endedAt: { gte: since } },
          { endedAt: null, startedAt: { gte: since } },
        ],
      },
      orderBy: { startedAt: "desc" },
      take: 1000,
      select: {
        id: true,
        childId: true,
        outcome: true,
        outcomeNotes: true,
        unresolvedReportJson: true,
        metadataJson: true,
        endedAt: true,
        startedAt: true,
      },
    }),
    prisma.studentProfile.findMany({
      where: { childId: { in: studentIds } },
      select: { childId: true, aiLearningProfileJson: true },
    }),
    prisma.wordProgress.findMany({
      where: {
        studentId: { in: studentIds },
        lastSeen: { gte: since },
        mistakeType: { not: null },
      },
      orderBy: { lastSeen: "desc" },
      take: 2000,
      select: {
        id: true,
        studentId: true,
        word: true,
        mistakeType: true,
        status: true,
        attempts: true,
        correctCount: true,
        lastSeen: true,
      },
    }),
  ]);

  const studentNames = Object.fromEntries(children.map((child) => [child.id, child.name]));

  return {
    attempts: attempts.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      subject: row.subject,
      skillFocus: row.skillFocus,
      correct: row.correct,
      questionText: row.questionText,
      answerGiven: row.answerGiven,
      hintsUsed: row.hintsUsed,
      createdAt: row.createdAt.toISOString(),
    })),
    aiHelpTurns: aiHelpTurns.map((row) => ({
      id: row.id,
      studentId: row.childId,
      subject: row.subject,
      skillFocus: row.skillFocus,
      questionText: row.questionText,
      hintLevel: row.hintLevel,
      mode: row.mode,
      createdAt: row.createdAt.toISOString(),
    })),
    humanSessions: humanSessions.map((row) => ({
      id: row.id,
      studentId: row.childId,
      outcome: row.outcome,
      outcomeNotes: row.outcomeNotes,
      unresolvedReportJson: row.unresolvedReportJson,
      metadataJson: row.metadataJson,
      endedAt: row.endedAt?.toISOString() ?? null,
      startedAt: row.startedAt.toISOString(),
    })),
    learningDna: profiles.map((row) => ({
      studentId: row.childId,
      aiLearningProfileJson: row.aiLearningProfileJson,
    })),
    spellingMistakes: spellingMistakes.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      word: row.word,
      mistakeType: row.mistakeType,
      status: row.status,
      attempts: row.attempts,
      correctCount: row.correctCount,
      lastSeen: row.lastSeen.toISOString(),
    })),
    studentNames,
    nowIso: now.toISOString(),
    windowDays,
    schoolId: input.schoolId ?? null,
  };
}

export async function buildMisconceptionCohortSummary(
  input: LoadMisconceptionAnalyticsInput,
): Promise<MisconceptionCohortSummary> {
  const payload = await loadMisconceptionAnalyticsInput(input);
  return aggregateMisconceptionAnalytics(payload);
}

export async function buildMisconceptionStudentSummary(
  input: { studentId: string; windowDays?: number; schoolId?: string | null },
): Promise<MisconceptionStudentSummary | null> {
  const cohort = await buildMisconceptionCohortSummary({
    studentIds: [input.studentId],
    windowDays: input.windowDays,
    schoolId: input.schoolId,
  });
  return cohort.students.find((row) => row.studentId === input.studentId)
    ?? {
      studentId: input.studentId,
      studentName: cohort.students[0]?.studentName ?? null,
      signalCount: 0,
      bySource: [],
      topSkills: [],
      signals: [],
      needsMonitoringSessionCount: 0,
      unresolvedSessionCount: 0,
      escalatedSessionCount: 0,
    };
}
