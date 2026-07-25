import test from "node:test";
import assert from "node:assert/strict";
import { shiftTimeRangesOverlap } from "../src/lib/schools/tutor-support-shifts";

test("shift overlap detects intersecting ranges", () => {
  const aStart = new Date("2026-07-25T09:00:00.000Z");
  const aEnd = new Date("2026-07-25T12:00:00.000Z");
  const bStart = new Date("2026-07-25T11:00:00.000Z");
  const bEnd = new Date("2026-07-25T13:00:00.000Z");
  assert.equal(shiftTimeRangesOverlap(aStart, aEnd, bStart, bEnd), true);
});

test("shift overlap rejects adjacent back-to-back ranges", () => {
  const aStart = new Date("2026-07-25T09:00:00.000Z");
  const aEnd = new Date("2026-07-25T12:00:00.000Z");
  const bStart = new Date("2026-07-25T12:00:00.000Z");
  const bEnd = new Date("2026-07-25T15:00:00.000Z");
  assert.equal(shiftTimeRangesOverlap(aStart, aEnd, bStart, bEnd), false);
});

test("resolveTutorShiftEligibility is DB-backed (skipped without fixture)", {
  skip: "requires DB fixtures for shifts/policy",
}, () => {
  assert.ok(true);
});
