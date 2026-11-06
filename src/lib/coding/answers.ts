import type { CodingBlock, CodingDirection, CodingProgram, GridPoint } from "@/lib/coding/types";

/** Server-only answers. Do not import this from a client component. */
export const PREDICT_CORRECT_CHOICE = "right-three";

export const REFERENCE_PROGRAMS: Record<"build" | "practise" | "debug" | "create", CodingProgram> = {
  build: {
    blocks: [{ id: "ref-build", kind: "repeat", times: 4, body: [{ id: "ref-build-move", kind: "move", direction: "right" }] }],
  },
  practise: {
    blocks: [{ id: "ref-practise", kind: "repeat", times: 3, body: [{ id: "ref-practise-move", kind: "move", direction: "up" }] }],
  },
  debug: {
    blocks: [{ id: "ref-debug", kind: "repeat", times: 3, body: [{ id: "ref-debug-move", kind: "move", direction: "right" }] }],
  },
  create: {
    blocks: [
      { id: "ref-create-x", kind: "repeat", times: 2, body: [{ id: "ref-create-right", kind: "move", direction: "right" }] },
      { id: "ref-create-y", kind: "repeat", times: 2, body: [{ id: "ref-create-up", kind: "move", direction: "up" }] },
    ],
  },
};

export const STAGE_GOALS: Record<"discover" | "predict" | "build" | "practise" | "debug" | "create", GridPoint> = {
  discover: { x: 3, y: 0 },
  predict: { x: 3, y: 0 },
  build: { x: 4, y: 0 },
  practise: { x: 0, y: 3 },
  debug: { x: 3, y: 0 },
  create: { x: 2, y: 2 },
};

export function explanationShowsUnderstanding(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;
  return /\b(loop|repeat|again|times)\b/i.test(trimmed);
}

const NUMBER_WORDS: Record<number, string[]> = {
  1: ["1", "one", "once"],
  2: ["2", "two", "twice"],
  3: ["3", "three"],
  4: ["4", "four"],
  5: ["5", "five"],
  6: ["6", "six"],
  7: ["7", "seven"],
  8: ["8", "eight"],
};

export type LoopFact = { times: number; direction: CodingDirection };

/** Repeats that contain a move, including a repeat nested inside another repeat. */
export function loopFacts(program: CodingProgram): LoopFact[] {
  const facts: LoopFact[] = [];
  const walk = (blocks: CodingBlock[]) => {
    for (const block of blocks) {
      if (block.kind !== "repeat") continue;
      for (const child of block.body) {
        if (child.kind === "move") facts.push({ times: block.times, direction: child.direction });
      }
      walk(block.body);
    }
  };
  walk(program.blocks);
  return facts;
}

function mentionsTimes(text: string, times: number): boolean {
  const words = NUMBER_WORDS[times] ?? [String(times)];
  return words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(text));
}

export function assessLoopExplanation(text: string, program: CodingProgram): { ok: boolean; feedback: string } {
  const trimmed = text.trim();
  const facts = loopFacts(program);
  if (!explanationShowsUnderstanding(trimmed)) {
    return {
      ok: false,
      feedback: "Tell StarLiz what your loop repeats, in a full sentence. Say the direction and how many times.",
    };
  }
  if (facts.length === 0) {
    return {
      ok: false,
      feedback: "Finish Create with a loop first. Then say the direction and how many times that loop repeats.",
    };
  }
  const directions = [...new Set(facts.map((fact) => fact.direction))];
  const counts = [...new Set(facts.map((fact) => fact.times))];
  const missingDirection = directions.some((direction) => !new RegExp(`\\b${direction}\\b`, "i").test(trimmed));
  const missingCount = counts.some((times) => !mentionsTimes(trimmed, times));
  if (missingDirection || missingCount) {
    const sample = facts.map((fact) => `${fact.direction} ${fact.times} ${fact.times === 1 ? "time" : "times"}`).join(" and ");
    return {
      ok: false,
      feedback: `Look at your finished blocks. Say the direction and the number on each repeat. Your loops move ${sample}.`,
    };
  }
  return {
    ok: true,
    feedback: "That explanation matches your loops: you named the direction and how many times the move repeats.",
  };
}
