import { NextResponse } from "next/server";
import { CODING_PATHWAY_CATALOG, codingPathwayIntro, publishedPathwayIds } from "@/lib/coding/catalog";
import { publicPlacementQuestions } from "@/lib/coding/placement";
import { pathwayForYear, pathwaySummary } from "@/lib/coding/catalog";
import { requireCodingLearner } from "@/lib/coding/student-context";
import { loadCodingHome } from "@/lib/coding/workspace-store";
import { publishedLessonValidation } from "@/lib/coding/draft-validation";

export async function GET() {
  const { child, response } = await requireCodingLearner();
  if (!child) return response;
  const home = await loadCodingHome(child.id, child.yearGroup);
  const yearPathway = pathwayForYear(child.yearGroup);
  const yearPathwayTitle = pathwaySummary(yearPathway).title;
  const publishedPathways = publishedPathwayIds();
  return NextResponse.json({
    learnerId: child.id,
    learnerName: child.name,
    yearGroup: child.yearGroup,
    yearPathway,
    yearPathwayTitle,
    intro: codingPathwayIntro({
      yearGroup: child.yearGroup,
      yearPathwayTitle,
      yearPathwayPublished: publishedPathways.includes(yearPathway),
      liveLessonTitle: "Understanding Loops",
    }),
    pathways: CODING_PATHWAY_CATALOG,
    placementQuestions: publicPlacementQuestions(publishedPathways),
    placement: home.placement,
    lesson: home.workspace
      ? {
          skillStatus: home.workspace.skillStatus,
          stage: home.workspace.stage,
          assignmentStatus: home.workspace.assignmentStatus,
          evidence: home.workspace.evidence,
          attemptCount: home.workspace.attemptCount,
          checksPassed: home.workspace.checksPassed,
        }
      : null,
    publication: publishedLessonValidation(),
  });
}
