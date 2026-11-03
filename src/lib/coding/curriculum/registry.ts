import approved from "../../../../docs/coding-curriculum/curriculum-proposal.json";
import { CODING_PATHWAYS } from "@/lib/coding/types";
import { lessonPackageHash, type ExecutableLessonPackage, type PublicationEvidence } from "@/lib/coding/curriculum/contracts";

export const CODING_CURRICULUM_VERSION = "starliz-coding-2026.11-v1";
export const approvedCodingInventory = approved;

type ReleasedPackage = { lesson: ExecutableLessonPackage; evidence: PublicationEvidence; verifiedHash: string };

/** Server-owned release records only; never fill this from a learner request. */
export function curriculumReadiness(releases: readonly ReleasedPackage[] = [], completionEvidence: {
  curriculumVersion: string; verifiedConsolidationIds: readonly string[]; verifiedProjectIds: readonly string[];
} = { curriculumVersion: CODING_CURRICULUM_VERSION, verifiedConsolidationIds: [], verifiedProjectIds: [] }) {
  const expected = new Map(approved.lessons.map((lesson) => [lesson.id, lesson]));
  const verified = new Set<string>();
  for (const release of releases) {
    const lesson = expected.get(release.lesson.inventoryId);
    const hash = lessonPackageHash(release.lesson);
    if (!lesson || release.verifiedHash !== hash || release.evidence.packageHash !== hash
      || !release.evidence.educationalReview.approved || !release.evidence.authenticatedUat.passed
      || !release.evidence.accessibility.passed || !release.evidence.security.passed) continue;
    if (release.lesson.pathwayId !== lesson.pathwayId || release.lesson.courseId !== lesson.courseId
      || release.lesson.moduleId !== lesson.moduleId || release.lesson.projectId !== lesson.projectId) continue;
    verified.add(lesson.id);
  }
  const pathways = CODING_PATHWAYS.map((id) => {
    const lessons = approved.lessons.filter((lesson) => lesson.pathwayId === id);
    const completion = pathwayCompletion({ pathwayId: id, curriculumVersion: completionEvidence.curriculumVersion,
      masteredLessons: [...verified], completedConsolidations: completionEvidence.verifiedConsolidationIds, verifiedProjects: completionEvidence.verifiedProjectIds });
    return { id, expectedCoreLessons: lessons.length, verifiedCoreLessons: lessons.filter((lesson) => verified.has(lesson.id)).length,
      complete: completion.complete, missingConsolidations: completion.missingConsolidations.length, missingProjects: completion.missingProjects.length };
  });
  return { version: CODING_CURRICULUM_VERSION, approvedCoreLessons: approved.lessons.length,
    plannedConsolidationSessions: approved.consolidationSessionsPerYear * approved.courses.length,
    portfolioProjects: approved.projects.length, verifiedNewLessonPackages: verified.size,
    legacyPublishedLessons: [{ id: "understanding-loops", inventoryId: "Y3.02" }], pathways };
}

/** A pathway certificate must refer to this exact curriculum version. */
export function pathwayCompletion(input: {
  pathwayId: string;
  curriculumVersion: string;
  masteredLessons: readonly string[];
  completedConsolidations: readonly string[];
  verifiedProjects: readonly string[];
}): { complete: boolean; missingLessons: string[]; missingConsolidations: string[]; missingProjects: string[] } {
  const courses = approved.courses.filter((course) => course.pathwayId === input.pathwayId);
  const courseIds = new Set(courses.map((course) => course.id));
  const requiredLessons = approved.lessons.filter((lesson) => lesson.pathwayId === input.pathwayId).map((lesson) => lesson.id);
  const requiredProjects = approved.projects.filter((project) => courseIds.has(project.courseId)).map((project) => project.id);
  const requiredConsolidations = courses.flatMap((course) => course.moduleIds.flatMap((moduleId) =>
    ["retrieval", "repair", "transfer"].map((kind) => `${moduleId}/consolidation/${kind}`)));
  const missingLessons = requiredLessons.filter((id) => !input.masteredLessons.includes(id));
  const missingConsolidations = requiredConsolidations.filter((id) => !input.completedConsolidations.includes(id));
  const missingProjects = requiredProjects.filter((id) => !input.verifiedProjects.includes(id));
  return { complete: courses.length > 0 && input.curriculumVersion === CODING_CURRICULUM_VERSION
    && missingLessons.length === 0 && missingConsolidations.length === 0 && missingProjects.length === 0,
    missingLessons, missingConsolidations, missingProjects };
}
