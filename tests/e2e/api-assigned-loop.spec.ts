import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, request, test, type APIRequestContext } from "@playwright/test";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "e2e.api.admin@starliz.local";
const ADMIN_PASSWORD = "E2EApiAdmin#2026";
const PARENT_EMAIL = "e2e.api.parent@starliz.local";
const PARENT_PASSWORD = "E2EApiParent#2026";
const CHILD_ID = "e2e-api-loop-child";
const CHILD_NAME = "E2E API Loop Child";

const SKILL_FOCUS = "Silent e";

type SeededUsers = {
  adminId: string;
  parentId: string;
};

async function seedUsers(): Promise<SeededUsers> {
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const parentPasswordHash = await bcrypt.hash(PARENT_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: "admin",
      name: "E2E API Admin",
      passwordHash: adminPasswordHash,
    },
    create: {
      email: ADMIN_EMAIL,
      role: "admin",
      name: "E2E API Admin",
      passwordHash: adminPasswordHash,
    },
    select: { id: true },
  });

  const parent = await prisma.user.upsert({
    where: { email: PARENT_EMAIL },
    update: {
      role: "parent",
      name: "E2E API Parent",
      passwordHash: parentPasswordHash,
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
      activeChildId: CHILD_ID,
    },
    create: {
      email: PARENT_EMAIL,
      role: "parent",
      name: "E2E API Parent",
      passwordHash: parentPasswordHash,
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      activeChildId: CHILD_ID,
    },
    select: { id: true },
  });

  await prisma.subscription.deleteMany({
    where: {
      OR: [
        { parentId: parent.id, providerSubId: "e2e-api-loop" },
        { providerSubId: "e2e-api-loop" },
      ],
    },
  });

  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-api-loop",
      planKey: "yearly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: CHILD_ID },
    update: {
      parentId: parent.id,
      name: CHILD_NAME,
      avatar: "star",
      archived: false,
      age: 7,
      yearGroup: "Year 2",
    },
    create: {
      id: CHILD_ID,
      parentId: parent.id,
      name: CHILD_NAME,
      avatar: "star",
      age: 7,
      yearGroup: "Year 2",
    },
  });

  return { adminId: admin.id, parentId: parent.id };
}

