import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDays,
  computeComplaintSlaDueDates,
  evaluateComplaintSla,
  isWorkingDay,
} from "../src/lib/complaints/working-days";

test("isWorkingDay excludes weekends and England bank holidays", () => {
  // Friday 2026-05-01 is a working day; Monday 2026-05-04 is Early May bank holiday.
  assert.equal(isWorkingDay(new Date("2026-05-01T12:00:00Z")), true);
  assert.equal(isWorkingDay(new Date("2026-05-02T12:00:00Z")), false); // Saturday
  assert.equal(isWorkingDay(new Date("2026-05-03T12:00:00Z")), false); // Sunday
  assert.equal(isWorkingDay(new Date("2026-05-04T12:00:00Z")), false); // bank holiday
  assert.equal(isWorkingDay(new Date("2026-05-05T12:00:00Z")), true);
});

test("addWorkingDays skips weekends and bank holidays", () => {
  // From Thursday 30 Apr 2026, +2 working days:
  // Fri 1 May, skip Sat/Sun + Mon bank holiday, Tue 5 May.
  const from = new Date("2026-04-30T09:00:00Z");
  const due = addWorkingDays(from, 2);
  assert.equal(due.toISOString().slice(0, 10), "2026-05-05");
});

test("ordinary complaint acknowledgement is 2 working days; urgent is 1", () => {
  const receivedAt = new Date("2026-07-20T10:00:00Z"); // Monday
  const ordinary = computeComplaintSlaDueDates({ receivedAt, priority: "normal" });
  const urgent = computeComplaintSlaDueDates({ receivedAt, priority: "urgent" });

  assert.equal(ordinary.acknowledgementDueAt.toISOString().slice(0, 10), "2026-07-22");
  assert.equal(urgent.acknowledgementDueAt.toISOString().slice(0, 10), "2026-07-21");
  assert.equal(ordinary.substantiveResponseDueAt.toISOString().slice(0, 10), "2026-08-03");
});

test("opening a case does not clear overdue status", () => {
  const now = new Date("2026-07-28T12:00:00Z");
  const overdue = evaluateComplaintSla({
    now,
    status: "received",
    acknowledgementDueAt: new Date("2026-07-22T10:00:00Z"),
    substantiveResponseDueAt: new Date("2026-08-03T10:00:00Z"),
    acknowledgedAt: null,
    substantiveRespondedAt: null,
  });
  assert.equal(overdue.acknowledgementOverdue, true);
  assert.equal(overdue.substantiveOverdue, false);

  // Still overdue after "opening" — only acknowledgement clears it.
  const stillOverdue = evaluateComplaintSla({
    now,
    status: "investigating",
    acknowledgementDueAt: new Date("2026-07-22T10:00:00Z"),
    substantiveResponseDueAt: new Date("2026-08-03T10:00:00Z"),
    acknowledgedAt: null,
    substantiveRespondedAt: null,
  });
  assert.equal(stillOverdue.acknowledgementOverdue, true);
});
