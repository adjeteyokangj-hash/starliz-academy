import test from "node:test";
import assert from "node:assert/strict";
import {
  SHORT_LEARNING_CHECKBOX,
  SHORT_LEARNING_HONESTY_POLICY_VERSION,
  SHORT_LEARNING_PROMISE,
  SHORT_LEARNING_ALLOWED_DURATIONS,
  canCancelFreely,
  generateSlotStartMinutes,
  isAllowedShortLearningDuration,
  isWithinStandardBookingWindow,
  parseTimeHm,
  shortLearningCancellationIsAlwaysFree,
} from "../src/lib/schools/short-learning-bookings";

test("Short Learning honesty copy is present", () => {
  assert.match(SHORT_LEARNING_PROMISE, /AI teaching is guaranteed/i);
  assert.match(SHORT_LEARNING_CHECKBOX, /AI-led/i);
  assert.equal(SHORT_LEARNING_HONESTY_POLICY_VERSION, "short-learning-ai-led-v1");
});

test("weekday booking opens 7 days ahead and is late after noon", () => {
  // Wednesday 2026-07-29 15:00 UTC session
  const sessionStartsAt = new Date("2026-07-29T15:00:00.000Z");

  const tooEarly = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-20T12:00:00.000Z"),
  });
  assert.equal(tooEarly.ok, false);

  const onTime = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-28T10:00:00.000Z"),
  });
  assert.equal(onTime.ok, true);
  assert.equal(onTime.lateBooking, false);

  const late = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-29T13:00:00.000Z"),
  });
  assert.equal(late.ok, true);
  assert.equal(late.lateBooking, true);
});

test("weekend booking opens 14 days ahead and is late after Thursday 18:00", () => {
  // Saturday 2026-08-01
  const sessionStartsAt = new Date("2026-08-01T10:00:00.000Z");

  const tooEarly = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-10T12:00:00.000Z"),
  });
  assert.equal(tooEarly.ok, false);

  const onTime = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-29T12:00:00.000Z"), // Wednesday before Thu deadline
  });
  assert.equal(onTime.ok, true);
  assert.equal(onTime.lateBooking, false);

  const late = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-31T12:00:00.000Z"), // Friday after Thu 18:00
  });
  assert.equal(late.ok, true);
  assert.equal(late.lateBooking, true);
});

test("weekday cancel is late within 2 hours of start", () => {
  const sessionStartsAt = new Date("2026-07-29T16:00:00.000Z");
  const free = canCancelFreely({
    sessionStartsAt,
    now: new Date("2026-07-29T13:00:00.000Z"),
  });
  assert.equal(free.free, true);
  assert.equal(free.late, false);

  const late = canCancelFreely({
    sessionStartsAt,
    now: new Date("2026-07-29T15:00:00.000Z"),
  });
  assert.equal(late.free, true);
  assert.equal(late.late, true);
});

test("weekend cancel is late after previous day 18:00", () => {
  const sessionStartsAt = new Date("2026-08-01T10:00:00.000Z"); // Saturday
  const free = canCancelFreely({
    sessionStartsAt,
    now: new Date("2026-07-31T16:00:00.000Z"),
  });
  assert.equal(free.free, true);
  assert.equal(free.late, false);

  const late = canCancelFreely({
    sessionStartsAt,
    now: new Date("2026-07-31T19:00:00.000Z"),
  });
  assert.equal(late.free, true);
  assert.equal(late.late, true);
});

test("cancellation is always free — no fee in subscription model", () => {
  assert.equal(shortLearningCancellationIsAlwaysFree(), true);

  const scenarios = [
    { sessionStartsAt: new Date("2026-07-29T16:00:00.000Z"), now: new Date("2026-07-29T15:30:00.000Z") },
    { sessionStartsAt: new Date("2026-08-01T10:00:00.000Z"), now: new Date("2026-08-01T09:00:00.000Z") },
  ];
  for (const input of scenarios) {
    const result = canCancelFreely(input);
    assert.equal(result.free, true, "cancellation must never charge a fee");
  }
});

test("allowed durations are 90 and 120 minutes only", () => {
  assert.deepEqual(SHORT_LEARNING_ALLOWED_DURATIONS, [90, 120]);
  assert.equal(isAllowedShortLearningDuration(90), true);
  assert.equal(isAllowedShortLearningDuration(120), true);
  assert.equal(isAllowedShortLearningDuration(60), false);
  assert.equal(isAllowedShortLearningDuration(150), false);
});

test("weekday default window yields 30-minute slot grid for 90 and 120 min sessions", () => {
  const openMin = parseTimeHm("16:00");
  const closeMin = parseTimeHm("20:00");
  assert.equal(openMin, 16 * 60);
  assert.equal(closeMin, 20 * 60);

  const slots90 = generateSlotStartMinutes({
    openMin,
    closeMin,
    durationMinutes: 90,
    intervalMinutes: 30,
  });
  assert.deepEqual(slots90, [16 * 60, 16 * 60 + 30, 17 * 60, 17 * 60 + 30, 18 * 60, 18 * 60 + 30]);

  const slots120 = generateSlotStartMinutes({
    openMin,
    closeMin,
    durationMinutes: 120,
    intervalMinutes: 30,
  });
  assert.deepEqual(slots120, [16 * 60, 16 * 60 + 30, 17 * 60, 17 * 60 + 30, 18 * 60]);

  const invalidDuration = generateSlotStartMinutes({
    openMin,
    closeMin,
    durationMinutes: 60,
    intervalMinutes: 30,
  });
  assert.deepEqual(invalidDuration, []);
});

test("weekend default window supports 90-min slots on 30-minute boundaries", () => {
  const openMin = parseTimeHm("09:00");
  const closeMin = parseTimeHm("18:00");
  const slots = generateSlotStartMinutes({
    openMin,
    closeMin,
    durationMinutes: 90,
    intervalMinutes: 30,
  });
  assert.ok(slots.length >= 3);
  assert.ok(slots.every((min) => min % 30 === 0));
  assert.ok(slots.every((min) => min + 90 <= closeMin));
});

test("late booking flag is false before weekday noon deadline", () => {
  const sessionStartsAt = new Date("2026-07-29T18:00:00.000Z");
  const onTime = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-29T11:59:00.000Z"),
  });
  assert.equal(onTime.ok, true);
  assert.equal(onTime.lateBooking, false);
});

test("late booking flag is true after weekday noon deadline", () => {
  const sessionStartsAt = new Date("2026-07-29T18:00:00.000Z");
  const late = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-29T12:01:00.000Z"),
  });
  assert.equal(late.ok, true);
  assert.equal(late.lateBooking, true);
});

test("weekend late booking flag flips after Thursday 18:00", () => {
  const sessionStartsAt = new Date("2026-08-01T10:00:00.000Z");
  const onTime = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-30T17:00:00.000Z"),
  });
  assert.equal(onTime.lateBooking, false);

  const late = isWithinStandardBookingWindow({
    sessionStartsAt,
    now: new Date("2026-07-30T19:00:00.000Z"),
  });
  assert.equal(late.lateBooking, true);
});