async function cleanupFixtures() {
  const content = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        { createdBy: ADMIN_EMAIL },
        { topic: { startsWith: "E2E API Loop" } },
      ],
    },
    select: { id: true },
  });
  const contentIds = content.map((entry) => entry.id);

  await prisma.attempt.deleteMany({
    where: {
      OR: [
        { studentId: CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
  });

  await prisma.assignment.deleteMany({
    where: {
      OR: [
        { studentId: CHILD_ID },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
  });

  await prisma.weakArea.deleteMany({ where: { studentId: CHILD_ID } });
  await prisma.aIContentCache.deleteMany({ where: { id: { in: contentIds.length ? contentIds : ["__none__"] } } });
  await prisma.childProfile.deleteMany({ where: { id: CHILD_ID } });
  await prisma.subscription.deleteMany({ where: { providerSubId: "e2e-api-loop" } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } } });
}

async function loginApi(api: APIRequestContext, email: string, password: string) {
  const response = await api.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("API Assigned Loop Deterministic", () => {
  test.beforeAll(async () => {
    await cleanupFixtures();
    await seedUsers();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("content save -> assignment -> student -> attempts -> weak area -> parent report", async () => {
    const adminApi = await request.newContext();
    const parentApi = await request.newContext();

    await loginApi(adminApi, ADMIN_EMAIL, ADMIN_PASSWORD);

    const saveResponse = await adminApi.post("/api/admin/content-library", {
      data: {
        type: "spelling",
        ageGroup: "5-7",
        keyStage: "KS1",
        yearGroup: "Year 2",
        skillFocus: SKILL_FOCUS,
        difficulty: 2,
        topic: "E2E API Loop Silent e",
        status: "review",
        items: [
          {
            id: "e2e-api-word-1",
            word: "cake",
            hint: "Ends with silent e.",
            sentenceContext: "I ate a cake.",
          },
          {
            id: "e2e-api-word-2",
            word: "make",
            hint: "Also ends with silent e.",
            sentenceContext: "I can make a model.",
          },
        ],
      },
    });
    expect(saveResponse.status()).toBe(201);
    const savePayload = await saveResponse.json() as { item?: { id?: string } };
    const contentId = savePayload.item?.id;
    expect(contentId).toBeTruthy();

    const assignResponse = await adminApi.post("/api/admin/assignments", {
      data: {
        studentId: CHILD_ID,
        contentId,
      },
    });
    expect(assignResponse.status()).toBe(201);
    const assignPayload = await assignResponse.json() as { assignments?: Array<{ id: string }> };
    const assignmentId = assignPayload.assignments?.[0]?.id;
    expect(assignmentId).toBeTruthy();

    await loginApi(parentApi, PARENT_EMAIL, PARENT_PASSWORD);

    const activateChild = await parentApi.post("/api/children/active", {
      data: { childId: CHILD_ID },
    });
    expect(activateChild.ok()).toBeTruthy();

    const studentAssignments = await parentApi.get(`/api/student/assignments?studentId=${CHILD_ID}`);
    expect(studentAssignments.ok()).toBeTruthy();
    const studentPayload = await studentAssignments.json() as { assignments?: Array<{ id: string; status: string }> };
    const assignmentBeforeAttempts = studentPayload.assignments?.find((entry) => entry.id === assignmentId);
    expect(assignmentBeforeAttempts?.status).toBe("assigned");

    const firstAttempt = await parentApi.post("/api/attempts", {
      data: {
        studentId: CHILD_ID,
        subject: "spelling",
        skillFocus: SKILL_FOCUS,
        contentId,
        assignmentId,
        questionText: "cake",
        answerGiven: "cak",
        correctAnswer: "cake",
        correct: false,
        responseTimeMs: 450,
        hintsUsed: 1,
        difficulty: 2,
      },
    });
    expect(firstAttempt.status()).toBe(201);

    const secondAttempt = await parentApi.post("/api/attempts", {
      data: {
        studentId: CHILD_ID,
        subject: "spelling",
        skillFocus: SKILL_FOCUS,
        contentId,
        assignmentId,
        questionText: "cake",
        answerGiven: "cake",
        correctAnswer: "cake",
        correct: true,
        responseTimeMs: 350,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(secondAttempt.status()).toBe(201);

    const thirdAttempt = await parentApi.post("/api/attempts", {
      data: {
        studentId: CHILD_ID,
        subject: "spelling",
        skillFocus: SKILL_FOCUS,
        contentId,
        assignmentId,
        questionText: "make",
        answerGiven: "make",
        correctAnswer: "make",
        correct: true,
        responseTimeMs: 380,
        hintsUsed: 0,
        difficulty: 2,
      },
    });
    expect(thirdAttempt.status()).toBe(201);

    await expect.poll(async () => {
      const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { status: true } });
      return assignment?.status;
    }).toBe("completed");

    const weakArea = await prisma.weakArea.findUnique({
      where: {
        studentId_subject_skillFocus: {
          studentId: CHILD_ID,
          subject: "spelling",
          skillFocus: SKILL_FOCUS,
        },
      },
      select: { metadataJson: true, status: true, accuracy: true, currentDifficulty: true },
    });
    expect(weakArea).toBeTruthy();
    expect(["active", "improving"]).toContain(weakArea?.status ?? "");
    expect(weakArea?.accuracy ?? 0).toBeGreaterThanOrEqual(0);
    expect(weakArea?.currentDifficulty ?? 0).toBeGreaterThanOrEqual(1);

    const insightsResponse = await parentApi.get("/api/parent/insights");
    expect(insightsResponse.ok()).toBeTruthy();
    const insights = await insightsResponse.json() as { weaknesses?: Array<{ topic: string; attempts: number }> };
    const weaknessEntry = (insights.weaknesses ?? []).find((entry) => entry.topic.toLowerCase() === SKILL_FOCUS.toLowerCase());
    expect(weaknessEntry).toBeTruthy();
    expect((weaknessEntry?.attempts ?? 0) > 0).toBeTruthy();

    const reportResponse = await parentApi.get(`/api/parent/reports/export?childId=${CHILD_ID}&format=csv&range=30d`);
    expect(reportResponse.ok()).toBeTruthy();
    expect((reportResponse.headers()["content-type"] ?? "").toLowerCase()).toContain("text/csv");
    const reportCsv = await reportResponse.text();
    expect(reportCsv).toContain(CHILD_NAME);
    expect(reportCsv.toLowerCase()).toContain("silent e");

    await adminApi.dispose();
    await parentApi.dispose();
  });
});
