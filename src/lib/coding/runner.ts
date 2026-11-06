import {
  CODING_GRID_SIZE,
  CODING_MAX_BLOCKS,
  CODING_MAX_DEPTH,
  CODING_MAX_REPEAT,
  CODING_MAX_STEPS,
  type CodingBlock,
  type CodingDirection,
  type CodingProgram,
  type CodingRunResult,
  type GridPoint,
} from "@/lib/coding/types";

const DIRECTIONS = new Set<CodingDirection>(["up", "down", "left", "right"]);

export function emptyProgram(): CodingProgram {
  return { blocks: [] };
}

export function countBlocks(blocks: CodingBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    total += 1;
    if (block.kind === "repeat") total += countBlocks(block.body);
  }
  return total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBlock(value: unknown, depth: number): CodingBlock | string {
  if (!isRecord(value)) return "StarLiz could not read one of the blocks.";
  if (depth > CODING_MAX_DEPTH) return "These blocks are nested too deeply for this lesson.";
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 40) : `block-${depth}`;
  if (value.kind === "move") {
    if (!DIRECTIONS.has(value.direction as CodingDirection)) {
      return "Choose up, down, left or right for each move.";
    }
    return { id, kind: "move", direction: value.direction as CodingDirection };
  }
  if (value.kind === "repeat") {
    if (typeof value.times !== "number" || !Number.isInteger(value.times)) {
      return "The repeat number needs to be a whole number.";
    }
    if (value.times < 0) return "A repeat number cannot be less than 0.";
    if (value.times > CODING_MAX_REPEAT) return `Repeat up to ${CODING_MAX_REPEAT} times in this lesson.`;
    if (!Array.isArray(value.body)) return "A repeat block needs instructions inside it.";
    const body: CodingBlock[] = [];
    for (const child of value.body) {
      const parsed = parseBlock(child, depth + 1);
      if (typeof parsed === "string") return parsed;
      body.push(parsed);
    }
    return { id, kind: "repeat", times: value.times, body };
  }
  return "StarLiz only runs move and repeat blocks in this lesson.";
}

/** Accept only the lesson block language. No text is evaluated as code. */
export function parseCodingProgram(value: unknown): { ok: true; program: CodingProgram } | { ok: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    return { ok: false, error: "The program needs a list of blocks." };
  }
  const blocks: CodingBlock[] = [];
  for (const raw of value.blocks) {
    const parsed = parseBlock(raw, 1);
    if (typeof parsed === "string") return { ok: false, error: parsed };
    blocks.push(parsed);
  }
  if (countBlocks(blocks) > CODING_MAX_BLOCKS) {
    return { ok: false, error: `Use no more than ${CODING_MAX_BLOCKS} blocks in this lesson.` };
  }
  return { ok: true, program: { blocks } };
}

function step(point: GridPoint, direction: CodingDirection): GridPoint {
  if (direction === "up") return { x: point.x, y: point.y + 1 };
  if (direction === "down") return { x: point.x, y: point.y - 1 };
  if (direction === "left") return { x: point.x - 1, y: point.y };
  return { x: point.x + 1, y: point.y };
}

function inGrid(point: GridPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < CODING_GRID_SIZE && point.y < CODING_GRID_SIZE;
}

type ExecState = {
  point: GridPoint;
  frames: GridPoint[];
  steps: number;
  usedLoop: boolean;
  unrolledMoves: number;
  error: string | null;
  limitHit: boolean;
};

function runBlocks(blocks: CodingBlock[], state: ExecState, depth: number, insideLoop: boolean): void {
  for (const block of blocks) {
    if (state.error) return;
    if (block.kind === "move") {
      if (!insideLoop && depth === 1) state.unrolledMoves += 1;
      const next = step(state.point, block.direction);
      if (state.steps >= CODING_MAX_STEPS) {
        state.limitHit = true;
        state.error = "This program took too many steps, so StarLiz stopped it. Check the number on your repeat block.";
        return;
      }
      state.steps += 1;
      if (!inGrid(next)) {
        state.error = "The character tried to walk off the board. Change the direction or the repeat number.";
        state.point = next;
        return;
      }
      state.point = next;
      state.frames.push({ ...next });
      continue;
    }
    if (block.body.length === 0 && block.times > 0) {
      state.error = "The repeat block is empty. Put a move inside it.";
      return;
    }
    if (block.times > 0 && block.body.length > 0) state.usedLoop = true;
    for (let count = 0; count < block.times; count += 1) {
      runBlocks(block.body, state, depth + 1, true);
      if (state.error) return;
    }
  }
}

export function runCodingProgram(program: CodingProgram, goal: GridPoint | null, start: GridPoint = { x: 0, y: 0 }): CodingRunResult {
  const state: ExecState = {
    point: { ...start },
    frames: [{ ...start }],
    steps: 0,
    usedLoop: false,
    unrolledMoves: 0,
    error: inGrid(start) && Number.isInteger(start.x) && Number.isInteger(start.y) ? null : "The starting position is outside the board.",
    limitHit: false,
  };
  runBlocks(program.blocks, state, 1, false);
  const final = { ...state.point };
  const reachedGoal = Boolean(goal && !state.error && final.x === goal.x && final.y === goal.y);
  return {
    ok: !state.error,
    frames: state.frames,
    final,
    steps: state.steps,
    usedLoop: state.usedLoop,
    unrolledMoves: state.unrolledMoves,
    error: state.error,
    reachedGoal,
    limitHit: state.limitHit,
  };
}

export function samePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}
