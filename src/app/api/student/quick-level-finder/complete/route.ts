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
  upsertQuickLevelFinderRetestEnabled,
  upsertQuickLevelFinderSession,
} from "@/lib/quick-level-finder";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { selectPlacementLessons, type PlacementLevelInput } from "@/lib/placement-lesson-selector";

const MAX_POST_QLF_ASSIGNMENTS = 4;
const REVIEWED_STATUSES = ["reviewed", "approved", "published"] as const;

/**
 * Seeds 2–4 assignments from existing reviewed content after QLF completion.
 * Never throws — QLF completion must not be blocked by content availability.
 * Does not create WeakArea or mastery records.
 */
async function seedPostQlfAssignments(input: {
  studentId: string;
  levels: Record<string, PlacementLevelInput>;
  yearGroup: string | null;
  keyStage: string | null;
}): Promise<number> {
  try {
    // Derive parent subjects from level keys (e.g. "english:reading" → "english")
    const parentSubjects = [
      ...new Set(
        Object.keys(input.levels).map((key) => (key.includes(":") ? key.split(":")[0] : key)),
      ),
    ].filter(Boolean);

    if (parentSubjects.length === 0) return 0;

    const [contentRows, existingAssignments] = await Promise.all([
      prisma.aIContentCache.findMany({
        where: {
          status: { in: [...REVIEWED_STATUSES] },
          ...(input.yearGroup ? { yearGroup: input.yearGroup } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          contentType: true,
          level: true,
          status: true,
          topic: true,
          skillFocus: true,
          yearGroup: true,
          keyStage: true,
          metadataJson: true,
        },
      }),
      prisma.assignment.findMany({
        where: { studentId: input.studentId },
        select: { id: true, contentId: true, status: true },
      }),
    ]);

    if (contentRows.length === 0) return 0;

    const result = selectPlacementLessons({
      studentId: input.studentId,
      selectedSubjects: parentSubjects,
      placementLevels: input.levels,
      availableContent: contentRows,
      existingAssignments: existingAssignments.map((a) => ({ id: a.id, contentId: a.contentId, status: a.status })),
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
    });

    // Only assign content that is ready (reviewed, not yet assigned)
    // Sort: "below" placement level first, then maths before english before others
    const toAssign = result.recommendations
      .filter((r) => r.status === "ready" && r.contentId)
      .sort((a, b) => {
        if (a.levelBand === "below" && b.levelBand !== "below") return -1;
        if (a.levelBand !== "below" && b.levelBand === "below") return 1;
        const subjectPriority = (s: string) => (s === "maths" ? 0 : s === "english" ? 1 : 2);
        return subjectPriority(a.parentSubject) - subjectPriority(b.parentSubject);
      })
      .slice(0, MAX_POST_QLF_ASSIGNMENTS);

    if (toAssign.length === 0) return 0;

    const existingContentIds = new Set(existingAssignments.map((a) => a.contentId));
    let seeded = 0;

    for (const rec of toAssign) {
      if (!rec.contentId || existingContentIds.has(rec.contentId)) continue;
      try {
        await prisma.assignment.create({
          data: {
            studentId: input.studentId,
            contentId: rec.contentId,
            status: "assigned",
          },
        });
        existingContentIds.add(rec.contentId);
        seeded++;
      } catch {
        // Skip if uniqueness constraint fires or any transient error — never block QLF completion.
      }
    }

    return seeded;
  } catch {
    // Never propagate seeding errors to QLF completion response.
    return 0;
  }
}

const bodySchema = z.object({
  sessionId: z.string().min(1),
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

  const profileWithSession = upsertQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null, state);
  const nextProfileJson = upsertQuickLevelFinderRetestEnabled(profileWithSession, false);
  await prisma.$transaction(async (tx) => {
    await tx.studentProfile.upsert({
      where: { childId: student.id },
      update: {
        aiLearningProfileJson: nextProfileJson,
        ...(placementProfile ? { keyStageLevel: placementProfile.keyStage } : {}),
      },
      create: {
        childId: student.id,
        aiLearningProfileJson: nextProfileJson,
        keyStageLevel: placementProfile?.keyStage ?? student.studentProfile?.keyStageLevel ?? null,
      },
    });

    if (placementProfile) {
      await tx.childProfile.update({
        where: { id: student.id },
        data: { yearGroup: placementProfile.yearGroup },
      });
    }
  });

  await invalidateAcademicIntelligenceSnapshot({
    studentId: student.id,
    reason: "level_finder_completed",
  }).catch(() => undefined);

  // Seed first assignments from reviewed content. Runs after placement is persisted.
  // Never fails QLF completion. Does not create WeakArea or mastery records.
  const seededAssignmentsCount = await seedPostQlfAssignments({
    studentId: student.id,
    levels: state.levels as Record<string, PlacementLevelInput>,
    yearGroup: placementProfile?.yearGroup ?? student.yearGroup ?? null,
    keyStage: placementProfile?.keyStage ?? student.studentProfile?.keyStageLevel ?? null,
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
    levels: state.levels,
    seededAssignmentsCount,
  });
}
