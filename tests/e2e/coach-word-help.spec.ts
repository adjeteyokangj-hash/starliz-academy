import { expect, test } from "@playwright/test";
import {
  ensureDictionaryAdminUser,
  loginAsDictionaryAdmin,
  seedDeterministicDictionaryWords,
} from "./support/dictionary-fixtures";

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

test.describe("Coach Word Help", () => {
  test.skip(!HAS_DATABASE_URL, "DATABASE_URL is required for deterministic dictionary setup.");

  test.beforeAll(async ({ request }) => {
    await ensureDictionaryAdminUser();
    await seedDeterministicDictionaryWords(request);
  });

  test("returns fallback help when the word is missing", async ({ page }) => {
    await loginAsDictionaryAdmin(page);

    const response = await page.request.post("/api/coach/word-help", {
      data: {
        word: "",
        subject: "spelling",
        keyStage: "ks1",
        yearGroup: "Year 2",
        activityType: "spelling-game",
        supportLevel: 1,
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as { found: boolean; coachMessage: string };
    expect(payload.found).toBe(false);
    expect(payload.coachMessage).toContain("Word Bank yet");
  });

  test("uses stored dictionary content first", async ({ page }) => {
    await loginAsDictionaryAdmin(page);

    const response = await page.request.post("/api/coach/word-help", {
      data: {
        word: "bright",
        subject: "spelling",
        keyStage: "ks1",
        yearGroup: "Year 1",
        activityType: "spelling-game",
        supportLevel: 2,
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as { found: boolean; word: string | null; definitionChild: string };
    expect(payload.found).toBe(true);
    expect(payload.word).toBe("bright");
    expect(payload.definitionChild).toContain("Bright means full of light");
  });

  test("does not return inactive dictionary words", async ({ page }) => {
    await loginAsDictionaryAdmin(page);

    const response = await page.request.post("/api/coach/word-help", {
      data: {
        word: "retiredword",
        subject: "spelling",
        keyStage: "ks1",
        yearGroup: "Year 1",
        activityType: "spelling-game",
        supportLevel: 2,
      },
    });

    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as { found: boolean; active: boolean; coachMessage: string };
    expect(payload.found).toBe(false);
    expect(payload.active).toBe(false);
    expect(payload.coachMessage).toContain("Word Bank yet");
  });
});
