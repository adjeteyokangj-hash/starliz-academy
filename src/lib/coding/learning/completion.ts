import inventory from "../../../../docs/coding-curriculum/curriculum-proposal.json";
import { CODING_PATHWAY_CATALOG } from "../catalog";
import { activityId } from "./authoring";
import type { ActivityContent } from "./types";

export type LearningCompletion = { id: string; kind: "course" | "pathway"; title: string; pathwayId: string; year: number | null; activityIds: string[] };
function courseIds(courseId: string): string[] {
  return inventory.modules.filter((module) => module.courseId === courseId).flatMap((module) => [...module.lessonIds,
    ...[1, 2, 3].map((slot) => module.projectId.replace(/^P-/, "C-") + `-${slot}`), module.projectId]).map(activityId);
}
/** Full academic scope is derived from the approved inventory, never from the
 * smaller number of activities currently authored or returned by a query. */
export function completedLearningGroups(masteredIds: ReadonlySet<string>, definitions: readonly ActivityContent[]): LearningCompletion[] {
  const available = new Set(definitions.map((activity) => activity.id));
  const satisfies = (ids: string[]) => ids.length > 0 && new Set(ids).size === ids.length && ids.every((id) => available.has(id) && masteredIds.has(id));
  const courses: LearningCompletion[] = inventory.courses.flatMap((course) => {
    const ids = courseIds(course.id);
    return ids.length === 40 && satisfies(ids) ? [{ id: course.id, kind: "course", title: `Year ${course.year} Coding: ${course.title}`, pathwayId: course.pathwayId, year: course.year, activityIds: ids }] : [];
  });
  const pathways: LearningCompletion[] = CODING_PATHWAY_CATALOG.flatMap((pathway) => {
    const requiredCourses = inventory.courses.filter((course) => course.pathwayId === pathway.id);
    const ids = requiredCourses.flatMap((course) => courseIds(course.id));
    return requiredCourses.length > 0 && ids.length === requiredCourses.length * 40 && satisfies(ids) ? [{ id: pathway.id, kind: "pathway", title: `${pathway.title} Coding pathway`, pathwayId: pathway.id, year: null, activityIds: ids }] : [];
  });
  return [...courses, ...pathways];
}
