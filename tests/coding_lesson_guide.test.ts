import test from "node:test";
import assert from "node:assert/strict";
import { advance } from "../src/components/guidance/guide";
import { lessonGuide } from "../src/components/guidance/coding-guides";

const context = { stage: "build", objective: "Use a repeat to make a route.", editor: "blocks", completed: false } as const;

test("visual and source guides identify the available tools", () => {
  const blocks = lessonGuide(context);
  assert.equal(blocks.find(step => step.id === "start")?.target, "coding-start-block");
  for (const [editor, label] of [["python", "Python"], ["javascript", "JavaScript"]] as const) {
    const steps = lessonGuide({ ...context, editor });
    assert.match(steps.find(step => step.id === "editor")!.text, new RegExp(label));
    assert.ok(!steps.some(step => step.id === "tools" || step.id === "start"));
  }
  assert.ok(lessonGuide(context, true).length < blocks.length);
});

test("stage guidance is bounded by actual lesson actions", () => {
  const discover = lessonGuide({ ...context, stage: "discover" });
  assert.ok(discover[0]?.text.includes(context.objective));
  assert.match(discover[0]!.text, /Instructions.*Lesson Example/);
  assert.ok(!discover.some(step => step.action === "edit"));
  const prediction = lessonGuide({ ...context, stage: "predict" });
  assert.equal(advance(prediction, prediction[0]!, "run"), prediction[0]);
  for (const stage of ["create", "review"] as const) {
    const steps = lessonGuide({ ...context, stage });
    assert.equal(steps.length, 1);
    assert.ok(!steps.some(step => ["edit", "run", "check"].includes(step.action)));
  }
  assert.ok(lessonGuide({ ...context, stage: "debug" }).some(step => step.title === "Repair one problem"));
  assert.ok(lessonGuide({ ...context, stage: "practise" }).some(step => step.title === "Try it yourself"));
});
