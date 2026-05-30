import test from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/lib/db";
import {
  getCoachHeartbeatSignals,
  summarizeCoachHeartbeatSignals,
} from "../src/lib/academic-intelligence/coachHeartbeatSignals";

test("coach heartbeat helper parses valid heartbeat.signal.updated metadata", () => {
  const now = new Date("2026-05-30T10:00:00.000Z");
  const summary = summarizeCoachHeartbeatSignals([
    {
      metadataJson: JSON.stringify({
        subject: "Maths",
        strand: "Number",
        skillTopic: "Multiplication",
        understoodAfterHelp: true,
        stillStruggling: false,
        repeatedWeakArea: false,
        needsCatchUp: false,
        needsDifferentExplanationStyle: false,
        needsLiveTutorSupport: false,
      }),
      createdAt: now,
    },
  ], 14);

  assert.equal(summary.totalCoachSignals, 1);
  assert.equal(summary.understoodAfterHelpCount, 1);
  assert.equal(summary.topSubjects[0]?.value, "Maths");
  assert.equal(summary.topSkillTopics[0]?.value, "Multiplication");
  assert.equal(summary.latestSignalAt, now.toISOString());
});

test("coach heartbeat helper ignores malformed metadataJson", () => {
  const summary = summarizeCoachHeartbeatSignals([
    {
      metadataJson: "{not-valid-json}",
      createdAt: new Date("2026-05-30T10:00:00.000Z"),
    },
    {
      metadataJson: JSON.stringify({
        subject: "Maths",
        understoodAfterHelp: false,
        stillStruggling: true,
        repeatedWeakArea: true,
        needsCatchUp: true,
        needsDifferentExplanationStyle: false,
        needsLiveTutorSupport: false,
      }),
      createdAt: new Date("2026-05-30T11:00:00.000Z"),
    },
  ], 14);

  assert.equal(summary.totalCoachSignals, 1);
  assert.equal(summary.stillStrugglingCount, 1);
  assert.equal(summary.repeatedWeakAreaCount, 1);
});

test("coach heartbeat helper aggregates counts and top dimensions", () => {
  const summary = summarizeCoachHeartbeatSignals([
    {
      metadataJson: JSON.stringify({
        subject: "Maths",
        strand: "Number",
        skillTopic: "Multiplication",
        understoodAfterHelp: false,
        stillStruggling: true,
        repeatedWeakArea: true,
        needsCatchUp: true,
        needsDifferentExplanationStyle: true,
        needsLiveTutorSupport: true,
      }),
      createdAt: new Date("2026-05-30T09:00:00.000Z"),
    },
    {
      metadataJson: JSON.stringify({
        subject: "Maths",
        strand: "Number",
        skillTopic: "Multiplication",
        understoodAfterHelp: true,
        stillStruggling: false,
        repeatedWeakArea: false,
        needsCatchUp: false,
        needsDifferentExplanationStyle: false,
        needsLiveTutorSupport: true,
      }),
      createdAt: new Date("2026-05-30T10:00:00.000Z"),
    },
    {
      metadataJson: JSON.stringify({
        subject: "English",
        strand: "Reading",
        skillTopic: "Inference",
        understoodAfterHelp: true,
        stillStruggling: false,
        repeatedWeakArea: false,
        needsCatchUp: false,
        needsDifferentExplanationStyle: false,
        needsLiveTutorSupport: false,
      }),
      createdAt: new Date("2026-05-30T11:00:00.000Z"),
    },
  ], 14);

  assert.equal(summary.totalCoachSignals, 3);
  assert.equal(summary.needsLiveTutorSupportCount, 2);
  assert.equal(summary.hasTutorEscalationSignal, true);
  assert.equal(summary.hasCatchUpSignal, true);
  assert.equal(summary.topSubjects[0]?.value, "Maths");
  assert.equal(summary.topStrands[0]?.value, "Number");
  assert.equal(summary.topSkillTopics[0]?.value, "Multiplication");
});

test("coach heartbeat query scopes by studentId/entity and heartbeat action", async () => {
  const original = prisma.auditLog.findMany;
  let capturedArgs: unknown = null;
  prisma.auditLog.findMany = (async (args: unknown) => {
    capturedArgs = args;
    return [];
  }) as typeof prisma.auditLog.findMany;

  try {
    await getCoachHeartbeatSignals("student-42", {
      now: new Date("2026-05-30T12:00:00.000Z"),
      windowDays: 14,
    });
  } finally {
    prisma.auditLog.findMany = original;
  }

  const where = (capturedArgs as { where?: { action?: string; OR?: Array<{ entityType?: string; entityId?: string }> } })?.where;
  assert.equal(where?.action, "heartbeat.signal.updated");
  assert.equal(where?.OR?.some((item) => item.entityType === "StudentSignal" && item.entityId === "student-42"), true);
  assert.equal(where?.OR?.some((item) => item.entityId === "student-42"), true);
});

test("coach heartbeat query ignores unrelated actions via action filter", async () => {
  const original = prisma.auditLog.findMany;
  let capturedAction: string | undefined;
  prisma.auditLog.findMany = (async (args: { where?: { action?: string } }) => {
    capturedAction = args?.where?.action;
    return [];
  }) as typeof prisma.auditLog.findMany;

  try {
    const summary = await getCoachHeartbeatSignals("student-99");
    assert.equal(summary.totalCoachSignals, 0);
  } finally {
    prisma.auditLog.findMany = original;
  }

  assert.equal(capturedAction, "heartbeat.signal.updated");
});
