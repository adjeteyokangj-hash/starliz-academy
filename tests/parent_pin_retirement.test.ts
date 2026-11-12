import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveStaffLandingFromMembership } from "../src/lib/schools/portal-routing";
import { nonPlatformAdminFallbackPath } from "../src/lib/admin-auth-gate";
import { resolveActiveChildForSession } from "../src/lib/activeChild";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("parent login landing is Parent Portal dashboard, not profiles/PIN", () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "parent", membership: null }),
    { kind: "parent", path: "/parent/dashboard" },
  );
  assert.equal(nonPlatformAdminFallbackPath("parent"), "/parent/dashboard");

  const loginPage = read("src/app/auth/login/page.tsx");
  assert.match(loginPage, /landingPath \?\? "\/parent\/dashboard"/);
  assert.doesNotMatch(loginPage, /\/parent\/profiles"/);
  assert.doesNotMatch(loginPage, /\/parent-pin/);
});

test("middleware no longer requires Parent PIN unlock for parent portal", () => {
  const mw = read("middleware.ts");
  assert.doesNotMatch(mw, /hasParentUnlock/);
  assert.doesNotMatch(mw, /intent=parent&next=/);
  assert.match(mw, /Parent PIN pages are retired/);
  assert.match(mw, /pathname\.startsWith\("\/parent-pin"\)/);
  assert.match(mw, /Always clear legacy unlock cookie/);
});

test("Parent PIN APIs are retired with 410 stubs", () => {
  for (const route of [
    "src/app/api/pin/status/route.ts",
    "src/app/api/pin/verify/route.ts",
    "src/app/api/pin/set/route.ts",
    "src/app/api/pin/refresh/route.ts",
    "src/app/api/parent-pin/forgot/route.ts",
    "src/app/api/parent-pin/reset/route.ts",
    "src/app/api/admin/parents/[id]/reset-pin/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /parent-pin-retired/);
  }
  const retired = read("src/lib/parent-pin-retired.ts");
  assert.match(retired, /status: 410/);
  assert.match(retired, /parent_pin_retired/);
});

test("Parent PIN pages redirect to parent dashboard", () => {
  assert.match(read("src/app/parent-pin/page.tsx"), /redirect\("\/parent\/dashboard"\)/);
  assert.match(read("src/app/parent-pin/forgot/page.tsx"), /redirect\("\/parent\/dashboard"\)/);
  assert.match(read("src/app/parent-pin/reset/page.tsx"), /redirect\("\/parent\/dashboard"\)/);
});

test("parent portal shell does not gate on PIN status and keeps child management", () => {
  const shell = read("src/components/parent/ParentPortalShell.tsx");
  assert.doesNotMatch(shell, /\/api\/pin\/status/);
  assert.doesNotMatch(shell, /\/parent-pin\?/);
  assert.match(shell, /ChildManagementForm/);
  assert.match(shell, /ChildLoginCredentialsReveal/);
});

test("profiles management UI no longer prompts for Parent PIN or soft child PIN", () => {
  const profiles = read("src/app/parent/profiles/ProfileSelectionClient.tsx");
  assert.doesNotMatch(profiles, /parent-pin-client/);
  assert.doesNotMatch(profiles, /resolveParentPinGateState/);
  assert.doesNotMatch(profiles, /create-parent-pin-cta/);
  assert.doesNotMatch(profiles, /parent-pin-input/);
  assert.doesNotMatch(profiles, /verify-child-pin/);
  assert.match(profiles, /\/parent\/dashboard/);
  assert.match(profiles, /Create child login/);
});

test("admin parent detail no longer offers Reset Parent PIN", () => {
  const admin = read("src/app/admin/(secure)/parents/[id]/page.tsx");
  assert.doesNotMatch(admin, /Reset Parent PIN/);
  assert.doesNotMatch(admin, /reset-pin/);
  assert.match(admin, /Reset Password/);
});

test("login and logout still clear legacy unlock cookie", () => {
  const login = read("src/app/api/auth/login/route.ts");
  assert.match(login, /getParentUnlockCookieName\(\), ""/);
  const logout = read("src/app/api/auth/logout/route.ts");
  assert.match(logout, /getParentUnlockCookieName/);
});

test("student username landing and student-owned ChildProfile resolution remain intact", async () => {
  assert.deepEqual(
    resolveStaffLandingFromMembership({ userRole: "student", membership: null }),
    { kind: "student", path: "/student/dashboard" },
  );

  const resolved = await resolveActiveChildForSession(
    { userId: "student-1", role: "student" },
    {
      readSelectionCookie: async () => "other-child",
      findStudentOwnedProfile: async (userId) => {
        assert.equal(userId, "student-1");
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
});

test("dormant Parent PIN schema fields were not dropped", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /pinHash/);
  assert.match(schema, /parentPinFailedAttempts/);
  assert.match(schema, /parentPinLockedUntil/);
});

test("requireParentUnlocked now equals authenticated session (PIN gate removed)", () => {
  const guard = read("src/lib/api_guard.ts");
  assert.match(guard, /Parent PIN unlock is retired/);
  assert.match(guard, /return requireSession\(\);/);
  assert.doesNotMatch(guard, /Parent PIN required/);
});
