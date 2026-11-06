import assert from "node:assert/strict";
import test from "node:test";
import { describeParentProgressRecord } from "../src/components/parent/progress-record-display";

test("existing activity records without skill still have a progress row", () => {
  const row = describeParentProgressRecord({
    id: "atswei-reading",
    activityType: "reading",
    activityName: "Reading Journey",
    score: 80,
    accuracy: 75,
    difficulty: 2,
  });
  assert.ok(row);
  assert.equal(row.subject, "reading");
  assert.equal(row.skill, "Reading Journey");
  assert.equal(row.level, "2");
  assert.equal(row.accuracy, 80);
});

test("skill-coded records keep the subject prefix and full skill", () => {
  const row = describeParentProgressRecord({
    skill: "maths_addition",
    level: "Year 3",
    score: 70,
  });
  assert.ok(row);
  assert.equal(row.subject, "maths");
  assert.equal(row.skill, "maths_addition");
  assert.equal(row.level, "Year 3");
  assert.equal(row.accuracy, 70);
});

test("missing skill and activity fields are left blank", () => {
  const row = describeParentProgressRecord({ id: "empty" });
  assert.ok(row);
  assert.equal(row.subject, "—");
  assert.equal(row.skill, "—");
  assert.equal(row.level, "—");
  assert.equal(row.accuracy, null);
});

test("a record that is not an object cannot be rendered as a crash", () => {
  assert.equal(describeParentProgressRecord(null), null);
  assert.equal(describeParentProgressRecord("reading_journey"), null);
  assert.equal(describeParentProgressRecord(4), null);
});

test("a coding reward shows stars instead of a one percent score", () => {
  const row = describeParentProgressRecord({
    id: "coding-mastery",
    activityType: "coding",
    activityName: "Understanding Loops · mastery",
    score: 1,
    accuracy: 57,
    difficulty: 2,
    starsEarned: 8,
  });
  assert.ok(row);
  assert.equal(row.subject, "Coding");
  assert.equal(row.skill, "Understanding Loops · mastery");
  assert.equal(row.level, "8 stars");
  assert.equal(row.accuracy, null);
});
