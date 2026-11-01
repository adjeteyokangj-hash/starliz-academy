import assert from "node:assert/strict";
import test from "node:test";
import { stageBrief, UNDERSTANDING_LOOPS } from "../src/lib/coding/catalog";
import { codingRunSelection, moveCodingBlock } from "../src/lib/coding/editor";
import { parseCodingProgram, runCodingProgram } from "../src/lib/coding/runner";
import type { CodingProgram } from "../src/lib/coding/types";

const nested: CodingProgram = {
  blocks: [
    {
      id: "loop",
      kind: "repeat",
      times: 2,
      body: [
        { id: "inside-a", kind: "move", direction: "right" },
        { id: "inside-b", kind: "move", direction: "up" },
      ],
    },
    { id: "after", kind: "move", direction: "left" },
  ],
};

test("blocks move up and down inside the same list", () => {
  const down = moveCodingBlock(nested, "loop", "down");
  assert.deepEqual(down.blocks.map((block) => block.id), ["after", "loop"]);
  const repeat = down.blocks[1];
  assert.equal(repeat?.kind, "repeat");
  if (repeat?.kind !== "repeat") return;
  assert.deepEqual(repeat.body.map((block) => block.id), ["inside-a", "inside-b"]);

  const up = moveCodingBlock(down, "loop", "up");
  assert.deepEqual(up.blocks.map((block) => block.id), ["loop", "after"]);
});

test("a nested block stays inside its repeat", () => {
  const swapped = moveCodingBlock(nested, "inside-b", "up");
  assert.deepEqual(swapped.blocks.map((block) => block.id), ["loop", "after"]);
  const repeat = swapped.blocks[0];
  assert.equal(repeat?.kind, "repeat");
  if (repeat?.kind !== "repeat") return;
  assert.deepEqual(repeat.body.map((block) => block.id), ["inside-b", "inside-a"]);

  const stuck = moveCodingBlock(swapped, "inside-b", "up");
  assert.deepEqual(stuck, swapped);
  const unknown = moveCodingBlock(nested, "missing", "down");
  assert.equal(unknown, nested);
});

test("reordered programs run in the new order and restore from saved JSON", () => {
  const original: CodingProgram = {
    blocks: [
      { id: "off", kind: "move", direction: "left" },
      { id: "safe", kind: "move", direction: "right" },
    ],
  };
  const blocked = runCodingProgram(original, null);
  assert.equal(blocked.ok, false);

  const reordered = moveCodingBlock(original, "safe", "up");
  const walked = runCodingProgram(reordered, null);
  assert.equal(walked.ok, true);
  assert.deepEqual(walked.final, { x: 0, y: 0 });

  const restored = parseCodingProgram(JSON.parse(JSON.stringify(reordered)));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.program.blocks.map((block) => block.id), ["safe", "off"]);
  const again = runCodingProgram(restored.program, null);
  assert.equal(again.ok, true);
  assert.deepEqual(again.final, walked.final);
});

test("predict can run the lesson example or the learner program without changing graded rules", () => {
  const example = stageBrief(UNDERSTANDING_LOOPS, "predict").example;
  const learner: CodingProgram = { blocks: [{ id: "mine", kind: "move", direction: "up" }] };
  assert.ok(example);

  const lessonRun = codingRunSelection({ graded: false, example, learner, source: "example" });
  assert.equal(lessonRun.source, "example");
  assert.equal(lessonRun.program, example);

  const ownRun = codingRunSelection({ graded: false, example, learner, source: "learner" });
  assert.equal(ownRun.source, "learner");
  assert.equal(ownRun.program, learner);

  const omitted = codingRunSelection({ graded: false, example, learner });
  assert.equal(omitted.source, "example");

  const graded = codingRunSelection({ graded: true, example, learner, source: "example" });
  assert.equal(graded.source, "learner");
  assert.equal(graded.program, learner);
});
