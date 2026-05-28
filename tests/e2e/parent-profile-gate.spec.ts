import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const RUN_ID = Date.now().toString(36);
const RUN_DIGITS = Date.now().toString().slice(-8);
const PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? `profile-gate-guardian+${RUN_ID}@gmail.com`;
const PARENT_PASSWORD = "Parent#2026";
const PARENT_NAME = "Olivia Thompson";
const PARENT_PHONE = `+4474${RUN_DIGITS}`;
const PARENT_PIN = "2580";
const PARENT_CHILD_NAME = "Profile Gate Child";
const COOKIE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETUP_REQUEST_TIMEOUT_MS = 180_000;
const SETUP_BOOT_TIMEOUT_MS = 180_000;
let parentReady = false;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function setupPost(request: APIRequestContext, path: string, data: unknown, step: string) {
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

async function setupGet(request: APIRequestContext, path: string, step: string, timeout = SETUP_REQUEST_TIMEOUT_MS) {
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
        name: PARENT_NAME,
        phone: PARENT_PHONE,
        address: {
          addressLine1: "10 Downing Street",
          addressLine2: "",
          townCity: "London",
          county: "",
          postcode: "SW1A 2AA",
          country: "United Kingdom",
        },
        child: {
          name: PARENT_CHILD_NAME,
          age: 7,
          yearGroup: "Year 2",
          mainFocus: "All subjects",
          avatar: "star",
        },
      },
      "Parent signup setup",
    );

    if (signupResponse.status() !== 201 && signupResponse.status() !== 409) {
      throw new Error(`Unexpected signup status: ${signupResponse.status()}`);
    }
  }

}

async function ensureParentReady(request: APIRequestContext) {
  if (parentReady) return;
  await ensureParentAccount(request);
  parentReady = true;
}

async function ensureFirstChildPinDisabled(page: Page) {
  const profilesResponse = await page.request.get("/api/parent/profiles", {
    timeout: SETUP_REQUEST_TIMEOUT_MS,
    failOnStatusCode: false,
  });
  expect(profilesResponse.ok()).toBeTruthy();
  const profiles = (await profilesResponse.json()) as { children?: Array<{ id: string; pinEnabled?: boolean }> };
  const firstChild = profiles.children?.[0];
  if (!firstChild?.id || !firstChild.pinEnabled) return;

  const disablePinResponse = await page.request.post(
    `/api/parent/children/${encodeURIComponent(firstChild.id)}/pin`,
    {
      data: { enablePin: false },
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    },
  );
  if (!disablePinResponse.ok()) {
    return;
  }
}

async function loginViaUi(page: Page) {
  await ensureParentReady(page.request);
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(PARENT_EMAIL);
  await page.getByLabel("Password").fill(PARENT_PASSWORD);
  const loginResponsePromise = page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Login" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await page.waitForURL(/\/parent\/profiles/, { timeout: SETUP_REQUEST_TIMEOUT_MS });
  if (!/\/parent\/profiles/.test(page.url())) {
    await page.goto("/parent/profiles");
  }
  await expect(page).toHaveURL(/\/parent\/profiles/);
}

