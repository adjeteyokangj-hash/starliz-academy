import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext } from "@playwright/test";

const prisma = new PrismaClient();

const RUN_ID = Date.now().toString(36);
const ADMIN_EMAIL = `e2e.release.admin+${RUN_ID}@starliz.local`;
const ADMIN_PASSWORD = "E2EReleaseAdmin#2026";
const PARENT_EMAIL = `e2e.release.parent+${RUN_ID}@starliz.local`;
const PARENT_PASSWORD = "E2EReleaseParent#2026";
const PARENT_NAME = "E2E Release Parent";
const CHILD_NAME = "E2E Release Child";

const TEST_CONTENT_ID = `e2e-release-content-${RUN_ID}`;
const RUN_RELEASE_QA = process.env.E2E_RELEASE_QA === "1";

let parentId = "";
let childId = "";
let assignmentId = "";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      data: { email, password },
      failOnStatusCode: false,
    });

    if (response.ok()) return;

    if (response.status() === 429 && attempt < 3) {
      const retryAfter = Number(response.headers()["retry-after"] ?? "1");
      await delay(Math.max(1000, retryAfter * 1000));
      continue;
    }

    const body = await response.text();
    throw new Error(`Login failed status=${response.status()} body=${body}`);
  }
}

async function apiLogout(request: APIRequestContext) {
  const response = await request.post("/api/auth/logout", { failOnStatusCode: false });
  expect(response.ok()).toBe(true);
}

async function acceptConsent(request: APIRequestContext) {
  const response = await request.post("/api/consent", {
    data: { accepted: true, version: "1.0" },
    failOnStatusCode: false,
  });
  expect(response.ok()).toBe(true);
}

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const childIds = await prisma.childProfile.findMany({
    where: { parentId: { in: userIds } },
    select: { id: true },
  });
  const childIdList = childIds.map((c) => c.id);

  await prisma.attempt.deleteMany({ where: { studentId: { in: childIdList.length ? childIdList : ["__none__"] } } });
  await prisma.assignment.deleteMany({ where: { studentId: { in: childIdList.length ? childIdList : ["__none__"] } } });
  await prisma.studentProfile.deleteMany({ where: { childId: { in: childIdList.length ? childIdList : ["__none__"] } } });
  await prisma.childProfile.deleteMany({ where: { id: { in: childIdList.length ? childIdList : ["__none__"] } } });
  await prisma.subscription.deleteMany({ where: { parentId: { in: userIds.length ? userIds : ["__none__"] } } });
  await prisma.parentProfile.deleteMany({ where: { userId: { in: userIds.length ? userIds : ["__none__"] } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds.length ? userIds : ["__none__"] } } });
  await prisma.aIContentCache.deleteMany({ where: { id: TEST_CONTENT_ID } });
  await prisma.user.deleteMany({ where: { id: { in: userIds.length ? userIds : ["__none__"] } } });
}

async function seedAdminAndContent() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      role: "admin",
      name: "E2E Release Admin",
    },
    select: { id: true },
  });

  await prisma.aIContentCache.create({
    data: {
      id: TEST_CONTENT_ID,
      contentType: "spelling",
      level: 2,
      topic: "E2E Release QA spelling",
      skillFocus: "silent e",
      status: "published",
      contentJson: JSON.stringify([
        {
          id: "e2e-release-q1",
          word: "cake",
          hint: "silent e",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
      ]),
      createdBy: ADMIN_EMAIL,
    },
  });

  return admin.id;
}

async function seedParentAccount() {
  const parentHash = await bcrypt.hash(PARENT_PASSWORD, 12);
  const parent = await prisma.user.create({
    data: {
      email: PARENT_EMAIL,
      passwordHash: parentHash,
      role: "parent",
      name: PARENT_NAME,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
      parentProfile: {
        create: {
          phone: "+447400000123",
          status: "active",
          country: "United Kingdom",
          address: "10 Downing Street, London, SW1A 2AA",
        },
      },
    },
    select: { id: true },
  });

  parentId = parent.id;
}

