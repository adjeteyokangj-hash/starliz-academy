import type { CodingProgram, GridPoint } from "@/lib/coding/types";

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
