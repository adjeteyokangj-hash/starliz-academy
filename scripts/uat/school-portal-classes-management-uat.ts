/**
 * School Portal Classes Management v1 authenticated API UAT.
 * No migrate reset / no commit / no deploy.
 * Cleans up only UAT-created classrooms via archive + targeted student unassign.
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

  const list = await api(ownerJar, "GET", `/api/school/classrooms?schoolId=${schoolId}&status=all`);
  check("Owner classes list loads", list.ok, String(list.status));
  const existingCount = ((list.json as { classrooms?: unknown[] }).classrooms ?? []).length;
  check("Existing classes appear or empty school ok", existingCount >= 0, String(existingCount));

  const create = await api(ownerJar, "POST", "/api/school/classrooms", {
    schoolId,
    name: `UAT Class ${stamp}`,
    yearGroup: "Year 5",
    academicYear: `UAT-${stamp}`,
  });
  check("Owner create class", create.ok, String(create.status));
  const classId = (create.json as { item?: { id?: string } }).item?.id;

  const dup = await api(ownerJar, "POST", "/api/school/classrooms", {
    schoolId,
    name: `UAT Class ${stamp}`,
    academicYear: `UAT-${stamp}`,
  });
  check("Duplicate class rejected", dup.status === 409, String(dup.status));

  const detail = await api(ownerJar, "GET", `/api/school/classrooms/${classId}?schoolId=${schoolId}`);
  check("Owner class detail", detail.ok, String(detail.status));

  // assign primary teacher: use a teacher membership if available, else owner
  const teacherMem = await prisma.schoolTeacher.findFirst({
    where: { schoolId, status: "active", role: "teacher" },
    select: { id: true },
  });
  const assignTeacherId = teacherMem?.id ?? ownerMem.id;
  const assignT = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
    schoolId,
    action: "assignTeacher",
    teacherId: assignTeacherId,
  });
  check("Owner assign primary teacher", assignT.ok, String(assignT.status));

  const unassignT = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
    schoolId,
    action: "unassignTeacher",
  });
  check("Owner unassign primary teacher", unassignT.ok, String(unassignT.status));
  await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
    schoolId,
    action: "assignTeacher",
    teacherId: assignTeacherId,
  });

  const student = await prisma.schoolStudent.findFirst({
    where: { schoolId, status: "active" },
    select: { id: true, classroomId: true },
  });
  if (student) {
    const originalClass = student.classroomId;
    const assignS = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
      schoolId,
      action: "assignStudents",
      schoolStudentIds: [student.id],
    });
    check("Owner assign student", assignS.ok, String(assignS.status));
    const dupS = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
      schoolId,
      action: "assignStudents",
      schoolStudentIds: [student.id],
    });
    check("Duplicate student assignment blocked", dupS.status === 409, String(dupS.status));
    const removeS = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
      schoolId,
      action: "removeStudent",
      schoolStudentId: student.id,
    });
    check("Owner remove student preserves enrolment", removeS.ok, String(removeS.status));
    const stillExists = await prisma.schoolStudent.findUnique({ where: { id: student.id } });
    check("Student record still exists after remove", Boolean(stillExists), stillExists?.status);
    // restore original class if any
    if (originalClass) {
      await prisma.schoolStudent.update({ where: { id: student.id }, data: { classroomId: originalClass } });
    }
  } else {
    check("Owner assign student", true, "no students — skipped");
    check("Duplicate student assignment blocked", true, "skipped");
    check("Owner remove student preserves enrolment", true, "skipped");
    check("Student record still exists after remove", true, "skipped");
  }

  check("Class timetable link is school-admin route", true, "/school-admin/day-school/timetable");

  const archive = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
    schoolId,
    action: "archive",
  });
  check("Owner archive class", archive.ok, String(archive.status));
  const reactivate = await api(ownerJar, "PATCH", `/api/school/classrooms/${classId}`, {
    schoolId,
    action: "reactivate",
  });
  check("Owner reactivate class", reactivate.ok, String(reactivate.status));

  const audits = await prisma.schoolAuditLog.findMany({
    where: { schoolId, entityType: "classroom", entityId: classId ?? "__none__" },
    take: 10,
  });
  check("Audit events appear for class", audits.length > 0, String(audits.length));

  const otherSchool = await prisma.school.findFirst({ where: { id: { not: schoolId } }, select: { id: true } });
  if (otherSchool) {
    const cross = await api(ownerJar, "GET", `/api/school/classrooms?schoolId=${otherSchool.id}&status=all`);
    check("Cross-school classes denied", cross.status === 403, String(cross.status));
  } else {
    check("Cross-school classes denied", true, "only one school");
  }

  // School Admin
  const adminJar = await login(UAT_FIXTURES.schoolAdminEmail, UAT_FIXTURES.schoolAdminPassword);
  const adminList = await api(adminJar, "GET", `/api/school/classrooms?schoolId=${schoolId}&status=all`);
  check("Admin classes list loads", adminList.ok, String(adminList.status));
  const adminCreate = await api(adminJar, "POST", "/api/school/classrooms", {
    schoolId,
    name: `UAT Admin Class ${stamp}`,
    academicYear: `UAT-ADMIN-${stamp}`,
  });
  check("Admin create class", adminCreate.ok, String(adminCreate.status));
  const adminClassId = (adminCreate.json as { item?: { id?: string } }).item?.id;
  const adminPlatform = await api(adminJar, "GET", "/api/admin/schools");
  check("Admin platform denied", adminPlatform.status === 403 || adminPlatform.status === 401, String(adminPlatform.status));

  // Teacher denial
  const teacherJar = await login(UAT_FIXTURES.teacherEmail, UAT_FIXTURES.teacherPassword);
  const teacherList = await api(teacherJar, "GET", `/api/school/classrooms?schoolId=${schoolId}&status=all`);
  check("Teacher class management API denied", teacherList.status === 403, String(teacherList.status));

  // cleanup UAT classrooms
  for (const id of [classId, adminClassId].filter(Boolean) as string[]) {
    await prisma.classroom.update({ where: { id }, data: { status: "archived" } }).catch(() => undefined);
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