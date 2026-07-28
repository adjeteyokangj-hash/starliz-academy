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
import {
  canAssignSchoolRole,
  canManageSchoolOwnership,
  getSchoolRoleLabel,
} from "../src/lib/schools/permissions";

/**
 * Focused RBAC: School Admin (admin@starlizacademy.com model).
 * Access from User.role=teacher + SchoolTeacher.role=admin — never email inference.
 */

test("school admin landing is school-admin from DB membership shape", () => {
  const landing = resolveStaffLandingFromMembership({
    userRole: "teacher",
    membership: { schoolId: "cmpgzr6nc000jskjob867guo7", role: "admin" },
  });
  assert.deepEqual(landing, {
    kind: "school_admin",
    path: SCHOOL_ADMIN_HOME,
    schoolId: "cmpgzr6nc000jskjob867guo7",
    schoolRole: "admin",
  });
});

test("school admin label is School Admin", () => {
  assert.equal(getSchoolRoleLabel("admin"), "School Admin");
});

test("school admin is denied platform admin routes", () => {
  for (const pathname of ["/admin", "/admin/schools", "/admin/login"]) {
    const decision = resolvePlatformAdminGate({
      pathname,
      session: { role: "teacher" },
    });
    assert.equal(decision.action, "redirect");
    if (decision.action !== "redirect") continue;
    assert.equal(decision.to, SCHOOL_ADMIN_HOME);
  }
});

test("school admin cannot assign or transfer ownership", () => {
  assert.equal(canManageSchoolOwnership("admin"), false);
  assert.equal(canAssignSchoolRole("admin", "owner"), false);
  assert.equal(canAssignSchoolRole("admin", "admin"), false);
  assert.equal(canAssignSchoolRole("admin", "teacher"), true);
});

test("school owner can assign owner; platform path unaffected", () => {
  assert.equal(canManageSchoolOwnership("owner"), true);
  assert.equal(canAssignSchoolRole("owner", "owner"), true);
  assert.equal(nonPlatformAdminFallbackPath("teacher"), "/school-admin");

  const gate = resolvePlatformAdminGate({
    pathname: "/admin/schools",
    session: { role: "admin" },
  });
  assert.equal(gate.action, "allow");
});

test("email alone cannot grant school-admin landing without membership", () => {
  const landing = resolveStaffLandingFromMembership({
    userRole: "teacher",
    membership: null,
  });
  assert.equal(landing.kind, "teacher");
  assert.equal(landing.path, "/teacher");
});