async function loginViaApi(page: Page) {
  await ensureParentReady(page.request);
  const response = await page.request.post("/api/auth/login", {
    data: { email: PARENT_EMAIL, password: PARENT_PASSWORD },
    timeout: SETUP_REQUEST_TIMEOUT_MS,
    failOnStatusCode: false,
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/parent/profiles");
  await expect(page).toHaveURL(/\/parent\/profiles/);
}

async function lockParentSession(page: Page) {
  const setPinResponse = await page.request.post("/api/pin/set", {
    data: { pin: PARENT_PIN },
    timeout: SETUP_REQUEST_TIMEOUT_MS,
    failOnStatusCode: false,
  });
  if (!setPinResponse.ok() && setPinResponse.status() !== 409 && setPinResponse.status() !== 403) {
    throw new Error(`Unable to ensure parent PIN before lock test. status=${setPinResponse.status()}`);
  }

  if (setPinResponse.status() === 403) {
    const pinStatusResponse = await page.request.get("/api/pin/status", {
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    if (!pinStatusResponse.ok()) {
      throw new Error(`Unable to confirm parent PIN status. status=${pinStatusResponse.status()}`);
    }
    const pinStatus = (await pinStatusResponse.json()) as { hasPin?: boolean };
    if (!pinStatus.hasPin) {
      throw new Error("Parent PIN is not configured; lock test requires an existing PIN.");
    }
  }

  // Ensure unlock state is removed by rebuilding cookie jar without unlock/selection cookies.
  const cookies = await page.context().cookies(COOKIE_URL);
  const sessionCookie = cookies.find((cookie) => cookie.name === "starliz_session");
  const refreshCookie = cookies.find((cookie) => cookie.name === "starliz_refresh");

  await page.context().clearCookies();

  const authCookies = [] as Array<{
    name: string;
    value: string;
    url: string;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  }>;

  if (sessionCookie) {
    authCookies.push({
      name: "starliz_session",
      value: sessionCookie.value,
      url: COOKIE_URL,
      httpOnly: sessionCookie.httpOnly,
      sameSite: sessionCookie.sameSite,
      secure: sessionCookie.secure,
    });
  }

  if (refreshCookie) {
    authCookies.push({
      name: "starliz_refresh",
      value: refreshCookie.value,
      url: COOKIE_URL,
      httpOnly: refreshCookie.httpOnly,
      sameSite: refreshCookie.sameSite,
      secure: refreshCookie.secure,
    });
  }

  if (authCookies.length > 0) {
    await page.context().addCookies(authCookies);
  }

  const remainingCookies = await page.context().cookies(COOKIE_URL);
  expect(remainingCookies.some((cookie) => cookie.name === "starliz_parent_unlock" && cookie.value.length > 0)).toBeFalsy();
}

async function unlockParentFromProfiles(page: Page) {
  let verifyResponse: APIResponse | null = null;
  
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      verifyResponse = await page.request.post("/api/pin/verify", {
        data: { pin: PARENT_PIN },
        timeout: SETUP_REQUEST_TIMEOUT_MS,
        failOnStatusCode: false,
      });
      if (verifyResponse.ok()) break;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(1000 * (attempt + 1));
      continue;
    }

    if (attempt === 0 && !verifyResponse.ok()) {
      await page.request.post("/api/pin/set", {
        data: { pin: PARENT_PIN },
        timeout: SETUP_REQUEST_TIMEOUT_MS,
        failOnStatusCode: false,
      });
    }
    
    await delay(500);
  }
  
  expect(verifyResponse).toBeTruthy();
  expect(verifyResponse!.ok()).toBeTruthy();

  await page.goto("/parent/dashboard");
  await expect(page).toHaveURL(/\/parent\/dashboard/);
}

test.describe("Parent Profile Gate", () => {
  test.describe.configure({ timeout: 15 * 60 * 1000, mode: 'serial' });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  });

  test("parent login redirects to profile selection", async ({ page }) => {
    await loginViaUi(page);
    await expect(page.getByTestId("profile-card-parent")).toBeVisible({ timeout: 30_000 });
  });

  test("parent profile asks for PIN", async ({ page }) => {
    await loginViaApi(page);
    const ensurePinResponse = await page.request.post("/api/pin/set", {
      data: { pin: PARENT_PIN },
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    expect(ensurePinResponse.ok() || ensurePinResponse.status() === 403).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("profile-card-parent")).toBeVisible();
    await page.getByTestId("profile-card-parent").click();
    await expect(page.getByTestId("parent-pin-input")).toBeVisible();
  });

  test("parent dashboard remains reachable after lock reset", async ({ page }) => {
    await loginViaApi(page);
    await lockParentSession(page);

    await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(/\/parent\/dashboard/);
  });

  test("child without PIN opens student dashboard", async ({ page }) => {
    await loginViaApi(page);
    await ensureFirstChildPinDisabled(page);
    const childCard = page.locator('[data-testid^="profile-card-child-"]').first();
    const childEntryResponsePromise = page.waitForResponse((response) => response.url().includes("/api/parent/profiles/verify-child-pin") && response.request().method() === "POST");
    await childCard.click();
    const childEntryResponse = await childEntryResponsePromise;
    expect(childEntryResponse.ok()).toBeTruthy();
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/(student\/dashboard|dashboard)/);
  });

  test("parent route stays on dashboard after session lock reset", async ({ page }) => {
    await loginViaApi(page);
    await unlockParentFromProfiles(page);

    await page.goto("/parent/profiles");
    await lockParentSession(page);
    await page.goto("/parent/dashboard");

    await expect(page).toHaveURL(/\/parent\/dashboard/);
  });

  test("child with PIN prompts before entry and parent can reset child PIN", async ({ page }) => {
    await loginViaApi(page);
    await unlockParentFromProfiles(page);

    await page.goto("/parent/dashboard");
    const updatePinResponsePromise = page.waitForResponse((response) =>
      /\/api\/parent\/children\/[^/]+\/pin$/.test(response.url()) && response.request().method() === "POST"
    );
    await page.locator('[data-testid^="child-pin-input-"]').first().fill("2486");
    await page.locator('[data-testid^="child-pin-save-"]').first().click();
    const updatePinResponse = await updatePinResponsePromise;
    expect(updatePinResponse.ok()).toBeTruthy();
    await expect(page.getByText("PIN enabled").first()).toBeVisible();

    await page.goto("/parent/profiles");
    await page.locator('[data-testid^="profile-card-child-"]').first().click();
    await expect(page.getByTestId("child-pin-input")).toBeVisible();
  });

  test("legacy parent profile route redirects to dashboard with account settings", async ({ page }) => {
    await loginViaApi(page);
    await unlockParentFromProfiles(page);

    await page.goto("/parent/profile");
    await expect(page).toHaveURL(/\/parent\/dashboard/);
    await expect(page.getByRole("heading", { name: "Account & Contact Details" })).toBeVisible();
  });

  test("parent navigation does not show My Profile", async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "My Profile" })).toHaveCount(0);
  });
});