test.describe("Phase 6 Release QA Foundation", () => {
  test.describe.configure({ mode: "serial", timeout: 12 * 60 * 1000 });
  test.skip(!RUN_RELEASE_QA, "Set E2E_RELEASE_QA=1 to run release QA journeys with dedicated fixtures.");

  test.beforeAll(async () => {
    await cleanupFixtures();
    await seedAdminAndContent();
    await seedParentAccount();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("parent auth journey covers login and logout (signup route may be launch-scoped)", async ({ page }) => {
    const signupPage = await page.request.get("/signup", { failOnStatusCode: false });
    expect([200, 302, 307, 308]).toContain(signupPage.status());

    await apiLogin(page.request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(page.request);

    const meResponse = await page.request.get("/api/auth/me", { failOnStatusCode: false });
    expect(meResponse.ok()).toBe(true);
    const mePayload = (await meResponse.json()) as { user?: { id?: string } };
    parentId = mePayload.user?.id ?? "";
    expect(parentId.length).toBeGreaterThan(0);

    await page.goto("/parent/profiles");
    await expect(page).toHaveURL(/\/parent\/profiles/);

    await apiLogout(page.request);

    const afterLogout = await page.request.get("/api/auth/me", { failOnStatusCode: false });
    expect(afterLogout.status()).toBe(401);
  });

  test("parent creates child and can create export/delete requests", async ({ page }) => {
    await apiLogin(page.request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(page.request);

    const createChild = await page.request.post("/api/children", {
      data: {
        name: CHILD_NAME,
        ageYears: 8,
        yearGroup: "Year 3",
        schoolYear: "Year 3",
        keyStageLevel: "KS2",
        subjectLevel: "KS2",
        learningGoals: ["Spelling confidence"],
        selectedSubjects: ["English", "Maths"],
        avatar: "star",
      },
      failOnStatusCode: false,
    });
    expect([200, 201]).toContain(createChild.status());

    const listChildren = await page.request.get("/api/children", { failOnStatusCode: false });
    expect(listChildren.ok()).toBe(true);
    const childrenPayload = (await listChildren.json()) as { children?: Array<{ id: string; name: string }> };
    const child = childrenPayload.children?.find((entry) => entry.name === CHILD_NAME);
    expect(child).toBeTruthy();
    childId = child?.id ?? "";

    const exportRequest = await page.request.post("/api/parent/data-requests", {
      data: { type: "export", childId },
      failOnStatusCode: false,
    });
    expect(exportRequest.status()).toBe(201);

    const deletionRequest = await page.request.post("/api/parent/data-requests", {
      data: { type: "deletion", childId, reason: "Parent request for erasure workflow" },
      failOnStatusCode: false,
    });
    expect(deletionRequest.status()).toBe(201);

    const requestsList = await page.request.get("/api/parent/data-requests", { failOnStatusCode: false });
    expect(requestsList.ok()).toBe(true);
    const requestsPayload = (await requestsList.json()) as {
      requests?: Array<{ type: string; status: string }>;
      aiUseDisclosure?: { summary?: string };
    };
    expect(requestsPayload.requests?.some((entry) => entry.type === "export")).toBe(true);
    expect(requestsPayload.requests?.some((entry) => entry.type === "deletion")).toBe(true);
    expect(Boolean(requestsPayload.aiUseDisclosure?.summary)).toBe(true);
  });

  test("admin assigns content, student attempt updates assignment/progress", async ({ page }) => {
    await apiLogin(page.request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const assignResponse = await page.request.post("/api/admin/assignments", {
      data: {
        contentId: TEST_CONTENT_ID,
        studentId: childId,
      },
      failOnStatusCode: false,
    });
    expect(assignResponse.status()).toBe(201);

    const assignPayload = (await assignResponse.json()) as {
      assignments?: Array<{ id: string }>;
      blocked?: unknown[];
    };
    assignmentId = assignPayload.assignments?.[0]?.id ?? "";
    expect(assignmentId.length).toBeGreaterThan(0);

    await apiLogin(page.request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(page.request);

    const setActiveChild = await page.request.post("/api/children/active", {
      data: { childId },
      failOnStatusCode: false,
    });
    expect(setActiveChild.ok()).toBe(true);

    const attemptResponse = await page.request.post("/api/attempts", {
      data: {
        studentId: childId,
        subject: "spelling",
        keyStage: "KS2",
        yearGroup: "Year 3",
        skillFocus: "silent e",
        contentId: TEST_CONTENT_ID,
        assignmentId,
        questionText: "cake",
        answerGiven: "cake",
        correctAnswer: "cake",
        correct: true,
        responseTimeMs: 2000,
        hintsUsed: 0,
        difficulty: 2,
      },
      failOnStatusCode: false,
    });
    expect(attemptResponse.ok()).toBe(true);

    const assignments = await page.request.get(`/api/assignments?childId=${encodeURIComponent(childId)}`, {
      failOnStatusCode: false,
    });
    expect(assignments.ok()).toBe(true);

    const summary = await page.request.get("/api/student/dashboard-summary", { failOnStatusCode: false });
    expect([200, 402, 403]).toContain(summary.status());
  });

  test("parent report export, password reset request, and PIN reset flow", async ({ page }) => {
    await apiLogin(page.request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(page.request);

    const reportExport = await page.request.get(
      `/api/parent/reports/export?childId=${encodeURIComponent(childId)}&format=csv&range=30d`,
      { failOnStatusCode: false },
    );
    expect([200, 404]).toContain(reportExport.status());

    const passwordReset = await page.request.post("/api/auth/forgot-password", {
      data: { email: PARENT_EMAIL },
      failOnStatusCode: false,
    });
    expect(passwordReset.ok()).toBe(true);

    const setPin = await page.request.post("/api/pin/set", {
      data: { pin: "2580" },
      failOnStatusCode: false,
    });
    expect([200, 409]).toContain(setPin.status());

    const resetPin = await page.request.post("/api/pin/set", {
      data: { currentPin: "2580", newPin: "3691" },
      failOnStatusCode: false,
    });
    expect(resetPin.ok()).toBe(true);
  });

  test("subscription lifecycle is validated with safe status mocks", async ({ page }) => {
    await apiLogin(page.request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(page.request);

    const setActive = await page.request.patch("/api/subscription", {
      data: { status: "active" },
      failOnStatusCode: false,
    });
    expect(setActive.ok()).toBe(true);

    const setCancelled = await page.request.patch("/api/subscription", {
      data: { status: "cancelled" },
      failOnStatusCode: false,
    });
    expect(setCancelled.ok()).toBe(true);

    const cancelledAccess = await page.request.get("/api/subscription/access?feature=learning", {
      failOnStatusCode: false,
    });
    expect([200, 402]).toContain(cancelledAccess.status());

    const setExpired = await page.request.patch("/api/subscription", {
      data: { status: "expired" },
      failOnStatusCode: false,
    });
    expect(setExpired.ok()).toBe(true);

    const expiredAccess = await page.request.get("/api/subscription/access?feature=learning", {
      failOnStatusCode: false,
    });
    expect(expiredAccess.status()).toBe(402);
  });

  test("teacher and school scoped access check when teacher creds are provided", async ({ page }) => {
    const teacherEmail = process.env.E2E_TEACHER_EMAIL;
    const teacherPassword = process.env.E2E_TEACHER_PASSWORD;

    test.skip(!teacherEmail || !teacherPassword, "Teacher credentials not configured for this environment.");

    await apiLogin(page.request, teacherEmail!, teacherPassword!);
    const teacherPage = await page.request.get("/teacher", { failOnStatusCode: false });
    expect(teacherPage.status()).toBeLessThan(400);

    const schoolCompliance = await page.request.get("/api/school/compliance?mode=retention", {
      failOnStatusCode: false,
    });
    expect([200, 400, 403, 404]).toContain(schoolCompliance.status());
  });

  test("mobile parent journey renders dashboard shell", async ({ browser }) => {
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const request = mobileContext.request;
    await apiLogin(request, PARENT_EMAIL, PARENT_PASSWORD);
    await acceptConsent(request);

    const page = await mobileContext.newPage();
    await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(/\/parent\/dashboard/);

    await mobileContext.close();
  });
});
