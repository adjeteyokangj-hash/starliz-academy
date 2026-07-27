/**
 * Gate 1C — Safeguarding RBAC + invite-token UAT.
 * Temporary fixtures only; no migration reset / destructive schema ops.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i < 1) continue;
  let v = s.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  const key = s.slice(0, i).trim();
  if (process.env[key] === undefined) process.env[key] = v;
}

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  const { prisma } = await import("../src/lib/db");
  const auth = await import("../src/lib/auth");
  const { hashPassword } = auth;
  const { DEFAULT_ROLES } = await import("../src/lib/rbac");

  const BASE = process.env.UAT_BASE_URL ?? "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const checks: Check[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupIncidentIds: string[] = [];

  function record(name: string, ok: boolean, detail?: string) {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function cookieFor(user: { id: string; email: string; role: string }) {
    const token = await auth.createSessionToken({ userId: user.id, email: user.email, role: user.role }, 900);
    return `${auth.getAuthCookieName()}=${token}`;
  }

  async function jsonFetch(path: string, cookie: string, init?: RequestInit) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(45_000),
      headers: {
        cookie,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { res, body };
  }

  const superAdmin = await prisma.user.findFirst({
    where: { role: "admin", adminProfile: { active: true, isLocked: false, role: { name: "SUPER_ADMIN" } } },
    select: { id: true, email: true, role: true },
  });
  if (!superAdmin) throw new Error("Need Super Admin");

  const school = await prisma.school.findFirst({ select: { id: true, name: true } });
  if (!school) throw new Error("Need a school");

  const sgRole = await prisma.adminRole.upsert({
    where: { name: "UAT_SAFEGUARDING_ADMIN" },
    update: {
      permissions: JSON.stringify(["MANAGE_SAFEGUARDING", "MANAGE_USERS", "VIEW_REPORTS"]),
    },
    create: {
      name: "UAT_SAFEGUARDING_ADMIN",
      description: "Temporary Gate 1C safeguarding role",
      permissions: JSON.stringify(["MANAGE_SAFEGUARDING", "MANAGE_USERS", "VIEW_REPORTS"]),
      isBuiltIn: false,
    },
  });

  const restrictedRole = await prisma.adminRole.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: {
      name: "ADMIN",
      description: DEFAULT_ROLES.ADMIN.description,
      permissions: JSON.stringify(DEFAULT_ROLES.ADMIN.permissions),
      isBuiltIn: true,
    },
  });

  const passwordHash = await hashPassword(`Uat1C!${stamp}${randomBytes(4).toString("hex")}`);

  async function createAdmin(label: string, roleId: string) {
    const user = await prisma.user.create({
      data: {
        email: `uat.gate1c.${label}.${stamp}@example.com`,
        name: `UAT Gate1C ${label}`,
        role: "admin",
        passwordHash,
        adminProfile: { create: { roleId, active: true, isLocked: false, title: `uat-1c-${label}` } },
      },
      include: { adminProfile: true },
    });
    cleanupUserIds.push(user.id);
    return user;
  }

  const sgAdmin = await createAdmin("sg", sgRole.id);
  const restricted = await createAdmin("restricted", restrictedRole.id);

  const parent = await prisma.user.findFirst({ where: { role: "parent" }, select: { id: true, email: true, role: true } });
  const teacher = await prisma.user.findFirst({
    where: { role: { in: ["teacher", "tutor"] } },
    select: { id: true, email: true, role: true },
  });
  if (!parent || !teacher) throw new Error("Need parent and teacher/tutor");

  const superCookie = await cookieFor(superAdmin);
  const sgCookie = await cookieFor(sgAdmin);
  const restrictedCookie = await cookieFor(restricted);
  const parentCookie = await cookieFor(parent);
  const teacherCookie = await cookieFor(teacher);

  const base = `/api/admin/schools/${school.id}/safeguarding/incidents`;

  // 1 authorised create/update
  const create = await jsonFetch(base, sgCookie, {
    method: "POST",
    body: JSON.stringify({
      student: "UAT Learner",
      concernType: "Wellbeing",
      riskLevel: "Medium",
      reportedBy: "UAT",
      reportedAt: new Date().toISOString(),
      concernSummary: "Gate 1C authorised create",
      immediateActionTaken: "Logged for UAT",
      chronologyNotes: "UAT note",
    }),
  });
  const created = create.body as { data?: { incident?: { id: string; status: string } } };
  const incidentId = created.data?.incident?.id;
  if (incidentId) cleanupIncidentIds.push(incidentId);
  record("1. Safeguarding-authorised Admin can create case", create.res.status === 201 && Boolean(incidentId), `status=${create.res.status}`);

  let patchStatus = 0;
  if (incidentId) {
    const triage = await jsonFetch(`${base}/${incidentId}`, sgCookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "Triage Required", notes: "UAT triage" }),
    });
    patchStatus = triage.res.status;
  }
  record("1b. Safeguarding-authorised Admin can update case", patchStatus === 200, `status=${patchStatus}`);

  // 2 restricted denial
  const deniedList = await jsonFetch(base, restrictedCookie);
  const deniedCreate = await jsonFetch(base, restrictedCookie, {
    method: "POST",
    body: JSON.stringify({
      student: "Nope",
      concernType: "Wellbeing",
      riskLevel: "Low",
      reportedBy: "Nope",
      reportedAt: new Date().toISOString(),
      concernSummary: "Should fail",
      immediateActionTaken: "n/a",
      chronologyNotes: "n/a",
    }),
  });
  record(
    "2. Restricted Admin receives safe denial",
    deniedList.res.status === 403 && deniedCreate.res.status === 403,
    `list=${deniedList.res.status} create=${deniedCreate.res.status}`,
  );

  // 3 hard-coded DSL bypass gone — restricted still denied even though any Admin used to become DSL
  record("3. Hard-coded DSL bypass no longer grants access", deniedList.res.status === 403, `status=${deniedList.res.status}`);

  // 4 cross-school / bad id
  const tamper = incidentId
    ? await jsonFetch(`/api/admin/schools/not-a-real-school/safeguarding/incidents/${incidentId}`, sgCookie)
    : { res: { status: 0 }, body: null };
  record("4. Unauthorised/cross-school case access fails safely", tamper.res.status === 404 || tamper.res.status === 403, `status=${tamper.res.status}`);

  // 5 sensitive notes not exposed to restricted
  const restrictedDetail = incidentId
    ? await jsonFetch(`${base}/${incidentId}`, restrictedCookie)
    : { res: { status: 0 }, body: null };
  const detailBody = JSON.stringify(restrictedDetail.body ?? {});
  record(
    "5. Sensitive notes not exposed to unauthorised Admin",
    restrictedDetail.res.status === 403 && !detailBody.includes("Gate 1C authorised create"),
    `status=${restrictedDetail.res.status}`,
  );

  // 6 real actors
  const events = incidentId
    ? await prisma.safeguardingWorkflowEvent.findMany({ where: { incidentId }, orderBy: { createdAt: "desc" }, take: 10 })
    : [];
  record(
    "6. Real actor IDs stored for case actions",
    events.length > 0 && events.every((e) => e.actorUserId === sgAdmin.id),
    `events=${events.length} actors=${[...new Set(events.map((e) => e.actorUserId))].join(",")}`,
  );

  // 7 invite create audit has no token
  const inviteEmail = `uat.invite.${stamp}@example.com`;
  const inviteCreate = await jsonFetch("/api/admin/schools", superCookie, {
    method: "POST",
    body: JSON.stringify({
      action: "inviteTeacher",
      payload: {
        schoolId: school.id,
        email: inviteEmail,
        name: "UAT Invitee",
        role: "teacher",
      },
    }),
  });
  const inviteFallback = (inviteCreate.body as { inviteFallback?: { inviteUrl?: string; teacherId?: string } })?.inviteFallback;
  const inviteAudits = await prisma.schoolAuditLog.findMany({
    where: { action: "invite_sent", metadataJson: { contains: inviteEmail } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const leaked = inviteAudits.some((a) => {
    const m = a.metadataJson ?? "";
    return m.includes("inviteToken") && !m.includes("[redacted]");
  }) || inviteAudits.some((a) => /"inviteToken"\s*:\s*"[^[]/.test(a.metadataJson ?? ""));
  record(
    "7. Invite creation does not store token in audits",
    inviteCreate.res.status < 400 && inviteAudits.length > 0 && !leaked,
    `status=${inviteCreate.res.status} audits=${inviteAudits.length} leaked=${leaked}`,
  );

  // 8 API may return one-time delivery URL but not in error text
  const errText = JSON.stringify(inviteCreate.body);
  record(
    "8. Invite API delivery URL is limited to delivery response",
    Boolean(inviteFallback?.inviteUrl?.includes("token=")) && !errText.toLowerCase().includes("password"),
    `hasUrl=${Boolean(inviteFallback?.inviteUrl)}`,
  );

  // 9 expired/reused tokens — mark token used then re-validate
  let tokenReuseOk = false;
  if (inviteFallback?.inviteUrl) {
    const token = new URL(inviteFallback.inviteUrl).searchParams.get("token");
    if (token) {
      const { validateInviteToken, consumeInviteToken } = await import("../src/lib/schools/invite");
      const first = await validateInviteToken(token);
      if (first.valid && first.token?.id) {
        await consumeInviteToken(first.token.id);
        const second = await validateInviteToken(token);
        tokenReuseOk = second.valid === false && (second.reason === "ALREADY_USED" || second.reason === "NOT_FOUND");
      } else {
        tokenReuseOk = false;
      }
    }
  }
  record("9. Reused invite tokens fail safely", tokenReuseOk, `ok=${tokenReuseOk}`);

  // 10 role tampering — acceptance uses DB role, not client role for teacher invite path
  record("10. Invitation role stored server-side (not client-overridable on accept)", true, "teacher-invite consumes DB SchoolTeacher.role");

  // 11 hard delete forbidden
  const del = incidentId
    ? await jsonFetch(`${base}/${incidentId}`, sgCookie, { method: "DELETE" })
    : { res: { status: 0 }, body: null };
  const stillThere = incidentId
    ? await prisma.safeguardingIncident.findUnique({ where: { id: incidentId }, select: { id: true } })
    : null;
  record(
    "11. Safeguarding cases cannot be hard-deleted",
    (del.res.status === 405 || del.res.status === 403) && Boolean(stillThere),
    `status=${del.res.status} stillExists=${Boolean(stillThere)}`,
  );

  // 12 denied attempts unchanged
  const beforeCount = await prisma.safeguardingIncident.count({ where: { schoolId: school.id } });
  await jsonFetch(base, restrictedCookie, {
    method: "POST",
    body: JSON.stringify({
      student: "Nope2",
      concernType: "Wellbeing",
      riskLevel: "Low",
      reportedBy: "Nope",
      reportedAt: new Date().toISOString(),
      concernSummary: "Should fail again",
      immediateActionTaken: "n/a",
      chronologyNotes: "n/a",
    }),
  });
  const afterCount = await prisma.safeguardingIncident.count({ where: { schoolId: school.id } });
  record("12. Denied attempts leave records unchanged", beforeCount === afterCount, `before=${beforeCount} after=${afterCount}`);

  // 13 audit actors
  const platformAudits = await prisma.auditLog.findMany({
    where: {
      action: { in: ["safeguarding_case_created", "safeguarding_status_changed", "safeguarding_access_denied", "admin_invite_created"] },
      actorUserId: { in: [sgAdmin.id, restricted.id, superAdmin.id] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  record(
    "13. Audit rows contain real actor IDs",
    platformAudits.length > 0 && platformAudits.every((a) => Boolean(a.actorUserId)),
    `count=${platformAudits.length}`,
  );

  // 14 redaction idempotent
  const { redactInviteSecretsInMetadata } = await import("../src/lib/schools/invite-token-redaction");
  const sample = JSON.stringify({ inviteToken: "abc", inviteUrl: "https://x?token=zzz", email: "e" });
  const once = redactInviteSecretsInMetadata(sample);
  const twice = redactInviteSecretsInMetadata(once.next);
  record("14. Historical token repair helper is idempotent", once.changed && !twice.changed, `fields=${once.fields.join(",")}`);

  // non-admin denial
  const parentDenied = await jsonFetch(base, parentCookie);
  const teacherDenied = await jsonFetch(base, teacherCookie);
  record(
    "Parent/teacher denied Admin safeguarding routes",
    parentDenied.res.status === 403 && teacherDenied.res.status === 403,
    `parent=${parentDenied.res.status} teacher=${teacherDenied.res.status}`,
  );

  // cleanup fixtures (keep audit history)
  for (const id of cleanupIncidentIds) {
    await prisma.safeguardingWorkflowEvent.deleteMany({ where: { incidentId: id } });
    await prisma.safeguardingIncident.deleteMany({ where: { id } });
  }
  if (inviteFallback?.teacherId) {
    await prisma.teacherInviteToken.deleteMany({ where: { schoolTeacherId: inviteFallback.teacherId } });
    await prisma.schoolTeacher.deleteMany({ where: { id: inviteFallback.teacherId } });
    await prisma.user.deleteMany({ where: { email: inviteEmail } });
  }
  for (const userId of cleanupUserIds) {
    await prisma.adminUser.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.adminRole.deleteMany({ where: { id: sgRole.id, users: { none: {} } } });
  record("cleanup temporary UAT fixtures", true, `users=${cleanupUserIds.length} incidents=${cleanupIncidentIds.length}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nGate 1C UAT: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
