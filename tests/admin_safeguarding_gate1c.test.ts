import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contextHasPermission,
  expandPermissionRequirement,
  type AdminAuthContext,
} from "../src/lib/admin-permissions";
import { redactInviteSecretsInMetadata } from "../src/lib/schools/invite-token-redaction";
import { sanitizeSchoolAuditMetadata } from "../src/lib/schools/audit";

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

test("MANAGE_SAFEGUARDING is not aliased to MANAGE_USERS", () => {
  assert.deepEqual(expandPermissionRequirement("MANAGE_SAFEGUARDING"), ["MANAGE_SAFEGUARDING"]);
  const restricted = ctx({
    roleId: "r1",
    roleName: "ADMIN",
    permissions: ["MANAGE_USERS", "MANAGE_CONTENT"],
    isSuperAdmin: false,
  });
  assert.equal(contextHasPermission(restricted, "MANAGE_SAFEGUARDING"), false);
  assert.equal(contextHasPermission(restricted, "MANAGE_USERS"), true);
});

test("Super Admin and explicit safeguarding role can manage safeguarding", () => {
  const superAdmin = ctx({
    roleId: "r1",
    roleName: "SUPER_ADMIN",
    permissions: ["MANAGE_SAFEGUARDING"],
    isSuperAdmin: true,
  });
  const dedicated = ctx({
    roleId: "r2",
    roleName: "ADMIN",
    permissions: ["MANAGE_SAFEGUARDING"],
    isSuperAdmin: false,
  });
  assert.equal(contextHasPermission(superAdmin, "MANAGE_SAFEGUARDING"), true);
  assert.equal(contextHasPermission(dedicated, "MANAGE_SAFEGUARDING"), true);
});

test("Admin safeguarding routes no longer hard-code DSL bypass", () => {
  for (const rel of [
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/route.ts",
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/route.ts",
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/timeline/route.ts",
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/escalation/route.ts",
    "src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/audit/route.ts",
  ]) {
    const source = read(rel);
    assert.doesNotMatch(source, /normalizeRole\("dsl"\)/);
    assert.match(source, /requireSafeguardingAdmin/);
  }
});

test("safeguarding store persists real actorUserId", () => {
  const source = read("src/app/api/admin/schools/[schoolId]/safeguarding/_lib/store.ts");
  assert.match(source, /actorUserId: actorUserId \?\? null/);
  assert.doesNotMatch(source, /actorUserId: null,\s*\n\s*eventType: "timeline\.added"/);
});

test("invite audits do not store raw tokens", () => {
  const adminSchools = read("src/app/api/admin/schools/route.ts");
  // Delivery response may include inviteUrl once; audit metadata must not.
  const auditBlocks = [...adminSchools.matchAll(/write(?:School)?AuditLog\(\{[\s\S]*?\n\s*\}\);/g)].map((m) => m[0]);
  assert.ok(auditBlocks.length > 0, "expected audit writes in admin schools route");
  for (const block of auditBlocks) {
    assert.doesNotMatch(block, /inviteToken\s*:/);
    assert.doesNotMatch(block, /newToken\s*:/);
    assert.doesNotMatch(block, /inviteUrl\s*:/);
  }
  assert.match(adminSchools, /admin_invite_created/);
  assert.match(adminSchools, /admin_invite_resent/);

  const schoolInvites = read("src/app/api/school/invites/route.ts");
  const schoolAuditBlocks = [...schoolInvites.matchAll(/writeSchoolAuditLog\(\{[\s\S]*?\n\s*\}\);/g)].map((m) => m[0]);
  assert.ok(schoolAuditBlocks.length > 0, "expected school invite audit writes");
  for (const block of schoolAuditBlocks) {
    assert.doesNotMatch(block, /inviteUrl\s*:/);
    assert.doesNotMatch(block, /rawToken\s*:/);
    assert.doesNotMatch(block, /inviteToken\s*:/);
  }
  assert.match(schoolInvites, /inviteUrl/); // delivery response may still include one-time URL
});

test("school audit sanitizer redacts invite secrets", () => {
  const sanitized = sanitizeSchoolAuditMetadata({
    inviteToken: "abc123",
    newToken: "def456",
    inviteUrl: "https://example.com/accept?token=deadbeef",
    email: "a@example.com",
    expiresAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(sanitized?.inviteToken, "[redacted]");
  assert.equal(sanitized?.newToken, "[redacted]");
  assert.match(String(sanitized?.inviteUrl), /token=\[redacted\]/);
  assert.equal(sanitized?.email, "a@example.com");
});

test("invite token redaction helper is idempotent", () => {
  const first = redactInviteSecretsInMetadata(JSON.stringify({
    inviteToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    inviteUrl: "https://x/school/invites/accept?token=bbbb",
    email: "x@y.z",
  }));
  assert.equal(first.changed, true);
  const second = redactInviteSecretsInMetadata(first.next);
  assert.equal(second.changed, false);
});

test("hard delete of safeguarding cases is rejected", () => {
  const source = read("src/app/api/admin/schools/[schoolId]/safeguarding/incidents/[incidentId]/route.ts");
  assert.match(source, /HARD_DELETE_FORBIDDEN/);
  assert.match(source, /export async function DELETE/);
});

test("school invite accept paths are publicly reachable", () => {
  const source = read("middleware.ts");
  assert.match(source, /\/school\/invites\/accept/);
  assert.match(source, /\/api\/school\/invites\/accept/);
});
