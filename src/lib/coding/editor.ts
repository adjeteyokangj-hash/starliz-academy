import { parseCodingProgram } from "@/lib/coding/runner";
import { CODING_MAX_DEPTH, type CodingBlock, type CodingProgram } from "@/lib/coding/types";

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

const NEST_LIMIT_REASON = "A repeat can go inside another repeat, but not any deeper.";
const BLOCK_LIMIT_REASON = "This repeat cannot hold another block.";

export type CodingInsertResult = {
  program: CodingProgram;
  inserted: boolean;
  reason: string | null;
};

/** Add a block at the top, or inside the selected Repeat when that Repeat can hold it. */
export function insertCodingBlock(
  program: CodingProgram,
  parentId: string | null,
  block: CodingBlock,
): CodingInsertResult {
  if (!parentId) return acceptProgram({ blocks: [...program.blocks, block] }, program);
  const parent = findRepeat(program.blocks, parentId, 1);
  if (!parent) return acceptProgram({ blocks: [...program.blocks, block] }, program);
  if (!containerAccepts(parent.depth, block.kind)) {
    return {
      program,
      inserted: false,
      reason: block.kind === "repeat" ? NEST_LIMIT_REASON : BLOCK_LIMIT_REASON,
    };
  }
  const blocks = insertIntoRepeat(program.blocks, parentId, block);
  if (!blocks) return { program, inserted: false, reason: BLOCK_LIMIT_REASON };
  return acceptProgram({ blocks }, program);
}

export function updateCodingRepeatTimes(program: CodingProgram, repeatId: string, times: number): CodingProgram {
  if (!Number.isInteger(times)) return program;
  return acceptProgram({ blocks: mapRepeatTimes(program.blocks, repeatId, times) }, program).program;
}

export function removeCodingBlock(program: CodingProgram, blockId: string): CodingProgram {
  return acceptProgram({ blocks: removeFromList(program.blocks, blockId) }, program).program;
}

function acceptProgram(candidate: CodingProgram, fallback: CodingProgram): CodingInsertResult {
  const parsed = parseCodingProgram(candidate);
  if (!parsed.ok) return { program: fallback, inserted: false, reason: parsed.error };
  return { program: parsed.program, inserted: true, reason: null };
}

function containerAccepts(parentDepth: number, kind: CodingBlock["kind"]): boolean {
  const childDepth = parentDepth + 1;
  if (childDepth > CODING_MAX_DEPTH) return false;
  if (kind === "repeat" && childDepth >= CODING_MAX_DEPTH) return false;
  return true;
}

function findRepeat(blocks: CodingBlock[], id: string, depth: number): { depth: number } | null {
  for (const block of blocks) {
    if (block.kind !== "repeat") continue;
    if (block.id === id) return { depth };
    const nested = findRepeat(block.body, id, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function insertIntoRepeat(blocks: CodingBlock[], parentId: string, child: CodingBlock): CodingBlock[] | null {
  let found = false;
  const next = blocks.map((block) => {
    if (found || block.kind !== "repeat") return block;
    if (block.id === parentId) {
      found = true;
      return { ...block, body: [...block.body, child] };
    }
    const body = insertIntoRepeat(block.body, parentId, child);
    if (!body) return block;
    found = true;
    return { ...block, body };
  });
  return found ? next : null;
}

function mapRepeatTimes(blocks: CodingBlock[], repeatId: string, times: number): CodingBlock[] {
  return blocks.map((block) => {
    if (block.kind !== "repeat") return block;
    if (block.id === repeatId) return { ...block, times };
    return { ...block, body: mapRepeatTimes(block.body, repeatId, times) };
  });
}

function removeFromList(blocks: CodingBlock[], blockId: string): CodingBlock[] {
  return blocks.flatMap((block): CodingBlock[] => {
    if (block.id === blockId) return [];
    if (block.kind !== "repeat") return [block];
    return [{ ...block, body: removeFromList(block.body, blockId) }];
  });
}
