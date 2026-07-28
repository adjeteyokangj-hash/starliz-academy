import test from "node:test";
import assert from "node:assert/strict";
import {
  nonPlatformAdminFallbackPath,
  resolvePlatformAdminGate,
} from "../src/lib/admin-auth-gate";
import {
  resolveStaffLandingFromMembership,
  SCHOOL_ADMIN_HOME,
} from "../src/lib/schools/portal-routing";
import { getSchoolRoleLabel } from "../src/lib/schools/permissions";

/**
 * Focused RBAC: StarLiz Academy School Owner (ops-owner@starliz.dev model).
 * Access comes from User.role=teacher + SchoolTeacher.role=owner — never email inference.
 */

test("school owner landing is school-admin from DB membership shape", () => {
  const landing = resolveStaffLandingFromMembership({
    userRole: "teacher",
    membership: { schoolId: "cmpgzr6nc000jskjob867guo7", role: "owner" },
  });
  assert.deepEqual(landing, {
    kind: "school_admin",
    path: SCHOOL_ADMIN_HOME,
    schoolId: "cmpgzr6nc000jskjob867guo7",
    schoolRole: "owner",
  });
});

test("school owner label is School Owner", () => {
  assert.equal(getSchoolRoleLabel("owner"), "School Owner");
});

test("school owner session is denied platform admin routes (no role-switch login)", () => {
  for (const pathname of ["/admin", "/admin/schools", "/admin/login", "/admin/content-library"]) {
    const decision = resolvePlatformAdminGate({
      pathname,
      session: { role: "teacher" },
    });
    assert.equal(decision.action, "redirect");
    if (decision.action !== "redirect") continue;
    assert.equal(decision.to, SCHOOL_ADMIN_HOME);
    assert.doesNotMatch(decision.to, /admin\/login/);
    assert.doesNotMatch(decision.to, /reason=switch/);
  }
});

test("nonPlatformAdminFallbackPath routes school staff to school portal", () => {
  assert.equal(nonPlatformAdminFallbackPath("teacher"), "/school-admin");
  assert.equal(nonPlatformAdminFallbackPath("admin"), "/");
});

test("platform admin landing and gate remain intact", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "admin", membership: null }),
    { kind: "platform_admin", path: "/admin" },
  );
  // Even with a school membership present, User.role=admin stays platform admin.
  assert.deepEqual(
    resolveStaffLandingFromMembership({
      userRole: "admin",
      membership: { schoolId: "cmpgzr6nc000jskjob867guo7", role: "owner" },
    }),
    { kind: "platform_admin", path: "/admin" },
  );

  const gate = resolvePlatformAdminGate({
    pathname: "/admin/schools",
    session: { role: "admin" },
  });
  assert.equal(gate.action, "allow");
});

test("email alone cannot grant school-owner landing without membership", () => {
  // Simulates ops-owner@starliz.dev if someone only set User.role=teacher with no SchoolTeacher row.
  const landing = resolveStaffLandingFromMembership({
    userRole: "teacher",
    membership: null,
  });
  assert.equal(landing.kind, "teacher");
  assert.equal(landing.path, "/teacher");
});