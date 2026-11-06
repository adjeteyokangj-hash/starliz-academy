import { parseCodingProgram, runCodingProgram } from "@/lib/coding/runner";
import { CODING_GRID_SIZE, type CodingProgram, type GridPoint } from "@/lib/coding/types";

/** Keep the exact assessed target with the program; later retries may use another map. */
export function encodeMasteryProgram(program: CodingProgram, goal: GridPoint | null): string {
  return JSON.stringify({ ...program, assessment: { version: 1, goal } });
}

export function readMasteryProgram(raw: string): { program: CodingProgram; goal: GridPoint | null } | null {
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  const parsed = parseCodingProgram(value);
  if (!parsed.ok) return null;
  const goal = value?.assessment?.version === 1 ? value.assessment.goal : null;
  const valid = goal && Number.isInteger(goal.x) && Number.isInteger(goal.y)
    && goal.x >= 0 && goal.y >= 0 && goal.x < CODING_GRID_SIZE && goal.y < CODING_GRID_SIZE;
  // Legacy snapshots remain replayable; never invent their original target.
  return { program: parsed.program, goal: valid ? { x: goal.x, y: goal.y } : null };
}

/** A read-only native replay. An old snapshot's unknown goal stays unknown. */
export function restoredReviewProject(fallback: CodingProgram | null | undefined, fallbackGoal: GridPoint | null, assessed?: ReturnType<typeof readMasteryProgram>) {
  const program = assessed?.program ?? fallback;
  if (!program?.blocks.length) return null;
  return { program, run: runCodingProgram(program, assessed ? assessed.goal : fallbackGoal) };
}
