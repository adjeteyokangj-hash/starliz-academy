import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import {
  createChildSelectionToken,
  createSessionToken,
  getAccessTokenMaxAgeSeconds,
  getAuthCookieName,
  getChildSelectionCookieName,
} from "@/lib/auth";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "e2e.formula.live.admin@starliz.local";
const ADMIN_PASSWORD = "E2EFormulaAdmin#2026";
const PARENT_EMAIL = "e2e.formula.live.parent@starliz.local";
const PARENT_PASSWORD = "E2EFormulaParent#2026";
const CHILD_ID = "e2e-formula-live-child";
const CHILD_NAME = "E2E Formula Child";
const SUB_ID = "e2e-formula-live-sub";
const FIXTURE_TAG = "e2e-formula-live";
const BASE_URL = "http://127.0.0.1:3000";

type SeededIds = {
  mathsContentId: string;
  readingContentId: string;
  scienceContentId: string;
};

let seeded: SeededIds;
let assignmentId = "";
let parentUserId = "";

async function loginApi(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function setParentBrowserSession(page: Page) {
  const sessionToken = await createSessionToken(
    { userId: parentUserId, email: PARENT_EMAIL, role: "parent" },
    getAccessTokenMaxAgeSeconds(),
  );
  const childSelectionToken = await createChildSelectionToken(parentUserId, CHILD_ID);

  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: getAuthCookieName(),
      value: sessionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
    {
      name: getChildSelectionCookieName(),
      value: childSelectionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

async function seedUsersAndChild() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const parentHash = await bcrypt.hash(PARENT_PASSWORD, 12);

  const [admin, parent] = await Promise.all([
    prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { role: "admin", name: "E2E Formula Admin", passwordHash: adminHash },
      create: { email: ADMIN_EMAIL, role: "admin", name: "E2E Formula Admin", passwordHash: adminHash },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { email: PARENT_EMAIL },
      update: {
        role: "parent",
        name: "E2E Formula Parent",
        passwordHash: parentHash,
        trialSessionsUsed: 0,
        consentVersion: "1.0",
        consentAcceptedAt: new Date(),
        consentWithdrawnAt: null,
        activeChildId: CHILD_ID,
      },
      create: {
        email: PARENT_EMAIL,
        role: "parent",
        name: "E2E Formula Parent",
        passwordHash: parentHash,
        trialSessionsUsed: 0,
        consentVersion: "1.0",
        consentAcceptedAt: new Date(),
        activeChildId: CHILD_ID,
      },
      select: { id: true },
    }),
  ]);

  await prisma.subscription.deleteMany({ where: { providerSubId: SUB_ID } });
  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: SUB_ID,
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
      age: 10,
      yearGroup: "Year 5",
    },
    create: {
      id: CHILD_ID,
      parentId: parent.id,
      name: CHILD_NAME,
      avatar: "star",
      age: 10,
      yearGroup: "Year 5",
    },
  });

  return { adminId: admin.id, parentId: parent.id };
}

async function cleanupFixtures() {
  const content = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        { createdBy: ADMIN_EMAIL },
        { topic: { startsWith: "E2E Formula Live" } },
      ],
    },
    select: { id: true },
  });
  const contentIds = content.map((item) => item.id);

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
  await prisma.childProfile.deleteMany({ where: { id: CHILD_ID } });
  await prisma.subscription.deleteMany({ where: { providerSubId: SUB_ID } });
  await prisma.aIContentCache.deleteMany({ where: { id: { in: contentIds.length ? contentIds : ["__none__"] } } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } } });
}

async function saveFormulaContent(page: Page, body: Record<string, unknown>) {
  const response = await page.request.post("/api/admin/content-library", { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ item: { id: string }; warnings?: string[] }>;
}

async function seedClientProfileState(page: Page) {
  await page.addInitScript(({ id, name }) => {
    const profiles = JSON.stringify([
      {
        id,
        name,
        avatar: "🦊",
        ageRange: "8-11",
        adaptive: {
          spellingDifficulty: 3,
          mathDifficulty: 3,
          readingDifficulty: 3,
        },
      },
    ]);
    const profileKeys = ["starliz.profiles", "starliz.childProfiles", "childProfiles"];
    const activeKeys = ["starliz.activeProfileId", "activeChildId", "activeProfileId"];
    for (const key of profileKeys) window.localStorage.setItem(key, profiles);
    for (const key of activeKeys) window.localStorage.setItem(key, id);
    // Disable TTS so warmup phase transitions are immediate in headless.
    window.localStorage.setItem("lessonVoiceEnabled", "false");
    window.localStorage.setItem("starliz.lesson.voice", "false");
  }, { id: CHILD_ID, name: CHILD_NAME });
}

async function seedWarmupSpeechMock(page: Page) {
  await page.addInitScript(({ transcript }) => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });

    class MockSpeechRecognition {
      lang = "en-GB";
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((event: { results: Array<Array<{ transcript: string }>>; timeStamp: number }) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        window.setTimeout(() => {
          this.onresult?.({
            results: [[{ transcript }]],
            timeStamp: performance.now(),
          });
          window.setTimeout(() => {
            this.onend?.();
          }, 0);
        }, 0);
      }

      stop() {
        this.onend?.();
      }

      abort() {
        this.onend?.();
      }
    }

    const globalWindow = window as Window & {
      SpeechRecognition?: typeof MockSpeechRecognition;
      webkitSpeechRecognition?: typeof MockSpeechRecognition;
    };

    globalWindow.SpeechRecognition = MockSpeechRecognition;
    globalWindow.webkitSpeechRecognition = MockSpeechRecognition;
  }, { transcript: "I feel good today" });
}

