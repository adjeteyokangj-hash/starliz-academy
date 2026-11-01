import { parseCodingProgram } from "@/lib/coding/runner";
import type { CodingBlock, CodingProgram } from "@/lib/coding/types";

export type BlockMoveDirection = "up" | "down";
export type CodingRunSource = "example" | "learner";

/** Swap a block with its neighbour in the same list. Nested blocks stay inside their Repeat. */
export function moveCodingBlock(
  program: CodingProgram,
  blockId: string,
  direction: BlockMoveDirection,
): CodingProgram {
  const blocks = reorderInList(program.blocks, blockId, direction);
  if (!blocks) return program;
  const parsed = parseCodingProgram({ blocks });
  if (!parsed.ok) return program;
  return parsed.program;
}

/**
 * Discover and Predict keep the lesson example as the default run.
 * Graded stages always run the learner program, even if an example is requested.
 */
export function codingRunSelection(input: {
  graded: boolean;
  example: CodingProgram | null;
  learner: CodingProgram;
  source?: CodingRunSource;
}): { source: CodingRunSource; program: CodingProgram } {
  if (!input.graded && input.source !== "learner" && input.example) {
    return { source: "example", program: input.example };
  }
  return { source: "learner", program: input.learner };
}

function reorderInList(
  blocks: CodingBlock[],
  blockId: string,
  direction: BlockMoveDirection,
): CodingBlock[] | null {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index >= 0) {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= blocks.length) return null;
    const reordered = blocks.slice();
    const [item] = reordered.splice(index, 1);
    if (!item) return null;
    reordered.splice(nextIndex, 0, item);
    return reordered;
  }
  let changed = false;
  const next = blocks.map((block) => {
    if (changed || block.kind !== "repeat") return block;
    const body = reorderInList(block.body, blockId, direction);
    if (!body) return block;
    changed = true;
    return { ...block, body };
  });
  return changed ? next : null;
}
