import { codingLessonById } from "../catalog";
import { activityDefinition, activityReleased } from "../learning/catalogue";
import { ContentReviewError, type worldContentDraftSchema } from "./content-policy";
import type { z } from "zod";
export function validateWorldCurriculumLinks(content: z.infer<typeof worldContentDraftSchema>, publishing: boolean) {
  for (const link of content.metadata?.curriculumLinks ?? []) {
    const definition = link.kind === "lesson" ? codingLessonById(link.id) : activityDefinition(link.id);
    if (!definition) throw new ContentReviewError("Choose an existing Coding Learning lesson for every curriculum mapping.");
    if (publishing && (link.kind === "lesson" ? !codingLessonById(link.id)?.published : !activityReleased(link.id))) throw new ContentReviewError("A curriculum mapping cannot publish or unlock an unreleased lesson.");
  }
}

/** Approved mappings can change the presentation location only. The canonical
 * lesson ID, objective, engine and assessment endpoints remain unchanged. */
export async function publishedGuidedLocation(id: string, kind: "lesson" | "activity", fallback: import("./model").LocationId) {
  const { publishedWorldCopy } = await import("./content");
  const { missions } = await import("./model");
  const packs = await publishedWorldCopy();
  const pack = packs.find(pack => pack.metadata?.curriculumLinks.some(link => link.id === id && link.kind === kind));
  return missions.find(mission => mission.id === pack?.missionId)?.location ?? fallback;
}
