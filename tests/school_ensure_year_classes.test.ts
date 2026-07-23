import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureSchoolYearClasses,
  SCHOOL_YEAR_CLASS_GROUPS,
  type EnsureYearClassesDeps,
} from "../src/lib/schools/ensure-year-classes";

test("ensureSchoolYearClasses creates Year 1 through Year 11", async () => {
  const created: string[] = [];
  const result = await ensureSchoolYearClasses(
    { schoolId: "school-1", actorUserId: "admin-1" },
    {
      findSchool: async () => ({ id: "school-1" }),
      findClassrooms: async () => [],
      createClassroom: async (input) => {
        created.push(input.yearGroup);
        assert.equal(input.name, input.yearGroup);
        return { id: `class-${input.yearGroup}` };
      },
      restoreClassroom: async (input) => ({ id: input.classroomId }),
      writeSchoolAuditLog: async () => undefined,
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created.length, 11);
    assert.deepEqual(created, [...SCHOOL_YEAR_CLASS_GROUPS]);
  }
});

test("ensureSchoolYearClasses reuses existing year classes", async () => {
  const created: string[] = [];
  const result = await ensureSchoolYearClasses(
    { schoolId: "school-1", actorUserId: "admin-1" },
    {
      findSchool: async () => ({ id: "school-1" }),
      findClassrooms: async () => SCHOOL_YEAR_CLASS_GROUPS.map((yearGroup, index) => ({
        id: `existing-${index}`,
        name: yearGroup,
        yearGroup,
        status: "active",
      })),
      createClassroom: async (input) => {
        created.push(input.yearGroup);
        return { id: `class-${input.yearGroup}` };
      },
      restoreClassroom: async (input) => ({ id: input.classroomId }),
      writeSchoolAuditLog: async () => undefined,
    } satisfies EnsureYearClassesDeps,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created.length, 0);
    assert.equal(result.reused.length, 11);
    assert.deepEqual(created, []);
  }
});
