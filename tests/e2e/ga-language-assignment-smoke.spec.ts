import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  createChildSelectionToken,
  createSessionToken,
  getAccessTokenMaxAgeSeconds,
  getAuthCookieName,
  getChildSelectionCookieName,
} from "@/lib/auth";

const prisma = new PrismaClient();

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = "e2e.ga.smoke.admin@starliz.local";
const ADMIN_PASSWORD = "E2E-Ga-Smoke-Admin-2026!";
const PARENT_EMAIL = "e2e.ga.smoke.parent@starliz.local";
const PARENT_PASSWORD = "E2E-Ga-Smoke-Parent-2026!";
const CHILD_ID = "e2e-ga-smoke-child";
const CHILD_NAME = "E2E Ga Smoke Child";
const SUBSCRIPTION_PROVIDER_ID = "e2e-ga-smoke-sub";
const LESSON_SLUG = "e2e-ga-smoke-assignment-lesson";
const LESSON_TITLE = "E2E Ga Smoke Assignment Lesson";

let adminUserId = "";
let parentUserId = "";
let lessonId = "";
let materialisedContentId = "";

async function setSessionCookies(context: BrowserContext, input: { userId: string; email: string; role: "admin" | "parent"; childId?: string }) {
  const sessionToken = await createSessionToken(
    { userId: input.userId, email: input.email, role: input.role },
    getAccessTokenMaxAgeSeconds(),
  );
  const cookies = [
    {
      name: getAuthCookieName(),
      value: sessionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax" as const,
      secure: false,
    },
  ];

  if (input.role === "parent" && input.childId) {
    const childSelectionToken = await createChildSelectionToken(input.userId, input.childId);
    cookies.push({
      name: getChildSelectionCookieName(),
      value: childSelectionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax" as const,
      secure: false,
    });
  }

  await context.clearCookies();
  await context.addCookies(cookies);
}

async function seedFixtures() {
  const [adminHash, parentHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 12),
    bcrypt.hash(PARENT_PASSWORD, 12),
  ]);

  const [admin, parent] = await Promise.all([
    prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { role: "admin", name: "E2E Ga Smoke Admin", passwordHash: adminHash },
      create: { email: ADMIN_EMAIL, role: "admin", name: "E2E Ga Smoke Admin", passwordHash: adminHash },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { email: PARENT_EMAIL },
      update: {
        role: "parent",
        name: "E2E Ga Smoke Parent",
        passwordHash: parentHash,
        activeChildId: CHILD_ID,
        consentVersion: "1.0",
        consentAcceptedAt: new Date(),
        consentWithdrawnAt: null,
      },
      create: {
        email: PARENT_EMAIL,
        role: "parent",
        name: "E2E Ga Smoke Parent",
        passwordHash: parentHash,
        activeChildId: CHILD_ID,
        consentVersion: "1.0",
        consentAcceptedAt: new Date(),
        consentWithdrawnAt: null,
      },
      select: { id: true },
    }),
  ]);

  adminUserId = admin.id;
  parentUserId = parent.id;

  await prisma.subscription.deleteMany({ where: { providerSubId: SUBSCRIPTION_PROVIDER_ID } });
  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: SUBSCRIPTION_PROVIDER_ID,
      planKey: "yearly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: CHILD_ID },
    update: {
      parentId: parent.id,
      name: CHILD_NAME,
      archived: false,
      yearGroup: "Year 5",
      age: 10,
    },
    create: {
      id: CHILD_ID,
      parentId: parent.id,
      name: CHILD_NAME,
      yearGroup: "Year 5",
      age: 10,
      archived: false,
    },
  });

  const lesson = await prisma.gaLesson.upsert({
    where: { slug: LESSON_SLUG },
    update: {
      title: LESSON_TITLE,
      level: "Foundation",
      category: "Grammar",
      objective: "E2E smoke objective",
      publishStatus: "Published",
      lessonOrder: 901,
    },
    create: {
      title: LESSON_TITLE,
      slug: LESSON_SLUG,
      level: "Foundation",
      category: "Grammar",
      objective: "E2E smoke objective",
      publishStatus: "Published",
      packKey: "e2e-ga-smoke",
      lessonOrder: 901,
    },
    select: { id: true },
  });

  lessonId = lesson.id;

  await prisma.assignment.deleteMany({ where: { studentId: CHILD_ID } });
  await prisma.aIContentCache.deleteMany({ where: { skillFocus: `ga_lesson:${lesson.id}` } });
}

async function cleanupFixtures() {
  await prisma.assignment.deleteMany({ where: { studentId: CHILD_ID } });
  await prisma.aIContentCache.deleteMany({ where: { skillFocus: `ga_lesson:${lessonId}` } });
  await prisma.gaLesson.deleteMany({ where: { slug: LESSON_SLUG } });
  await prisma.childProfile.deleteMany({ where: { id: CHILD_ID } });
  await prisma.subscription.deleteMany({ where: { providerSubId: SUBSCRIPTION_PROVIDER_ID } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } } });
}

async function materialiseAndAssignViaApi(page: Page) {
  const materialise = await page.request.post(`/api/admin/ga/lessons/${lessonId}/assignment-content`);
  expect(materialise.ok()).toBeTruthy();
  const materialiseBody = await materialise.json() as { contentId: string };
  materialisedContentId = materialiseBody.contentId;

  const assign = await page.request.post("/api/admin/assignments", {
    data: {
      contentId: materialisedContentId,
      studentIds: [CHILD_ID],
    },
  });
  expect(assign.ok()).toBeTruthy();
  const assignment = await prisma.assignment.findFirst({
    where: { studentId: CHILD_ID, contentId: materialisedContentId },
    select: { id: true, status: true },
  });
  expect(assignment?.status).toBe("assigned");
}

