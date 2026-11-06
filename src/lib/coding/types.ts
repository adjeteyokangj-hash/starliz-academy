export const CODING_STAGES = [
  "discover",
  "predict",
  "build",
  "practise",
  "debug",
  "create",
  "review",
] as const;

export type CodingStage = (typeof CODING_STAGES)[number];

/** A stage opens when every earlier stage has been completed. Discover is always open. */
export function stageUnlocked(stage: CodingStage, completed: readonly CodingStage[]): boolean {
  const index = CODING_STAGES.indexOf(stage);
  if (index <= 0) return true;
  return CODING_STAGES.slice(0, index).every((previous) => completed.includes(previous));
}

/** The stage a learner should see. A stored stage ahead of its prerequisite stays locked. */
export function visibleCodingStage(stored: CodingStage, completed: readonly CodingStage[]): CodingStage {
  if (stageUnlocked(stored, completed)) return stored;
  for (const stage of CODING_STAGES) {
    if (!completed.includes(stage) && stageUnlocked(stage, completed)) return stage;
  }
  return "discover";
}

export const CODING_SKILL_STATUSES = [
  "not_started",
  "learning",
  "practising",
  "mastered",
] as const;

export type CodingSkillStatus = (typeof CODING_SKILL_STATUSES)[number];

export const CODING_PATHWAYS = [
  "foundations",
  "block-coding",
  "blocks-to-text",
  "programming-web",
  "applied",
] as const;

export type CodingPathwayId = (typeof CODING_PATHWAYS)[number];

export type CodingDirection = "up" | "down" | "left" | "right";

export type CodingBlock =
  | { id: string; kind: "move"; direction: CodingDirection }
  | { id: string; kind: "repeat"; times: number; body: CodingBlock[] };

export type CodingProgram = { blocks: CodingBlock[] };

export type GridPoint = { x: number; y: number };

export type CodingEvidence = {
  prediction: boolean;
  practical: boolean;
  debugging: boolean;
  explanation: boolean;
  independent: boolean;
};

export const EMPTY_EVIDENCE: CodingEvidence = {
  prediction: false,
  practical: false,
  debugging: false,
  explanation: false,
  independent: false,
};

export type RunFrame = GridPoint;

export type CodingRunResult = {
  ok: boolean;
  frames: RunFrame[];
  final: GridPoint;
  steps: number;
  usedLoop: boolean;
  unrolledMoves: number;
  error: string | null;
  reachedGoal: boolean;
  limitHit: boolean;
};

export const CODING_GRID_SIZE = 6;
export const CODING_MAX_STEPS = 40;
export const CODING_MAX_BLOCKS = 24;
export const CODING_MAX_REPEAT = 8;
export const CODING_MAX_DEPTH = 3;

export const PLACEMENT_LESSON_ID = "__placement";
export const PUBLISHED_CODING_LESSON_ID = "understanding-loops";
