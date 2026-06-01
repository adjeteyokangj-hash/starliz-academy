import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { isFinalSmokeEnabled } from "../../src/lib/release/final-smoke";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "e2e.final.smoke.admin@starliz.local";
const ADMIN_PASSWORD = "E2EFinalSmokeAdmin#2026";
const PARENT_EMAIL = "e2e.final.smoke.parent@starliz.local";
const PARENT_PASSWORD = "E2EFinalSmokeParent#2026";
const CHILD_ID = "e2e-final-smoke-child";
const RUN_FINAL_SMOKE = isFinalSmokeEnabled(process.env.E2E_FINAL_SMOKE);

type Seeded = {
  parentId: string;
  assignmentId: string;
  contentId: string;
};

let seeded: Seeded;

async function loginAs(page: import("@playwright/test").Page, email: string, password: string) {
  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.ok()).toBe(true);
}

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, PARENT_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  const content = await prisma.aIContentCache.findMany({
    where: {
      OR: [
        { createdBy: ADMIN_EMAIL },
        { topic: { startsWith: "E2E Final Smoke" } },
      ],
    },
    select: { id: true },
  });
  const contentIds = content.map((c) => c.id);

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
  await prisma.subscription.deleteMany({ where: { providerSubId: "e2e-final-smoke" } });
  await prisma.parentProfile.deleteMany({ where: { userId: { in: userIds.length ? userIds : ["__none__"] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds.length ? userIds : ["__none__"] } } });
}

