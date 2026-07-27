import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_ADMIN_PERMISSIONS,
  contextHasPermission,
  expandPermissionRequirement,
  normalizePermissionSet,
  normalizeStoredPermission,
  validateRolePermissionList,
  type AdminAuthContext,
} from "../src/lib/admin-permissions";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function ctx(partial: Partial<AdminAuthContext> & Pick<AdminAuthContext, "permissions" | "isSuperAdmin" | "roleId" | "roleName">): AdminAuthContext {
  return {
    userId: "u1",
    email: "a@test",
    adminUserId: "au1",
    active: true,
    isLocked: false,
    ...partial,
  };
}

test("canonical permission mapping expands product aliases", () => {
  assert.deepEqual(expandPermissionRequirement("MANAGE_PARENTS"), ["MANAGE_USERS"]);
  assert.deepEqual(expandPermissionRequirement("MANAGE_SCHOOLS"), ["MANAGE_USERS"]);
  assert.deepEqual(expandPermissionRequirement("MANAGE_SUPPORT"), ["MANAGE_INBOX"]);
  // Gate 5 product permission — not aliased to MANAGE_SETTINGS (fail-closed separation).
  assert.deepEqual(expandPermissionRequirement("MANAGE_POLICIES"), ["MANAGE_POLICIES"]);
  assert.deepEqual(expandPermissionRequirement("MANAGE_ADMINS"), ["MANAGE_ADMINS"]);
});

test("legacy colon permissions map to canonical tokens", () => {
  assert.deepEqual(normalizeStoredPermission("content:view"), ["MANAGE_CONTENT"]);
  assert.deepEqual(normalizeStoredPermission("parents:write"), ["MANAGE_USERS"]);
  assert.deepEqual(normalizeStoredPermission("students:write"), ["MANAGE_USERS"]);
  assert.deepEqual(normalizeStoredPermission("reports:view"), ["VIEW_REPORTS"]);
  assert.deepEqual(normalizePermissionSet(["content:view", "MANAGE_CONTENT", "parents:write"]), [
    "MANAGE_CONTENT",
    "MANAGE_USERS",
  ]);
});

test("no-role admin is denied privileged checks", () => {
  const noRole = ctx({
    roleId: null,
    roleName: null,
    permissions: [],
    isSuperAdmin: false,
  });
  assert.equal(contextHasPermission(noRole, "MANAGE_ADMINS"), false);
  assert.equal(contextHasPermission(noRole, "VIEW_ADMIN"), false);
  assert.equal(contextHasPermission(noRole, "content:view"), false);
});

test("Super Admin has full access including legacy aliases", () => {
  const superAdmin = ctx({
    roleId: "r1",
    roleName: "SUPER_ADMIN",
    permissions: [...CANONICAL_ADMIN_PERMISSIONS],
    isSuperAdmin: true,
  });
  assert.equal(contextHasPermission(superAdmin, "MANAGE_ADMINS"), true);
  assert.equal(contextHasPermission(superAdmin, "content:edit"), true);
  assert.equal(contextHasPermission(superAdmin, "MANAGE_PARENTS"), true);
});

test("restricted Admin only receives assigned permissions", () => {
  const restricted = ctx({
    roleId: "r2",
    roleName: "ADMIN",
    permissions: ["MANAGE_USERS", "MANAGE_CONTENT", "VIEW_REPORTS"],
    isSuperAdmin: false,
  });
  assert.equal(contextHasPermission(restricted, "students:write"), true);
  assert.equal(contextHasPermission(restricted, "content:view"), true);
  assert.equal(contextHasPermission(restricted, "MANAGE_ADMINS"), false);
  assert.equal(contextHasPermission(restricted, "MANAGE_SUBSCRIPTIONS"), false);
  assert.equal(contextHasPermission(restricted, "VIEW_ADMIN"), true);
});

