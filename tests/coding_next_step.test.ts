import test from "node:test";
import assert from "node:assert/strict";
import { codingNextStep } from "../src/lib/coding/next-step";

const activity = { title: "Published practice", href: "/student/coding/activities/published-practice", mastered: false, unlocked: true };
test("no remaining published activities reports caught up", () => {
  assert.deepEqual(codingNextStep([]), { state: "caught-up" });
  assert.deepEqual(codingNextStep([{ ...activity, mastered: true }]), { state: "caught-up" });
});
test("next activity skips mastered and locked candidates", () => {
  assert.deepEqual(codingNextStep([{ ...activity, mastered: true }, { ...activity, unlocked: false }, activity]), { state: "next", activity: { title: activity.title, href: activity.href } });
});
test("locked remaining activities do not claim all available learning is complete", () => {
  assert.deepEqual(codingNextStep([{ ...activity, unlocked: false }]), { state: "prerequisites" });
});
