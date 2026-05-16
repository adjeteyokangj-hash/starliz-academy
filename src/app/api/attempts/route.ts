import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { recalculateWeakAreaFromAttempts } from "@/lib/ai/weak-area-detector";
import { resolveParentScope } from "@/lib/parent_scope";
import { checkSubscriptionAccess, getTrialSessionLimit } from "@/lib/subscriptions/enforcement";
import { mergeWeakAreas, parseWeakAreaMetadata, stringifyWeakAreaMetadata } from "@/lib/weakAreas";
import { updateStudentSkills } from "@/lib/skillEngine";
import { parseSkills, skillFocusToCode } from "@/lib/skills";
import { resolveAttemptStudentIdentity, upsertLearningDnaProfileFromAttempt } from "@/lib/attempts/learning_dna_pipeline";

const attemptSchema = z.object({
  studentId: z.string().min(1),
  subject: z.enum(["spelling", "math", "reading"]),
  spellingMode: z.string().optional(),
  keyStage: z.string().optional(),
  yearGroup: z.string().optional(),
  skillFocus: z.string().min(1),
  contentId: z.string().optional(),
  assignmentId: z.string().optional(),
  questionText: z.string().optional(),
  answerGiven: z.string().optional(),
  correctAnswer: z.string().optional(),
  correct: z.boolean(),
  responseTimeMs: z.number().int().min(0).default(0),
  hintsUsed: z.number().int().min(0).default(0),
  difficulty: z.number().int().min(1).max(5).default(1),
  skills: z.string().optional(), // comma-separated skill codes
  pronunciationAttempted: z.boolean().optional(),
  pronunciationPassed: z.boolean().optional(),
  spokenText: z.string().optional(),
  targetText: z.string().optional(),
  errorType: z.string().optional(),
});

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
  assignmentId: string;
  studentId: string;
  subject: "spelling" | "math" | "reading";
  contentJson: string;
}): Promise<boolean> {
  const assignedItems = parseAssignedItems(input.contentJson);
  if (!assignedItems.length) return false;

  const attempts = await prisma.attempt.findMany({
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

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  try {
    const body = attemptSchema.parse(await request.json());
    const parentScope = await resolveParentScope(session);
    if (!parentScope) {
      return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
    }

    const [user, access] = await Promise.all([
      prisma.user.findUnique({ where: { id: parentScope.parentId }, select: { trialSessionsUsed: true } }),
      checkSubscriptionAccess(parentScope.parentId),
    ]);

    const hasPaidSubscription = access.hasPaidSubscription === true && access.allowed;
    if (!hasPaidSubscription && (user?.trialSessionsUsed ?? 0) >= getTrialSessionLimit()) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    const { resolvedStudentId, assignment } = await resolveAttemptStudentIdentity(prisma, {
      assignmentId: body.assignmentId,
      requestedStudentId: body.studentId,
      parentId: parentScope.parentId,
    });

    const student = await prisma.childProfile.findFirst({
      where: { id: resolvedStudentId, parentId: parentScope.parentId },
      select: { id: true },
    });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    const {
      skills: skillsRaw,
      pronunciationAttempted,
      pronunciationPassed,
      spokenText,
      targetText,
      errorType,
      ...attemptData
    } = body;
    const attempt = await prisma.attempt.create({
      data: {
        ...attemptData,
        studentId: resolvedStudentId,
        assignmentId: assignment?.id ?? attemptData.assignmentId,
        contentId: assignment?.contentId ?? attemptData.contentId,
        skills: skillsRaw,
      },
    });

    if (pronunciationAttempted || pronunciationPassed !== undefined || spokenText || targetText || errorType) {
      await writeAuditLog({
        actorUserId: session.userId,
        action: "attempt.pronunciation",
        entityType: "attempt",
        entityId: attempt.id,
        metadata: {
          studentId: body.studentId,
          resolvedStudentId,
          subject: body.subject,
          skillFocus: body.skillFocus,
          pronunciationAttempted: Boolean(pronunciationAttempted),
          pronunciationPassed: pronunciationPassed === true,
          spokenText: spokenText ?? "",
          targetText: targetText ?? body.correctAnswer ?? "",
          errorType: errorType ?? null,
        },
      });
    }

    // --- Skill engine: update StudentSkill rows ---
    const explicitSkills = parseSkills(skillsRaw);
    const inferredSkill = skillFocusToCode(body.skillFocus);
    const skillsToUpdate = explicitSkills.length > 0
      ? explicitSkills
      : inferredSkill
        ? [inferredSkill]
        : [];
    if (skillsToUpdate.length) {
      void updateStudentSkills({ studentId: resolvedStudentId, skills: skillsToUpdate, isCorrect: body.correct });
    }

    if (assignment) {
        const contentTypeMatchesSubject = assignment.content.contentType === body.subject;
        const matchesAssignedContent = !body.contentId || body.contentId === assignment.contentId;
        const assignedItems = parseAssignedItems(assignment.content.contentJson);
        const attemptedAssignedItem =
          contentTypeMatchesSubject
          && matchesAssignedContent
          && assignedItems.some((item) =>
            attemptMatchesAssignedItem(
              {
                subject: body.subject,
                questionText: body.questionText,
                answerGiven: body.answerGiven,
                correctAnswer: body.correctAnswer,
              },
              item,
            ),
          );

        if (attemptedAssignedItem && assignment.status === "assigned") {
          await prisma.assignment.update({ where: { id: assignment.id }, data: { status: "in_progress" } });
          await writeAuditLog({
            actorUserId: session.userId,
            action: "assignment.in_progress",
            entityType: "assignment",
            entityId: assignment.id,
            metadata: { studentId: resolvedStudentId, attemptId: attempt.id },
          });
        }

        if (attemptedAssignedItem && body.correct && assignment.status !== "completed") {
          const completed = await assignmentBatchCompleted({
            assignmentId: assignment.id,
            studentId: resolvedStudentId,
            subject: body.subject,
            contentJson: assignment.content.contentJson,
          });

          if (completed) {
            await prisma.assignment.update({
              where: { id: assignment.id },
              data: { status: "completed", completedAt: new Date() },
            });
            await writeAuditLog({
              actorUserId: session.userId,
              action: "assignment.completed",
              entityType: "assignment",
              entityId: assignment.id,
              metadata: { studentId: resolvedStudentId, attemptId: attempt.id, contentId: assignment.contentId },
            });
          }
        }
    }

    const weakArea = await recalculateWeakAreaFromAttempts({
      studentId: resolvedStudentId,
      subject: body.subject,
      skillFocus: body.skillFocus,
      actorUserId: session.userId,
    });

    if (!body.correct) {
      const weakWord = body.subject === "spelling"
        ? body.correctAnswer || body.questionText || body.answerGiven
        : body.questionText || body.correctAnswer || body.answerGiven;
      const existing = await prisma.weakArea.findUnique({
        where: {
          studentId_subject_skillFocus: {
            studentId: body.studentId,
            subject: body.subject,
            skillFocus: body.skillFocus,
          },
        },
        select: { metadataJson: true },
      });
      const metadata = parseWeakAreaMetadata(existing?.metadataJson);
      await prisma.weakArea.update({
        where: {
          studentId_subject_skillFocus: {
            studentId: body.studentId,
            subject: body.subject,
            skillFocus: body.skillFocus,
          },
        },
        data: {
          metadataJson: stringifyWeakAreaMetadata({
            ...metadata,
            weakWords: mergeWeakAreas(metadata.weakWords, weakWord ? [weakWord] : []),
            weakSkills: mergeWeakAreas(metadata.weakSkills, [body.skillFocus]),
            assignmentId: body.assignmentId,
          }),
        },
      }).catch(() => undefined);
    }

    // Learning DNA update: aggregate cognitive, pacing, and emotional learning signals.
    try {
      await upsertLearningDnaProfileFromAttempt(prisma, resolvedStudentId, {
        subject: body.subject,
        skillFocus: body.skillFocus,
        correct: body.correct,
        responseTimeMs: body.responseTimeMs,
        hintsUsed: body.hintsUsed,
        difficulty: body.difficulty,
        errorType,
      });
    } catch (learningDnaError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Learning DNA update skipped:", learningDnaError);
      }
    }

    return NextResponse.json({
      ok: true,
      attempt,
      weakArea,
      skills: skillsToUpdate,
      learningDnaUpdatedForChildId: resolvedStudentId,
      studentResolution: assignment
        ? { source: "assignment", assignmentId: assignment.id, clientStudentId: body.studentId, resolvedStudentId }
        : { source: "client", clientStudentId: body.studentId, resolvedStudentId },
      message: "Attempt saved.",
    }, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Attempt submission failed:", error);
    }
    return NextResponse.json({ error: "Invalid attempt payload." }, { status: 400 });
  }
}