test.describe("Focused smoke: dashboard language card + admin ga assign row", () => {
  test.beforeAll(async () => {
    await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("student dashboard language module visibility and route link", async ({ page, context }) => {
    await setSessionCookies(context, {
      userId: parentUserId,
      email: PARENT_EMAIL,
      role: "parent",
      childId: CHILD_ID,
    });

    await page.goto("/student/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Language Adventure", { exact: true })).toHaveCount(0);

    await setSessionCookies(context, {
      userId: adminUserId,
      email: ADMIN_EMAIL,
      role: "admin",
    });
    await materialiseAndAssignViaApi(page);

    await setSessionCookies(context, {
      userId: parentUserId,
      email: PARENT_EMAIL,
      role: "parent",
      childId: CHILD_ID,
    });

    const summaryResponse = await page.request.get("/api/student/dashboard-summary");
    expect(summaryResponse.ok()).toBeTruthy();
    const summaryPayload = await summaryResponse.json() as { activeLanguageModules?: Array<{ id: string }> };
    expect(summaryPayload.activeLanguageModules?.some((module) => module.id === "ga-learning-hub")).toBeTruthy();

    await page.goto("/student/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Language Adventure/i)).toBeVisible();

    const openModuleLink = page.getByRole("link", { name: /Open Ga Learning Hub/i });
    await expect(openModuleLink).toBeVisible();
    await openModuleLink.click();
    await expect(page).toHaveURL(/\/ga-learning-hub/);
  });

  test("admin ga lessons row assign: drawer open, student selection, materialisation and duplicate-safe handling", async ({ page, context }) => {
    await prisma.assignment.deleteMany({ where: { studentId: CHILD_ID } });
    await prisma.aIContentCache.deleteMany({ where: { skillFocus: `ga_lesson:${lessonId}` } });

    await setSessionCookies(context, {
      userId: adminUserId,
      email: ADMIN_EMAIL,
      role: "admin",
    });

    await page.goto("/admin/ga-lessons", { waitUntil: "domcontentloaded" });

    // Wait for the students API to resolve before any interaction — the Assign button
    // is disabled while students === [] and only becomes enabled once this response settles.
    const studentsResponse = await page.waitForResponse((response) => (
      response.url().includes("/api/admin/students?context=assignment")
      && response.request().method() === "GET"
    ));
    const studentsPayload = await studentsResponse.json() as { students?: Array<{ id: string }> };
    expect(studentsPayload.students?.some((student) => student.id === CHILD_ID)).toBeTruthy();

    // Locate the exact lesson row by title inside main content only.
    const lessonRow = page.locator("main").locator("tr", { hasText: LESSON_TITLE }).first();
    await expect(lessonRow).toBeVisible();

    // Wait until the Assign button within this row is enabled — it is disabled while
    // `students.length === 0` (guard in ga-lessons/page.tsx).
    const assignButton = lessonRow.getByRole("button", { name: /^Assign$/ });
    await expect(assignButton).toBeEnabled({ timeout: 5000 });

    // Open the assign drawer.
    await assignButton.click();

    // Confirm the drawer is open using correct text anchors.
    // The drawer search label reads "Search students" — NOT "Select students".
    await expect(page.getByText("Assign Ga lesson")).toBeVisible();
    await expect(page.getByText("Search students")).toBeVisible();

    // Confirm the student table with checkboxes is rendered.
    const studentCheckbox = page.getByRole("checkbox", { name: new RegExp(`Select ${CHILD_NAME}`, "i") });
    await expect(studentCheckbox).toBeVisible();

    // Screenshot the open drawer — taken while the drawer is confirmed open.
    await page.screenshot({
      path: "tests/fixtures/smoke-ga-lessons-assign-drawer.png",
      fullPage: false,
    });

    // Select the smoke-test student.
    await studentCheckbox.check();
    await expect(page.getByText("1 student", { exact: true })).toBeVisible();

    // Submit — capture the assignment-content API response to get the stable contentId.
    const submitButton = page.getByRole("button", { name: /Assign to 1 student/ });
    await expect(submitButton).toBeEnabled();

    const [materialiseResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/assignment-content") && resp.request().method() === "POST",
        { timeout: 10000 },
      ),
      submitButton.click(),
    ]);
    const materialisePayload = await materialiseResponse.json() as { contentId?: string };
    expect(materialisePayload.contentId).toBeTruthy();
    const contentId = materialisePayload.contentId as string;

    // Confirm success message.
    await expect(page.getByText(new RegExp(`Assigned.*${LESSON_TITLE}.*1 student`, "i"))).toBeVisible({ timeout: 10000 });

    // Verify the content record was materialised with the correct type, using the
    // ID returned directly by the API (avoids any skillFocus string-matching ambiguity).
    const createdContent = await prisma.aIContentCache.findUnique({
      where: { id: contentId },
      select: { id: true, contentType: true },
    });
    expect(createdContent?.contentType).toBe("ga");

    // Re-open the drawer and try to assign again — should report duplicate.
    await expect(assignButton).toBeEnabled({ timeout: 8000 });
    await assignButton.click();
    await expect(page.getByText("Assign Ga lesson")).toBeVisible();
    const checkboxAgain = page.getByRole("checkbox", { name: new RegExp(`Select ${CHILD_NAME}`, "i") });
    await checkboxAgain.check();
    const submitAgain = page.getByRole("button", { name: /Assign to 1 student/ });
    await submitAgain.click();
    await expect(page.getByText(/already assigned/i)).toBeVisible({ timeout: 10000 });

    // Confirm no duplicate assignment row was created.
    const duplicateAssignments = await prisma.assignment.count({
      where: { studentId: CHILD_ID, contentId },
    });
    expect(duplicateAssignments).toBe(1);
  });
});
