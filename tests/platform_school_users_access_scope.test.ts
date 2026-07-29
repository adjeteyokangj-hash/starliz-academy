import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyAccessScopes,
  groupSchoolUsersBySchool,
  isPlatformScoped,
  isSchoolScoped,
  schoolRoleGroup,
  toPlatformUserDto,
  toSchoolUserDto,
  type PlatformUserDto,
  type SchoolUserDto,
} from "../src/lib/admin/access-scope";

const ROOT = process.cwd();

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function platformSuperAdmin(): PlatformUserDto {
  return toPlatformUserDto({
    id: "au-super",
    userId: "u-super",
    email: "super@starliz.test",
    name: "Platform Super Admin",
    role: "SUPER_ADMIN",
    roleId: "role-super",
    active: true,
  });
}

function schoolMembership(partial: Partial<SchoolUserDto> & Pick<SchoolUserDto, "membershipId" | "userId" | "schoolId" | "schoolName" | "schoolRole">): SchoolUserDto {
  return toSchoolUserDto({
    email: partial.email ?? "staff@school.test",
    name: partial.name ?? "School Staff",
    status: partial.status ?? "active",
    membershipId: partial.membershipId,
    userId: partial.userId,
    schoolId: partial.schoolId,
    schoolName: partial.schoolName,
    schoolRole: partial.schoolRole,
  });
}

test("Platform Super Admin only classifies under platform scope", () => {
  const facts = { hasAdminUser: true, hasSchoolTeacherMembership: false };
  assert.deepEqual(classifyAccessScopes(facts), ["platform"]);
  assert.equal(isPlatformScoped(facts), true);
  assert.equal(isSchoolScoped(facts), false);

  const row = platformSuperAdmin();
  assert.equal(row.accessScope, "platform");
  assert.equal(row.role, "SUPER_ADMIN");
});

test("School Owner/Admin/Teacher/Tutor(support) only classify under school scope", () => {
  const facts = { hasAdminUser: false, hasSchoolTeacherMembership: true };
  assert.deepEqual(classifyAccessScopes(facts), ["school"]);
  assert.equal(isPlatformScoped(facts), false);
  assert.equal(isSchoolScoped(facts), true);

  const roles = ["owner", "admin", "teacher", "support"] as const;
  for (const role of roles) {
    const row = schoolMembership({
      membershipId: `m-${role}`,
      userId: `u-${role}`,
      schoolId: "school-1",
      schoolName: "North Academy",
      schoolRole: role,
    });
    assert.equal(row.accessScope, "school");
    assert.notEqual(row.accessScope, "platform");
  }

  assert.equal(schoolRoleGroup("owner"), "school_owner");
  assert.equal(schoolRoleGroup("admin"), "school_admin");
  assert.equal(schoolRoleGroup("teacher"), "teachers");
  assert.equal(schoolRoleGroup("support"), "tutors_support");
});

test("multi-school user shows each membership under School Users", () => {
  const userId = "u-multi";
  const memberships = [
    schoolMembership({
      membershipId: "m1",
      userId,
      schoolId: "s1",
      schoolName: "Alpha School",
      schoolRole: "owner",
      name: "Multi School User",
      email: "multi@school.test",
    }),
    schoolMembership({
      membershipId: "m2",
      userId,
      schoolId: "s2",
      schoolName: "Beta School",
      schoolRole: "teacher",
      name: "Multi School User",
      email: "multi@school.test",
    }),
  ];

  const grouped = groupSchoolUsersBySchool(memberships);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].schoolName, "Alpha School");
  assert.equal(grouped[1].schoolName, "Beta School");
  assert.equal(grouped.flatMap((g) => g.groups.flatMap((x) => x.users)).length, 2);
  assert.ok(grouped.every((g) => g.groups.every((x) => x.users.every((u) => u.accessScope === "school"))));
});

test("platform creation form exposes only platform roles (source)", () => {
  const settings = read("src/app/admin/(secure)/settings/page.tsx");
  const adminUsers = read("src/app/admin/(secure)/settings/admin-users/page.tsx");
  const api = read("src/app/api/admin/users/route.ts");

  assert.match(settings, /New platform user/);
  assert.match(settings, /Select a platform role|aria-label=\"Platform role\"/);
  assert.match(adminUsers, /New platform user/);
  assert.match(adminUsers, /Select platform role|aria-label=\"Platform role\"/);
  assert.match(adminUsers, /\/api\/admin\/roles/);

  // POST remains AdminUser / AdminRole only — no SchoolTeacher creation.
  assert.match(api, /prisma\.adminUser\.create/);
  assert.match(api, /prisma\.adminRole\.(findUnique|upsert)/);
  assert.doesNotMatch(api, /prisma\.schoolTeacher\.create/);
  assert.match(api, /requireAdminPermission\("MANAGE_ADMINS"\)/);
});

test("school user section cannot assign platform AdminRole permissions (source)", () => {
  const panel = read("src/components/admin/PlatformSchoolUsersPanel.tsx");
  const settings = read("src/app/admin/(secure)/settings/page.tsx");
  const adminUsers = read("src/app/admin/(secure)/settings/admin-users/page.tsx");

  assert.match(panel, /School Users/);
  assert.match(panel, /Manage school users/);
  assert.match(panel, /\/admin\/schools\/\$\{school\.schoolId\}\/staff\/directory/);
  // School rows only link to manage path — no platform role select in school section.
  assert.doesNotMatch(panel, /Update school user role|Assign platform role/);
  assert.match(settings, /This form only creates platform users/);
  assert.doesNotMatch(adminUsers, /schoolRoleId|Assign AdminRole to school/);
});

test("last Super Admin protection remains on admin users API", () => {
  const api = read("src/app/api/admin/users/route.ts");
  assert.match(api, /mutateAdminWithLastSuperAdminProtection/);
  assert.match(api, /admin_self_escalation_rejected/);
  assert.match(api, /cannot_change_own_role/);
  assert.match(api, /Only Super Admins can (create|assign|delete)/);
});

test("ordinary Admin without MANAGE_ADMINS cannot manage users API", () => {
  const api = read("src/app/api/admin/users/route.ts");
  const matches = api.match(/requireAdminPermission\("MANAGE_ADMINS"\)/g) ?? [];
  assert.ok(matches.length >= 4, `expected MANAGE_ADMINS on GET/POST/PUT/DELETE, found ${matches.length}`);
});

test("GET /api/admin/users returns platformUsers and schoolUsers with accessScope", () => {
  const api = read("src/app/api/admin/users/route.ts");
  assert.match(api, /platformUsers/);
  assert.match(api, /schoolUsers/);
  assert.match(api, /toPlatformUserDto/);
  assert.match(api, /toSchoolUserDto/);
  assert.match(api, /admins: platformUsers/);
  assert.match(api, /prisma\.schoolTeacher\.findMany/);
});

test("classification never uses email or name heuristics", () => {
  const lib = read("src/lib/admin/access-scope.ts");
  assert.match(lib, /hasAdminUser/);
  assert.match(lib, /hasSchoolTeacherMembership/);
  assert.doesNotMatch(lib, /includes\(\"uat\"\)|endsWith\(\"@\"\)|email\.toLowerCase\(\)\.includes/);
});