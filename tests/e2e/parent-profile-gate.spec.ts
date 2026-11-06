import { expect, test } from "@playwright/test";
import { login, seedAuthScenario, type AuthScenario } from "./helpers/auth-fixtures";

test.describe("Current parent sign-in and child profile protections", () => {
  test.describe.configure({ timeout: 180000 });
  let scenario: AuthScenario;
  test.beforeAll(async () => { scenario = await seedAuthScenario("profile-gate"); });
  test.afterAll(async () => { await scenario?.prisma.$disconnect(); });

  test("parent PIN endpoints explicitly remain retired", async ({ page }) => {
    await login(page, scenario);
    for (const endpoint of ["/api/pin/set", "/api/pin/verify"]) {
      const response = await page.request.post(endpoint, { data: { pin: "2580" } });
      expect(response.status()).toBe(410); expect((await response.json()).code).toBe("parent_pin_retired");
    }
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_parent_unlock")).toBe(false);
  });

  test("parent profile opens the dashboard without a PIN prompt", async ({ page }) => {
    await login(page, scenario); await page.goto("/parent/profiles");
    await page.getByTestId("profile-card-parent").click(); await expect(page).toHaveURL(/\/parent\/dashboard/);
    await expect(page.getByTestId("parent-pin-input")).toHaveCount(0);
  });

  test("an unauthenticated parent route requires email/password sign-in", async ({ page }) => {
    await page.goto("/parent/dashboard"); await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("parent preview selects only its own child using the implemented picker", async ({ page }) => {
    await login(page, scenario); await page.goto("/parent/profiles");
    const selected = page.waitForResponse(response => response.url().endsWith("/api/children/active") && response.request().method() === "POST");
    await page.getByTestId(`profile-card-child-${scenario.child.id}`).click(); expect((await selected).status()).toBe(200);
    await expect(page).toHaveURL(/\/student\/dashboard/);
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_child_selection")).toBe(true);
  });

  test("another parent's child cannot be selected or have its PIN changed", async ({ page }) => {
    await login(page, scenario);
    for (const [url, data] of [["/api/children/active", { childId: scenario.foreignChild.id }], ["/api/parent/profiles/verify-child-pin", { childId: scenario.foreignChild.id }], [`/api/parent/children/${scenario.foreignChild.id}/pin`, { enablePin: true, pin: "2486" }]] as const) {
      expect((await page.request.post(url, { data })).status()).toBe(404);
    }
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_child_selection")).toBe(false);
  });

  test("supported child PIN verification rejects absent/wrong PIN and accepts the correct PIN", async ({ page }) => {
    await login(page, scenario);
    expect((await page.request.post(`/api/parent/children/${scenario.child.id}/pin`, { data: { enablePin: true, pin: "2486" } })).status()).toBe(200);
    const absent = await page.request.post("/api/parent/profiles/verify-child-pin", { data: { childId: scenario.child.id } });
    expect(absent.status()).toBe(400); expect((await absent.json()).pinRequired).toBe(true);
    expect((await page.request.post("/api/parent/profiles/verify-child-pin", { data: { childId: scenario.child.id, pin: "7391" } })).status()).toBe(401);
    expect((await page.request.post("/api/parent/profiles/verify-child-pin", { data: { childId: scenario.child.id, pin: "2486" } })).status()).toBe(200);
  });

  test("parent can disable a child PIN while the student cannot switch ownership", async ({ page }) => {
    await login(page, scenario);
    expect((await page.request.post(`/api/parent/children/${scenario.child.id}/pin`, { data: { enablePin: true, pin: "2486" } })).status()).toBe(200);
    expect((await page.request.post(`/api/parent/children/${scenario.child.id}/pin`, { data: { enablePin: false } })).status()).toBe(200);
    expect((await page.request.post("/api/parent/profiles/verify-child-pin", { data: { childId: scenario.child.id } })).status()).toBe(200);
    await login(page, scenario, scenario.student);
    expect((await page.request.post("/api/children/active", { data: { childId: scenario.foreignChild.id } })).status()).toBe(403);
    await page.goto("/parent/dashboard"); await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test("legacy parent profile navigation resolves to account dashboard", async ({ page }) => {
    await login(page, scenario); await page.goto("/parent/profile"); await expect(page).toHaveURL(/\/parent\/dashboard/);
    await expect(page.getByRole("link", { name: "Dashboard", exact: true }).first()).toBeVisible();
  });
});
