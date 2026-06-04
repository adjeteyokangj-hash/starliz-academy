import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { recalculateWeakAreaFromAttempts } from "@/lib/ai/weak-area-detector";
import { mergeWeakAreas, parseWeakAreaMetadata, stringifyWeakAreaMetadata } from "@/lib/weakAreas";
import { updateStudentSkills } from "@/lib/skillEngine";
import { parseSkills, skillFocusToCode } from "@/lib/skills";
import { upsertLearningDnaProfileFromAttempt } from "@/lib/attempts/learning_dna_pipeline";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import type { ResolvedAttemptAssignment } from "@/lib/attempts/learning_dna_pipeline";
import { applyRetentionRules, parseRetentionMetadata } from "@/lib/retentionScheduler";
import { toLegacyStudentSkillStatus, type SkillMasteryStatus } from "@/lib/learningEngineV2";

type LearningActivityPrisma = typeof prisma;

type AttemptActivityInput = {
  kind?: "attempt";
  actorUserId: string;
  clientStudentId: string;
  resolvedStudentId: string;
  assignment: ResolvedAttemptAssignment | null;
  idempotencyKey?: string;
  attempt: {
    studentId: string;
    subject: "spelling" | "math" | "reading";
    spellingMode?: string;
    keyStage?: string;
    yearGroup?: string;
    skillFocus: string;
    contentId?: string;
    assignmentId?: string;
    questionText?: string;
    answerGiven?: string;
    correctAnswer?: string;
    correct: boolean;
    responseTimeMs: number;
    hintsUsed: number;
    difficulty: number;
    skills?: string;
    pronunciationAttempted?: boolean;
    pronunciationPassed?: boolean;
    spokenText?: string;
    targetText?: string;
    errorType?: string;
  };
};

type SessionSummaryActivityInput = {
  kind: "session_summary";
  actorUserId: string;
  clientStudentId: string;
  resolvedStudentId: string;
  idempotencyKey?: string;
  summary: {
    subject: string;
    skillFocus?: string;
    assignmentId?: string;
    score: number;
    correct: number;
    incorrect: number;
    attempts: number;
    weakWords: string[];
    weakSkills: string[];
    confidenceStatus?: SkillMasteryStatus;
    snapshotReason: "lesson_completed" | "quiz_or_test_completed";
    intervention?: {
      mode?: boolean;
      primarySkill?: string | null;
      baselineAccuracy?: number | null;
      improvementPct?: number | null;
      launchedAt?: string | null;
      completedAt?: string | null;
    } | null;
  };
};

export type WriteLearningActivityInput = AttemptActivityInput | SessionSummaryActivityInput;

export type WriteLearningActivityResult = {
  attempt: Record<string, unknown> | null;
  weakArea: unknown;
  skills: string[];
  learningDnaUpdatedForChildId: string;
  studentResolution: {
    source: "assignment" | "client";
    assignmentId?: string;
    clientStudentId: string;
    resolvedStudentId: string;
  };
};

export type WriteLearningActivityDeps = {
  prisma: LearningActivityPrisma;
  recalculateWeakAreaFromAttempts: typeof recalculateWeakAreaFromAttempts;
  updateStudentSkills: typeof updateStudentSkills;
  upsertLearningDnaProfileFromAttempt: typeof upsertLearningDnaProfileFromAttempt;
  invalidateAcademicIntelligenceSnapshot: typeof invalidateAcademicIntelligenceSnapshot;
  writeAuditLog: typeof writeAuditLog;
};

export const defaultWriteLearningActivityDeps: WriteLearningActivityDeps = {
  prisma,
  recalculateWeakAreaFromAttempts,
  updateStudentSkills,
  upsertLearningDnaProfileFromAttempt,
  invalidateAcademicIntelligenceSnapshot,
  writeAuditLog,
};

