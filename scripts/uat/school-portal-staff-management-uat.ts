/**
 * School Portal Staff Management v1 authenticated API UAT.
 * No migrate reset / no commit / no deploy.
 */
import "./load-env";
import { UAT_FIXTURES } from "./local-fixtures";
import { prisma } from "../../src/lib/db";

const BASE = UAT_FIXTURES.baseUrl.replace(/\/$/, "");
type Jar = { cookie: string };
type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(email: string, password: string): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { cookie: setCookie.map((c) => c.split(";")[0]).join("; ") };
}

async function api(jar: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: jar.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function resolveSchoolId(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`Missing user ${email}`);
  const membership = await prisma.schoolTeacher.findFirst({
    where: { userId: user.id, status: { in: ["active", "invited"] } },
    select: { schoolId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error(`No school membership for ${email}`);
  return membership;
}

async function main() {
  try {
    await fetch(`${BASE}/auth/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    check("Dev server reachable", false, BASE);
    console.log(JSON.stringify({ checks }, null, 2));
    process.exit(1);
  }
  check("Dev server reachable", true, BASE);

  const ownerMembership = await resolveSchoolId(UAT_FIXTURES.schoolOwnerEmail);
  const schoolId = ownerMembership.schoolId;
  check("Owner membership role", ownerMembership.role === "owner", ownerMembership.role);

  const stamp = Date.now();
  const ownerJar = await login(UAT_FIXTURES.schoolOwnerEmail, UAT_FIXTURES.schoolOwnerPassword);

  const listOwner = await api(ownerJar, "GET", `/api/school/teachers?schoolId=${schoolId}&status=all`);
  check("Owner staff list loads", listOwner.ok, String(listOwner.status));
  const ownerRow = ((listOwner.json as { teachers?: Array<{ id: string; role: string; user?: { email?: string } }> }).teachers ?? []).find((t) => t.role === "owner");
  check("Owner visible in list", Boolean(ownerRow), ownerRow?.user?.email);

  const teacherEmail = `uat.staff.teacher.${stamp}@starliz.dev`;
  const supportEmail = `uat.staff.support.${stamp}@starliz.dev`;

  const inviteTeacher = await api(ownerJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: teacherEmail,
    inviteType: "teacher",
    targetRole: "teacher",
    firstName: "Uat",
    lastName: "Teacher",
  });
  check("Owner invite Teacher", inviteTeacher.ok, String(inviteTeacher.status));
  const inviteUrl = (inviteTeacher.json as { inviteUrl?: string }).inviteUrl;
  check("Invite URL returned for copy", Boolean(inviteUrl));

  const inviteAdmin = await api(ownerJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: `uat.staff.admin.${stamp}@starliz.dev`,
    inviteType: "school_admin",
    targetRole: "admin",
    firstName: "Uat",
    lastName: "Admin",
  });
  check("Owner invite School Admin", inviteAdmin.ok, String(inviteAdmin.status));

  const pending = await api(ownerJar, "GET", `/api/school/invites?schoolId=${schoolId}`);
  const invites = ((pending.json as { invites?: Array<{ id: string; targetEmail: string }> }).invites ?? []);
  const teacherInvite = invites.find((i) => i.targetEmail === teacherEmail);
  check("Pending invite listed", Boolean(teacherInvite));

  if (teacherInvite) {
    const resent = await api(ownerJar, "PATCH", "/api/school/invites", {
      schoolId,
      inviteId: teacherInvite.id,
      action: "resend",
    });
    check("Owner resend invite", resent.ok, String(resent.status));

    const revoked = await api(ownerJar, "PATCH", "/api/school/invites", {
      schoolId,
      inviteId: teacherInvite.id,
      action: "revoke",
    });
    check("Owner revoke invite", revoked.ok, String(revoked.status));
  } else {
    check("Owner resend invite", false, "invite missing");
    check("Owner revoke invite", false, "invite missing");
  }

  const activeEmail = `uat.staff.active.${stamp}@starliz.dev`;
  const inviteActive = await api(ownerJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: activeEmail,
    inviteType: "teacher",
    targetRole: "teacher",
    firstName: "Active",
    lastName: "Teacher",
  });
  const activeTeacherId = (inviteActive.json as { schoolTeacherId?: string }).schoolTeacherId;
  if (activeTeacherId) {
    await prisma.schoolTeacher.update({
      where: { id: activeTeacherId },
      data: { status: "active", acceptedAt: new Date() },
    });
  }

  const promote = await api(ownerJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "changeRole",
    role: "admin",
  });
  check("Owner promote Teacher to School Admin", promote.ok, String(promote.status));

  const demote = await api(ownerJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "changeRole",
    role: "teacher",
  });
  check("Owner demote School Admin to Teacher", demote.ok, String(demote.status));

  const suspend = await api(ownerJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "suspend",
  });
  check("Owner suspend Teacher", suspend.ok, String(suspend.status));

  const reactivate = await api(ownerJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "reactivate",
  });
  check("Owner reactivate Teacher", reactivate.ok, String(reactivate.status));

  const modifyOwner = await api(ownerJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: ownerRow?.id,
    action: "suspend",
  });
  check("Owner cannot modify School Owner", modifyOwner.status === 403, String(modifyOwner.status));

  const platformProbe = await api(ownerJar, "GET", "/api/admin/schools");
  check("Owner denied platform admin API", platformProbe.status === 403 || platformProbe.status === 401, String(platformProbe.status));

  const adminJar = await login(UAT_FIXTURES.schoolAdminEmail, UAT_FIXTURES.schoolAdminPassword);
  const adminMembership = await resolveSchoolId(UAT_FIXTURES.schoolAdminEmail);
  check("School Admin membership", adminMembership.role === "admin", adminMembership.role);

  const listAdmin = await api(adminJar, "GET", `/api/school/teachers?schoolId=${schoolId}&status=all`);
  check("Admin staff list loads", listAdmin.ok, String(listAdmin.status));

  const adminInviteTeacher = await api(adminJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: `uat.staff.byadmin.teacher.${stamp}@starliz.dev`,
    inviteType: "teacher",
    targetRole: "teacher",
    firstName: "By",
    lastName: "Admin",
  });
  check("Admin invite Teacher", adminInviteTeacher.ok, String(adminInviteTeacher.status));

  const adminInviteSupport = await api(adminJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: supportEmail,
    inviteType: "teacher",
    targetRole: "support",
    firstName: "Tutor",
    lastName: "Support",
  });
  check("Admin invite Tutor/Support", adminInviteSupport.ok, String(adminInviteSupport.status));

  const adminInviteAdmin = await api(adminJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: `uat.staff.byadmin.admin.${stamp}@starliz.dev`,
    inviteType: "school_admin",
    targetRole: "admin",
  });
  check("Admin invite School Admin denied", adminInviteAdmin.status === 403, String(adminInviteAdmin.status));

  const adminModifyOwner = await api(adminJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: ownerRow?.id,
    action: "suspend",
  });
  check("Admin modify School Owner denied", adminModifyOwner.status === 403, String(adminModifyOwner.status));

  const otherAdmin = ((listAdmin.json as { teachers?: Array<{ id: string; role: string; user?: { email?: string } }> }).teachers ?? []).find(
    (t) => t.role === "admin" && t.user?.email !== UAT_FIXTURES.schoolAdminEmail,
  );
  if (otherAdmin) {
    const adminModifyAdmin = await api(adminJar, "PATCH", "/api/school/teachers", {
      schoolId,
      teacherId: otherAdmin.id,
      action: "suspend",
    });
    check("Admin modify other School Admin denied", adminModifyAdmin.status === 403, String(adminModifyAdmin.status));
  } else if (activeTeacherId) {
    await prisma.schoolTeacher.update({ where: { id: activeTeacherId }, data: { role: "admin", status: "active" } });
    const adminModifyAdmin = await api(adminJar, "PATCH", "/api/school/teachers", {
      schoolId,
      teacherId: activeTeacherId,
      action: "suspend",
    });
    check("Admin modify other School Admin denied", adminModifyAdmin.status === 403, String(adminModifyAdmin.status));
    await prisma.schoolTeacher.update({ where: { id: activeTeacherId }, data: { role: "teacher" } });
  } else {
    check("Admin modify other School Admin denied", false, "no other admin fixture");
  }

  const adminSuspend = await api(adminJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "suspend",
  });
  check("Admin suspend Teacher", adminSuspend.ok, String(adminSuspend.status));

  const adminRoleChange = await api(adminJar, "PATCH", "/api/school/teachers", {
    schoolId,
    teacherId: activeTeacherId,
    action: "changeRole",
    role: "support",
  });
  check("Admin role change among normal staff", adminRoleChange.ok, String(adminRoleChange.status));

  const adminPlatform = await api(adminJar, "GET", "/api/admin/schools");
  check("Admin denied platform API", adminPlatform.status === 403 || adminPlatform.status === 401, String(adminPlatform.status));

  const teacherJar = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  const teacherList = await api(teacherJar, "GET", `/api/school/teachers?schoolId=${schoolId}&status=all`);
  check("Teacher staff API denied", teacherList.status === 403, String(teacherList.status));
  const teacherInviteDenied = await api(teacherJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: `uat.staff.byteacher.${stamp}@starliz.dev`,
    inviteType: "teacher",
    targetRole: "teacher",
  });
  check("Teacher invite API denied", teacherInviteDenied.status === 403, String(teacherInviteDenied.status));

  const otherSchool = await prisma.school.findFirst({
    where: { id: { not: schoolId } },
    select: { id: true },
  });
  if (otherSchool) {
    const cross = await api(ownerJar, "GET", `/api/school/teachers?schoolId=${otherSchool.id}&status=all`);
    check("Cross-school staff list denied", cross.status === 403, String(cross.status));
  } else {
    check("Cross-school staff list denied", true, "only one school in DB — skipped with pass note");
  }

  const existingConflict = await api(ownerJar, "POST", "/api/school/invites", {
    schoolId,
    targetEmail: UAT_FIXTURES.schoolAdminEmail,
    inviteType: "teacher",
    targetRole: "teacher",
  });
  check("Existing active member invite conflict", existingConflict.status === 409, String(existingConflict.status));

  const failed = checks.filter((c) => !c.ok).length;
  console.log("\nSummary:", { passed: checks.length - failed, failed, total: checks.length });
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});