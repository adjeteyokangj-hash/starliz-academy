import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { generateWeeklyHomeworkBatch } from "@/lib/homework-phase1a/generation";
import { weekWindowInTimezone } from "@/lib/homework-phase1a/eligibility";
import type { WeeklyWeaknessCandidate } from "@/lib/homework-phase1a/types";
import { readSchoolWeekSettingsFromProfileJson } from "@/lib/academic-intelligence/schoolWeekSettings";
import { isWeeklyHomeworkPhase1GEnabled } from "@/lib/homework-phase1g/config";
import { toHeartbeatSignalRecords } from "@/lib/homework-phase1g/intelligence";
import { keyStageForYearGroup } from "@/lib/curriculum";
import { parseTargetLearningEvidenceFromMetadata } from "@/lib/curriculum-level-targets";
import {
  hasPausedOrHolidayNote,
  isStudentInAllowedHomeworkCohort,
  isWeeklyHomeworkPhase1FEnabled,
  isYearGroupAllowedForHomework,
} from "@/lib/homework-phase1f/config";

const DEFAULT_TIMEZONE = "Europe/London";

type Phase1FTransaction = {
  homeworkBatch: {
    create(args: unknown): Promise<{ id: string }>;
  };
  homeworkAuditLog: {
    createMany(args: unknown): Promise<unknown>;
  };
};

type Phase1FPrisma = {
  childProfile: {
    findMany(args: unknown): Promise<WeeklyHomeworkGenerationStudentInput[]>;
  };
  $transaction<T>(fn: (tx: Phase1FTransaction) => Promise<T>): Promise<T>;
};

const phase1fPrisma = prisma as unknown as Phase1FPrisma;

export type WeeklyHomeworkGenerationStudentInput = {
  id: string;
  yearGroup: string | null;
  parent: { parentProfile: { timezone: string | null } | null } | null;
  studentProfile: { aiLearningProfileJson: string | null } | null;
  progressRecords: Array<{ id: string; createdAt: Date; completed: boolean }>;
  weakAreas: Array<{
    id: string;
    subject: string;
    skillFocus: string;
    weaknessType: string;
    accuracy: number;
    attemptsCount: number;
    metadataJson: string | null;
  }>;
  coachInteractionLogs: Array<{ subject: string; skillFocus: string }>;
  homeworkBatches: Array<{
    id: string;
    weekStart: Date;
    status: string;
    scorePercent: number | null;
    recapOnly: boolean;
    questions: Array<{ id: string; subject: string; topic: string | null; skill: string | null; estimatedMinutes: number }>;
    answers: Array<{ metadataJson: string | null; reviewNeeded: boolean }>;
  }>;
};

type PersistPayload = {
  studentId: string;
  timezone: string;
  generation: Extract<ReturnType<typeof generateWeeklyHomeworkBatch>, { created: true }>;
};

export type WeeklyHomeworkGenerationPersistPayload = PersistPayload;

export type WeeklyHomeworkGenerationStudentResult = {
  studentId: string;
  timezone: string;
  weekStartIso: string;
  weekEndIso: string;
  action: "created" | "skipped" | "duplicate_prevented" | "dry_run";
  reason: string;
  questionCount: number;
};

export type WeeklyHomeworkGenerationSummary = {
  featureEnabled: boolean;
  dryRun: boolean;
  nowIso: string;
  totals: {
    considered: number;
    created: number;
    skipped: number;
    duplicatePrevented: number;
    dryRun: number;
  };
  students: WeeklyHomeworkGenerationStudentResult[];
};

