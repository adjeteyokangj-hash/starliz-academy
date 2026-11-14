import { prisma } from "@/lib/db";
import { authoredActivities, releasedActivities } from "./catalogue";

/** A private development acceptance lane, never a publication or prerequisite
 * waiver. Exact new synthetic children still use real auth, billing, school,
 * stage, assessment and ownership checks. Production cannot enable this lane. */
export function qaChildConfigured(childId: string) {
  if (process.env.NODE_ENV !== "development" || process.env.CODING_CURRICULUM_QA_ENABLED !== "true") return false;
  const ids = (process.env.CODING_CURRICULUM_QA_CHILD_IDS ?? "").split(",");
  return ids.length <= 4 && ids.every(id => /^[A-Za-z0-9_-]{8,100}$/.test(id)) && ids.includes(childId);
}
export async function developmentCurriculumQa(childId: string) {
  if (!qaChildConfigured(childId)) return false;
  const child = await prisma.childProfile.findFirst({ where: { id: childId, archived: false, parent: { role: "parent", name: "Coding completion QA only", email: { startsWith: "coding-completion-qa-", endsWith: "@example.invalid" } } }, select: { id: true } });
  return Boolean(child);
}
export async function availableActivityDefinitions(childId: string) {
  const published = releasedActivities();
  if (published.length) return published;
  return await developmentCurriculumQa(childId) ? authoredActivities : published;
}