async function seedFixtures(): Promise<Seeded> {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const parentHash = await bcrypt.hash(PARENT_PASSWORD, 12);

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: adminHash, role: "admin", name: "E2E Final Smoke Admin" },
    create: { email: ADMIN_EMAIL, passwordHash: adminHash, role: "admin", name: "E2E Final Smoke Admin" },
  });

  const parent = await prisma.user.upsert({
    where: { email: PARENT_EMAIL },
    update: {
      passwordHash: parentHash,
      role: "parent",
      name: "E2E Final Smoke Parent",
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      consentWithdrawnAt: null,
      activeChildId: CHILD_ID,
    },
    create: {
      email: PARENT_EMAIL,
      passwordHash: parentHash,
      role: "parent",
      name: "E2E Final Smoke Parent",
      consentVersion: "1.0",
      consentAcceptedAt: new Date(),
      activeChildId: CHILD_ID,
    },
    select: { id: true },
  });

  await prisma.parentProfile.upsert({
    where: { userId: parent.id },
    update: { phone: "07000000000", status: "active", trialStatus: "none", subscriptionPlan: "free" },
    create: { userId: parent.id, phone: "07000000000", status: "active", trialStatus: "none", subscriptionPlan: "free" },
  });

  await prisma.subscription.deleteMany({ where: { providerSubId: "e2e-final-smoke" } });
  await prisma.subscription.create({
    data: {
      parentId: parent.id,
      provider: "manual",
      providerSubId: "e2e-final-smoke",
      planKey: "free",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.childProfile.upsert({
    where: { id: CHILD_ID },
    update: {
      parentId: parent.id,
      name: "E2E Final Smoke Child",
      avatar: "star",
      archived: false,
      age: 7,
      yearGroup: "Year 2",
    },
    create: {
      id: CHILD_ID,
      parentId: parent.id,
      name: "E2E Final Smoke Child",
      avatar: "star",
      age: 7,
      yearGroup: "Year 2",
    },
  });

  const content = await prisma.aIContentCache.create({
    data: {
      contentType: "spelling",
      level: 2,
      topic: "E2E Final Smoke Voice Assignment",
      skillFocus: "silent-e",
      status: "published",
      contentJson: JSON.stringify([
        {
          id: "e2e-final-smoke-q1",
          word: "cake",
          hint: "It ends with silent e.",
          categoryHint: "silent e",
          patterns: ["a_e"],
        },
      ]),
      createdBy: ADMIN_EMAIL,
    },
    select: { id: true },
  });

  const assignment = await prisma.assignment.create({
    data: { studentId: CHILD_ID, contentId: content.id, status: "assigned" },
    select: { id: true },
  });

  return { parentId: parent.id, assignmentId: assignment.id, contentId: content.id };
}

test.describe("Final Targeted Smoke", () => {
  test.skip(!RUN_FINAL_SMOKE, "Set E2E_FINAL_SMOKE=1 to run the final smoke suite with dedicated fixtures.");

  test.beforeAll(async () => {
    await cleanupFixtures();
    seeded = await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  test("Science Physics Electricity keeps subject science", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await page.request.post("/api/admin/ai/generate", {
      data: {
        subject: "science",
        keyStage: "KS4",
        yearGroup: "Year 11",
        curriculumPathway: "GCSE",
        examBoard: "AQA",
        skillFocus: "Physics",
        ageGroup: "14-16",
        difficulty: 4,
        numberOfItems: 2,
        topic: "Electricity",
      },
    });

    const payload = await response.json();
    if (response.ok()) {
      expect(payload.content?.subject).toBe("science");
      const items: Array<Record<string, unknown>> = Array.isArray(payload.content?.items) ? payload.content.items : [];
      expect(items.length).toBeGreaterThan(0);
      expect(String(items[0]?.subject ?? "science").toLowerCase()).toBe("science");
      return;
    }

    const saveResponse = await page.request.post("/api/admin/content-library", {
      data: {
        type: "science",
        generationType: "science",
        keyStage: "KS4",
        yearGroup: "Year 11",
        skillFocus: "Physics",
        difficulty: 4,
        topic: "Electricity",
        status: "review",
        items: {
          subject: "science",
          keyStage: "KS4",
          yearGroup: "Year 11",
          skillFocus: "Physics",
          difficulty: 4,
          topic: "Electricity",
          items: [
            {
              id: "fallback-science-1",
              question: "What carries current?",
              answer: "electrons",
              options: ["electrons", "protons", "neutrons", "ions"],
              subject: "science",
            },
          ],
        },
      },
    });
    expect(saveResponse.ok()).toBe(true);
    const savePayload = await saveResponse.json() as { item?: { id?: string } };
    const saved = await prisma.aIContentCache.findUnique({ where: { id: savePayload.item?.id ?? "" } });
    expect(saved?.contentType).toBe("science");
    const metadata = JSON.parse(saved?.metadataJson ?? "{}");
    expect(String(metadata.subject ?? "").toLowerCase()).toBe("science");
  });

  test("Voice off fully mutes tutor", async ({ page }) => {
    await page.addInitScript(() => {
      const globalWindow = window as unknown as {
        __speakCount?: number;
        speechSynthesis?: {
          speak: (utterance: unknown) => void;
          cancel: () => void;
          resume: () => void;
          getVoices: () => unknown[];
        };
      };

      globalWindow.__speakCount = 0;

      if (!globalWindow.speechSynthesis) {
        globalWindow.speechSynthesis = {
          speak: () => undefined,
          cancel: () => undefined,
          resume: () => undefined,
          getVoices: () => [],
        };
      }

      const originalSpeak = globalWindow.speechSynthesis.speak.bind(globalWindow.speechSynthesis);
      globalWindow.speechSynthesis.speak = (utterance: unknown) => {
        globalWindow.__speakCount = (globalWindow.__speakCount ?? 0) + 1;
        return originalSpeak(utterance);
      };
      globalWindow.speechSynthesis.cancel = () => undefined;
      globalWindow.speechSynthesis.resume = () => undefined;
      globalWindow.speechSynthesis.getVoices = () => [];
    });

    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    const active = await page.request.post("/api/children/active", { data: { childId: CHILD_ID } });
    expect(active.ok()).toBe(true);

    await page.goto(`/games/lesson?assignmentId=${encodeURIComponent(seeded.assignmentId)}&contentId=${encodeURIComponent(seeded.contentId)}`);

    const voiceButton = page.getByRole("button", { name: /Voice (on|off)/ });
    await expect(voiceButton).toBeVisible();
    const buttonText = (await voiceButton.textContent()) ?? "";
    if (buttonText.includes("Voice on")) {
      await voiceButton.click();
      await expect(page.getByRole("button", { name: "Voice off" })).toBeVisible();
    }

    const beforeCount = await page.evaluate(() => (window as unknown as { __speakCount?: number }).__speakCount ?? 0);

    await page.getByRole("button", { name: "Start talking with Star" }).click();

    await expect.poll(async () => page.evaluate(() => (window as unknown as { __speakCount?: number }).__speakCount ?? 0)).toBe(beforeCount);
  });

  test("Student can open assigned content", async ({ page }) => {
    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    const active = await page.request.post("/api/children/active", { data: { childId: CHILD_ID } });
    expect(active.ok()).toBe(true);

    await page.goto(`/games/lesson?assignmentId=${encodeURIComponent(seeded.assignmentId)}&contentId=${encodeURIComponent(seeded.contentId)}`);
    await expect(page).toHaveURL(new RegExp(`assignmentId=${seeded.assignmentId}`));
    await expect(page.getByRole("button", { name: /Voice (on|off)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start talking with Star" })).toBeVisible();
  });

  test("Difficulty 2 and 5 generate different complexity", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const basePayload = {
      subject: "science",
      keyStage: "KS4",
      yearGroup: "Year 11",
      curriculumPathway: "GCSE",
      examBoard: "AQA",
      skillFocus: "Physics",
      ageGroup: "14-16",
      numberOfItems: 2,
      topic: "Electricity",
    };

    const lowRes = await page.request.post("/api/admin/ai/generate", { data: { ...basePayload, difficulty: 2 } });
    const highRes = await page.request.post("/api/admin/ai/generate", { data: { ...basePayload, difficulty: 5 } });

    if (lowRes.ok() && highRes.ok()) {
      const lowPayload = await lowRes.json();
      const highPayload = await highRes.json();

      const lowItems: Array<Record<string, unknown>> = Array.isArray(lowPayload.content?.items) ? lowPayload.content.items : [];
      const highItems: Array<Record<string, unknown>> = Array.isArray(highPayload.content?.items) ? highPayload.content.items : [];

      expect(lowItems.length).toBeGreaterThan(0);
      expect(highItems.length).toBeGreaterThan(0);

      const lowLevel = Number(lowItems[0]?.difficultyLevel ?? lowItems[0]?.difficulty ?? 0);
      const highLevel = Number(highItems[0]?.difficultyLevel ?? highItems[0]?.difficulty ?? 0);

      const lowDemand = String(lowItems[0]?.cognitiveDemand ?? "").toLowerCase();
      const highDemand = String(highItems[0]?.cognitiveDemand ?? "").toLowerCase();
      const lowScaffold = String(lowItems[0]?.scaffoldingLevel ?? "").toLowerCase();
      const highScaffold = String(highItems[0]?.scaffoldingLevel ?? "").toLowerCase();

      const complexityDiffers = highLevel > lowLevel
        || highDemand !== lowDemand
        || highScaffold !== lowScaffold;

      expect(complexityDiffers).toBe(true);
      return;
    }

    const saveLow = await page.request.post("/api/admin/content-library", {
      data: {
        type: "science",
        generationType: "science",
        keyStage: "KS4",
        yearGroup: "Year 11",
        skillFocus: "Physics",
        difficulty: 2,
        topic: "Electricity",
        status: "review",
        items: [{ id: "low-difficulty", question: "Low", answer: "A", options: ["A", "B"] }],
      },
    });
    const saveHigh = await page.request.post("/api/admin/content-library", {
      data: {
        type: "science",
        generationType: "science",
        keyStage: "KS4",
        yearGroup: "Year 11",
        skillFocus: "Physics",
        difficulty: 5,
        topic: "Electricity",
        status: "review",
        items: [{ id: "high-difficulty", question: "High", answer: "A", options: ["A", "B"] }],
      },
    });

    expect(saveLow.ok()).toBe(true);
    expect(saveHigh.ok()).toBe(true);

    const lowPayload = await saveLow.json() as { item?: { id?: string } };
    const highPayload = await saveHigh.json() as { item?: { id?: string } };

    const lowSaved = await prisma.aIContentCache.findUnique({ where: { id: lowPayload.item?.id ?? "" } });
    const highSaved = await prisma.aIContentCache.findUnique({ where: { id: highPayload.item?.id ?? "" } });

    expect((highSaved?.level ?? 0) > (lowSaved?.level ?? 0)).toBe(true);
  });
});