function normalizeText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function parseAssignedItems(contentJson: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
    if (parsed && typeof parsed === "object") {
      return [parsed as Record<string, unknown>];
    }
  } catch {
    return [];
  }
  return [];
}

type AttemptMatchInput = {
  subject: "spelling" | "math" | "reading";
  questionText?: string;
  answerGiven?: string;
  correctAnswer?: string;
};

function attemptMatchesAssignedItem(input: AttemptMatchInput, item: Record<string, unknown>): boolean {
  const questionText = normalizeText(input.questionText);
  const answerGiven = normalizeText(input.answerGiven);
  const correctAnswer = normalizeText(input.correctAnswer);

  if (input.subject === "spelling") {
    const word = normalizeText(typeof item.word === "string" ? item.word : undefined);
    if (!word) return false;
    return questionText === word || correctAnswer === word || answerGiven === word;
  }

  if (input.subject === "math") {
    const prompt = normalizeText(
      typeof item.prompt === "string"
        ? item.prompt
        : typeof item.question === "string"
          ? item.question
          : undefined,
    );
    const expectedAnswerRaw =
      typeof item.answer === "number"
        ? String(item.answer)
        : typeof item.answer === "string"
          ? item.answer
          : undefined;
    const expectedAnswer = normalizeText(expectedAnswerRaw);
    if (!prompt || !expectedAnswer) return false;
    return questionText === prompt && correctAnswer === expectedAnswer;
  }

  const readingQuestion = normalizeText(
    typeof item.question === "string"
      ? item.question
      : typeof item.prompt === "string"
        ? item.prompt
        : undefined,
  );
  const readingAnswer = normalizeText(typeof item.answer === "string" ? item.answer : undefined);
  if (!readingQuestion || !readingAnswer) return false;
  return questionText === readingQuestion && correctAnswer === readingAnswer;
}

async function assignmentBatchCompleted(input: {
  prismaClient: LearningActivityPrisma;
  assignmentId: string;
  studentId: string;
  subject: "spelling" | "math" | "reading";
  contentJson: string;
}): Promise<boolean> {
  const assignedItems = parseAssignedItems(input.contentJson);
  if (!assignedItems.length) return false;

  const attempts = await input.prismaClient.attempt.findMany({
    where: {
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      subject: input.subject,
      correct: true,
    },
    select: {
      questionText: true,
      answerGiven: true,
      correctAnswer: true,
    },
  });

  return assignedItems.every((item) =>
    attempts.some((attempt) =>
      attemptMatchesAssignedItem(
        {
          subject: input.subject,
          questionText: attempt.questionText ?? undefined,
          answerGiven: attempt.answerGiven ?? undefined,
          correctAnswer: attempt.correctAnswer ?? undefined,
        },
        item,
      ),
    ),
  );
}

function buildResolution(input: WriteLearningActivityInput): WriteLearningActivityResult["studentResolution"] {
  return "assignment" in input && input.assignment
    ? {
        source: "assignment",
        assignmentId: input.assignment.id,
        clientStudentId: input.clientStudentId,
        resolvedStudentId: input.resolvedStudentId,
      }
    : {
        source: "client",
        clientStudentId: input.clientStudentId,
        resolvedStudentId: input.resolvedStudentId,
      };
}

