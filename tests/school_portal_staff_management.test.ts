import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignableSchoolRoles,
  canAssignSchoolRole,
  canDo,
  canManageTargetStaffMember,
  getSchoolRoleLabel,
} from "../src/lib/schools/permissions";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("school portal staff page uses staff management client and manageTeachers gate", () => {
  const page = read("src/app/school-admin/day-school/teachers/page.tsx");
  assert.match(page, /SchoolStaffManagementClient/);
  assert.match(page, /manageTeachers/);
  assert.doesNotMatch(page, /\/teacher\/governance/);
  assert.doesNotMatch(page, /\/admin\//);
});

test("staff management client stays inside school-admin APIs", () => {
  const client = read("src/components/school-admin/SchoolStaffManagementClient.tsx");
  assert.match(client, /Invite staff/);
  assert.match(client, /\/api\/school\/invites/);
  assert.match(client, /\/api\/school\/teachers/);
  assert.match(client, /\/api\/school\/audit/);
  assert.match(client, /Tutor \/ Support/);
  assert.match(client, /Not available here/);
  assert.match(client, /\/school-admin\/day-school\/classes/);
  assert.doesNotMatch(client, /\/teacher\/governance/);
  assert.doesNotMatch(client, /\/admin\//);
});

test("school admin nav labels staff management under day school", () => {
  const nav = read("src/components/school-admin/SchoolAdminNav.tsx");
  assert.match(nav, /\/school-admin\/day-school\/teachers/);
  assert.match(nav, /label: "Staff"/);
});

test("support displays as Tutor / Support without inventing a tutor role", () => {
  assert.equal(getSchoolRoleLabel("support"), "Tutor / Support");
  assert.deepEqual(assignableSchoolRoles("owner").includes("support"), true);
  assert.equal(assignableSchoolRoles("owner").includes("tutor" as never), false);
});

test("owner may invite school admin; school admin may not", () => {
  assert.equal(canAssignSchoolRole("owner", "admin"), true);
  assert.equal(canAssignSchoolRole("admin", "admin"), false);
  assert.equal(canAssignSchoolRole("admin", "teacher"), true);
  assert.equal(canAssignSchoolRole("admin", "support"), true);
  assert.equal(canAssignSchoolRole("admin", "owner"), false);
  assert.equal(canAssignSchoolRole("teacher", "teacher"), false);
});

test("school admin cannot manage owner or other school admins", () => {
  assert.equal(canManageTargetStaffMember("owner", "admin"), true);
  assert.equal(canManageTargetStaffMember("owner", "teacher"), true);
  assert.equal(canManageTargetStaffMember("admin", "teacher"), true);
  assert.equal(canManageTargetStaffMember("admin", "admin"), false);
  assert.equal(canManageTargetStaffMember("admin", "owner"), false);
  assert.equal(canManageTargetStaffMember("teacher", "teacher"), false);
});

test("teacher is denied staff management permission", () => {
  assert.equal(canDo("teacher", "manageTeachers"), false);
  assert.equal(canDo("teacher", "inviteTeacher"), false);
  assert.equal(canDo("owner", "manageTeachers"), true);
  assert.equal(canDo("admin", "manageTeachers"), true);
});

test("teachers API supports archive and target-staff protection helpers", () => {
  const route = read("src/app/api/school/teachers/route.ts");
  assert.match(route, /archive/);
  assert.match(route, /canManageTargetStaffMember/);
  assert.match(route, /teacher_archived/);
  assert.match(route, /safeguardingAccess/);
  assert.match(route, /shortLearning/);
  assert.match(route, /resetPassword/);
  assert.match(route, /teacher_password_reset/);
  assert.match(route, /createPasswordResetToken/);
});

test("staff client exposes password reset without showing passwords", () => {
  const client = read("src/components/school-admin/SchoolStaffManagementClient.tsx");
  assert.match(client, /Reset password/);
  assert.match(client, /resetPassword/);
  assert.doesNotMatch(client, /temporaryPassword|plainPassword|passwordHash/);
});

test("invites API accepts optional name fields and returns inviteUrl for copy-after-send", () => {
  const route = read("src/app/api/school/invites/route.ts");
  assert.match(route, /firstName/);
  assert.match(route, /lastName/);
  assert.match(route, /inviteUrl/);
  assert.match(route, /invite_sent/);
  assert.match(route, /invite_resent/);
  assert.match(route, /invitedBy/);
});

test("audit API can filter by entityId for staff detail history", () => {
  const route = read("src/app/api/school/audit/route.ts");
  assert.match(route, /entityId/);
});
