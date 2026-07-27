import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { hasCronAccess } from "../src/lib/cron-auth";
import { handleShortLearningRemindersCron } from "../src/app/api/cron/short-learning-reminders/route";

test("vercel.json schedules Short Learning reminders every 10 minutes", () => {
  const raw = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
  const config = JSON.parse(raw) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const entry = config.crons?.find((c) => c.path === "/api/cron/short-learning-reminders");
  assert.ok(entry, "expected short-learning-reminders cron entry");
  assert.equal(entry.schedule, "*/10 * * * *");
});

test("vercel.json also schedules tutor-presence-sweep and short-learning-lifecycle", () => {
  const raw = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");
  const config = JSON.parse(raw) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const presence = config.crons?.find((c) => c.path === "/api/cron/tutor-presence-sweep");
  const lifecycle = config.crons?.find((c) => c.path === "/api/cron/short-learning-lifecycle");
  assert.ok(presence, "expected tutor-presence-sweep cron entry");
  assert.equal(presence.schedule, "* * * * *");
  assert.ok(lifecycle, "expected short-learning-lifecycle cron entry");
  assert.equal(lifecycle.schedule, "*/5 * * * *");
});

test("hasCronAccess rejects missing Authorization when CRON_SECRET is set", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const req = new Request("http://localhost/api/cron/short-learning-reminders", { method: "GET" });
    assert.equal(hasCronAccess(req), false);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("hasCronAccess rejects invalid Bearer token", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const req = new Request("http://localhost/api/cron/short-learning-reminders", {
      method: "GET",
      headers: { authorization: "Bearer wrong" },
    });
    assert.equal(hasCronAccess(req), false);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("hasCronAccess accepts Bearer CRON_SECRET (Vercel Cron pattern)", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const req = new Request("http://localhost/api/cron/short-learning-reminders", {
      method: "GET",
      headers: { authorization: "Bearer test-cron-secret" },
    });
    assert.equal(hasCronAccess(req), true);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("hasCronAccess accepts x-cron-secret header", () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const req = new Request("http://localhost/api/cron/short-learning-reminders", {
      method: "POST",
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    assert.equal(hasCronAccess(req), true);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("handler GET rejects missing secret (Vercel Cron method)", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const res = await handleShortLearningRemindersCron(
      new Request("http://localhost/api/cron/short-learning-reminders", { method: "GET" }),
    );
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Unauthorized");
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("handler GET rejects invalid Bearer secret", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const res = await handleShortLearningRemindersCron(
      new Request("http://localhost/api/cron/short-learning-reminders", {
        method: "GET",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    assert.equal(res.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  }
});

test("handler POST rejects invalid x-cron-secret", async () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const res = await handleShortLearningRemindersCron(
      new Request("http://localhost/api/cron/short-learning-reminders", {
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
