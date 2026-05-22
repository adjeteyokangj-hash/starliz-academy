import { expect, test } from "@playwright/test";
import {
  ensureDictionaryAdminUser,
  loginAsDictionaryAdmin,
  seedDeterministicDictionaryWords,
} from "./support/dictionary-fixtures";

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

test.describe("Admin Dictionary / Word Bank", () => {
  test.skip(!HAS_DATABASE_URL, "DATABASE_URL is required for deterministic dictionary setup.");

  test.beforeAll(async ({ request }) => {
    await ensureDictionaryAdminUser();
    await seedDeterministicDictionaryWords(request);
  });

  test("loads the page shell and form controls", async ({ page }) => {
    await loginAsDictionaryAdmin(page);
    await page.goto("/admin/dictionary");

    await expect(page.getByRole("heading", { name: "Dictionary / Word Bank" })).toBeVisible();
    await expect(page.getByPlaceholder("Search word, topic, meaning")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add word" })).toBeVisible();
    await expect(page.getByText("Dictionary entry")).toBeVisible();
    await expect(page.getByText("Total words")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import starter words" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("imports starter words and keeps admin tools operational", async ({ page }) => {
    await loginAsDictionaryAdmin(page);
    await page.goto("/admin/dictionary");

    await page.getByRole("button", { name: "Import starter words" }).click();
    await expect(page.getByText(/Imported starter words:/)).toBeVisible();
    await expect(page.getByText("Words by Subject")).toBeVisible();
  });
});
