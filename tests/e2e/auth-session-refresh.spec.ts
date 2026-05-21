import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

console.log("TEST_DATABASE_HOST", new URL(process.env.DATABASE_URL ?? "").host);

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const RUN_ID = Date.now().toString(36);
const RUN_DIGITS = Date.now().toString().slice(-8);

const PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? `refresh-parent+${RUN_ID}@gmail.com`;
const PARENT_PASSWORD = "PlaywrightParent#2026";
const PARENT_PIN = "2580";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? `refresh-admin+${RUN_ID}@starliz.local`;
const ADMIN_PASSWORD = "PlaywrightAdmin#2026";

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);
const SETUP_REQUEST_TIMEOUT_MS = 180_000;
const SETUP_BOOT_TIMEOUT_MS = 180_000;
const SETUP_DB_TIMEOUT_MS = 20_000;

let parentChildId = "";
let parentReady = false;
let adminReady = false;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieBaseUrl(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
}

function extractCookieValue(setCookie: string, expectedName: string): string | null {
  const [firstPair] = setCookie.split(";");
  const [name, ...rest] = firstPair.split("=");
  if (name !== expectedName || !rest.length) {
    return null;
  }
  return rest.join("=");
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, step: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${step} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function setupPost(request: APIRequestContext, path: string, data: unknown, step: string): Promise<APIResponse> {
  try {
    return await request.post(path, {
      data,
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
  } catch (error) {
    throw new Error(`${step} request failed: ${asErrorMessage(error)}`);
  }
}

async function setupGet(
  request: APIRequestContext,
  path: string,
  step: string,
  timeout = SETUP_REQUEST_TIMEOUT_MS,
): Promise<APIResponse> {
  try {
    return await request.get(path, {
      timeout,
      failOnStatusCode: false,
    });
  } catch (error) {
    throw new Error(`${step} request failed: ${asErrorMessage(error)}`);
  }
}

async function assertServerReachable(request: APIRequestContext) {
  const response = await setupGet(request, "/api/auth/login", "Server reachability check", SETUP_BOOT_TIMEOUT_MS);
  if (response.status() >= 500) {
    throw new Error(`Server reachability check failed with status ${response.status()}`);
  }
}

async function ensureParentAccount(request: APIRequestContext) {
  await assertServerReachable(request);

  const loginProbe = await setupPost(
    request,
    "/api/auth/login",
    { email: PARENT_EMAIL, password: PARENT_PASSWORD },
    "Parent login probe",
  );

  if (!loginProbe.ok()) {
    const signupResponse = await setupPost(
      request,
      "/api/auth/signup",
      {
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
      "Parent signup setup",
    );

    if (signupResponse.status() !== 201 && signupResponse.status() !== 409) {
      const bodyText = await signupResponse.text();
      throw new Error(`Unexpected signup status: ${signupResponse.status()} body=${bodyText}`);
    }
  }

}

async function ensureParentReady(request: APIRequestContext) {
  if (parentReady) return;
  await ensureParentAccount(request);
  parentReady = true;
}

async function ensureAdminAccount() {
  try {
    const passwordHash = await withTimeout(
      bcrypt.hash(ADMIN_PASSWORD, 12),
      SETUP_DB_TIMEOUT_MS,
      "Admin password hash setup",
    );
    await withTimeout(
      prisma.user.upsert({
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
      }),
      SETUP_DB_TIMEOUT_MS,
      "Admin upsert setup",
    );
  } catch (error) {
    throw new Error(`Admin setup failed: ${asErrorMessage(error)}`);
  }
}

async function ensureAdminReady() {
  if (adminReady) return;
  await ensureAdminAccount();
  adminReady = true;
}

async function loginWithRetry(page: Page, email: string, password: string): Promise<APIResponse> {
  let lastResponse: APIResponse | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.post("/api/auth/login", {
      data: { email, password },
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    if (response.ok()) {
      return response;
    }
    lastResponse = response;
    await delay(500 * (attempt + 1));
  }
  return lastResponse as APIResponse;
}

async function loginAs(page: Page, setupRequest: APIRequestContext, email: string, password: string) {
  await ensureParentReady(setupRequest);
  await page.context().clearCookies();
  const response = await loginWithRetry(page, email, password);
  expect(response.ok()).toBeTruthy();

  const setCookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);

  const sessionToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_session"))
    .find((value): value is string => Boolean(value));
  const refreshToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_refresh"))
    .find((value): value is string => Boolean(value));

  const cookiesToSet: Array<{ name: string; value: string; url: string; httpOnly: boolean; sameSite: "Lax" }> = [];
  if (sessionToken) {
    cookiesToSet.push({
      name: "starliz_session",
      value: sessionToken,
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    });
  }
  if (refreshToken) {
    cookiesToSet.push({
      name: "starliz_refresh",
      value: refreshToken,
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    });
  }

  if (cookiesToSet.length) {
    await page.context().addCookies(cookiesToSet);
  }
}

async function unlockParent(page: Page) {
  let response: APIResponse | null = null;
  
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await page.request.post("/api/pin/verify", {
        data: { pin: PARENT_PIN },
        timeout: SETUP_REQUEST_TIMEOUT_MS,
        failOnStatusCode: false,
      });
      if (response.ok()) break;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(1000 * (attempt + 1));
      continue;
    }

    if (attempt === 0 && !response.ok()) {
      await page.request.post("/api/pin/set", {
        data: { pin: PARENT_PIN },
        timeout: SETUP_REQUEST_TIMEOUT_MS,
        failOnStatusCode: false,
      });
    }
    
    await delay(500);
  }
  
  const resolvedResponse = response;
  if (!resolvedResponse) {
    throw new Error("Parent PIN unlock verification returned no response.");
  }
  expect(resolvedResponse.ok()).toBeTruthy();

  const unlockToken = resolvedResponse
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => extractCookieValue(header.value, "starliz_parent_unlock"))
    .find((value): value is string => Boolean(value));

  if (unlockToken) {
    await page.context().addCookies([
      {
        name: "starliz_parent_unlock",
        value: unlockToken,
        url: cookieBaseUrl(),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
}

async function selectChild(page: Page) {
  if (!parentChildId) {
    const profilesResponse = await page.request.get("/api/parent/profiles", {
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    expect(profilesResponse.ok()).toBeTruthy();
    const payload = (await profilesResponse.json()) as { children?: Array<{ id: string }> };
    const firstChild = payload.children?.[0];
    if (!firstChild?.id) {
      throw new Error("No child profile available for refresh tests.");
    }
    parentChildId = firstChild.id;
  }

  const response = await page.request.post("/api/parent/profiles/verify-child-pin", {
    data: { childId: parentChildId },
    timeout: SETUP_REQUEST_TIMEOUT_MS,
    failOnStatusCode: false,
  });
  expect(response.ok()).toBeTruthy();

  const childSelectionToken = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => extractCookieValue(header.value, "starliz_child_selection"))
    .find((value): value is string => Boolean(value));

  if (childSelectionToken) {
    await page.context().addCookies([
      {
        name: "starliz_child_selection",
        value: childSelectionToken,
        url: cookieBaseUrl(),
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
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

async function syncAuthCookiesFromResponse(page: Page, response: APIResponse) {
  const setCookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);

  const sessionToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_session"))
    .find((value): value is string => Boolean(value));
  const refreshToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_refresh"))
    .find((value): value is string => Boolean(value));

  const cookiesToSet: Array<{ name: string; value: string; url: string; httpOnly: boolean; sameSite: "Lax" }> = [];
  if (sessionToken) {
    cookiesToSet.push({
      name: "starliz_session",
      value: sessionToken,
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    });
  }
  if (refreshToken) {
    cookiesToSet.push({
      name: "starliz_refresh",
      value: refreshToken,
      url: cookieBaseUrl(),
      httpOnly: true,
      sameSite: "Lax",
    });
  }

  if (cookiesToSet.length > 0) {
    await page.context().addCookies(cookiesToSet);
  }
}

test.describe("Auth/session refresh continuity", () => {
  test.describe.configure({ timeout: 15 * 60 * 1000, mode: 'serial' });
  test.setTimeout(10 * 60 * 1000);
  test.skip(!HAS_DATABASE_URL, "DATABASE_URL is required for refresh integration e2e tests.");

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  });

  test.afterAll(async () => {
    if (!HAS_DATABASE_URL) return;
    await prisma.$disconnect();
  });

  test("parent login session reaches profile selection", async ({ page, request }) => {
    await loginAs(page, request, PARENT_EMAIL, PARENT_PASSWORD);
    await page.goto("/parent/profiles");
    await expect(page).toHaveURL(/\/parent\/profiles/);
    await expect(page.getByTestId("profile-card-parent")).toBeVisible({ timeout: 120_000 });
  });

  test("parent dashboard recovers after stale session via refresh and keeps unlock", async ({ page, request }) => {
    await loginAs(page, request, PARENT_EMAIL, PARENT_PASSWORD);
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

  test("child selection survives session refresh and assignment API stays authorized", async ({ page, request }) => {
    await loginAs(page, request, PARENT_EMAIL, PARENT_PASSWORD);
    await selectChild(page);

    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/(student\/dashboard|dashboard)/);

    await setStaleSessionCookie(page);

    const refreshResponse = await page.request.post("/api/auth/refresh", {
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    expect(refreshResponse.status()).toBe(200);
    await syncAuthCookiesFromResponse(page, refreshResponse);

    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/student\/dashboard/);

    const assignmentResponse = await page.request.get(
      `/api/student/assignments?studentId=${encodeURIComponent(parentChildId)}`,
      {
        failOnStatusCode: false,
        headers: { "cache-control": "no-store" },
      },
    );
    const assignmentsStatus = assignmentResponse.status();
    expect(assignmentsStatus).not.toBe(401);
  });

  test("invalid refresh cookie clears stale auth cookies and redirects to login", async ({ request }) => {
    const refreshResponse = await request.get("/api/auth/refresh?next=/dashboard", {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: {
        Cookie: "starliz_refresh=stale.invalid.refresh; starliz_session=stale.invalid.session",
      },
    });

    expect([302, 303, 307, 308]).toContain(refreshResponse.status());
    const location = refreshResponse.headers()["location"] ?? "";
    expect(location).toContain("/auth/login");

    const setCookies = refreshResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value);
    expect(setCookies.some((cookie) => cookie.startsWith("starliz_session="))).toBeTruthy();
    expect(setCookies.some((cookie) => cookie.startsWith("starliz_refresh="))).toBeTruthy();
  });

  test("admin protected routes renew stale session via refresh", async ({ page, request }) => {
    await ensureAdminReady();
    await loginAs(page, request, ADMIN_EMAIL, ADMIN_PASSWORD);
    await setStaleSessionCookie(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });
});
