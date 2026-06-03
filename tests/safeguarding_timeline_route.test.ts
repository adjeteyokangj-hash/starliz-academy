import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminSafeguardingIncidentCreatePost } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/route";
import { handleAdminSafeguardingIncidentTimelinePost } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/timeline/route";

const adminDeps = {
  requireAdmin: async () => ({
    session: { email: "dsl@example.com", userId: "admin-1", role: "admin" },
    response: null,
  }),
};

function schoolContext(schoolId: string) {
  return { params: Promise.resolve({ schoolId }) };
}

function incidentContext(schoolId: string, incidentId: string) {
  return { params: Promise.resolve({ schoolId, incidentId }) };
}

async function createIncident(schoolId: string) {
  const response = await handleAdminSafeguardingIncidentCreatePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents`, {
      method: "POST",
      body: JSON.stringify({
        student: "A. Learner",
        concernType: "Wellbeing",
        riskLevel: "High",
        reportedBy: "Form tutor",
        reportedAt: "2026-06-03T09:00:00.000Z",
        concernSummary: "Student disclosed a concern requiring DSL review.",
        immediateActionTaken: "DSL notified and safe space arranged.",
        chronologyNotes: "Initial concern recorded.",
      }),
    }),
    schoolContext(schoolId),
    adminDeps,
  );

  const payload = await response.json() as {
    data: { incident: { id: string; chronologyNotes: string } } | null;
  };

  assert.equal(response.status, 201);
  assert.ok(payload.data?.incident.id);
  return payload.data.incident;
}

test("safeguarding timeline append records event, audit entry, and chronology note", async () => {
  const schoolId = `school-timeline-${Date.now()}`;
  const incident = await createIncident(schoolId);

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/${incident.id}/timeline`, {
      method: "POST",
      body: JSON.stringify({
        action: "parent-contact",
        note: "Parent contacted and follow-up review booked.",
        timestamp: "2026-06-03T10:30:00.000Z",
      }),
    }),
    incidentContext(schoolId, incident.id),
    adminDeps,
  );

  const payload = await response.json() as {
    auditEvent: { actionType: string; actor: string; notes: string } | null;
    data: {
      timelineEvent: { actor: string; action: string; note: string; timestamp: string };
      timeline: Array<{ action: string }>;
      incident: { chronologyNotes: string; status: string } | null;
    } | null;
  };

  assert.equal(response.status, 201);
  assert.equal(payload.data?.timelineEvent.actor, "dsl@example.com");
  assert.equal(payload.data?.timelineEvent.action, "parent-contact");
  assert.equal(payload.data?.timelineEvent.timestamp, "2026-06-03T10:30:00.000Z");
  assert.equal(payload.data?.timeline.length, 1);
  assert.match(payload.data?.incident?.chronologyNotes ?? "", /Initial concern recorded\.\n2026-06-03T10:30:00\.000Z: Parent contacted/);
  assert.equal(payload.data?.incident?.status, "New");
  assert.equal(payload.auditEvent?.actionType, "timeline.added");
  assert.equal(payload.auditEvent?.actor, "dsl@example.com");
  assert.equal(payload.auditEvent?.notes, "Parent contacted and follow-up review booked.");
});

test("safeguarding timeline rejects invalid payloads", async () => {
  const schoolId = `school-timeline-invalid-${Date.now()}`;
  const incident = await createIncident(schoolId);

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/${incident.id}/timeline`, {
      method: "POST",
      body: JSON.stringify({ action: "", note: "" }),
    }),
    incidentContext(schoolId, incident.id),
    adminDeps,
  );

  const payload = await response.json() as {
    error: { code: string } | null;
    validationErrors: Array<{ field: string }>;
  };

  assert.equal(response.status, 422);
  assert.equal(payload.error?.code, "VALIDATION_FAILED");
  assert.deepEqual(payload.validationErrors.map((error) => error.field).sort(), ["action", "note"]);
});

test("safeguarding timeline returns not found for unknown incident", async () => {
  const schoolId = `school-timeline-missing-${Date.now()}`;

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/missing/timeline`, {
      method: "POST",
      body: JSON.stringify({ action: "review", note: "Attempted update." }),
    }),
    incidentContext(schoolId, "missing"),
    adminDeps,
  );

  const payload = await response.json() as { error: { code: string } | null };

  assert.equal(response.status, 404);
  assert.equal(payload.error?.code, "NOT_FOUND");
});
