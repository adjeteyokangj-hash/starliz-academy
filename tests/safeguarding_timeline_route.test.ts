import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminSafeguardingIncidentTimelinePost } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/timeline/route";
import type { SafeguardingIncident, TimelineEvent, AuditEvent } from "../src/app/api/admin/schools/[schoolId]/safeguarding/_lib/contracts";

const adminDeps = {
  requireSafeguardingAdmin: async () => ({
    session: { email: "dsl@example.com", userId: "admin-1", role: "admin" },
    response: null,
  }),
};

function incidentContext(schoolId: string, incidentId: string) {
  return { params: Promise.resolve({ schoolId, incidentId }) };
}

function buildIncident(schoolId: string, incidentId: string): SafeguardingIncident {
  return {
    id: incidentId,
    schoolId,
    student: "A. Learner",
    concernType: "Wellbeing",
    riskLevel: "High",
    reportedBy: "Form tutor",
    reportedAt: "2026-06-03T09:00:00.000Z",
    concernSummary: "Student disclosed a concern requiring DSL review.",
    immediateActionTaken: "DSL notified and safe space arranged.",
    assignedOwner: null,
    status: "New",
    nextReviewDate: null,
    parentContacted: false,
    externalAgencyInvolved: false,
    chronologyNotes: "Initial concern recorded.",
    closureSummary: "",
    parentContactNotes: "",
    agencyReferralStatus: "Not Referred",
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-03T09:00:00.000Z",
    triagedAt: null,
    escalatedAt: null,
    resolvedAt: null,
    closedAt: null,
  };
}

function buildTimelineDeps(incident: SafeguardingIncident | null) {
  const timeline: TimelineEvent[] = [];
  const audits: AuditEvent[] = [];
  let incidentState = incident;

  return {
    requireSafeguardingAdmin: adminDeps.requireSafeguardingAdmin,
    writeAuditLog: async () => undefined,
    getIncident: async (schoolId: string, incidentId: string) => {
      if (!incidentState) return null;
      if (incidentState.schoolId !== schoolId || incidentState.id !== incidentId) return null;
      return incidentState;
    },
    appendTimelineEvent: async (
      _schoolId: string,
      _incidentId: string,
      event: TimelineEvent,
      actorUserId?: string | null,
    ) => {
      const stored = { ...event, actor: actorUserId ?? event.actor };
      timeline.unshift(stored);
      return stored;
    },
    updateIncident: async (_schoolId: string, _incidentId: string, patch: Partial<SafeguardingIncident>) => {
      if (!incidentState) return null;
      incidentState = {
        ...incidentState,
        ...patch,
      };
      return incidentState;
    },
    appendAuditEvent: async (
      _schoolId: string,
      _incidentId: string,
      event: AuditEvent,
      actorUserId?: string | null,
    ) => {
      const stored = { ...event, actor: actorUserId ?? event.actor };
      audits.unshift(stored);
      return stored;
    },
    listTimelineEvents: async () => timeline,
    getAuditEvents: () => audits,
  };
}

test("safeguarding timeline append records event, audit entry, and chronology note", async () => {
  const schoolId = `school-timeline-${Date.now()}`;
  const incident = buildIncident(schoolId, `incident-${Date.now()}`);
  const deps = buildTimelineDeps(incident);

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
    deps,
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
  assert.equal(payload.data?.timelineEvent.actor, "admin-1");
  assert.equal(payload.data?.timelineEvent.action, "parent-contact");
  assert.equal(payload.data?.timelineEvent.timestamp, "2026-06-03T10:30:00.000Z");
  assert.equal(payload.data?.timeline.length, 1);
  assert.match(payload.data?.incident?.chronologyNotes ?? "", /Initial concern recorded\.\n2026-06-03T10:30:00\.000Z: Parent contacted/);
  assert.equal(payload.data?.incident?.status, "New");
  assert.equal(payload.auditEvent?.actionType, "timeline.added");
  assert.equal(payload.auditEvent?.actor, "admin-1");
  assert.equal(payload.auditEvent?.notes, "Timeline note added.");
});

test("safeguarding timeline rejects invalid payloads", async () => {
  const schoolId = `school-timeline-invalid-${Date.now()}`;
  const incident = buildIncident(schoolId, `incident-${Date.now()}`);
  const deps = buildTimelineDeps(incident);

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/${incident.id}/timeline`, {
      method: "POST",
      body: JSON.stringify({ action: "", note: "" }),
    }),
    incidentContext(schoolId, incident.id),
    deps,
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
  const deps = buildTimelineDeps(null);

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/missing/timeline`, {
      method: "POST",
      body: JSON.stringify({ action: "review", note: "Attempted update." }),
    }),
    incidentContext(schoolId, "missing"),
    deps,
  );

  const payload = await response.json() as { error: { code: string } | null };

  assert.equal(response.status, 404);
  assert.equal(payload.error?.code, "NOT_FOUND");
});

test("safeguarding timeline denies callers without MANAGE_SAFEGUARDING", async () => {
  const schoolId = `school-timeline-denied-${Date.now()}`;
  const incident = buildIncident(schoolId, `incident-${Date.now()}`);
  const deps = {
    ...buildTimelineDeps(incident),
    requireSafeguardingAdmin: async () => ({
      session: null,
      response: new Response(JSON.stringify({ error: "You do not have permission to perform this action." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    }),
  };

  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request(`http://localhost/api/admin/schools/${schoolId}/safeguarding/incidents/${incident.id}/timeline`, {
      method: "POST",
      body: JSON.stringify({ action: "review", note: "Should fail." }),
    }),
    incidentContext(schoolId, incident.id),
    deps,
  );

  assert.equal(response.status, 403);
});
