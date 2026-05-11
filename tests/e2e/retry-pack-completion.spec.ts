import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const E2E_PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? "e2e.parent+retry-pack@starliz.local";
const E2E_PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "PlaywrightRetry#2026";
const E2E_CHILD_ID = "e2e-retry-pack-child";
const E2E_CHILD_NAME = "E2E Retry Child";

async function seedParentAndChild(): Promise<void> {
  const passwordHash = await bcrypt.hash(E2E_PARENT_PASSWORD, 12);
  const parent = await prisma.user.upsert({
    where: { email: E2E_PARENT_EMAIL },
    update: {
      passwordHash,
      role: "parent",
      name: "E2E Retry Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
    },
    create: {
      email: E2E_PARENT_EMAIL,
      passwordHash,
      role: "parent",
      name: "E2E Retry Parent",
      trialSessionsUsed: 0,
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.subscription.deleteMany({
    where: { parentId: parent.id, providerSubId: "e2e-retry-pack" },
  });
  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-retry-pack",
      planKey: "yearly",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: E2E_CHILD_ID },
    update: {
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      archived: false,
      age: 7,
      yearGroup: "Year 2",
    },
    create: {
      id: E2E_CHILD_ID,
      parentId: parent.id,
      name: E2E_CHILD_NAME,
      avatar: "star",
      age: 7,
      yearGroup: "Year 2",
    },
  });
}

async function cleanupParentAndChild(): Promise<void> {
  await prisma.attempt.deleteMany({ where: { studentId: E2E_CHILD_ID } });
  await prisma.assignment.deleteMany({ where: { studentId: E2E_CHILD_ID } });
  await prisma.childProfile.deleteMany({ where: { id: E2E_CHILD_ID } });
  await prisma.subscription.deleteMany({ where: { providerSubId: "e2e-retry-pack" } });
}

async function seedClientProfileState(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(({ id, name }) => {
    const profiles = JSON.stringify([
      {
        id,
        name,
        avatar: "🦊",
        ageRange: "5-7",
        adaptive: {
          spellingDifficulty: 2,
          mathDifficulty: 2,
          readingDifficulty: 2,
        },
      },
    ]);

    const profileKeys = ["starliz.profiles", "starliz.childProfiles", "childProfiles"];
    const activeKeys = ["starliz.activeProfileId", "activeChildId", "activeProfileId"];
    for (const key of profileKeys) window.localStorage.setItem(key, profiles);
    for (const key of activeKeys) window.localStorage.setItem(key, id);
  }, { id: E2E_CHILD_ID, name: E2E_CHILD_NAME });
}

function computeAnswerFromPrompt(prompt: string): number | null {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*([+\-xX×*/÷])\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[3]);
  const op = match[2];
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  if (op === "+") return left + right;
  if (op === "-") return left - right;
  if (op === "x" || op === "X" || op === "×" || op === "*") return left * right;
  if (right === 0) return null;
  return left / right;
}

test.describe("Retry Pack Completion", () => {
  test.beforeAll(async () => {
    await cleanupParentAndChild();
    await seedParentAndChild();
  });

  test.afterAll(async () => {
    await cleanupParentAndChild();
    await prisma.$disconnect();
  });

  test("completes retry pack without continuing old session questions", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: {
        email: E2E_PARENT_EMAIL,
        password: E2E_PARENT_PASSWORD,
      },
    });
    expect(login.ok()).toBe(true);

    await expect.poll(async () => {
      const response = await page.request.get("/api/auth/me");
      return response.status();
    }, { timeout: 20_000 }).toBe(200);

    const activateChild = await page.request.post("/api/children/active", {
      data: { childId: E2E_CHILD_ID },
    });
    expect(activateChild.ok()).toBe(true);
    await seedClientProfileState(page);

    const consentCheck = await page.request.get("/api/consent");
    const consentPayload = (await consentCheck.json()) as { accepted?: boolean };
    if (!consentPayload.accepted) {
      await page.request.post("/api/consent", { data: { accepted: true, version: "1.0" } });
    }

    await page.goto("/games/math");
    await expect(page.getByPlaceholder("Type the answer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check Answer" })).toBeVisible();

    // Force one weak-item entry by getting the first question wrong 3 times.
    for (let i = 0; i < 3; i += 1) {
      await page.getByPlaceholder("Type the answer").fill("-999");
      await page.getByRole("button", { name: "Check Answer" }).click();
    }

    // Finish the rest of the base session quickly.
    for (let i = 0; i < 12; i += 1) {
      const completion = page.getByText("Session complete.", { exact: true });
      if (await completion.isVisible()) break;
      await page.getByRole("button", { name: "Try Another" }).click();
    }

    await expect(page.getByText("Session complete.", { exact: true })).toBeVisible();

    const retryButton = page.getByRole("button", { name: /Retry Weak Pack \([1-9]\d*\)/i });
    await expect(retryButton).toBeVisible();
    await retryButton.click();

    await expect(page.getByText(/Question 1 of 1/i)).toBeVisible();

    const prompt = (await page.locator("h2").filter({ hasText: /\d/ }).first().textContent()) ?? "";
    const answer = computeAnswerFromPrompt(prompt);
    if (answer === null) {
      // Fallback path for non-arithmetic prompts.
      await page.getByPlaceholder("Type the answer").fill("0");
    } else {
      await page.getByPlaceholder("Type the answer").fill(String(answer));
    }
    await page.getByRole("button", { name: "Check Answer" }).click();

    // After answering, advanceSession completes the retry pack when retryQueueIds is empty.
    // If the answer was wrong the user must click "Try Another" to trigger advanceSession.
    for (let i = 0; i < 5; i += 1) {
      const completion = page.getByText("Session complete.", { exact: true });
      if (await completion.isVisible()) break;
      const tryAnother = page.getByRole("button", { name: "Try Another" });
      if (await tryAnother.isEnabled()) await tryAnother.click();
      await page.waitForTimeout(800);
    }

    await expect(page.getByText("Session complete.", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Try Another" })).toBeDisabled();
    await expect(page.getByText(/Question 2 of 1/i)).toHaveCount(0);
  });
});
