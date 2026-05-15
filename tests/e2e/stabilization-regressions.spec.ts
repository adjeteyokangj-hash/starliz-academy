import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e.admin+stabilization@starliz.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "PlaywrightAdmin#2026";

const PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? "e2e.parent+stabilization@starliz.local";
const PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "PlaywrightParent#2026";

const STUDENT_Y11_ID = "e2e-stabilization-y11";
const STUDENT_Y10_ID = "e2e-stabilization-y10";
const CONTENT_CREATED_BY = "e2e-stabilization";
const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.ok()).toBe(true);
}

async function seedUsersAndStudents() {
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const parentPasswordHash = await bcrypt.hash(PARENT_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash: adminPasswordHash,
      role: "admin",
      name: "E2E Admin",
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      role: "admin",
      name: "E2E Admin",
    },
    select: { id: true },
  });

  const parent = await prisma.user.upsert({
    where: { email: PARENT_EMAIL },
    update: {
      passwordHash: parentPasswordHash,
      role: "parent",
      name: "E2E Parent",
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
    },
    create: {
      email: PARENT_EMAIL,
      passwordHash: parentPasswordHash,
      role: "parent",
      name: "E2E Parent",
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.parentProfile.upsert({
    where: { userId: parent.id },
    update: {
      phone: "07000000000",
      status: "active",
      trialStatus: "none",
      subscriptionPlan: "free",
    },
    create: {
      userId: parent.id,
      phone: "07000000000",
      status: "active",
      trialStatus: "none",
      subscriptionPlan: "free",
    },
  });

  await prisma.subscription.deleteMany({ where: { parentId: parent.id, providerSubId: "e2e-stabilization" } });
  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-stabilization",
      planKey: "free",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: STUDENT_Y11_ID },
    update: {
      parentId: parent.id,
      name: "E2E Year 11",
      avatar: "star",
      archived: false,
      age: 15,
      yearGroup: "Year 11",
    },
    create: {
      id: STUDENT_Y11_ID,
      parentId: parent.id,
      name: "E2E Year 11",
      avatar: "star",
      age: 15,
      yearGroup: "Year 11",
    },
  });

  await prisma.childProfile.upsert({
    where: { id: STUDENT_Y10_ID },
    update: {
      parentId: parent.id,
      name: "E2E Year 10",
      avatar: "star",
      archived: false,
      age: 14,
      yearGroup: "Year 10",
    },
    create: {
      id: STUDENT_Y10_ID,
      parentId: parent.id,
      name: "E2E Year 10",
      avatar: "star",
      age: 14,
      yearGroup: "Year 10",
    },
  });

  await prisma.user.update({ where: { id: parent.id }, data: { activeChildId: STUDENT_Y11_ID } });

  return { adminId: admin.id, parentId: parent.id };
}

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const contents = await prisma.aIContentCache.findMany({
    where: { createdBy: CONTENT_CREATED_BY },
    select: { id: true },
  });
  const contentIds = contents.map((c) => c.id);

  const assignments = await prisma.assignment.findMany({
    where: {
      OR: [
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
        { studentId: { in: [STUDENT_Y11_ID, STUDENT_Y10_ID] } },
      ],
    },
    select: { id: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds.length ? userIds : ["__none__"] } },
        { action: "admin.subscription.override" },
        { action: "student.assignment_content_load_failed" },
      ],
    },
  });

  await prisma.attempt.deleteMany({
    where: {
      OR: [
        { assignmentId: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { studentId: { in: [STUDENT_Y11_ID, STUDENT_Y10_ID] } },
      ],
    },
  });

  await prisma.assignment.deleteMany({
    where: {
      OR: [
        { id: { in: assignmentIds.length ? assignmentIds : ["__none__"] } },
        { studentId: { in: [STUDENT_Y11_ID, STUDENT_Y10_ID] } },
        { contentId: { in: contentIds.length ? contentIds : ["__none__"] } },
      ],
    },
  });

  await prisma.weakArea.deleteMany({ where: { studentId: { in: [STUDENT_Y11_ID, STUDENT_Y10_ID] } } });
  await prisma.aIContentCache.deleteMany({ where: { id: { in: contentIds.length ? contentIds : ["__none__"] } } });
  await prisma.childProfile.deleteMany({ where: { id: { in: [STUDENT_Y11_ID, STUDENT_Y10_ID] } } });

  const parent = await prisma.user.findUnique({ where: { email: PARENT_EMAIL }, select: { id: true } });
  if (parent) {
    await prisma.subscription.deleteMany({ where: { parentId: parent.id } });
    await prisma.parentProfile.deleteMany({ where: { userId: parent.id } });
  }

  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } } });
}

