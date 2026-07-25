import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeAdminSupportCaseId,
  parseAdminSupportCaseId,
} from "../src/lib/schools/admin-support-case";
import { mergeAdminFollowUp, parseAdminFollowUp } from "../src/lib/schools/admin-support-follow-up";
import {
  canAdminReassignQueueStatus,
  requiresCloseActiveSessionForForceOffline,
} from "../src/lib/schools/admin-support-actions";

describe("admin support case id", () => {
  it("round-trips child and period", () => {
    const id = encodeAdminSupportCaseId({ childId: "child-1", periodId: "period-9" });
    assert.equal(id, "child-1::period-9");
    assert.deepEqual(parseAdminSupportCaseId(id), { childId: "child-1", periodId: "period-9" });
  });

  it("allows null period", () => {
    const id = encodeAdminSupportCaseId({ childId: "child-1", periodId: null });
    assert.deepEqual(parseAdminSupportCaseId(id), { childId: "child-1", periodId: null });
  });

  it("rejects invalid ids", () => {
    assert.equal(parseAdminSupportCaseId(""), null);
    assert.equal(parseAdminSupportCaseId("no-separator"), null);
  });
});

describe("admin follow-up merge", () => {
  it("stores follow-up without wiping other metadata", () => {
    const { metadataJson, followUp } = mergeAdminFollowUp(
      JSON.stringify({ sessionNotes: { privateNotes: "keep me", actionsTaken: [], followUpNeeded: true } }),
      {
        status: "open",
        adminNote: "Headteacher review",
        updatedByUserId: "admin-1",
        now: new Date("2026-07-25T12:00:00.000Z"),
      },
    );
    const parsed = JSON.parse(metadataJson);
    assert.equal(parsed.sessionNotes.privateNotes, "keep me");
    assert.equal(followUp.status, "open");
    assert.equal(parseAdminFollowUp(metadataJson)?.adminNote, "Headteacher review");
  });
});

describe("admin action guards", () => {
  it("allows reassign only for unaccepted queue states", () => {
    assert.equal(canAdminReassignQueueStatus("waiting"), true);
    assert.equal(canAdminReassignQueueStatus("assigned"), true);
    assert.equal(canAdminReassignQueueStatus("paused_ai_only"), true);
    assert.equal(canAdminReassignQueueStatus("in_session"), false);
    assert.equal(canAdminReassignQueueStatus("completed"), false);
  });

  it("requires closeActiveSession when busy with active session", () => {
    assert.equal(
      requiresCloseActiveSessionForForceOffline({ status: "busy", activeSessionId: "s1" }),
      true,
    );
    assert.equal(
      requiresCloseActiveSessionForForceOffline({ status: "available", activeSessionId: null }),
      false,
    );
  });
});