test("inactive or locked admins fail closed", () => {
  const inactive = ctx({
    roleId: "r1",
    roleName: "ADMIN",
    permissions: ["MANAGE_USERS"],
    isSuperAdmin: false,
    active: false,
  });
  const locked = ctx({
    roleId: "r1",
    roleName: "ADMIN",
    permissions: ["MANAGE_USERS"],
    isSuperAdmin: false,
    isLocked: true,
  });
  assert.equal(contextHasPermission(inactive, "MANAGE_USERS"), false);
  assert.equal(contextHasPermission(locked, "MANAGE_USERS"), false);
});

test("role permission validation rejects unknown strings and normalises duplicates", () => {
  const bad = validateRolePermissionList(["MANAGE_USERS", "not-a-real-perm"]);
  assert.equal(bad.ok, false);

  const good = validateRolePermissionList(["MANAGE_USERS", "parents:write", "MANAGE_USERS", "content:view"]);
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.deepEqual(good.permissions, ["MANAGE_USERS", "MANAGE_CONTENT"]);
  }
});

test("api_guard removes no-role Super Admin bypass", () => {
  const source = read("src/lib/api_guard.ts");
  assert.match(source, /missing_or_invalid_role/);
  assert.match(source, /no Super Admin bypass/i);
  assert.doesNotMatch(source, /seed admins without a role/);
});

test("admin user routes always require MANAGE_ADMINS", () => {
  const list = read("src/app/api/admin/users/route.ts");
  const byId = read("src/app/api/admin/users/[id]/route.ts");
  const reset = read("src/app/api/admin/users/[id]/reset-password/route.ts");
  assert.match(list, /requireAdminPermission\("MANAGE_ADMINS"\)/);
  assert.match(byId, /requireAdminPermission\("MANAGE_ADMINS"\)/);
  assert.match(reset, /requireAdminPermission\("MANAGE_ADMINS"\)/);
  assert.match(list, /admin_self_escalation_rejected/);
  assert.match(list, /mutateAdminWithLastSuperAdminProtection/);
  assert.match(list, /admin_user_created/);
  assert.doesNotMatch(reset, /actorProfile\.roleId &&/);
});

test("critical route families use server-side permission checks", () => {
  assert.match(read("src/app/api/admin/subscriptions/route.ts"), /contextHasPermission|MANAGE_SUBSCRIPTIONS/);
  assert.match(read("src/app/api/admin/audit-logs/route.ts"), /requireAdminPermission\("VIEW_AUDIT_LOGS"\)/);
  assert.doesNotMatch(read("src/app/api/admin/audit-logs/route.ts"), /skip if no role assigned/);
  assert.match(read("src/app/api/admin/settings/general/route.ts"), /requireAdminPermission\("MANAGE_SETTINGS"\)/);
  assert.match(read("src/app/api/admin/content/route.ts"), /requireAdminPermission\("MANAGE_CONTENT"\)/);
  assert.match(read("src/app/api/admin/messages/route.ts"), /requireAdminPermission\("MANAGE_INBOX"\)/);
  assert.match(read("src/app/api/admin/parents/route.ts"), /requireAdminPermission\("parents:write"\)/);
  assert.match(read("src/app/api/admin/students/route.ts"), /requireAdminPermission\("students:write"\)/);
  assert.match(read("src/app/api/admin/roles/route.ts"), /requireAdminPermission\("MANAGE_ROLES"\)/);
});

test("secure admin layout rejects missing inactive locked profiles", () => {
  const source = read("src/app/admin/(secure)/layout.tsx");
  assert.match(source, /user\.adminProfile\.active/);
  assert.match(source, /!user\.adminProfile\.isLocked/);
  assert.match(source, /Boolean\(user\.adminProfile\.roleId\)/);
  assert.doesNotMatch(source, /adminProfile\?\.active !== false/);
});

test("last Super Admin mutations are serialized in one transaction", () => {
  const source = read("src/lib/admin-permissions.ts");
  assert.match(source, /mutateAdminWithLastSuperAdminProtection/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /admin_last_super_admin_protected/);
});
