import test from "node:test";
import assert from "node:assert/strict";
import {
  isSchoolAdminRole,
  isTeachingCapableRole,
  passesSchoolAdminLayoutGuard,
  resolveStaffLandingFromMembership,
  SCHOOL_ADMIN_HOME,
  TEACHER_HOME,
  PORTAL_MODE_COOKIE,
} from "../src/lib/schools/portal-routing";

test("school admin roles are owner and admin only", () => {
  assert.equal(isSchoolAdminRole("owner"), true);
  assert.equal(isSchoolAdminRole("admin"), true);
  assert.equal(isSchoolAdminRole("teacher"), false);
  assert.equal(isSchoolAdminRole("support"), false);
  assert.equal(isSchoolAdminRole(null), false);
});

test("teaching-capable roles include classroom and support staff", () => {
  assert.equal(isTeachingCapableRole("teacher"), true);
  assert.equal(isTeachingCapableRole("support"), true);
  assert.equal(isTeachingCapableRole("owner"), true);
  assert.equal(isTeachingCapableRole("admin"), true);
  assert.equal(isTeachingCapableRole("finance"), false);
  assert.equal(isTeachingCapableRole("staff_observer"), false);
});

test("school-admin layout guard rejects non-admin school roles", () => {
  assert.equal(passesSchoolAdminLayoutGuard("owner"), true);
  assert.equal(passesSchoolAdminLayoutGuard("admin"), true);
  assert.equal(passesSchoolAdminLayoutGuard("teacher"), false);
  assert.equal(passesSchoolAdminLayoutGuard(null), false);
});

test("portal routing constants are stable", () => {
  assert.equal(SCHOOL_ADMIN_HOME, "/school-admin");
  assert.equal(TEACHER_HOME, "/teacher");
  assert.equal(PORTAL_MODE_COOKIE, "starliz_portal_mode");
});

test("platform and consumer roles land on fixed paths", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "admin", membership: null }),
    { kind: "platform_admin", path: "/admin" },
  );
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "student", membership: null }),
    { kind: "student", path: "/student/dashboard" },
  );
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "parent", membership: null }),
    { kind: "parent", path: "/parent/profiles" },
  );
});

test("school owner/admin land on school-admin unless teaching mode cookie", () => {
  const membership = { schoolId: "sch_1", role: "owner" as const };

  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "teacher", membership }),
    {
      kind: "school_admin",
      path: SCHOOL_ADMIN_HOME,
      schoolId: "sch_1",
      schoolRole: "owner",
    },
  );

  assert.deepEqual(
    resolveStaffLandingFromMembership({
      userRole: "teacher",
      membership: { schoolId: "sch_1", role: "admin" },
      portalMode: "teaching",
    }),
    {
      kind: "teacher",
      path: TEACHER_HOME,
      schoolId: "sch_1",
      schoolRole: "admin",
    },
  );
});

test("classroom teacher without membership falls back to teacher home", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "teacher", membership: null }),
    { kind: "teacher", path: TEACHER_HOME, schoolId: "", schoolRole: "teacher" },
  );
});

test("school teacher/support membership lands on teacher portal", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({
      userRole: "teacher",
      membership: { schoolId: "sch_2", role: "teacher" },
    }),
    {
      kind: "teacher",
      path: TEACHER_HOME,
      schoolId: "sch_2",
      schoolRole: "teacher",
    },
  );
});
