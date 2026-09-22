import test from "node:test";
import assert from "node:assert/strict";
import { resolveImprovingBoostSession, IMPROVING_SESSION_MINUTES, IMPROVING_SESSION_QUESTION_CAP } from "../src/lib/improving-session";

test("improving boost auto-selects skill and matching assignment for 20 minutes", () => {
  assert.equal(IMPROVING_SESSION_MINUTES, 20);
  assert.equal(IMPROVING_SESSION_QUESTION_CAP, 10);

  const now = new Date("2026-09-21T12:00:00.000Z");
  const session = resolveImprovingBoostSession({
    now,
    skills: [
      { skill: "fractions", status: "improving", accuracy: 62, updatedAt: "2026-09-20T12:00:00.000Z" },
      { skill: "old_skill", status: "improving", accuracy: 55, updatedAt: "2026-08-01T12:00:00.000Z" },
      { skill: "mastered_skill", status: "mastered", accuracy: 90, updatedAt: "2026-09-20T12:00:00.000Z" },
    ],
    assignments: [
      {
        id: "a1",
        status: "assigned",
        title: "Fractions practice",
        subject: "math",
        skillFocus: "fractions",
        href: "/games/math?assignmentId=a1",
        updatedAt: "2026-09-20T10:00:00.000Z",
      },
    ],
  });

  assert.ok(session);
  assert.equal(session?.skill.skill, "fractions");
  assert.equal(session?.estimatedMinutes, 20);
  assert.match(session?.href ?? "", /mode=improving_boost/);
  assert.match(session?.href ?? "", /targetMinutes=20/);
});

test("improving boost returns null when no improving skills", () => {
  const session = resolveImprovingBoostSession({
    skills: [{ skill: "fractions", status: "mastered", accuracy: 90, updatedAt: "2026-09-20T12:00:00.000Z" }],
    assignments: [],
  });
  assert.equal(session, null);
});