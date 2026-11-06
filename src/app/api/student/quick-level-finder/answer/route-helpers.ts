import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { resolveParentActiveChildId } from "@/lib/activeChild";
import { prisma } from "@/lib/db";
import {
  deriveQuickLevelFinderLevels,
  inferQuickLevelFinderPlacementProfile,
  parseQuickLevelFinderSession,
  resolveQuickLevelFinderCanonicalPlacement,
  sanitiseQuestion,
  upsertQuickLevelFinderPlacementDiagnostic,
  upsertQuickLevelFinderRetestEnabled,
  upsertQuickLevelFinderSession,
} from "@/lib/quick-level-finder";
import type { PlacementLevelInput } from "@/lib/placement-lesson-selector";
import {
  applyQuickLevelFinderPostCompletionPipeline,
  type QlfPostCompletionDeps,
  type QlfPostCompletionInput,
} from "@/lib/quick-level-finder-post-completion";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  correct: z.boolean(),
  timeSpentMs: z.number().int().nonnegative().max(300_000).optional(),
  applyCanonicalPlacementOverride: z.boolean().optional(),
});

export async function applyAnswerRouteCompletionPipeline(
  input: QlfPostCompletionInput,
  deps?: QlfPostCompletionDeps,
): Promise<number> {
  return applyQuickLevelFinderPostCompletionPipeline(input, deps);
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const studentId = await resolveParentActiveChildId(parentScope.parentId);
  if (!studentId) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answer payload." }, { status: 400 });
  }

  const student = await prisma.childProfile.findFirst({
    where: { id: studentId, parentId: parentScope.parentId, archived: false },
    select: {
      id: true,
      yearGroup: true,
      studentProfile: {
        select: {
          keyStageLevel: true,
          aiLearningProfileJson: true,
        },
      },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const state = parseQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null);
  if (!state) {
    return NextResponse.json({ error: "Quick Level Finder has not started." }, { status: 404 });
  }
  if (state.sessionId !== parsed.data.sessionId) {
    return NextResponse.json({ error: "Session mismatch. Please restart Quick Level Finder." }, { status: 409 });
  }
  if (state.status !== "in_progress") {
    return NextResponse.json({ error: "Quick Level Finder is already completed." }, { status: 409 });
  }

  const currentQuestion = state.questions[state.cursor] ?? null;
  if (!currentQuestion) {
    return NextResponse.json({ error: "No pending question in this session." }, { status: 409 });
  }
  if (currentQuestion.id !== parsed.data.questionId) {
    return NextResponse.json(
      {
        error: "Answer out of sequence.",
        expectedQuestionId: currentQuestion.id,
      },
      { status: 409 },
    );
  }

  state.responses.push({
    questionId: parsed.data.questionId,
    subject: currentQuestion.subject,
    strand: currentQuestion.strand,
    scopedSubject: currentQuestion.strand
      ? `${currentQuestion.subject}:${currentQuestion.strand}`
      : currentQuestion.subject,
    correct: parsed.data.correct,
    timeSpentMs: parsed.data.timeSpentMs ?? 0,
    answeredAt: new Date().toISOString(),
  });
  state.cursor = Math.min(state.cursor + 1, state.questions.length);

  if (state.cursor >= state.questions.length) {
    state.status = "completed";
    state.completedAt = new Date().toISOString();
    state.levels = deriveQuickLevelFinderLevels(state);
  }

  const placementProfile = state.status === "completed"
    ? inferQuickLevelFinderPlacementProfile({
      levels: state.levels,
      baselineYearGroup: student.yearGroup,
      baselineKeyStage: student.studentProfile?.keyStageLevel ?? null,
    })
    : null;
  const canonicalDecision = state.status === "completed"
    ? resolveQuickLevelFinderCanonicalPlacement({
      inferredPlacement: placementProfile,
      existingYearGroup: student.yearGroup,
      existingKeyStage: student.studentProfile?.keyStageLevel ?? null,
      explicitOverride: parsed.data.applyCanonicalPlacementOverride === true,
    })
    : null;

  const profileWithSession = upsertQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null, state);
  const profileWithPlacementDiagnostic = state.status === "completed" && placementProfile && canonicalDecision
    ? upsertQuickLevelFinderPlacementDiagnostic(profileWithSession, {
      recommendedYearGroup: placementProfile.yearGroup,
      recommendedKeyStage: placementProfile.keyStage,
      confidence: placementProfile.confidence,
      computedAt: state.completedAt ?? new Date().toISOString(),
      appliedToCanonicalProfile: canonicalDecision.shouldUpdateCanonical,
      reason: canonicalDecision.reason,
    })
    : profileWithSession;
  const nextProfileJson = state.status === "completed"
    ? upsertQuickLevelFinderRetestEnabled(profileWithPlacementDiagnostic, false)
    : profileWithPlacementDiagnostic;
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.upsert({
      where: { childId: student.id },
      update: {
        aiLearningProfileJson: nextProfileJson,
        ...(canonicalDecision?.shouldUpdateCanonical && canonicalDecision.nextKeyStage
          ? { keyStageLevel: canonicalDecision.nextKeyStage }
          : {}),
      },
      create: {
        childId: student.id,
        aiLearningProfileJson: nextProfileJson,
        keyStageLevel: canonicalDecision?.shouldUpdateCanonical
          ? (canonicalDecision.nextKeyStage ?? null)
          : (student.studentProfile?.keyStageLevel ?? null),
      },
    });

    if (canonicalDecision?.shouldUpdateCanonical && canonicalDecision.nextYearGroup) {
      await tx.childProfile.update({
        where: { id: student.id },
        data: { yearGroup: canonicalDecision.nextYearGroup },
      });
    }
  });

  let seededAssignmentsCount = 0;
  if (state.status === "completed") {
    seededAssignmentsCount = await applyAnswerRouteCompletionPipeline({
      studentId: student.id,
      levels: state.levels as Record<string, PlacementLevelInput>,
      yearGroup: canonicalDecision?.nextYearGroup ?? student.yearGroup ?? null,
      keyStage: canonicalDecision?.nextKeyStage ?? student.studentProfile?.keyStageLevel ?? null,
    });
  }

  const nextCurrentQuestion = state.questions[state.cursor] ?? null;
  const safeNextQuestion = nextCurrentQuestion ? sanitiseQuestion(nextCurrentQuestion, state.cursor) : null;
  if (safeNextQuestion !== nextCurrentQuestion && safeNextQuestion !== null) {
    console.warn(`[qlf-answer] Repaired next question for student ${student.id} (${student.yearGroup})`);
  }

  return NextResponse.json({
    ok: true,
    completed: state.status === "completed",
    session: {
      sessionId: state.sessionId,
      status: state.status,
      answered: state.responses.length,
      totalQuestions: state.questions.length,
      currentQuestion: safeNextQuestion,
      questionPreview: state.questions.slice(state.cursor, state.cursor + 3),
      progressPercent: state.questions.length > 0
        ? Math.round((state.responses.length / state.questions.length) * 100)
        : 0,
    },
    placementProfile,
    canonicalPlacementUpdated: canonicalDecision?.shouldUpdateCanonical ?? false,
    canonicalPlacementReason: canonicalDecision?.reason ?? null,
    levels: state.status === "completed" ? state.levels : null,
    seededAssignmentsCount,
  });
}
