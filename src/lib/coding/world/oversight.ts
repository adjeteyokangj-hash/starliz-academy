import { publishedWorldMissions } from "./content";
import { prisma } from "@/lib/db";
import { WORLD_KEY, locations, worldStateSchema, missionCompletionCount } from "./model";
export type WorldPracticeSummary = { childId: string; completed: number; stars: number; hints: number; locations: Array<{ title: string; completed: number }>; updatedAt: string; recoveryRequired?: boolean };
/** Caller supplies child IDs resolved by the existing parent/classroom guards.
 * Read-only: inspecting a child never creates a world or changes assessment. */
export async function worldPracticeSummaries(childIds: string[]): Promise<WorldPracticeSummary[]> {
  if (!childIds.length) return [];
  const available = await publishedWorldMissions();
  const rows = await prisma.codingWorkspace.findMany({ where: { childId: { in: childIds }, lessonId: WORLD_KEY }, select: { childId: true, programsJson: true, updatedAt: true } });
  return rows.map(row => {
    try {
      const state = worldStateSchema.parse(JSON.parse(row.programsJson));
      return { childId: row.childId, completed: state.completed.length, stars: state.completed.length * 3, hints: Object.values(state.hints).reduce((a, b) => a + b, 0), updatedAt: row.updatedAt.toISOString(), locations: locations.map(l => ({ title: l.title, completed: missionCompletionCount(state, l.id, available) })) };
    } catch { return { childId: row.childId, completed: 0, stars: 0, hints: 0, locations: [], updatedAt: row.updatedAt.toISOString(), recoveryRequired: true }; }
  });
}
