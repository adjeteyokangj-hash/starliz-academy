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
  upsertQuickLevelFinderPlacementDiagnostic,
  upsertQuickLevelFinderRetestEnabled,
  upsertQuickLevelFinderSession,
} from "@/lib/quick-level-finder";
import type { PlacementLevelInput } from "@/lib/placement-lesson-selector";
import { applyQuickLevelFinderPostCompletionPipeline } from "@/lib/quick-level-finder-post-completion";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  applyCanonicalPlacementOverride: z.boolean().optional(),
});

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
    return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
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

  state.status = "completed";
  state.completedAt = state.completedAt ?? new Date().toISOString();
  state.cursor = state.questions.length;
  state.levels = deriveQuickLevelFinderLevels(state);

  const placementProfile = inferQuickLevelFinderPlacementProfile({
    levels: state.levels,
    baselineYearGroup: student.yearGroup,
    baselineKeyStage: student.studentProfile?.keyStageLevel ?? null,
  });
  const canonicalDecision = resolveQuickLevelFinderCanonicalPlacement({
    inferredPlacement: placementProfile,
    existingYearGroup: student.yearGroup,
    existingKeyStage: student.studentProfile?.keyStageLevel ?? null,
    explicitOverride: parsed.data.applyCanonicalPlacementOverride === true,
  });

  const profileWithSession = upsertQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null, state);
  const profileWithPlacementDiagnostic = placementProfile
    ? upsertQuickLevelFinderPlacementDiagnostic(profileWithSession, {
      recommendedYearGroup: placementProfile.yearGroup,
      recommendedKeyStage: placementProfile.keyStage,
      confidence: placementProfile.confidence,
      computedAt: state.completedAt ?? new Date().toISOString(),
      appliedToCanonicalProfile: canonicalDecision.shouldUpdateCanonical,
      reason: canonicalDecision.reason,
    })
    : profileWithSession;
  const nextProfileJson = upsertQuickLevelFinderRetestEnabled(profileWithPlacementDiagnostic, false);
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.upsert({
      where: { childId: student.id },
      update: {
        aiLearningProfileJson: nextProfileJson,
        ...(canonicalDecision.shouldUpdateCanonical && canonicalDecision.nextKeyStage
          ? { keyStageLevel: canonicalDecision.nextKeyStage }
          : {}),
      },
      create: {
        childId: student.id,
        aiLearningProfileJson: nextProfileJson,
        keyStageLevel: canonicalDecision.shouldUpdateCanonical
          ? (canonicalDecision.nextKeyStage ?? null)
          : (student.studentProfile?.keyStageLevel ?? null),
      },
    });

    if (canonicalDecision.shouldUpdateCanonical && canonicalDecision.nextYearGroup) {
      await tx.childProfile.update({
        where: { id: student.id },
        data: { yearGroup: canonicalDecision.nextYearGroup },
      });
    }
  });

  const seededAssignmentsCount = await applyQuickLevelFinderPostCompletionPipeline({
    studentId: student.id,
    levels: state.levels as Record<string, PlacementLevelInput>,
    yearGroup: canonicalDecision.nextYearGroup ?? student.yearGroup ?? null,
    keyStage: canonicalDecision.nextKeyStage ?? student.studentProfile?.keyStageLevel ?? null,
  });

  return NextResponse.json({
    ok: true,
    completed: true,
    session: {
      sessionId: state.sessionId,
      status: state.status,
      answered: state.responses.length,
      totalQuestions: state.questions.length,
      completedAt: state.completedAt,
    },
    placementProfile,
    canonicalPlacementUpdated: canonicalDecision.shouldUpdateCanonical,
    canonicalPlacementReason: canonicalDecision.reason,
    levels: state.levels,
    seededAssignmentsCount,
  });
}
