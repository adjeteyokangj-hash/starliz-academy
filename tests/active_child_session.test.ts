import test from "node:test";
import assert from "node:assert/strict";

import { resolveActiveChildForSession } from "../src/lib/activeChild";

test("student session resolves ChildProfile via userId", async () => {
  let selectionReads = 0;
  const resolved = await resolveActiveChildForSession(
    { userId: "student-user", role: "student" },
    {
      readSelectionCookie: async () => {
        selectionReads += 1;
        return "other-child";
      },
      findStudentOwnedProfile: async (userId) => {
        assert.equal(userId, "student-user");
        return { childId: "child-owned", parentId: "parent-1" };
      },
    },
  );

  assert.deepEqual(resolved, {
    ok: true,
    childId: "child-owned",
    parentId: "parent-1",
    source: "student_account",
  });
  assert.equal(selectionReads, 0, "student sessions must not read the child-selection cookie");
});

test("student cannot override profile using another child's selection cookie", async () => {
  const resolved = await resolveActiveChildForSession(
    { userId: "student-user", role: "student" },
    {
      readSelectionCookie: async () => "foreign-child",
      findStudentOwnedProfile: async () => ({ childId: "child-owned", parentId: "parent-1" }),
      findOwnedChild: async () => {
        throw new Error("student path must not consult owned-child cookie lookups");
      },
    },
  );

  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.childId, "child-owned");
    assert.notEqual(resolved.childId, "foreign-child");
  }
});

test("student User without linked ChildProfile fails safely", async () => {
  const resolved = await resolveActiveChildForSession(
    { userId: "orphan-student", role: "student" },
    {
      findStudentOwnedProfile: async () => null,
      readSelectionCookie: async () => "should-be-ignored",
    },
  );
  assert.deepEqual(resolved, { ok: false, reason: "no_linked_profile" });
});

test("parent session still resolves selected child through transitional cookie", async () => {
  const resolved = await resolveActiveChildForSession(
    { userId: "parent-1", role: "parent" },
    {
      readSelectionCookie: async (userId) => {
        assert.equal(userId, "parent-1");
        return "child-selected";
      },
      findOwnedChild: async (input) => {
        assert.equal(input.parentId, "parent-1");
        assert.equal(input.childId, "child-selected");
        return { id: "child-selected", parentId: "parent-1" };
      },
    },
  );

  assert.deepEqual(resolved, {
    ok: true,
    childId: "child-selected",
    parentId: "parent-1",
    source: "child_selection",
  });
});

test("unsupported roles do not resolve a child", async () => {
  const resolved = await resolveActiveChildForSession({ userId: "admin-1", role: "admin" });
  assert.deepEqual(resolved, { ok: false, reason: "unsupported_role" });
});
