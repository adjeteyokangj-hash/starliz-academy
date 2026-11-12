import assert from "node:assert/strict";
import test from "node:test";

import {
  enrolSchoolStudent,
  mapStaffUiRoleToSchoolRole,
  type EnrolStudentDeps,
} from "../src/lib/schools/enrol-student";

function makeDeps(overrides: Partial<EnrolStudentDeps> = {}): EnrolStudentDeps {
  return {
    canAddSchoolStudent: async () => ({ allowed: true, reason: "ok", seatLimit: 100, seatsUsed: 0 }),
    hashPassword: async () => "hashed",
    writeSchoolAuditLog: async () => undefined,
    findSchool: async () => ({ id: "school-1", name: "UI Drill School" }),
    findClassroom: async () => ({ id: "class-1" }),
    findUserByEmail: async () => null,
    createParentUser: async () => ({ id: "parent-1" }),
    createChildWithProfile: async () => ({ id: "child-1" }),
    createSchoolStudent: async () => ({ id: "ss-1" }),
    upsertParentSchoolLink: async () => undefined,
    ...overrides,
  };
}

test("enrolSchoolStudent creates parent, child, and school student", async () => {
  const calls: string[] = [];
  const result = await enrolSchoolStudent(
    {
      schoolId: "school-1",
      firstName: "Ada",
      lastName: "Lovelace",
      yearGroup: "Year 5",
      classroomId: "class-1",
      guardianName: "Parent Lovelace",
      guardianEmail: "parent@example.com",
      sendSupport: true,
      actorUserId: "admin-1",
    },
    makeDeps({
      createParentUser: async () => {
        calls.push("parent");
        return { id: "parent-1" };
      },
      createChildWithProfile: async (input) => {
        calls.push("child");
        assert.equal(input.name, "Ada Lovelace");
        assert.equal(input.yearGroup, "Year 5");
        assert.match(input.senSupportNeeds ?? "", /SEND/);
        return { id: input.id };
      },
      createSchoolStudent: async () => {
        calls.push("schoolStudent");
        return { id: "ss-1" };
      },
      upsertParentSchoolLink: async () => {
        calls.push("link");
      },
      writeSchoolAuditLog: async () => {
        calls.push("audit");
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.schoolStudentId, "ss-1");
    assert.equal(result.parentUserId, "parent-1");
    assert.ok(result.childId);
  }
  assert.deepEqual(calls, ["parent", "child", "schoolStudent", "link", "audit"]);
});

test("enrolSchoolStudent returns 402 when seats are blocked", async () => {
  const result = await enrolSchoolStudent(
    {
      schoolId: "school-1",
      firstName: "Ada",
      lastName: "Lovelace",
      yearGroup: "Year 5",
      guardianName: "Parent Lovelace",
      guardianEmail: "parent@example.com",
      actorUserId: "admin-1",
    },
    makeDeps({
      canAddSchoolStudent: async () => ({
        allowed: false,
        reason: "seat_limit",
        seatLimit: 1,
        seatsUsed: 1,
      }),
      createParentUser: async () => {
        throw new Error("should not create parent");
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 402);
    assert.match(result.error, /licence/i);
  }
});

test("enrolSchoolStudent rejects non-parent existing email", async () => {
  const result = await enrolSchoolStudent(
    {
      schoolId: "school-1",
      firstName: "Ada",
      lastName: "Lovelace",
      yearGroup: "Year 5",
      guardianName: "Teacher Person",
      guardianEmail: "teacher@example.com",
      actorUserId: "admin-1",
    },
    makeDeps({
      findUserByEmail: async () => ({ id: "user-t", role: "teacher" }),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /non-parent/i);
  }
});

test("mapStaffUiRoleToSchoolRole maps leadership and teaching roles", () => {
  assert.equal(mapStaffUiRoleToSchoolRole("head-teacher"), "owner");
  assert.equal(mapStaffUiRoleToSchoolRole("deputy-head-teacher"), "admin");
  assert.equal(mapStaffUiRoleToSchoolRole("class-teacher"), "teacher");
  assert.equal(mapStaffUiRoleToSchoolRole("finance-officer"), "finance");
  assert.equal(mapStaffUiRoleToSchoolRole("designated-safeguarding-lead"), "support");
});
