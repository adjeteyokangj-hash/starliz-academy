import { expect, test } from "@playwright/test";
import { expectRenewedAccess, expectValidAccess, expiredAccess, login, seedAuthScenario, staleAccess, type AuthScenario } from "./helpers/auth-fixtures";

test.describe("Auth/session refresh continuity", () => {
  test.describe.configure({ timeout: 180000 });
  let scenario: AuthScenario;
  test.beforeAll(async () => { scenario = await seedAuthScenario("refresh"); });
  test.afterAll(async () => { await scenario?.prisma.$disconnect(); });

  test("parent email/password sign-in lands directly in the parent dashboard", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email or username").fill(scenario.parent.email);
    await page.getByLabel("Password", { exact: true }).fill(scenario.password);
    await page.getByRole("button", { name: "Sign in to Parent Portal", exact: true }).click();
    await expect(page).toHaveURL(/\/parent\/dashboard/);
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_parent_unlock")).toBe(false);
  });

  test("parent dashboard refreshes a stale access session without parent unlock", async ({ page }) => {
    await login(page, scenario); await staleAccess(page);
    await page.goto("/parent/dashboard"); await expectRenewedAccess(page);
    await expect(page).toHaveURL(url => url.pathname === "/parent/dashboard");
    await expect(page.getByRole("link", { name: "Dashboard", exact: true }).first()).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find(cookie => cookie.name === "starliz_session")?.value).not.toBe("stale.invalid.session");
    expect(cookies.some(cookie => cookie.name === "starliz_parent_unlock")).toBe(false);
  });

  test("child selection and authorized assignment access survive refresh", async ({ page }) => {
    await login(page, scenario);
    expect((await page.request.post("/api/children/active", { data: { childId: scenario.child.id } })).status()).toBe(200);
    const selection = (await page.context().cookies()).find(cookie => cookie.name === "starliz_child_selection")?.value;
    expect(selection).toBeTruthy(); await staleAccess(page);
    expect((await page.request.post("/api/auth/refresh")).status()).toBe(200);
    expect((await page.context().cookies()).find(cookie => cookie.name === "starliz_child_selection")?.value).toBe(selection);
    const active = await page.request.get("/api/children/active"); expect((await active.json()).child.id).toBe(scenario.child.id);
    const response = await page.request.get(`/api/student/assignments?studentId=${scenario.child.id}`);
    expect(response.status(), await response.text()).toBe(200);
  });

  test("invalid refresh clears stale authentication and redirects to sign-in", async ({ request }) => {
    const response = await request.get("/api/auth/refresh?next=/parent/dashboard", { maxRedirects: 0, headers: { Cookie: "starliz_refresh=stale.invalid.refresh; starliz_session=stale.invalid.session" } });
    expect([302,303,307,308]).toContain(response.status()); expect(response.headers().location).toContain("/auth/login");
    const cookies = response.headersArray().filter(header => header.name.toLowerCase() === "set-cookie").map(header => header.value);
    for (const name of ["starliz_session", "starliz_refresh"]) expect(cookies.some(cookie => cookie.startsWith(`${name}=`) && /max-age=0/i.test(cookie))).toBe(true);
  });

  test("admin protection refreshes an admin session and refuses parent access", async ({ page }) => {
    await login(page, scenario, scenario.admin); await staleAccess(page);
    await page.goto("/admin"); await expectRenewedAccess(page);
    await expect(page).toHaveURL(url => url.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Platform overview", exact: true })).toBeVisible();
    expect((await page.context().cookies()).find(cookie => cookie.name === "starliz_session")?.value).not.toBe("stale.invalid.session");
    await login(page, scenario); const denied = await page.goto("/admin");
    expect(denied?.status() === 403 || !new URL(page.url()).pathname.startsWith("/admin")).toBe(true);
  });

  for (const role of ["parent", "admin"] as const) test(`${role} navigation renews genuinely expired access`, async ({ page, baseURL }) => {
    const actor = scenario[role]; await login(page, scenario, actor);
    const previous = await expiredAccess(page, scenario, actor);
    await page.goto(role === "admin" ? "/admin" : "/parent/dashboard");
    await expectValidAccess(page, previous, actor);
    await expect(page).toHaveURL(url => url.origin === new URL(baseURL!).origin && url.pathname === (role === "admin" ? "/admin" : "/parent/dashboard"));
    if (role === "admin") await expect(page.getByRole("heading", { name: "Platform overview", exact: true })).toBeVisible();
    else await expect(page.getByRole("link", { name: "Dashboard", exact: true }).first()).toBeVisible();
  });

  test("App Router RSC navigation renews access and retains the selected child", async ({ page }) => {
    await login(page, scenario);
    expect((await page.request.post("/api/children/active", { data: { childId: scenario.child.id } })).status()).toBe(200);
    const selection = (await page.context().cookies()).find(cookie => cookie.name === "starliz_child_selection")?.value;
    expect(selection).toBeTruthy();
    const previous = await expiredAccess(page, scenario);
    const response = await page.request.get("/parent/billing", { headers: { RSC: "1", Accept: "text/x-component" } });
    expect(response.status()).toBe(200); expect(new URL(response.url()).pathname).toBe("/parent/billing");
    expect(response.headers()["content-type"]).toContain("text/x-component");
    await expectValidAccess(page, previous, scenario.parent);
    expect((await page.context().cookies()).find(cookie => cookie.name === "starliz_child_selection")?.value).toBe(selection);
    const active = await page.request.get("/api/children/active"); expect((await active.json()).child.id).toBe(scenario.child.id);
  });

  test("revoked refresh cannot renew navigation or reveal the parent dashboard", async ({ page }) => {
    await login(page, scenario);
    await scenario.prisma.authSession.updateMany({ where: { userId: scenario.parent.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "ci-revocation" } });
    await expiredAccess(page, scenario); await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(url => url.pathname === "/auth/login");
    await expect(page.getByRole("button", { name: "Sign in to Parent Portal", exact: true })).toBeVisible();
    expect((await page.context().cookies()).some(cookie => cookie.name === "starliz_session" || cookie.name === "starliz_refresh")).toBe(false);
  });

  test("a valid parent session cannot enter the admin console", async ({ page }) => {
    await login(page, scenario); await page.goto("/admin");
    await expect(page).toHaveURL(url => url.pathname === "/parent/dashboard");
    await expect(page.getByRole("heading", { name: "Platform overview", exact: true })).toHaveCount(0);
  });

  test("refresh redirects stay internal for unsafe next paths", async ({ page }) => {
    await login(page, scenario);
    for (const next of ["//attacker.invalid/admin", "/\\attacker.invalid/admin"]) {
      const response = await page.request.get(`/api/auth/refresh?next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect(response.status()).toBe(307); expect(response.headers().location).toBe("/parent/dashboard");
    }
  });

  test("an inactive admin remains denied after renewal and can reauthenticate without a loop", async ({ page }) => {
    await login(page, scenario, scenario.admin);
    await scenario.prisma.adminUser.update({ where: { userId: scenario.admin.id }, data: { active: false } });
    try {
      await expiredAccess(page, scenario, scenario.admin); await page.goto("/admin");
      await expect(page).toHaveURL(url => url.pathname === "/admin/login");
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Platform overview", exact: true })).toHaveCount(0);
      await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name === "starliz_session" || cookie.name === "starliz_refresh")).toBe(false);
    } finally { await scenario.prisma.adminUser.update({ where: { userId: scenario.admin.id }, data: { active: true } }); }
  });
});
