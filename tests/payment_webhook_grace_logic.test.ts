import test from "node:test";
import assert from "node:assert/strict";

import { resolveGraceEndsAt } from "../src/lib/subscriptions/webhook-grace";

test("past_due with no existing grace creates a new grace window", () => {
  const now = new Date("2026-05-25T00:00:00.000Z");
  const value = resolveGraceEndsAt({ status: "past_due", existingGraceEndsAt: null, now });

  assert.ok(value instanceof Date);
  assert.equal(value?.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("past_due with active grace preserves existing window", () => {
  const now = new Date("2026-05-25T00:00:00.000Z");
  const existing = new Date("2026-05-30T00:00:00.000Z");
  const value = resolveGraceEndsAt({ status: "past_due", existingGraceEndsAt: existing, now });

  assert.equal(value, existing);
});

test("past_due with expired grace issues a fresh window", () => {
  const now = new Date("2026-05-25T00:00:00.000Z");
  const existing = new Date("2026-05-20T00:00:00.000Z");
  const value = resolveGraceEndsAt({ status: "past_due", existingGraceEndsAt: existing, now });

  assert.equal(value?.toISOString(), "2026-06-01T00:00:00.000Z");
});

test("active status clears grace", () => {
  const existing = new Date("2026-05-30T00:00:00.000Z");
  const value = resolveGraceEndsAt({ status: "active", existingGraceEndsAt: existing });

  assert.equal(value, null);
});

test("cancelled status clears grace", () => {
  const existing = new Date("2026-05-30T00:00:00.000Z");
  const value = resolveGraceEndsAt({ status: "cancelled", existingGraceEndsAt: existing });

  assert.equal(value, null);
});
