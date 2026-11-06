import { expect, test } from "@playwright/test";
import { login, seedAuthScenario, type AuthScenario } from "./helpers/auth-fixtures";

test.describe("Parent shell with email/password sessions", () => {
  test.describe.configure({ mode: "serial", timeout: 180000 });
  let scenario: AuthScenario;
  test.beforeAll(async () => { scenario = await seedAuthScenario("parent-shell"); });
  test.afterAll(async () => { await scenario?.prisma.$disconnect(); });

  test("parent root resolves to its dashboard without legacy unlock", async ({ page }) => {
    await login(page, scenario); await page.goto("/parent"); await expect(page).toHaveURL(/\/parent\/dashboard/);
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_parent_unlock")).toBe(false);
  });

  test("protected shell routes resolve to their requested pages", async ({ page }) => {
    await login(page, scenario);
    for (const path of ["/parent/dashboard", "/parent/children", "/parent/billing", "/parent/progress", "/parent/tutor-history", "/parent/rewards", "/parent/consent", "/parent/messages", "/parent/support"]) {
      const response = await page.request.get(path);
      expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
      expect(new URL(response.url()).pathname, "A login redirect must not be mistaken for a successful protected page").toBe(path);
    }
  });
});
