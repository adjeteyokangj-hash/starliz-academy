import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import {
  handleAdminSafeguardingIncidentCreatePost,
  handleAdminSafeguardingIncidentListGet,
} from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/route";
import {
  handleAdminSafeguardingIncidentDetailGet,
  handleAdminSafeguardingIncidentPatch,
} from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/route";
import { handleAdminSafeguardingIncidentAuditGet } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/audit/route";
import { handleAdminSafeguardingIncidentEscalationPost } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/escalation/route";
import { handleAdminSafeguardingIncidentTimelinePost } from "../src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/timeline/route";
import { handleAdminUsageEventsPost } from "../src/app/api/admin/usage-events/route.handler";

function deniedResponse() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

const deniedDeps = {
  requireAdmin: async () => ({
    session: null,
    response: deniedResponse(),
  }),
};

test("non-admin cannot list safeguarding incidents", async () => {
  const response = await handleAdminSafeguardingIncidentListGet(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents"),
    { params: Promise.resolve({ schoolId: "school-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot create safeguarding incidents", async () => {
  const response = await handleAdminSafeguardingIncidentCreatePost(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents", {
      method: "POST",
      body: JSON.stringify({ concernSummary: "ignored because auth fails first" }),
    }),
    { params: Promise.resolve({ schoolId: "school-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot view safeguarding incident detail", async () => {
  const response = await handleAdminSafeguardingIncidentDetailGet(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents/inc-1"),
    { params: Promise.resolve({ schoolId: "school-1", incidentId: "inc-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot update safeguarding incident detail", async () => {
  const response = await handleAdminSafeguardingIncidentPatch(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents/inc-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "Resolved" }),
    }),
    { params: Promise.resolve({ schoolId: "school-1", incidentId: "inc-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot access safeguarding incident audit route", async () => {
  const response = await handleAdminSafeguardingIncidentAuditGet(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents/inc-1/audit"),
    { params: Promise.resolve({ schoolId: "school-1", incidentId: "inc-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot access safeguarding incident escalation route", async () => {
  const response = await handleAdminSafeguardingIncidentEscalationPost(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents/inc-1/escalation", {
      method: "POST",
      body: JSON.stringify({ status: "Escalated" }),
    }),
    { params: Promise.resolve({ schoolId: "school-1", incidentId: "inc-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot access safeguarding incident timeline route", async () => {
  const response = await handleAdminSafeguardingIncidentTimelinePost(
    new Request("http://localhost/api/admin/schools/school-1/safeguarding/incidents/inc-1/timeline", {
      method: "POST",
      body: JSON.stringify({ action: "follow-up", note: "unauthorised" }),
    }),
    { params: Promise.resolve({ schoolId: "school-1", incidentId: "inc-1" }) },
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});

test("non-admin cannot post admin usage events", async () => {
  const response = await handleAdminUsageEventsPost(
    new Request("http://localhost/api/admin/usage-events", {
      method: "POST",
      body: JSON.stringify({ event: "clicked" }),
    }),
    deniedDeps,
  );

  const payload = (await response.json()) as { error?: string };
  assert.equal(response.status, 403);
  assert.equal(payload.error, "Forbidden: admin only");
});
