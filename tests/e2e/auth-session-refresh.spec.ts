import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const prisma = new PrismaClient();

const RUN_ID = Date.now().toString(36);
const RUN_DIGITS = Date.now().toString().slice(-8);

const PARENT_EMAIL = `refresh-parent+${RUN_ID}@gmail.com`;
const PARENT_PASSWORD = "PlaywrightParent#2026";
const PARENT_PIN = "2580";

const ADMIN_EMAIL = `refresh-admin+${RUN_ID}@starliz.local`;
const ADMIN_PASSWORD = "PlaywrightAdmin#2026";

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

let parentChildId = "";

function cookieBaseUrl(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
}

async function ensureParentAccount(request: APIRequestContext) {
  const signupResponse = await request.post("/api/auth/signup", {
    data: {
      email: PARENT_EMAIL,
      password: PARENT_PASSWORD,
      name: "Olivia Thompson",
      phone: `+4474${RUN_DIGITS}`,
      address: {
        addressLine1: "10 Downing Street",
        addressLine2: "",
        townCity: "London",
        county: "",
        postcode: "SW1A 2AA",
        country: "United Kingdom",
      },
      child: {
        name: "Refresh Child",
        age: 7,
        yearGroup: "Year 2",
        mainFocus: "All subjects",
        avatar: "star",
      },
    },
  });

  if (signupResponse.status() !== 201 && signupResponse.status() !== 409) {
    const bodyText = await signupResponse.text();
    throw new Error(`Unexpected signup status: ${signupResponse.status()} body=${bodyText}`);
  }

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: PARENT_EMAIL, password: PARENT_PASSWORD },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Parent login failed during setup: ${loginResponse.status()}`);
  }

  const consentResponse = await request.post("/api/consent", {
    data: { accepted: true, version: "1.0" },
  });
  if (!consentResponse.ok()) {
    throw new Error(`Consent setup failed: ${consentResponse.status()}`);
  }

  const pinSetResponse = await request.post("/api/pin/set", {
    data: { pin: PARENT_PIN },
  });
  if (!pinSetResponse.ok()) {
    throw new Error(`PIN setup failed: ${pinSetResponse.status()}`);
  }

  const pinVerifyResponse = await request.post("/api/pin/verify", {
    data: { pin: PARENT_PIN },
  });
  if (!pinVerifyResponse.ok()) {
    throw new Error(`PIN verify failed during setup: ${pinVerifyResponse.status()}`);
  }

  const profilesResponse = await request.get("/api/parent/profiles", { failOnStatusCode: false });
  if (!profilesResponse.ok()) {
    throw new Error(`Parent profiles setup call failed: ${profilesResponse.status()}`);
  }
  const payload = (await profilesResponse.json()) as { children?: Array<{ id: string }> };
  const firstChildId = payload.children?.[0]?.id;
  if (!firstChildId) {
    throw new Error("No child profile available for refresh tests.");
  }
  parentChildId = firstChildId;

  const disableChildPinResponse = await request.post(`/api/parent/children/${encodeURIComponent(firstChildId)}/pin`, {
    data: { enablePin: false },
  });
  if (!disableChildPinResponse.ok()) {
    throw new Error(`Disabling child PIN failed: ${disableChildPinResponse.status()}`);
  }
}

async function ensureAdminAccount() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      role: "admin",
      name: "Refresh Admin",
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      name: "Refresh Admin",
    },
  });
}

async function loginAs(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function unlockParent(page: Page) {
  const response = await page.request.post("/api/pin/verify", {
    data: { pin: PARENT_PIN },
  });
  expect(response.ok()).toBeTruthy();
}

async function selectChild(page: Page) {
  const response = await page.request.post("/api/parent/profiles/verify-child-pin", {
    data: { childId: parentChildId },
  });
  expect(response.ok()).toBeTruthy();
}

async function setStaleSessionCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "starliz_session",
      value: "stale.invalid.session",
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function setInvalidRefreshCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "starliz_refresh",
      value: "stale.invalid.refresh",
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "starliz_session",
      value: "stale.invalid.session",
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("Auth/session refresh continuity", () => {
  test.setTimeout(10 * 60 * 1000);
  test.skip(!HAS_DATABASE_URL, "DATABASE_URL is required for refresh integration e2e tests.");

  test.beforeAll(async ({ request }) => {
    if (!HAS_DATABASE_URL) return;
    await ensureParentAccount(request);
    await ensureAdminAccount();
  });

  test.afterAll(async () => {
    if (!HAS_DATABASE_URL) return;
    await prisma.$disconnect();
  });

  test("parent login session reaches profile selection", async ({ page }) => {
    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    await page.goto("/parent/profiles");
    await expect(page).toHaveURL(/\/parent\/profiles/);
    await expect(page.getByRole("heading", { name: "Who is using StarLiz Academy?" })).toBeVisible();
  });

  test("parent dashboard recovers after stale session via refresh and keeps unlock", async ({ page }) => {
    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    await unlockParent(page);
    await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(/\/parent\/dashboard/);

    await setStaleSessionCookie(page);

    await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(/\/parent\/dashboard/);

    const cookies = await page.context().cookies(cookieBaseUrl());
    const unlockCookie = cookies.find((cookie) => cookie.name === "starliz_parent_unlock");
    expect(unlockCookie).toBeTruthy();
    expect((unlockCookie?.value ?? "").length).toBeGreaterThan(10);
  });

  test("child selection survives session refresh and assignment API stays authorized", async ({ page }) => {
    await loginAs(page, PARENT_EMAIL, PARENT_PASSWORD);
    await selectChild(page);

    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/(student\/dashboard|dashboard)/);

    await setStaleSessionCookie(page);

    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/(student\/dashboard|dashboard)/);

    const assignmentsResponse = await page.request.get("/api/student/assignments", {
      failOnStatusCode: false,
    });
    expect(assignmentsResponse.status()).not.toBe(401);
  });

  test("invalid refresh cookie clears stale auth cookies and redirects to login", async ({ page }) => {
    await setInvalidRefreshCookie(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/(admin\/login|auth\/login|login)/);

    const cookies = await page.context().cookies(cookieBaseUrl());
    const sessionCookie = cookies.find((cookie) => cookie.name === "starliz_session");
    const refreshCookie = cookies.find((cookie) => cookie.name === "starliz_refresh");

    expect((sessionCookie?.value ?? "").length).toBe(0);
    expect((refreshCookie?.value ?? "").length).toBe(0);
  });

  test("admin protected routes renew stale session via refresh", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await setStaleSessionCookie(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });
});
