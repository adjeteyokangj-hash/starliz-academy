import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatUkDateTime,
  formatUkTime,
  londonInstantFromDateAndHm,
  zonedLocalToUtc,
} from "../src/lib/uk-datetime";
import {
  SHORT_LEARNING_STARLIZ_CHOOSE,
  SHORT_LEARNING_SUBJECT_OPTIONS,
  normalizeShortLearningSubjectInput,
  isManualShortLearningSubject,
} from "../src/lib/schools/short-learning-subjects";

test("BST booking 17:30 London stores 16:30 UTC and displays 17:30", () => {
  const instant = londonInstantFromDateAndHm("2026-07-29", "17:30");
  assert.ok(instant);
  assert.equal(instant!.toISOString(), "2026-07-29T16:30:00.000Z");
  assert.equal(formatUkTime(instant!), "17:30");
  assert.match(formatUkDateTime(instant!), /29 Jul 2026/);
  assert.match(formatUkDateTime(instant!), /17:30/);
  assert.doesNotMatch(formatUkDateTime(instant!), /AM|PM/i);
});

test("GMT booking 17:30 London stores 17:30 UTC and displays 17:30", () => {
  const instant = londonInstantFromDateAndHm("2026-01-15", "17:30");
  assert.ok(instant);
  assert.equal(instant!.toISOString(), "2026-01-15T17:30:00.000Z");
  assert.equal(formatUkTime(instant!), "17:30");
});

test("date-only input does not shift calendar day for London evening slots", () => {
  const instant = zonedLocalToUtc({
    year: 2026,
    month: 7,
    day: 29,
    hour: 17,
    minute: 30,
  });
  assert.equal(instant.toISOString().slice(0, 10), "2026-07-29");
});

test("Short Learning subject dropdown includes Let StarLiz choose as default key", () => {
  assert.equal(SHORT_LEARNING_SUBJECT_OPTIONS[0]?.key, SHORT_LEARNING_STARLIZ_CHOOSE);
  assert.equal(SHORT_LEARNING_SUBJECT_OPTIONS[0]?.label, "Let StarLiz choose");
  assert.ok(SHORT_LEARNING_SUBJECT_OPTIONS.some((o) => o.key === "maths"));
  assert.ok(SHORT_LEARNING_SUBJECT_OPTIONS.some((o) => o.key === "english"));
  assert.ok(SHORT_LEARNING_SUBJECT_OPTIONS.some((o) => o.key === "religious-education"));
});

test("blank subject normalises to StarLiz choose; invalid subject rejected", () => {
  assert.equal(normalizeShortLearningSubjectInput(""), SHORT_LEARNING_STARLIZ_CHOOSE);
  assert.equal(normalizeShortLearningSubjectInput(null), SHORT_LEARNING_STARLIZ_CHOOSE);
  assert.equal(normalizeShortLearningSubjectInput("maths"), "maths");
  assert.equal(normalizeShortLearningSubjectInput("Math"), "maths");
  assert.equal(normalizeShortLearningSubjectInput("not-a-subject"), null);
  assert.equal(isManualShortLearningSubject("maths"), true);
  assert.equal(isManualShortLearningSubject(SHORT_LEARNING_STARLIZ_CHOOSE), false);
});

test("parent Short Learning route uses ParentPortalShell", () => {
  const page = readFileSync(join(process.cwd(), "src/app/parent/short-learning/page.tsx"), "utf8");
  assert.match(page, /ParentPortalShell/);
  assert.match(page, /section="short-learning"/);
  assert.doesNotMatch(page, /<Navbar/);
});

test("ParentPortalShell embeds Short Learning panel and active section", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/parent/ParentPortalShell.tsx"), "utf8");
  assert.match(shell, /ParentShortLearningPanel/);
  assert.match(shell, /activeSection === "short-learning"/);
  assert.match(shell, /"short-learning": "\/parent\/short-learning"/);
});

test("Parent Area returns to Parent Dashboard for parent role", () => {
  const nav = readFileSync(join(process.cwd(), "src/components/layout/Navbar.tsx"), "utf8");
  assert.match(nav, /navLink\("parent-area", "\/parent\/dashboard", "Parent Area"\)/);
  assert.doesNotMatch(nav, /navLink\("[^"]+", "\/parent\/profiles\?intent=parent"/);
});

test("child entry no longer clears parent unlock cookie", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/parent/profiles/verify-child-pin/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /getParentUnlockCookieName\(\),\s*""/);
});

test("middleware only clears parent unlock on profiles re-entry", () => {
  const source = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
  assert.match(source, /pathname\.startsWith\("\/parent\/profiles"\)/);
  assert.doesNotMatch(
    source,
    /pathname\.startsWith\("\/parent\/profiles"\) \|\| !pathname\.startsWith\("\/parent"\)/,
  );
});

test("booking API treats subject as optional and returns resolved subject", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/parent/short-learning/bookings/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /startsAt, and subject are required/);
  assert.match(source, /subjectSelectionMode/);
  assert.match(source, /selectionReason/);
});

test("parent panel defaults subject to Let StarLiz choose and keeps honesty checkbox", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/parent/ParentShortLearningPanel.tsx"),
    "utf8",
  );
  assert.match(panel, /SHORT_LEARNING_STARLIZ_CHOOSE/);
  assert.match(panel, /let StarLiz select one based on your child/);
  assert.match(panel, /honestyAcknowledged/);
  assert.match(panel, /formatUkDateTimeShort|formatUkTime/);
  assert.match(panel, /no cancellation fee/i);
  assert.match(panel, /value=\{90\}/);
  assert.match(panel, /value=\{120\}/);
});

test("student short learning list uses UK datetime helper", () => {
  const source = readFileSync(join(process.cwd(), "src/app/student/short-learning/page.tsx"), "utf8");
  assert.match(source, /formatUkDateTime/);
  assert.doesNotMatch(source, /toLocaleString\(\)/);
});
