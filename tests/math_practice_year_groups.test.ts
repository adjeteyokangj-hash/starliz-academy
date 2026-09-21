import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMathPracticeFillItems,
  resolveMathPracticeTopic,
} from "../src/lib/schools/math-practice-fill";

const YEARS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
] as const;

test("each year group can fill a full lesson with four-choice questions", () => {
  for (const yearGroup of YEARS) {
    const items = buildMathPracticeFillItems({ yearGroup, count: 10 });
    assert.ok(items.length >= 8, `${yearGroup} should produce a lesson set, got ${items.length}`);
    for (const item of items) {
      assert.ok(item.prompt.length > 8, `${yearGroup} empty prompt`);
      assert.ok(item.options.length >= 4, `${yearGroup} ${item.prompt} needs four choices`);
      const answers = item.options.map((value) => String(value));
      assert.equal(new Set(answers).size, answers.length, `${yearGroup} duplicate choices: ${item.prompt}`);
      assert.ok(answers.includes(String(item.answer)), `${yearGroup} missing answer for ${item.prompt}`);
    }
  }
});

test("year-group questions follow the National Curriculum strand, not one Year 4 array pack", () => {
  assert.equal(resolveMathPracticeTopic("Year 1"), "addition");
  assert.equal(resolveMathPracticeTopic("Year 4"), "multiplication");
  assert.equal(resolveMathPracticeTopic("Year 5"), "fractions");
  assert.equal(resolveMathPracticeTopic("Year 6"), "percentages");
  assert.equal(resolveMathPracticeTopic("Year 8"), "algebra");
  assert.equal(resolveMathPracticeTopic("Year 5", "multiplication using arrays"), "multiplication");

  const year1 = buildMathPracticeFillItems({ yearGroup: "Year 1", count: 8 });
  assert.equal(year1.some((item) => /array|×/.test(item.prompt)), false);
  assert.ok(year1.some((item) => /\+|bond|more than|altogether|left/.test(item.prompt)));

  const year4 = buildMathPracticeFillItems({ yearGroup: "Year 4", count: 8 });
  assert.ok(year4.some((item) => /array|×|trays|rows/.test(item.prompt)));

  const year6 = buildMathPracticeFillItems({ yearGroup: "Year 6", count: 8 });
  assert.ok(year6.some((item) => /%|\/\d|new price|×/.test(item.prompt)));
});
