import test from "node:test";
import assert from "node:assert/strict";

import { canDo, getSchoolRoleLabel, requiresOwnerInviteConfirmation, canAssignSchoolRole, canManageSchoolOwnership } from "../src/lib/schools/permissions";

test("staff observer is read-only and cannot perform write actions", () => {
  assert.equal(canDo("staff_observer", "viewDashboard"), true);
  assert.equal(canDo("staff_observer", "viewClassrooms"), true);
  assert.equal(canDo("staff_observer", "manageTeachers"), false);
  assert.equal(canDo("staff_observer", "issueAssignment"), false);
  assert.equal(canDo("staff_observer", "manageLicence"), false);
  assert.equal(canDo("staff_observer", "manageSafeguarding"), false);
  assert.equal(canDo("staff_observer", "manageSchoolSettings"), false);
});

test("finance cannot access safeguarding management", () => {
  assert.equal(canDo("finance", "viewBilling"), true);
  assert.equal(canDo("finance", "manageBilling"), true);
  assert.equal(canDo("finance", "viewReports"), true);
  assert.equal(canDo("finance", "manageSafeguarding"), false);
});

test("support cannot change licence or governance settings", () => {
  assert.equal(canDo("support", "manageLicence"), false);
  assert.equal(canDo("support", "manageSchoolSettings"), false);
  assert.equal(canDo("support", "manageTeachers"), false);
});

test("admin and owner can manage staff invites", () => {
  assert.equal(canDo("admin", "inviteTeacher"), true);
  assert.equal(canDo("owner", "inviteTeacher"), true);
  assert.equal(canDo("teacher", "inviteTeacher"), false);
  assert.equal(canDo("support", "inviteTeacher"), false);
  assert.equal(canDo("finance", "inviteTeacher"), false);
  assert.equal(canDo("staff_observer", "inviteTeacher"), false);
});

test("owner invite confirmation helper enforces confirmation requirement", () => {
  assert.equal(requiresOwnerInviteConfirmation("owner"), true);
  assert.equal(requiresOwnerInviteConfirmation("admin"), false);
  assert.equal(requiresOwnerInviteConfirmation("teacher"), false);
});

test("only school owner may assign or transfer ownership", () => {
  assert.equal(canManageSchoolOwnership("owner"), true);
  assert.equal(canManageSchoolOwnership("admin"), false);
  assert.equal(canAssignSchoolRole("admin", "owner"), false);
  assert.equal(canAssignSchoolRole("owner", "owner"), true);
});

test("role labels stay consistent for dropdown and table rendering", () => {
  assert.equal(getSchoolRoleLabel("owner"), "School Owner");
  assert.equal(getSchoolRoleLabel("admin"), "School Admin");
  assert.equal(getSchoolRoleLabel("teacher"), "Teacher");
  assert.equal(getSchoolRoleLabel("support"), "Tutor / Support");
  assert.equal(getSchoolRoleLabel("staff_observer"), "Staff Observer");
  assert.equal(getSchoolRoleLabel("finance"), "Finance");
});