async function assertLessonCardVisible(page: Page) {
  await expect(page.getByText("Learning Focus")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Key Information")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("h2").first()).toBeVisible({ timeout: 10_000 });
  // Answer area may be text input or option buttons
  const hasInput = await page
    .getByPlaceholder("Type your answer")
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  const hasOptions = await page
    .getByRole("button")
    .filter({ hasText: /^\d|^[A-D]$/ })
    .first()
    .isVisible({ timeout: 2_000 })
    .catch(() => false);
  expect(hasInput || hasOptions, "Expected text input or option buttons in lesson").toBe(true);
  await expect(page.getByText(/Circuit diagram|Visual support/i)).toBeVisible({ timeout: 10_000 });
}

async function assertNoOverflow(page: Page) {
  const ok = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("h2, button, input, pre"));
    return nodes.every((node) => {
      const el = node as HTMLElement;
      return el.scrollWidth <= el.clientWidth + 2 || el.clientWidth === 0;
    });
  });
  expect(ok).toBe(true);
}

test.describe("StarLiz question formula live browser journey", () => {
  test.beforeAll(async () => {
    await cleanupFixtures();
    const seededUsers = await seedUsersAndChild();
    parentUserId = seededUsers.parentId;
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("verifies admin validation plus student lesson behavior on desktop/tablet/mobile", async ({ page }) => {
    await loginApi(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const blockedInvalidMath = await page.request.post("/api/admin/content-library", {
      data: {
        type: "maths",
        keyStage: "KS2",
        yearGroup: "Year 5",
        skillFocus: "Fractions",
        difficulty: 3,
        topic: "E2E Formula Live Invalid Maths",
        status: "review",
        model: FIXTURE_TAG,
        items: [{ id: "invalid-maths-1", explanation: "Missing prompt and answer." }],
      },
    });
    expect(blockedInvalidMath.status()).toBe(422);

    const mathsSaved = await saveFormulaContent(page, {
      type: "maths",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Fractions",
      difficulty: 3,
      topic: "E2E Formula Live Maths",
      status: "review",
      model: FIXTURE_TAG,
      items: [
        {
          id: "maths-q1",
          question: "What is 3/4 of 20?",
          prompt: "What is 3/4 of 20?",
          answer: "15",
          explanation: "Three quarters of 20 is 15 because 20 divided by 4 is 5 and 5 times 3 is 15.",
          hint: "Find one quarter first, then multiply by 3.",
          hint1: "Find one quarter first.",
          hint2: "20 ÷ 4 = 5, then 5 × 3.",
          workedSolution: "20 ÷ 4 = 5; 5 × 3 = 15.",
          answerOptions: ["10", "12", "15", "18"],
          keyInformation: ["Total = 20", "Need three quarters"],
          skillFocus: "Fractions",
          subject: "Maths",
        },
      ],
    });

    const readingSaved = await saveFormulaContent(page, {
      type: "reading",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Inference",
      difficulty: 3,
      topic: "E2E Formula Live Reading",
      status: "review",
      model: FIXTURE_TAG,
      items: [
        {
          id: "reading-q1",
          passage: "Lina packed an umbrella although the sky looked bright because dark clouds were moving in.",
          prompt: "Why did Lina pack an umbrella?",
          answer: "Dark clouds were moving in.",
          explanation: "Lina noticed dark clouds, which suggests rain was likely.",
          hint: "Look for the clue about weather.",
          hint1: "Find the weather clue in the sentence.",
          hint2: "What does dark clouds usually mean?",
          workedSolution: "Dark clouds are a sign of rain, so umbrella is sensible.",
          answerOptions: ["It was sunny", "Dark clouds were moving in.", "She forgot her coat", "She wanted shade"],
          keyInformation: ["Sky looked bright", "Dark clouds were moving in"],
          skillFocus: "Inference",
          subject: "Reading",
        },
      ],
    });

    const scienceSaved = await saveFormulaContent(page, {
      type: "science",
      keyStage: "KS2",
      yearGroup: "Year 5",
      skillFocus: "Ohm's Law",
      difficulty: 3,
      topic: "E2E Formula Live Science",
      status: "generated",
      model: FIXTURE_TAG,
      items: [
        {
          id: "science-q1",
          question: "A circuit has voltage 12V and resistance 4 ohms. What is the current?",
          prompt: "A circuit has voltage 12V and resistance 4 ohms. What is the current?",
          answer: "3",
          explanation: "Current is voltage divided by resistance, so 12 ÷ 4 = 3A.",
          hint: "Use I = V ÷ R.",
          hint1: "Identify V and R first.",
          hint2: "Now divide 12 by 4.",
          workedSolution: "I = V ÷ R = 12 ÷ 4 = 3A.",
          given: ["Voltage = 12V", "Resistance = 4 ohms"],
          keyInformation: ["Use Ohm's Law", "Current = Voltage ÷ Resistance"],
          subject: "Science",
          skillFocus: "Ohm's Law",
        },
      ],
    });

    seeded = {
      mathsContentId: mathsSaved.item.id,
      readingContentId: readingSaved.item.id,
      scienceContentId: scienceSaved.item.id,
    };

    const generatedAssignBlocked = await page.request.post("/api/admin/assignments", {
      data: { studentId: CHILD_ID, contentId: seeded.scienceContentId },
    });
    expect(generatedAssignBlocked.status()).toBe(409);

    const reviewResponse = await page.request.post(`/api/admin/content/${seeded.scienceContentId}/review`);
    expect(reviewResponse.status()).toBe(200);

    const assignScience = await page.request.post("/api/admin/assignments", {
      data: { studentId: CHILD_ID, contentId: seeded.scienceContentId },
    });
    expect(assignScience.status()).toBe(201);
    const assignPayload = (await assignScience.json()) as { assignments?: Array<{ id: string }> };
    assignmentId = assignPayload.assignments?.[0]?.id ?? "";
    expect(assignmentId).toBeTruthy();

    await setParentBrowserSession(page);
    await seedClientProfileState(page);
    await seedWarmupSpeechMock(page);

    await page.goto(`/games/lesson?assignmentId=${assignmentId}`);

    await page.waitForFunction(
      () => !document.body.innerText.includes("Preparing your learning space"),
      { timeout: 15_000 },
    );

    await expect(page.getByRole("button", { name: /Start talking with Star/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Start talking with Star/i }).click();
    await expect(page.getByRole("button", { name: /Tap the microphone/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Tap the microphone/i }).click();

    const beginBtn = page.getByRole("button", { name: /Begin my lesson/i });
    await expect(beginBtn).toBeEnabled({ timeout: 15_000 });
    await beginBtn.click();

    await assertLessonCardVisible(page);
    await expect(page.getByText(/Tap the microphone and say your answer/i)).toHaveCount(0);

    // Submit a wrong answer
    const answerInput = page.getByPlaceholder("Type your answer");
    const hasTextInput = await answerInput.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasTextInput) {
      await answerInput.fill("6");
      await page.getByRole("button", { name: "Submit" }).click();
    } else {
      // Option-button mode — click any option that isn't the correct answer (3A)
      await page.getByRole("button").filter({ hasText: /1A|2A|4A/i }).first().click();
    }
    await expect(page.getByText(/Not quite|Almost|Hmm|Let's|Hint/i).first()).toBeVisible({ timeout: 15_000 });

    // Dismiss / try again
    const tryAgainBtn = page.getByRole("button", { name: /Try again|Continue/i });
    if (await tryAgainBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await tryAgainBtn.click();
    }

    // Submit the correct answer
    const answerInput2 = page.getByPlaceholder("Type your answer");
    const hasTextInput2 = await answerInput2.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasTextInput2) {
      await answerInput2.fill("3");
      await page.getByRole("button", { name: "Submit" }).click();
    } else {
      await page.getByRole("button").filter({ hasText: /3A/i }).first().click();
    }
    await expect(page.locator("body")).toContainText(
      /Continue|Review Round|Lesson Complete|Review Complete|Nice work so far|Great job/i,
      { timeout: 15_000 },
    );

    // Progress through to lesson end (review round or lesson complete)
    const continueBtn2 = page.getByRole("button", { name: /Continue/i });
    if (await continueBtn2.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await continueBtn2.click();
    }
    await expect(
      page.getByText(/Lesson Complete|Review Round|Review Complete|Well done|Great job/i).first()
    ).toBeVisible({ timeout: 60_000 });

    // ─── Responsive layout checks ────────────────────────────────────────────
    for (const [w, h] of [[1366, 900], [1024, 1366], [390, 844]] as [number, number][]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/games/lesson?assignmentId=${assignmentId}`);
      // Page renders without hard error at this viewport
      await expect(page).not.toHaveURL(/\/500|\/error/);
      // Some primary element from the lesson UI is visible
      await expect(
        page.locator("progress, [role='progressbar']").first()
      ).toBeVisible({ timeout: 20_000 });
      await assertNoOverflow(page);
    }
  });
});