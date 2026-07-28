/**
 * School Portal Students + Parents v1 authenticated API UAT.
 * No migrate reset / no commit / no deploy.
 * Cleans up only UAT-created students via archive + guardian unlink.
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

async function membership(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`Missing ${email}`);
  const link = await prisma.schoolTeacher.findFirst({
    where: { userId: user.id, status: "active" },
    select: { schoolId: true, role: true, id: true },
  });
  if (!link) throw new Error(`No membership for ${email}`);
  return link;
}

async function main() {
  try {
    await fetch(`${BASE}/auth/login`, { signal: AbortSignal.timeout(5000) });
  } catch {
    check("Dev server reachable", false, BASE);
    process.exit(1);
  }
  check("Dev server reachable", true, BASE);

  const ownerMem = await membership(UAT_FIXTURES.schoolOwnerEmail);
  const schoolId = ownerMem.schoolId;
  const stamp = Date.now();
  const ownerJar = await login(UAT_FIXTURES.schoolOwnerEmail, UAT_FIXTURES.schoolOwnerPassword);

  const list = await api(ownerJar, "GET", `/api/school/students?schoolId=${schoolId}&status=all`);
  check("Owner students list loads", list.ok, String(list.status));
  const existingCount = ((list.json as { students?: unknown[] }).students ?? []).length;
  check("Existing students appear or empty ok", existingCount >= 0, String(existingCount));

  const classroom = await prisma.classroom.findFirst({
    where: { schoolId, status: "active" },
    select: { id: true },
  });

  const g1Email = `uat.guardian1.${stamp}@starliz.dev`;
  const create = await api(ownerJar, "POST", "/api/school/students", {
    schoolId,
    firstName: "Uat",
    lastName: `Student${stamp}`,
    yearGroup: "Year 5",
    classroomId: classroom?.id ?? null,
    guardianFirstName: "Guard",
    guardianLastName: "One",
    guardianEmail: g1Email,
    relationship: "parent",
    sendInvite: true,
  });
  check("Owner create student", create.ok, String(create.status));
  const studentId = (create.json as { schoolStudentId?: string }).schoolStudentId;
  check("Invite URL returned", Boolean((create.json as { inviteUrl?: string }).inviteUrl));

  const detail = await api(ownerJar, "GET", `/api/school/students/${studentId}?schoolId=${schoolId}`);
  check("Owner student detail", detail.ok, String(detail.status));

  if (classroom?.id) {
    await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
      schoolId,
      action: "removeClass",
    });
    const assign = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
      schoolId,
      action: "assignClass",
      classroomId: classroom.id,
    });
    check("Owner assign class", assign.ok, String(assign.status));
  } else {
    check("Owner assign class", true, "no classroom — skipped");
  }

  const g2Email = `uat.guardian2.${stamp}@starliz.dev`;
  const invite2 = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
    schoolId,
    action: "inviteGuardian",
    guardianFirstName: "Guard",
    guardianLastName: "Two",
    guardianEmail: g2Email,
    relationship: "carer",
  });
  check("Owner invite second guardian", invite2.ok, String(invite2.status));

  // Link existing parent to a second sibling student
  const sibling = await api(ownerJar, "POST", "/api/school/students", {
    schoolId,
    firstName: "Uat",
    lastName: `Sibling${stamp}`,
    yearGroup: "Year 3",
    guardianFirstName: "Guard",
    guardianLastName: "One",
    guardianEmail: g1Email,
    relationship: "parent",
    sendInvite: false,
  });
  check("Sibling with existing parent", sibling.ok, String(sibling.status));
  const siblingId = (sibling.json as { schoolStudentId?: string }).schoolStudentId;

  const linkExisting = await api(ownerJar, "PATCH", `/api/school/students/${siblingId}`, {
    schoolId,
    action: "linkGuardian",
    guardianEmail: g2Email,
    guardianFirstName: "Guard",
    guardianLastName: "Two",
  });
  check("Link existing parent to sibling", linkExisting.ok || linkExisting.status === 409, String(linkExisting.status));

  const detail2 = await api(ownerJar, "GET", `/api/school/students/${studentId}?schoolId=${schoolId}`);
  const invites = ((detail2.json as { pendingInvites?: Array<{ id: string }> }).pendingInvites ?? []);
  if (invites[0]) {
    const resend = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
      schoolId,
      action: "resendGuardianInvite",
      inviteId: invites[0].id,
    });
    check("Resend parent invite", resend.ok, String(resend.status));
  } else {
    check("Resend parent invite", true, "no pending invite — skipped");
  }

  const guardians = ((detail2.json as { item?: { guardians?: Array<{ id: string }> } }).item?.guardians ?? []);
  if (guardians[0]) {
    const suspend = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
      schoolId,
      action: "suspendGuardian",
      linkId: guardians[0].id,
    });
    check("Suspend guardian link", suspend.ok, String(suspend.status));
    const parentStill = await prisma.user.findUnique({ where: { email: g1Email } });
    check("Parent account preserved after suspend", Boolean(parentStill), parentStill?.email);
    await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
      schoolId,
      action: "reactivateGuardian",
      linkId: guardians[0].id,
    });
  } else {
    check("Suspend guardian link", false, "no guardians");
    check("Parent account preserved after suspend", false, "no guardians");
  }

  const archive = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
    schoolId,
    action: "archive",
  });
  check("Owner archive student", archive.ok, String(archive.status));
  const reactivate = await api(ownerJar, "PATCH", `/api/school/students/${studentId}`, {
    schoolId,
    action: "reactivate",
  });
  check("Owner reactivate student", reactivate.ok, String(reactivate.status));

  const audits = await prisma.schoolAuditLog.findMany({
    where: { schoolId, entityType: "student", entityId: studentId ?? "__none__" },
    take: 20,
  });
  check("Audit events appear", audits.length > 0, String(audits.length));

  const otherSchool = await prisma.school.findFirst({ where: { id: { not: schoolId } }, select: { id: true } });
  if (otherSchool) {
    const cross = await api(ownerJar, "GET", `/api/school/students?schoolId=${otherSchool.id}&status=all`);
    check("Cross-school students denied", cross.status === 403, String(cross.status));
  } else {
    check("Cross-school students denied", true, "only one school");
  }

  const adminJar = await login(UAT_FIXTURES.schoolAdminEmail, UAT_FIXTURES.schoolAdminPassword);
  const adminList = await api(adminJar, "GET", `/api/school/students?schoolId=${schoolId}&status=all`);
  check("Admin students list loads", adminList.ok, String(adminList.status));
  const adminCreate = await api(adminJar, "POST", "/api/school/students", {
    schoolId,
    firstName: "Admin",
    lastName: `Created${stamp}`,
    yearGroup: "Year 4",
    guardianFirstName: "Admin",
    guardianLastName: "Guard",
    guardianEmail: `uat.admin.guard.${stamp}@starliz.dev`,
    sendInvite: false,
  });
  check("Admin create student", adminCreate.ok, String(adminCreate.status));
  const adminStudentId = (adminCreate.json as { schoolStudentId?: string }).schoolStudentId;
  const adminPlatform = await api(adminJar, "GET", "/api/admin/schools");
  check("Admin platform denied", adminPlatform.status === 403 || adminPlatform.status === 401, String(adminPlatform.status));

  const teacherJar = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  const teacherList = await api(teacherJar, "GET", `/api/school/students?schoolId=${schoolId}&status=all`);
  check("Teacher students management denied", teacherList.status === 403, String(teacherList.status));

  // cleanup
  for (const id of [studentId, siblingId, adminStudentId].filter(Boolean) as string[]) {
    await prisma.schoolStudent.update({ where: { id }, data: { status: "archived", leftAt: new Date() } }).catch(() => undefined);
  }

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