async function writeLearningSessionSummary(
  input: SessionSummaryActivityInput,
  deps: WriteLearningActivityDeps,
): Promise<WriteLearningActivityResult> {
  const body = input.summary;
  const weakSkills = mergeWeakAreas(body.skillFocus ? [body.skillFocus] : [], body.weakSkills);
  const interventionMode = body.intervention?.mode === true;
  const detectedAtIso = new Date().toISOString();
  const weakAreaIds: string[] = [];

  if (body.weakWords.length || weakSkills.length) {
    for (const skill of weakSkills.length ? weakSkills : [`${body.subject} practice`]) {
      const existing = await deps.prisma.weakArea.findUnique({
        where: {
          studentId_subject_skillFocus: {
            studentId: input.resolvedStudentId,
            subject: body.subject,
            skillFocus: skill,
          },
        },
        select: { metadataJson: true, attemptsCount: true },
      });
      const existingMeta = parseWeakAreaMetadata(existing?.metadataJson);
      const existingRetentionMeta = parseRetentionMetadata(existing?.metadataJson);
      const weakWords = mergeWeakAreas(existingMeta.weakWords, body.weakWords);
      const mergedWeakSkills = mergeWeakAreas(existingMeta.weakSkills, [skill]);
      const existingIntervention = existingMeta.intervention ?? {};
      const baselineAccuracy = body.intervention?.baselineAccuracy ?? existingIntervention.baselineAccuracy ?? body.score;
      const improvementPct = body.intervention?.improvementPct
        ?? (typeof baselineAccuracy === "number" ? body.score - baselineAccuracy : undefined);
      const interventionMeta = {
        weakSkillDetectedAt: existingIntervention.weakSkillDetectedAt ?? detectedAtIso,
        weakSkillCode: body.intervention?.primarySkill ?? skill,
        launchedAt: body.intervention?.launchedAt ?? existingIntervention.launchedAt ?? detectedAtIso,
        completedAt: interventionMode ? (body.intervention?.completedAt ?? detectedAtIso) : existingIntervention.completedAt,
        improvementPct,
        baselineAccuracy,
        latestAccuracy: body.score,
        mode: interventionMode ? "mission" : (existingIntervention.mode ?? "auto_launch"),
      };
      const retentionMeta = applyRetentionRules({
        existing: {
          ...existingRetentionMeta,
          weakWords,
          weakSkills: mergedWeakSkills,
        },
        accuracy: body.score,
        retries: body.incorrect,
      });

      const weakArea = await deps.prisma.weakArea.upsert({
        where: {
          studentId_subject_skillFocus: {
            studentId: input.resolvedStudentId,
            subject: body.subject,
            skillFocus: skill,
          },
        },
        create: {
          studentId: input.resolvedStudentId,
          subject: body.subject,
          skillFocus: skill,
          weaknessType: body.incorrect > 0 ? "follow_up_needed" : "practice_review",
          accuracy: Math.round(body.score),
          attemptsCount: body.attempts,
          currentDifficulty: 1,
          metadataJson: stringifyWeakAreaMetadata({
            ...retentionMeta,
            assignmentId: body.assignmentId,
            lastScore: body.score,
            intervention: interventionMeta,
          }),
        },
        update: {
          weaknessType: body.incorrect > 0 ? "follow_up_needed" : "practice_review",
          accuracy: Math.round(body.score),
          attemptsCount: (existing?.attemptsCount ?? 0) + body.attempts,
          lastDetectedAt: new Date(),
          status: "active",
          metadataJson: stringifyWeakAreaMetadata({
            ...retentionMeta,
            assignmentId: body.assignmentId,
            lastScore: body.score,
            intervention: interventionMeta,
          }),
        },
      });
      if (weakArea && typeof weakArea === "object" && "id" in weakArea && typeof weakArea.id === "string") {
        weakAreaIds.push(weakArea.id);
      }
    }
  }

  if (weakSkills.length) {
    const skillAttempts = Math.max(1, body.attempts);
    const skillCorrect = Math.max(0, body.correct);
    const skillAccuracy = Math.max(0, Math.min(100, (skillCorrect / skillAttempts) * 100));
    const mappedStatus = toLegacyStudentSkillStatus(body.confidenceStatus ?? "learning");

    for (const skill of weakSkills) {
      await deps.prisma.studentSkill.upsert({
        where: { studentId_skill: { studentId: input.resolvedStudentId, skill } },
        create: {
          studentId: input.resolvedStudentId,
          skill,
          attempts: skillAttempts,
          correct: skillCorrect,
          accuracy: skillAccuracy,
          status: mappedStatus,
        },
        update: {
          attempts: { increment: skillAttempts },
          correct: { increment: skillCorrect },
          accuracy: skillAccuracy,
          status: mappedStatus,
        },
      });
    }
  }

  await deps.invalidateAcademicIntelligenceSnapshot({
    studentId: input.resolvedStudentId,
    reason: body.snapshotReason,
  }).catch(() => undefined);

  return {
    attempt: null,
    weakArea: weakAreaIds,
    skills: weakSkills,
    learningDnaUpdatedForChildId: input.resolvedStudentId,
    studentResolution: buildResolution(input),
  };
}

