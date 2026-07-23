import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminSchoolDashboardGet } from "../src/app/api/admin/school-dashboard/[schoolId]/route";
import { handleAdminSchoolGet } from "../src/app/api/admin/schools/[schoolId]/route";
import { mapSchoolToAdminRecord, mapSchoolToDashboardRecord } from "../src/lib/schools/school-admin-payload";

const now = new Date("2026-07-22T12:00:00.000Z");

function makeSchoolSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "school-1",
    name: "Starliz Academy",
    slug: "starliz-academy",
    status: "active",
    type: "secondary",
    contactEmail: "office@starliz.test",
    contactPhone: null,
    notes: "Demo academy",
    ownerUserId: "owner-1",
    createdAt: now,
    updatedAt: now,
    owner: { id: "owner-1", name: "Owner", email: "owner@starliz.test" },
    licence: {
      id: "lic-1",
      status: "active",
      seatLimit: 100,
      provider: "manual",
      pricingPlanId: null,
      currency: "GBP",
      billingInterval: "year",
      trialEndsAt: null,
      currentPeriodEnd: now,
      startsAt: now,
      endsAt: null,
      notes: null,
      updatedAt: now,
    },
    classrooms: [{
      id: "class-1",
      name: "9A",
      yearGroup: "Year 9",
      academicYear: "2025/26",
      status: "active",
      teacherId: "teacher-1",
      updatedAt: now,
      teacher: { user: { name: "Ms Rivera" } },
      _count: { students: 2 },
    }],
    teachers: [{
      id: "teacher-1",
      role: "teacher",
      status: "active",
      title: "Class Teacher",
      invitedAt: now,
      acceptedAt: now,
      lastActiveAt: now,
      updatedAt: now,
      user: { id: "user-t1", email: "rivera@starliz.test", name: "Ms Rivera" },
    }],
    students: [{
      id: "ss-1",
      classroomId: "class-1",
      status: "active",
      externalRef: null,
      joinedAt: now,
      updatedAt: now,
      child: {
        id: "child-1",
        name: "Adjei",
        parent: { email: "parent@example.com" },
      },
      classroom: { id: "class-1", name: "9A" },
    }],
    parentLinks: [],
    communicationLogs: [],
    safeguardingAlerts: [{ severity: "high" }],
    safeguardingIncidents: [],
    auditLogs: [{
      id: "audit-1",
      action: "student_assigned",
      entityType: "school_student",
      entityId: "ss-1",
      severity: "info",
      actorUserId: "owner-1",
      createdAt: now,
    }],
    dayLessons: [{
      id: "day-1",
      title: "Maths — Number fluency",
      subject: "Maths",
      lessonType: "core",
      yearGroup: "Year 9",
      keyStage: "KS3",
      skillFocus: "Number fluency",
      dayOfWeek: 1,
      periodIndex: 5,
      startsAt: "10:55",
      endsAt: "11:45",
      room: "Room 12",
      status: "scheduled",
      classroomId: "class-1",
      teacherId: "teacher-1",
      lessonId: "lesson-1",
      dueDate: null,
      updatedAt: now,
      classroom: { id: "class-1", name: "9A" },
      teacher: { user: { name: "Ms Rivera" } },
    }],
    ...overrides,
  };
}

test("mapSchoolToAdminRecord maps roster fields for academy dashboard", () => {
  const record = mapSchoolToAdminRecord(makeSchoolSource() as never);

  assert.equal(record.id, "school-1");
  assert.equal(record.students[0]?.childName, "Adjei");
  assert.equal(record.students[0]?.classroomName, "9A");
  assert.equal(record.teachers[0]?.email, "rivera@starliz.test");
  assert.equal(record.classrooms[0]?.teacherName, "Ms Rivera");
  assert.equal(record.classrooms[0]?.studentsCount, 2);
  assert.equal(record.licence?.seatsUsed, 1);
  assert.equal(record.safeguarding.openAlerts, 1);
  assert.equal(record.dayLessons[0]?.title, "Maths — Number fluency");
  assert.equal(record.dayLessons[0]?.teacherName, "Ms Rivera");
});

test("mapSchoolToDashboardRecord omits parent-comms graph", () => {
  const source = makeSchoolSource();
  const dashboardSource = {
    ...source,
    parentLinks: undefined,
    communicationLogs: undefined,
  };
  const record = mapSchoolToDashboardRecord(dashboardSource as never);
  assert.equal(record.communicationPreferences.length, 0);
  assert.equal(record.communicationLogs.length, 0);
  assert.equal(record.students[0]?.childName, "Adjei");
});

test("school-dashboard GET returns one school payload", async () => {
  const school = mapSchoolToDashboardRecord(makeSchoolSource() as never);
  const response = await handleAdminSchoolDashboardGet(
    new Request("http://localhost/api/admin/school-dashboard/school-1"),
    { params: Promise.resolve({ schoolId: "school-1" }) },
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      findSchoolDashboardRecord: async (schoolId) => (schoolId === "school-1" ? school : null),
    },
  );

  const payload = await response.json() as { school: { id: string; name: string } };
  assert.equal(response.status, 200);
  assert.equal(payload.school.id, "school-1");
  assert.equal(payload.school.name, "Starliz Academy");
});

test("single-school GET returns one school payload", async () => {
  const school = mapSchoolToAdminRecord(makeSchoolSource() as never);
  const response = await handleAdminSchoolGet(
    new Request("http://localhost/api/admin/schools/school-1"),
    { params: Promise.resolve({ schoolId: "school-1" }) },
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      findSchoolAdminRecord: async (schoolId) => (schoolId === "school-1" ? school : null),
    },
  );

  const payload = await response.json() as { school: { id: string; name: string } };
  assert.equal(response.status, 200);
  assert.equal(payload.school.id, "school-1");
  assert.equal(payload.school.name, "Starliz Academy");
});

test("single-school GET returns 404 when school is missing", async () => {
  const response = await handleAdminSchoolGet(
    new Request("http://localhost/api/admin/schools/missing"),
    { params: Promise.resolve({ schoolId: "missing" }) },
    {
      requireAdminPermission: async () => ({
        session: { userId: "admin-1", email: "admin@example.com", role: "admin" },
        response: null,
      }),
      findSchoolAdminRecord: async () => null,
    },
  );

  assert.equal(response.status, 404);
  const payload = await response.json() as { error: string };
  assert.match(payload.error, /not found/i);
});

test("single-school GET requires admin permission", async () => {
  const response = await handleAdminSchoolGet(
    new Request("http://localhost/api/admin/schools/school-1"),
    { params: Promise.resolve({ schoolId: "school-1" }) },
    {
      requireAdminPermission: async () => ({
        session: null,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }) as never,
      }),
      findSchoolAdminRecord: async () => {
        throw new Error("should not load school when unauthorized");
      },
    },
  );

  assert.equal(response.status, 401);
});
