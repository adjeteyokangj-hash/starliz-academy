import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { hasCronAccess } from "../src/lib/cron-auth";
import { handleTutorPresenceSweepCron } from "../src/app/api/cron/tutor-presence-sweep/route";
import { handleShortLearningLifecycleCron } from "../src/app/api/cron/short-learning-lifecycle/route";
import { classifyBookingLifecycleTransition } from "../src/lib/schools/short-learning-booking-lifecycle";

test("vercel.json schedules tutor-presence-sweep every minute", () => {
  const raw = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
  const config = JSON.parse(raw) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const entry = config.crons?.find((c) => c.path === "/api/cron/tutor-presence-sweep");
  assert.ok(entry, "expected tutor-presence-sweep cron entry");
  assert.equal(entry.schedule, "* * * * *");
});

test("vercel.json schedules short-learning-lifecycle every 5 minutes", () => {
  const raw = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
  const config = JSON.parse(raw) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const entry = config.crons?.find((c) => c.path === "/api/cron/short-learning-lifecycle");
  assert.ok(entry, "expected short-learning-lifecycle cron entry");
  assert.equal(entry.schedule, "*/5 * * * *");
});

test("tutor-presence-sweep handler rejects missing secret in production pattern", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const res = await handleTutorPresenceSweepCron(
      new Request("http://localhost/api/cron/tutor-presence-sweep", { method: "GET" }),
    );
    assert.equal(res.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("tutor-presence-sweep handler accepts Bearer CRON_SECRET", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    assert.equal(
      hasCronAccess(
        new Request("http://localhost/api/cron/tutor-presence-sweep", {
          method: "GET",
          headers: { authorization: "Bearer test-cron-secret" },
        }),
      ),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("short-learning-lifecycle handler rejects invalid secret", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const res = await handleShortLearningLifecycleCron(
      new Request("http://localhost/api/cron/short-learning-lifecycle", {
        method: "POST",
        headers: { "x-cron-secret": "wrong" },
      }),
    );
    assert.equal(res.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("lifecycle classifier: booked becomes active at early entry", () => {
  const startsAt = new Date("2026-07-26T16:00:00.000Z");
  const endsAt = new Date("2026-07-26T17:30:00.000Z");
  assert.equal(
    classifyBookingLifecycleTransition({
      status: "booked",
      startsAt,
      endsAt,
      joinedAt: null,
      now: new Date("2026-07-26T15:50:00.000Z"),
      studentPlayable: true,
    }),
    "active",
  );
});

test("lifecycle classifier: joined booking completes after endsAt", () => {
  const startsAt = new Date("2026-07-26T16:00:00.000Z");
  const endsAt = new Date("2026-07-26T17:30:00.000Z");
  assert.equal(
    classifyBookingLifecycleTransition({
      status: "attended",
      startsAt,
      endsAt,
      joinedAt: new Date("2026-07-26T16:05:00.000Z"),
      now: new Date("2026-07-26T17:31:00.000Z"),
      studentPlayable: true,
    }),
    "completed",
  );
});

test("lifecycle classifier: playable no-join becomes no_show", () => {
  const startsAt = new Date("2026-07-26T16:00:00.000Z");
  const endsAt = new Date("2026-07-26T17:30:00.000Z");
  assert.equal(
    classifyBookingLifecycleTransition({
      status: "confirmed",
      startsAt,
      endsAt,
      joinedAt: null,
      now: new Date("2026-07-26T17:31:00.000Z"),
      studentPlayable: true,
    }),
    "no_show",
  );
});

test("lifecycle classifier: unplayable no-join becomes expired not no_show", () => {
  const startsAt = new Date("2026-07-26T16:00:00.000Z");
  const endsAt = new Date("2026-07-26T17:30:00.000Z");
  assert.equal(
    classifyBookingLifecycleTransition({
      status: "booked",
      startsAt,
      endsAt,
      joinedAt: null,
      now: new Date("2026-07-26T17:31:00.000Z"),
      studentPlayable: false,
    }),
    "expired",
  );
});

test("lifecycle classifier never invents fees (no_show path is attendance-only)", () => {
  // Guardrail: classifier returns no_show without fee side effects — fee policy lives in reliability gate.
  const result = classifyBookingLifecycleTransition({
    status: "confirmed",
    startsAt: new Date("2026-07-26T16:00:00.000Z"),
    endsAt: new Date("2026-07-26T17:30:00.000Z"),
    joinedAt: null,
    now: new Date("2026-07-26T18:00:00.000Z"),
    studentPlayable: true,
  });
  assert.equal(result, "no_show");
});
