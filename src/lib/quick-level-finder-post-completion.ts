import type { PlacementLevelInput } from "@/lib/placement-lesson-selector";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { seedPostQlfAssignments } from "@/lib/quick-level-finder-seeding";

export type QlfPostCompletionInput = {
  studentId: string;
  levels: Record<string, PlacementLevelInput>;
  yearGroup: string | null;
  keyStage: string | null;
};

export type QlfPostCompletionDeps = {
  invalidateSnapshot: (input: { studentId: string; reason: "level_finder_completed" }) => Promise<void>;
  seedAssignments: (input: QlfPostCompletionInput) => Promise<number>;
};

const defaultDeps: QlfPostCompletionDeps = {
  invalidateSnapshot: invalidateAcademicIntelligenceSnapshot,
  seedAssignments: seedPostQlfAssignments,
};

export async function applyQuickLevelFinderPostCompletionPipeline(
  input: QlfPostCompletionInput,
  deps: QlfPostCompletionDeps = defaultDeps,
): Promise<number> {
  await deps.invalidateSnapshot({
    studentId: input.studentId,
    reason: "level_finder_completed",
  }).catch(() => undefined);

  const seededAssignmentsCount = await deps.seedAssignments(input);
  return seededAssignmentsCount;
}