function localDateIso(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseWeakAreaFromAnswerMetadata(metadataJson: string | null | undefined): string | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const weakArea = parsed.weakArea;
    return typeof weakArea === "string" && weakArea.trim() ? weakArea.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function normalizeTimezone(raw: string | null | undefined): string {
  const candidate = (raw ?? "").trim();
  if (!candidate) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function shouldSkipForPauseOrHoliday(student: WeeklyHomeworkGenerationStudentInput): boolean {
  const settings = readSchoolWeekSettingsFromProfileJson(student.studentProfile?.aiLearningProfileJson ?? null);
  if (!settings.enabled) return true;
  if (!settings.includeHomeworkBlock) return true;
  if (hasPausedOrHolidayNote(settings.parentAdminNotes)) return true;
  return false;
}

function weeklySessionCounts(student: WeeklyHomeworkGenerationStudentInput, timezone: string, weekStartIso: string, weekEndIso: string) {
  const weekRows = student.progressRecords.filter((row) => {
    const dateIso = localDateIso(row.createdAt, timezone);
    return dateIso >= weekStartIso && dateIso <= weekEndIso;
  });

  const completedSessionCount = weekRows.filter((row) => row.completed).length;
  return {
    completedSessionCount,
    startedSessionCount: weekRows.length,
  };
}

function previousHomeworkWeaknessKeys(student: WeeklyHomeworkGenerationStudentInput, currentWeekStartIso: string): Set<string> {
  const keys = new Set<string>();
  for (const batch of student.homeworkBatches) {
    const weekStartIso = batch.weekStart.toISOString().slice(0, 10);
    if (weekStartIso >= currentWeekStartIso) continue;
    const wasWeak = batch.recapOnly || (typeof batch.scorePercent === "number" && batch.scorePercent < 50)
      || batch.answers.some((answer) => answer.reviewNeeded);
    if (!wasWeak) continue;
    for (const question of batch.questions) {
      const skillOrTopic = (question.skill ?? question.topic ?? "").trim().toLowerCase();
      if (skillOrTopic) keys.add(skillOrTopic);
    }
    for (const answer of batch.answers) {
      const weakArea = parseWeakAreaFromAnswerMetadata(answer.metadataJson);
      if (weakArea) keys.add(weakArea);
    }
  }
  return keys;
}

function toWeaknessCandidates(student: WeeklyHomeworkGenerationStudentInput, currentWeekStartIso: string): WeeklyWeaknessCandidate[] {
  const coachUsage = new Map<string, number>();
  for (const log of student.coachInteractionLogs) {
    const key = `${log.subject.toLowerCase()}::${log.skillFocus.toLowerCase()}`;
    coachUsage.set(key, (coachUsage.get(key) ?? 0) + 1);
  }

  const previousWeaknesses = previousHomeworkWeaknessKeys(student, currentWeekStartIso);

  return student.weakAreas.map((weakArea) => {
    const coachKey = `${weakArea.subject.toLowerCase()}::${weakArea.skillFocus.toLowerCase()}`;
    const repeatedMistakes = Math.max(1, weakArea.attemptsCount - 1);
    const normalizedWeaknessType = weakArea.weaknessType.toLowerCase();
    const normalizedSkill = weakArea.skillFocus.trim().toLowerCase();
    const weakMetadata = (() => {
      if (!weakArea.metadataJson) return {};
      try {
        return JSON.parse(weakArea.metadataJson) as Record<string, unknown>;
      } catch {
        return {};
      }
    })();
    const targetEvidence = parseTargetLearningEvidenceFromMetadata(weakMetadata);

    return {
      id: weakArea.id,
      subject: weakArea.subject,
      topic: null,
      skill: weakArea.skillFocus,
      targetLearningYearGroup: targetEvidence?.targetLearningYearGroup ?? null,
      targetLearningKeyStage: targetEvidence?.targetLearningKeyStage ?? (targetEvidence?.targetLearningYearGroup ? keyStageForYearGroup(targetEvidence.targetLearningYearGroup) : null),
      studentYearGroup: student.yearGroup,
      estimatedMinutes: 5,
      repeatedMistakes,
      averageScore: Number.isFinite(weakArea.accuracy) ? weakArea.accuracy : null,
      coreTopicWeakness: normalizedWeaknessType.includes("core") || normalizedWeaknessType.includes("foundational"),
      masteryGap: weakArea.accuracy < 65,
      coachUsageCount: coachUsage.get(coachKey) ?? 0,
      completionIssueCount: 0,
      previousHomeworkWeakness: previousWeaknesses.has(normalizedSkill),
    };
  });
}

async function fetchStudentsForGeneration(now: Date, studentId?: string): Promise<WeeklyHomeworkGenerationStudentInput[]> {
  return phase1fPrisma.childProfile.findMany({
    where: {
      archived: false,
      ...(studentId ? { id: studentId } : {}),
    },
    select: {
      id: true,
      yearGroup: true,
      parent: {
        select: {
          parentProfile: {
            select: {
              timezone: true,
            },
          },
        },
      },
      studentProfile: {
        select: {
          aiLearningProfileJson: true,
        },
      },
      progressRecords: {
        where: {
          createdAt: {
            gte: new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          createdAt: true,
          completed: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      weakAreas: {
        where: {
          status: "active",
        },
        select: {
          id: true,
          subject: true,
          skillFocus: true,
          weaknessType: true,
          accuracy: true,
          attemptsCount: true,
          metadataJson: true,
        },
      },
      coachInteractionLogs: {
        select: {
          subject: true,
          skillFocus: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 200,
      },
      homeworkBatches: {
        orderBy: {
          weekStart: "desc",
        },
        take: 10,
        select: {
          id: true,
          weekStart: true,
          status: true,
          scorePercent: true,
          recapOnly: true,
          questions: {
            select: {
              id: true,
              subject: true,
              topic: true,
              skill: true,
              estimatedMinutes: true,
            },
          },
          answers: {
            select: {
              metadataJson: true,
              reviewNeeded: true,
            },
          },
        },
      },
    },
  }) as unknown as WeeklyHomeworkGenerationStudentInput[];
}

async function persistGeneratedBatch(payload: PersistPayload): Promise<"created" | "duplicate_prevented"> {
  const { batch, auditEvents } = payload.generation;
  const weekStart = new Date(`${batch.weekStartIso}T00:00:00.000Z`);
  const weekEnd = new Date(`${batch.weekEndIso}T23:59:59.999Z`);
  const now = new Date();
  const phase1gEnabled = isWeeklyHomeworkPhase1GEnabled();
  const leadQuestion = batch.questions[0];
  try {
    await phase1fPrisma.$transaction(async (tx) => {
      const created = await tx.homeworkBatch.create({
        data: {
          studentId: payload.studentId,
          weekStart,
          weekEnd,
          timezone: payload.timezone,
          status: batch.status,
          dueBeforeNextSession: batch.dueBeforeNextSession,
          sourceCompletedSessionCount: batch.sourceCompletedSessionCount,
          sourceStartedSessionCount: batch.sourceStartedSessionCount,
          workloadCapMinutes: batch.workloadCapMinutes,
          plannedMinutes: batch.plannedMinutes,
          metadataJson: JSON.stringify({
            generatedBy: "weekly-homework-phase1f",
            generatedAtIso: now.toISOString(),
          }),
          questions: {
            create: batch.questions.map((question, index) => ({
              order: index + 1,
              subject: question.subject,
              topic: question.topic,
              skill: question.skill,
              questionType: "short_answer",
              promptJson: JSON.stringify({
                text: `Practise ${question.skill ?? question.topic ?? question.subject} to strengthen this week\'s weak area.`,
                targetLearningYearGroup: question.targetLearningYearGroup ?? null,
                targetLearningKeyStage: question.targetLearningKeyStage ?? null,
                studentYearGroup: question.studentYearGroup ?? null,
              }),
              optionsJson: null,
              expectedAnswerJson: null,
              markingType: "manual",
              required: question.required,
              estimatedMinutes: Math.max(1, question.estimatedMinutes),
              difficulty: Math.max(1, Math.min(5, Math.floor(Math.max(1, question.estimatedMinutes) / 3) + 1)),
            })),
          },
        },
      });

      await tx.homeworkAuditLog.createMany({
        data: auditEvents.map((event) => ({
          batchId: created.id,
          actorUserId: null,
          action: event.action,
          reason: event.reason ?? null,
          metadataJson: JSON.stringify({ ...(event.metadata ?? {}), atIso: event.atIso }),
        })),
      });
    });

    if (phase1gEnabled) {
      const signals = toHeartbeatSignalRecords({
        featureEnabled: true,
        studentId: payload.studentId,
        now,
        status: batch.status,
        scorePercent: null,
        reviewNeededCount: 0,
        requiresRecap: false,
        context: {
          subject: leadQuestion?.subject ?? null,
          topic: leadQuestion?.topic ?? null,
          skill: leadQuestion?.skill ?? null,
        },
      });

      await Promise.all(signals.map((signal) => writeAuditLog({
        action: signal.action,
        entityType: signal.entityType,
        entityId: signal.entityId,
        metadata: signal.metadata,
      })));

      await invalidateAcademicIntelligenceSnapshot({
        studentId: payload.studentId,
        reason: "manual_refresh",
      });
    }

    return "created";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "duplicate_prevented";
    }
    throw error;
  }
}

export async function runWeeklyHomeworkFridayGeneration(input?: {
  now?: Date;
  dryRun?: boolean;
  studentId?: string;
  students?: WeeklyHomeworkGenerationStudentInput[];
  persistGeneratedBatch?: (payload: PersistPayload) => Promise<"created" | "duplicate_prevented">;
}): Promise<WeeklyHomeworkGenerationSummary> {
  const now = input?.now ?? new Date();
  const dryRun = input?.dryRun === true;
  const featureEnabled = isWeeklyHomeworkPhase1FEnabled();

  if (!featureEnabled) {
    return {
      featureEnabled,
      dryRun,
      nowIso: now.toISOString(),
      totals: {
        considered: 0,
        created: 0,
        skipped: 0,
        duplicatePrevented: 0,
        dryRun: 0,
      },
      students: [],
    };
  }

  const students = input?.students ?? await fetchStudentsForGeneration(now, input?.studentId);
  const persist = input?.persistGeneratedBatch ?? persistGeneratedBatch;

  const results: WeeklyHomeworkGenerationStudentResult[] = [];

  for (const student of students) {
    const timezone = normalizeTimezone(student.parent?.parentProfile?.timezone);
    const weekWindow = weekWindowInTimezone(now, timezone);

    if (!isStudentInAllowedHomeworkCohort(student.id)) {
      results.push({
        studentId: student.id,
        timezone,
        weekStartIso: weekWindow.weekStartIso,
        weekEndIso: weekWindow.weekEndIso,
        action: "skipped",
        reason: "COHORT_CONTROLLED",
        questionCount: 0,
      });
      continue;
    }

    if (!isYearGroupAllowedForHomework(student.yearGroup)) {
      results.push({
        studentId: student.id,
        timezone,
        weekStartIso: weekWindow.weekStartIso,
        weekEndIso: weekWindow.weekEndIso,
        action: "skipped",
        reason: "YEAR_GROUP_CONTROLLED",
        questionCount: 0,
      });
      continue;
    }

    if (shouldSkipForPauseOrHoliday(student)) {
      results.push({
        studentId: student.id,
        timezone,
        weekStartIso: weekWindow.weekStartIso,
        weekEndIso: weekWindow.weekEndIso,
        action: "skipped",
        reason: "PAUSED_OR_HOLIDAY",
        questionCount: 0,
      });
      continue;
    }

    const existingBatchForWeek = student.homeworkBatches.some((batch) => batch.weekStart.toISOString().slice(0, 10) === weekWindow.weekStartIso);
    const counts = weeklySessionCounts(student, timezone, weekWindow.weekStartIso, weekWindow.weekEndIso);
    const weaknesses = toWeaknessCandidates(student, weekWindow.weekStartIso);

    const generation = generateWeeklyHomeworkBatch({
      now,
      timezone,
      studentId: student.id,
      yearGroup: student.yearGroup,
      completedSessionCount: counts.completedSessionCount,
      startedSessionCount: counts.startedSessionCount,
      existingBatchForWeek,
      weaknesses,
    });

    if (!generation.created) {
      results.push({
        studentId: student.id,
        timezone,
        weekStartIso: generation.weekStartIso,
        weekEndIso: generation.weekEndIso,
        action: "skipped",
        reason: generation.reason,
        questionCount: 0,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        studentId: student.id,
        timezone,
        weekStartIso: generation.batch.weekStartIso,
        weekEndIso: generation.batch.weekEndIso,
        action: "dry_run",
        reason: "DRY_RUN",
        questionCount: generation.batch.questions.length,
      });
      continue;
    }

    const persistResult = await persist({
      studentId: student.id,
      timezone,
      generation,
    });

    results.push({
      studentId: student.id,
      timezone,
      weekStartIso: generation.batch.weekStartIso,
      weekEndIso: generation.batch.weekEndIso,
      action: persistResult,
      reason: persistResult === "created" ? "GENERATED" : "ALREADY_GENERATED",
      questionCount: generation.batch.questions.length,
    });
  }

  const totals = {
    considered: results.length,
    created: results.filter((row) => row.action === "created").length,
    skipped: results.filter((row) => row.action === "skipped").length,
    duplicatePrevented: results.filter((row) => row.action === "duplicate_prevented").length,
    dryRun: results.filter((row) => row.action === "dry_run").length,
  };

  return {
    featureEnabled,
    dryRun,
    nowIso: now.toISOString(),
    totals,
    students: results,
  };
}
