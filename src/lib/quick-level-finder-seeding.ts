import { prisma } from "@/lib/db";
import { selectPlacementLessons, type PlacementLevelInput } from "@/lib/placement-lesson-selector";

const MAX_POST_QLF_ASSIGNMENTS = 4;
const REVIEWED_STATUSES = ["reviewed", "approved", "published"] as const;

/**
 * Seeds 2-4 assignments from existing reviewed content after QLF completion.
 * Never throws; QLF completion must not be blocked by content availability.
 * Does not create WeakArea or mastery records.
 */
export async function seedPostQlfAssignments(input: {
  studentId: string;
  levels: Record<string, PlacementLevelInput>;
  yearGroup: string | null;
  keyStage: string | null;
}): Promise<number> {
  try {
    const parentSubjects = [
      ...new Set(
        Object.keys(input.levels).map((key) => (key.includes(":") ? key.split(":")[0] : key)),
      ),
    ].filter(Boolean);

    if (parentSubjects.length === 0) return 0;

    const existingAssignments = await prisma.assignment.findMany({
      where: { studentId: input.studentId },
      select: { id: true, contentId: true, status: true },
    });

    const selectFromContent = (contentRows: Array<{
      id: string;
      contentType: string;
      level: number;
      status: string;
      topic: string | null;
      skillFocus: string | null;
      yearGroup: string | null;
      keyStage: string | null;
      metadataJson: string | null;
    }>) => selectPlacementLessons({
      studentId: input.studentId,
      selectedSubjects: parentSubjects,
      placementLevels: input.levels,
      availableContent: contentRows,
      existingAssignments: existingAssignments.map((assignment) => ({
        id: assignment.id,
        contentId: assignment.contentId,
        status: assignment.status,
      })),
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
    });

    const strictContentRows = await prisma.aIContentCache.findMany({
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
    });

    let recommendationSet = selectFromContent(strictContentRows);
    const strictReadyCount = recommendationSet.recommendations.filter((row) => row.status === "ready").length;

    if (strictReadyCount === 0 && input.yearGroup) {
      const relaxedContentRows = await prisma.aIContentCache.findMany({
        where: {
          status: { in: [...REVIEWED_STATUSES] },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
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
      });
      recommendationSet = selectFromContent(relaxedContentRows);
    }

    const toAssign = recommendationSet.recommendations
      .filter((row) => row.status === "ready" && row.contentId)
      .sort((a, b) => {
        if (a.levelBand === "below" && b.levelBand !== "below") return -1;
        if (a.levelBand !== "below" && b.levelBand === "below") return 1;
        const subjectPriority = (subject: string) => (subject === "maths" ? 0 : subject === "english" ? 1 : 2);
        return subjectPriority(a.parentSubject) - subjectPriority(b.parentSubject);
      })
      .slice(0, MAX_POST_QLF_ASSIGNMENTS);

    if (toAssign.length === 0) return 0;

    const existingContentIds = new Set(existingAssignments.map((assignment) => assignment.contentId));
    let seeded = 0;

    for (const recommendation of toAssign) {
      if (!recommendation.contentId || existingContentIds.has(recommendation.contentId)) continue;
      try {
        await prisma.assignment.create({
          data: {
            studentId: input.studentId,
            contentId: recommendation.contentId,
            status: "assigned",
          },
        });
        existingContentIds.add(recommendation.contentId);
        seeded++;
      } catch {
        // Skip duplicates or transient DB failures; never block QLF completion.
      }
    }

    return seeded;
  } catch {
    return 0;
  }
}
