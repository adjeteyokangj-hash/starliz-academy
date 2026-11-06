import { stageBrief, type CodingLessonBrief } from "@/lib/coding/catalog";
import type { CodingProgram, CodingRunResult, CodingStage } from "@/lib/coding/types";

export type CodingTutorTurn = {
  message: string;
  hintLevel: number;
  revealsSolution: boolean;
  guidingQuestion: boolean;
};

const GUIDING: Record<CodingStage, string[]> = {
  discover: [
    "What is the character trying to reach?",
    "Which block is wrapped around the move?",
    "How many times does the example move?",
  ],
  predict: [
    "Which block is inside the other?",
    "What does the number on the repeat block tell you?",
    "Count the steps in your head, one pass at a time. How many steps is that?",
  ],
  build: [
    "What do you want the character to do more than once?",
    "The star is four steps to the right. Which direction belongs inside the loop?",
    "Use one repeat set to 4, and put move right inside it.",
  ],
  practise: [
    "Where is the star compared with the character?",
    "Can you say the move once and let repeat do the rest?",
    "Use repeat 3 with move up inside it.",
  ],
  debug: [
    "Which way did the character walk, and which way is the star?",
    "The number of repeats may be fine. Look at the move inside the loop.",
    "Change the move inside the repeat from left to right.",
  ],
  create: [
    "The star is not on a straight line. Which two directions do you need?",
    "You can use one loop for right and another loop for up.",
    "Use repeat 2 with move right, then repeat 2 with move up.",
  ],
  review: [
    "What did the loop save you from writing again?",
    "Name the direction and the number of times.",
    "A loop repeats the blocks inside it, so you write the move once.",
  ],
};

function describeProgram(program: CodingProgram): string {
  const parts: string[] = [];
  for (const block of program.blocks) {
    if (block.kind === "move") {
      parts.push(`move ${block.direction}`);
      continue;
    }
    const inside = block.body
      .filter((child) => child.kind === "move")
      .map((child) => (child.kind === "move" ? child.direction : ""))
      .filter(Boolean)
      .join(" and ");
    parts.push(inside
      ? `repeat ${block.times} time${block.times === 1 ? "" : "s"} moving ${inside}`
      : `repeat ${block.times} with nothing inside`);
  }
  return parts.length ? parts.join(", then ") : "no blocks yet";
}

function errorFromTheirCode(program: CodingProgram, run: CodingRunResult | null, stage: CodingStage): string | null {
  if (!run) return null;
  if (run.error) {
    return `Your program says ${describeProgram(program)}. ${run.error}`;
  }
  const briefGoal = stage === "build" || stage === "practise" || stage === "debug" || stage === "create";
  if (briefGoal && !run.reachedGoal) {
    return `Your program says ${describeProgram(program)}. The character stopped at column ${run.final.x}, row ${run.final.y}.`;
  }
  if (!run.usedLoop && run.unrolledMoves > 1) {
    return `Your program says ${describeProgram(program)}. That writes the move more than once instead of repeating it.`;
  }
  return null;
}

export function nextCodingHint(input: {
  lesson: CodingLessonBrief;
  stage: CodingStage;
  program: CodingProgram;
  hintCount: number;
  run: CodingRunResult | null;
}): CodingTutorTurn {
  const prompts = GUIDING[input.stage];
  const index = Math.min(input.hintCount, prompts.length - 1);
  const createGoal = stageBrief(input.lesson, "create").goal;
  const guiding = input.stage === "create" && index >= 1 && createGoal
    ? index >= 2
      ? `Use repeat ${createGoal.x} with move right, then repeat ${createGoal.y} with move up. This is a full answer; you will need a fresh independent challenge afterwards.`
      : "Use one loop for the horizontal movement and another for the vertical movement. Read the target coordinates."
    : prompts[index] ?? prompts[0]!;
  const fromCode = errorFromTheirCode(input.program, input.run, input.stage);
  const revealsSolution = index >= 2 && input.stage !== "predict" && input.stage !== "discover" && input.stage !== "review";
  const yearNote = input.lesson.yearMax <= 4
    ? "Look at the blocks, not lines of code."
    : "Read the instruction, then decide the next change yourself.";
  const message = fromCode && index > 0
    ? `${fromCode} ${guiding}`
    : `${guiding} ${index === 0 ? yearNote : ""}`.trim();
  return {
    message,
    hintLevel: index + 1,
    revealsSolution,
    guidingQuestion: index === 0,
  };
}

export function tutorCheckAfterSuccess(stage: CodingStage): string {
  const brief = stage;
  if (brief === "build" || brief === "practise" || brief === "create" || brief === "debug") {
    return "It worked. In one sentence, what did the repeat block do?";
  }
  if (brief === "predict") return "You predicted the result. What clue did you use?";
  return "Say what you would do next time you see a loop.";
}

export function stageTitle(lesson: CodingLessonBrief, stage: CodingStage): string {
  return stageBrief(lesson, stage).title;
}
