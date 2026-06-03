import test from "node:test";
import assert from "node:assert/strict";

import { buildBloodEvent, routeBloodEvent, tryRouteBloodEvent, getBloodPullContract, isBloodTransportPure } from "../src/lib/blood";

test("lesson_completed routes to core learning destinations", () => {
  const route = routeBloodEvent(buildBloodEvent({
    type: "lesson_completed",
    studentId: "student-1",
  }));

  assert.deepEqual(route.destinations, [
    "student_learning_brain",
    "heartbeat",
    "knowledge_graph",
    "parent_reports",
    "admin_reports",
    "coach",
    "audit_log",
  ]);
  assert.equal(route.deliveryMode, "push_and_pull");
});

test("quick_level_finder_completed routes to placement and report chain", () => {
  const route = routeBloodEvent(buildBloodEvent({
    type: "quick_level_finder_completed",
    studentId: "student-2",
  }));

  assert.deepEqual(route.destinations, [
    "student_learning_brain",
    "heartbeat",
    "placement",
    "assignments",
    "parent_reports",
    "admin_reports",
    "audit_log",
  ]);
});

test("coach_help_used routes to brain heartbeat coach admin and audit", () => {
  const route = routeBloodEvent(buildBloodEvent({
    type: "coach_help_used",
    studentId: "student-3",
  }));

  assert.deepEqual(route.destinations, [
    "student_learning_brain",
    "heartbeat",
    "coach",
    "admin_reports",
    "audit_log",
  ]);
});

test("certificate_issued routes to certificate and reporting destinations", () => {
  const route = routeBloodEvent(buildBloodEvent({
    type: "certificate_issued",
    studentId: "student-4",
  }));

  assert.deepEqual(route.destinations, [
    "certificates",
    "parent_reports",
    "admin_reports",
    "notifications",
    "audit_log",
  ]);
});

test("unsupported event types fail safely", () => {
  const route = tryRouteBloodEvent("unknown_event", "student-5");
  assert.equal(route, null);
});

test("blood pull contracts are allow-list only", () => {
  const contract = getBloodPullContract("knowledge_graph");

  assert.ok(contract.allowedFields.includes("learning_data_state"));
  assert.ok(contract.allowedFields.includes("evidence_summary"));
  assert.equal(contract.allowedFields.includes("audit_trace"), false);
});

test("blood transport is pure and does not perform intelligence calculation", () => {
  assert.equal(isBloodTransportPure(), true);
});