test.describe("Stabilization regressions", () => {
  test.skip(!HAS_DATABASE_URL, "DATABASE_URL is required for Prisma-backed stabilization e2e tests.");

  let seeded: { adminId: string; parentId: string };

  test.beforeAll(async () => {
    if (!HAS_DATABASE_URL) return;
    await cleanupFixtures();
    seeded = await seedUsersAndStudents();
  });

  test.afterAll(async () => {
    if (!HAS_DATABASE_URL) return;
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("Apply Filters is explicit and URL-driven", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/admin/content-library");

    await expect(page.getByPlaceholder("Search name, parent or class...")).toBeVisible();

    const filterSection = page.locator("section").filter({ hasText: "Apply Filters" }).first();
    const yearSelect = filterSection.locator("select").first();

    await yearSelect.selectOption("Year 10");
    await expect(page).toHaveURL(/\/admin\/content-library$/);

    await page.getByPlaceholder("Search name, parent or class...").fill("year10");
    await expect(page).toHaveURL(/\/admin\/content-library$/);

    await filterSection.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/year=Year\+10/);
    await expect(page).toHaveURL(/q=year10/);

    await filterSection.getByRole("button", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/admin\/content-library$/);
  });

  test("Year 11 assignment-backed loading blocks fallback and invalid assignment", async ({ page }) => {
    const literatureContent = await prisma.aIContentCache.create({
      data: {
        contentType: "reading",
        level: 9,
        topic: "Year 11 English Literature practice",
        keyStage: "KS4",
        yearGroup: "Year 11",
        skillFocus: "English Literature",
        status: "published",
        createdBy: CONTENT_CREATED_BY,
        metadataJson: JSON.stringify({
          subject: "english-literature",
          yearGroup: "Year 11",
          keyStage: "KS4",
          curriculumPathway: "GCSE",
        }),
        contentJson: JSON.stringify([
          {
            id: "e2e-y11-lit-1",
            passage: "In Shakespeare's tragedy, Macbeth's ambition becomes a destructive force that isolates him from moral restraint.",
            question: "Which theme is most clearly developed in the passage?",
            answer: "Unchecked ambition",
            choices: ["Comic relief", "Unchecked ambition", "Pastoral harmony", "Travel writing"],
          },
        ]),
      },
      select: { id: true },
    });

    const literatureAssignment = await prisma.assignment.create({
      data: { studentId: STUDENT_Y11_ID, contentId: literatureContent.id, status: "assigned" },
      select: { id: true },
    });

    const y10ReadingContent = await prisma.aIContentCache.create({
      data: {
        contentType: "reading",
        level: 8,
        topic: "Year 10 Reading analysis",
        keyStage: "KS4",
        yearGroup: "Year 10",
        skillFocus: "Comprehension",
        status: "published",
        createdBy: CONTENT_CREATED_BY,
        metadataJson: JSON.stringify({ subject: "reading", yearGroup: "Year 10", keyStage: "KS4", curriculumPathway: "GCSE" }),
        contentJson: JSON.stringify([
          {
            id: "e2e-y10-read-1",
            passage: "The committee report argued that evidence-based planning improved long-term outcomes.",
            question: "What does the report primarily advocate?",
            answer: "Evidence-based planning",
            choices: ["Random allocation", "Evidence-based planning", "No intervention", "Marketing-first strategy"],
          },
        ]),
      },
      select: { id: true },
    });

    const y10ReadingAssignment = await prisma.assignment.create({
      data: { studentId: STUDENT_Y10_ID, contentId: y10ReadingContent.id, status: "assigned" },
      select: { id: true },
    });

    const scienceContent = await prisma.aIContentCache.create({
      data: {
        contentType: "science",
        level: 4,
        topic: "GCSE Science energy transfer",
        keyStage: "KS4",
        yearGroup: "Year 11",
        skillFocus: "Physics",
        status: "published",
        createdBy: CONTENT_CREATED_BY,
        metadataJson: JSON.stringify({ subject: "science", yearGroup: "Year 11", keyStage: "KS4", curriculumPathway: "GCSE" }),
        contentJson: JSON.stringify([
          {
            id: "e2e-gcse-science-1",
            question: "Explain why thermal insulation reduces energy transfer.",
            answer: "It reduces conduction and convection.",
            options: ["It increases friction", "It reduces conduction and convection.", "It changes mass", "It removes gravity"],
          },
        ]),
      },
      select: { id: true },
    });

    const scienceAssignment = await prisma.assignment.create({
      data: { studentId: STUDENT_Y11_ID, contentId: scienceContent.id, status: "assigned" },
      select: { id: true },
    });

    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    const setActive = await page.request.post("/api/children/active", { data: { childId: STUDENT_Y11_ID } });
    expect(setActive.ok()).toBe(true);

    const y11AssignmentRes = await page.request.get(`/api/student/assignments?id=${encodeURIComponent(literatureAssignment.id)}`);
    const y11AssignmentPayload = await y11AssignmentRes.json();
    expect(y11AssignmentRes.ok()).toBe(true);
    expect(String(y11AssignmentPayload.href ?? "")).toContain(`/games/reading?assignmentId=${literatureAssignment.id}`);

    const scienceAssignmentRes = await page.request.get(`/api/student/assignments?id=${encodeURIComponent(scienceAssignment.id)}`);
    const scienceAssignmentPayload = await scienceAssignmentRes.json();
    expect(scienceAssignmentRes.ok()).toBe(true);
    expect(scienceAssignmentPayload.subject).toBe("science");
    expect(String(scienceAssignmentPayload.href ?? "")).toContain(`/games/lesson?assignmentId=${scienceAssignment.id}`);

    await page.request.post("/api/children/active", { data: { childId: STUDENT_Y10_ID } });
    const y10AssignmentRes = await page.request.get(`/api/student/assignments?id=${encodeURIComponent(y10ReadingAssignment.id)}`);
    const y10AssignmentPayload = await y10AssignmentRes.json();
    expect(y10AssignmentRes.ok()).toBe(true);
    expect(String(y10AssignmentPayload.href ?? "")).toContain(`/games/reading?assignmentId=${y10ReadingAssignment.id}`);

    await page.request.post("/api/children/active", { data: { childId: STUDENT_Y11_ID } });

    await page.goto(`/games/reading?assignmentId=${encodeURIComponent(literatureAssignment.id)}&contentId=${encodeURIComponent(literatureContent.id)}&mode=literature`);
    await expect(page).toHaveURL(new RegExp(`assignmentId=${literatureAssignment.id}`));
    await expect(page.getByText("Reading level")).toBeVisible();
    await expect(page.getByText("Macbeth's ambition")).toBeVisible();
    await expect(page.getByText("Mia has a red kite")).toHaveCount(0);

    await page.goto("/games/reading?assignmentId=missing-assignment-id");
    await expect(page.getByText("Assigned content could not be loaded")).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to dashboard" })).toBeVisible();
  });

  test("Science generation/save and weak-area subject preservation", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const scienceScenarios = [
      { yearGroup: "Year 10", skillFocus: "Biology", topic: "Cell division and growth" },
      { yearGroup: "Year 10", skillFocus: "Chemistry", topic: "Rates of reaction" },
      { yearGroup: "Year 11", skillFocus: "Physics", topic: "Forces and motion" },
    ];

    for (const scenario of scienceScenarios) {
      const generateResponse = await page.request.post("/api/admin/ai/generate", {
        data: {
          subject: "science",
          keyStage: "KS4",
          yearGroup: scenario.yearGroup,
          curriculumPathway: "GCSE",
          examBoard: "AQA",
          skillFocus: scenario.skillFocus,
          ageGroup: "14-16",
          difficulty: 4,
          numberOfItems: 2,
          topic: scenario.topic,
        },
      });

      const generatePayload = await generateResponse.json();

      let generatedItems: unknown[];
      if (generateResponse.ok()) {
        expect(generatePayload.content?.subject).toBe("science");
        generatedItems = Array.isArray(generatePayload.content?.items) ? generatePayload.content.items : [];
        expect(generatedItems.length).toBeGreaterThan(0);
        const metadataDebug = generatePayload.meta?.metadataDebug;
        expect(metadataDebug?.requestedMetadata?.yearGroup).toBe(scenario.yearGroup);
        expect(metadataDebug?.normalizedMetadata?.yearGroup).toBe(scenario.yearGroup);
        expect(metadataDebug?.requestedMetadata?.subject).toBe("science");
      } else {
        // Fallback path for environments without AI key: still validate save-path normalization and subject integrity.
        generatedItems = [
          {
            id: `fallback-${scenario.skillFocus.toLowerCase()}`,
            question: "Explain the concept in one sentence.",
            answer: "Model answer",
            options: ["A", "B", "C", "D"],
            yearGroup: "Year 5",
            subject: "maths",
          },
        ];
      }

      const saveResponse = await page.request.post("/api/admin/content-library", {
        data: {
          type: "science",
          generationType: "science",
          ageGroup: "14-16",
          keyStage: "KS4",
          yearGroup: scenario.yearGroup,
          curriculumPathway: "GCSE",
          examBoard: "AQA",
          skillFocus: scenario.skillFocus,
          difficulty: 4,
          topic: scenario.topic,
          itemSchema: "science",
          status: "review",
          items: {
            subject: "science",
            keyStage: "KS4",
            yearGroup: scenario.yearGroup,
            skillFocus: scenario.skillFocus,
            difficulty: 4,
            topic: scenario.topic,
            items: generatedItems,
          },
          model: "e2e",
          prompt: "e2e",
        },
      });
      expect(saveResponse.ok()).toBe(true);
      const savedPayload = await saveResponse.json();

      const saved = await prisma.aIContentCache.findUnique({ where: { id: savedPayload.item.id } });
      expect(saved?.contentType).toBe("science");
      const metadata = JSON.parse(saved?.metadataJson ?? "{}");
      expect(metadata.subject).toBe("science");
      expect(metadata.yearGroup).toBe(scenario.yearGroup);

      const contentItems = JSON.parse(saved?.contentJson ?? "[]");
      expect(contentItems[0]?.subject).toBe("science");
      expect(contentItems[0]?.yearGroup).toBe(scenario.yearGroup);
    }

    await prisma.weakArea.createMany({
      data: [
        { studentId: STUDENT_Y11_ID, subject: "english-language", keyStage: "KS4", yearGroup: "Year 11", skillFocus: "inference", weaknessType: "accuracy", accuracy: 46, attemptsCount: 8, currentDifficulty: 4, status: "active" },
        { studentId: STUDENT_Y11_ID, subject: "maths", keyStage: "KS4", yearGroup: "Year 11", skillFocus: "algebra", weaknessType: "accuracy", accuracy: 42, attemptsCount: 9, currentDifficulty: 4, status: "active" },
        { studentId: STUDENT_Y11_ID, subject: "science", keyStage: "KS4", yearGroup: "Year 11", skillFocus: "physics", weaknessType: "accuracy", accuracy: 38, attemptsCount: 10, currentDifficulty: 4, status: "active" },
      ],
    });

    const weakRes = await page.request.get("/api/admin/weak-areas?keyStage=KS4&yearGroup=Year%2011");
    expect(weakRes.ok()).toBe(true);
    const weakPayload = await weakRes.json();
    const subjects = new Set((weakPayload.weakAreas ?? []).map((entry: { subject: string }) => entry.subject));
    expect(subjects.has("english-language")).toBe(true);
    expect(subjects.has("maths")).toBe(true);
    expect(subjects.has("science")).toBe(true);
  });

  test("Parent plan override updates limits and writes audit log", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const planFlow = ["free", "starter", "standard", "pro"];
    const childLimits: number[] = [];

    for (const planKey of planFlow) {
      const patch = await page.request.patch("/api/admin/subscriptions", {
        data: {
          parentId: seeded.parentId,
          action: "change_plan",
          planKey,
          status: "active",
        },
      });
      expect(patch.ok()).toBe(true);

      const parentPage = await page.context().newPage();
      await loginAs(parentPage, PARENT_EMAIL, PARENT_PASSWORD);

      const subscriptionRes = await parentPage.request.get("/api/subscription");
      expect(subscriptionRes.ok()).toBe(true);
      const subscriptionPayload = await subscriptionRes.json();
      const childLimit = Number(subscriptionPayload.subscription?.childLimit ?? 0);
      childLimits.push(childLimit);
      expect(childLimit).toBeGreaterThan(0);

      const accountRes = await parentPage.request.get("/api/account");
      expect(accountRes.ok()).toBe(true);
      const accountPayload = await accountRes.json();
      expect(Number(accountPayload.account?.childLimit ?? 0)).toBe(childLimit);

      if (planKey === "free") {
        expect(subscriptionPayload.subscription?.upgradeRequired).toBe(true);
      }

      await parentPage.close();
    }

    expect(childLimits[0]).toBeLessThanOrEqual(childLimits[1]);
    expect(childLimits[1]).toBeLessThanOrEqual(childLimits[2]);
    expect(childLimits[2]).toBeLessThanOrEqual(childLimits[3]);

    const logs = await prisma.auditLog.findMany({
      where: {
        action: "admin.subscription.override",
        actorUserId: seeded.adminId,
        metadataJson: { contains: seeded.parentId },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    });
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });
});