export async function writeLearningActivity(
  input: WriteLearningActivityInput,
  deps: WriteLearningActivityDeps = defaultWriteLearningActivityDeps,
): Promise<WriteLearningActivityResult> {
  if (input.kind === "session_summary") {
    return writeLearningSessionSummary(input, deps);
  }

  const {
    skills: skillsRaw,
    pronunciationAttempted,
    pronunciationPassed,
    spokenText,
    targetText,
    errorType,
    ...attemptData
  } = input.attempt;

  const explicitSkills = parseSkills(skillsRaw);
  const inferredSkill = skillFocusToCode(input.attempt.skillFocus);
  const skillsToUpdate = explicitSkills.length > 0
    ? explicitSkills
    : inferredSkill
      ? [inferredSkill]
      : [];

  const attempt = await deps.prisma.attempt.create({
    data: {
      ...attemptData,
      studentId: input.resolvedStudentId,
      assignmentId: input.assignment?.id ?? attemptData.assignmentId,
      contentId: input.assignment?.contentId ?? attemptData.contentId,
      skills: skillsRaw,
    },
  }) as Record<string, unknown>;

  if (pronunciationAttempted || pronunciationPassed !== undefined || spokenText || targetText || errorType) {
    await deps.writeAuditLog({
      actorUserId: input.actorUserId,
      action: "attempt.pronunciation",
      entityType: "attempt",
      entityId: String(attempt.id),
      metadata: {
        studentId: input.clientStudentId,
        resolvedStudentId: input.resolvedStudentId,
        subject: input.attempt.subject,
        skillFocus: input.attempt.skillFocus,
        pronunciationAttempted: Boolean(pronunciationAttempted),
        pronunciationPassed: pronunciationPassed === true,
        spokenText: spokenText ?? "",
        targetText: targetText ?? input.attempt.correctAnswer ?? "",
        errorType: errorType ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  }

  if (skillsToUpdate.length) {
    void deps.updateStudentSkills({ studentId: input.resolvedStudentId, skills: skillsToUpdate, isCorrect: input.attempt.correct });
  }

  if (input.assignment) {
    const contentTypeMatchesSubject = input.assignment.content.contentType === input.attempt.subject;
    const matchesAssignedContent = !input.attempt.contentId || input.attempt.contentId === input.assignment.contentId;
    const assignedItems = parseAssignedItems(input.assignment.content.contentJson);
    const attemptedAssignedItem =
      contentTypeMatchesSubject
      && matchesAssignedContent
      && assignedItems.some((item) =>
        attemptMatchesAssignedItem(
          {
            subject: input.attempt.subject,
            questionText: input.attempt.questionText,
            answerGiven: input.attempt.answerGiven,
            correctAnswer: input.attempt.correctAnswer,
          },
          item,
        ),
      );

    if (attemptedAssignedItem && input.assignment.status === "assigned") {
      await deps.prisma.assignment.update({ where: { id: input.assignment.id }, data: { status: "in_progress" } });
      await deps.writeAuditLog({
        actorUserId: input.actorUserId,
        action: "assignment.in_progress",
        entityType: "assignment",
        entityId: input.assignment.id,
        metadata: { studentId: input.resolvedStudentId, attemptId: attempt.id, idempotencyKey: input.idempotencyKey ?? null },
      });
    }

    if (attemptedAssignedItem && input.attempt.correct && input.assignment.status !== "completed") {
      const completed = await assignmentBatchCompleted({
        prismaClient: deps.prisma,
        assignmentId: input.assignment.id,
        studentId: input.resolvedStudentId,
        subject: input.attempt.subject,
        contentJson: input.assignment.content.contentJson,
      });

      if (completed) {
        await deps.prisma.assignment.update({
          where: { id: input.assignment.id },
          data: { status: "completed", completedAt: new Date() },
        });
        await deps.writeAuditLog({
          actorUserId: input.actorUserId,
          action: "assignment.completed",
          entityType: "assignment",
          entityId: input.assignment.id,
          metadata: { studentId: input.resolvedStudentId, attemptId: attempt.id, contentId: input.assignment.contentId, idempotencyKey: input.idempotencyKey ?? null },
        });
      }
    }
  }

  const weakArea = await deps.recalculateWeakAreaFromAttempts({
    studentId: input.resolvedStudentId,
    subject: input.attempt.subject,
    skillFocus: input.attempt.skillFocus,
    actorUserId: input.actorUserId,
  });

  if (!input.attempt.correct) {
    const weakWord = input.attempt.subject === "spelling"
      ? input.attempt.correctAnswer || input.attempt.questionText || input.attempt.answerGiven
      : input.attempt.questionText || input.attempt.correctAnswer || input.attempt.answerGiven;
    const existing = await deps.prisma.weakArea.findUnique({
      where: {
        studentId_subject_skillFocus: {
          studentId: input.resolvedStudentId,
          subject: input.attempt.subject,
          skillFocus: input.attempt.skillFocus,
        },
      },
      select: { metadataJson: true },
    });
    const metadata = parseWeakAreaMetadata(existing?.metadataJson);
    await deps.prisma.weakArea.update({
      where: {
        studentId_subject_skillFocus: {
          studentId: input.resolvedStudentId,
          subject: input.attempt.subject,
          skillFocus: input.attempt.skillFocus,
        },
      },
      data: {
        metadataJson: stringifyWeakAreaMetadata({
          ...metadata,
          weakWords: mergeWeakAreas(metadata.weakWords, weakWord ? [weakWord] : []),
          weakSkills: mergeWeakAreas(metadata.weakSkills, [input.attempt.skillFocus]),
          assignmentId: input.assignment?.id ?? input.attempt.assignmentId,
        }),
      },
    }).catch((metadataError) => {
      console.warn("Weak-area metadata update skipped", {
        studentId: input.resolvedStudentId,
        subject: input.attempt.subject,
        skillFocus: input.attempt.skillFocus,
        attemptId: attempt.id,
        error: metadataError instanceof Error ? metadataError.message : String(metadataError),
      });
    });
  }

  try {
    await deps.upsertLearningDnaProfileFromAttempt(deps.prisma, input.resolvedStudentId, {
      subject: input.attempt.subject,
      skillFocus: input.attempt.skillFocus,
      correct: input.attempt.correct,
      responseTimeMs: input.attempt.responseTimeMs,
      hintsUsed: input.attempt.hintsUsed,
      difficulty: input.attempt.difficulty,
      errorType,
    });
  } catch (learningDnaError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Learning DNA update skipped:", learningDnaError);
    }
  }

  try {
    await deps.invalidateAcademicIntelligenceSnapshot({
      studentId: input.resolvedStudentId,
      reason: input.assignment ? "lesson_completed" : "quiz_or_test_completed",
    });
  } catch (snapshotError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Academic intelligence snapshot invalidation skipped:", snapshotError);
    }
  }

  return {
    attempt,
    weakArea,
    skills: skillsToUpdate,
    learningDnaUpdatedForChildId: input.resolvedStudentId,
    studentResolution: buildResolution(input),
  };
}
