import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const RUN_ID = Date.now().toString(36);
const RUN_DIGITS = Date.now().toString().slice(-8);
const PARENT_EMAIL = `profile-gate-guardian+${RUN_ID}@gmail.com`;
const PARENT_PASSWORD = "Parent#2026";
const PARENT_NAME = "Olivia Thompson";
const PARENT_PHONE = `+4474${RUN_DIGITS}`;
const PARENT_PIN = "2580";
const PARENT_CHILD_NAME = "Profile Gate Child";

async function ensureParentAccount(request: APIRequestContext) {
  const signupResponse = await request.post("/api/auth/signup", {
    data: {
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
  });

  if (signupResponse.status() !== 201 && signupResponse.status() !== 409) {
    throw new Error(`Unexpected signup status: ${signupResponse.status()}`);
  }

  const loginResponse = await request.post("/api/auth/login", {
    data: { email: PARENT_EMAIL, password: PARENT_PASSWORD },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login failed during setup: ${loginResponse.status()}`);
  }

  const consentResponse = await request.post('/api/consent', {
    data: { accepted: true, version: '1.0' },
  });
  if (!consentResponse.ok()) {
    throw new Error(`Consent setup failed: ${consentResponse.status()}`);
  }

  await request.post("/api/pin/set", {
    data: { pin: PARENT_PIN },
  });
  await request.post("/api/pin/verify", {
    data: { pin: PARENT_PIN },
  });

  const profilesResponse = await request.get("/api/parent/profiles");
  if (!profilesResponse.ok()) {
    throw new Error(`Profiles fetch failed during setup: ${profilesResponse.status()}`);
  }
  const profiles = (await profilesResponse.json()) as { children?: Array<{ id: string }> };
  const firstChildId = profiles.children?.[0]?.id;
  if (!firstChildId) {
    throw new Error("No child profile available for profile gate tests.");
  }

  const disablePinResponse = await request.post(`/api/parent/children/${encodeURIComponent(firstChildId)}/pin`, {
    data: { enablePin: false },
  });
  if (!disablePinResponse.ok()) {
    throw new Error(`Failed to disable child PIN during setup: ${disablePinResponse.status()}`);
  }
}

async function loginViaUi(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(PARENT_EMAIL);
  await page.getByLabel("Password").fill(PARENT_PASSWORD);
  const loginResponsePromise = page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Login" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/parent\/profiles/);
}

async function loginViaApi(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: PARENT_EMAIL, password: PARENT_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/parent/profiles");
  await expect(page).toHaveURL(/\/parent\/profiles/);
}

async function clearParentUnlockCookie(page: Page) {
  const cookieUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  await page.context().addCookies([
    {
      name: "starliz_parent_unlock",
      value: "",
      url: cookieUrl,
      expires: 0,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function unlockParentFromProfiles(page: Page) {
  await page.getByTestId("profile-card-parent").click();
  await page.getByTestId("parent-pin-input").fill(PARENT_PIN);
  const verifyResponsePromise = page.waitForResponse((response) => response.url().includes("/api/pin/verify") && response.request().method() === "POST");
  await page.getByTestId("parent-pin-submit").click();
  const verifyResponse = await verifyResponsePromise;
  expect(verifyResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/parent\/dashboard/);
}

test.describe("Parent Profile Gate", () => {
  test.beforeAll(async ({ request }) => {
    await ensureParentAccount(request);
  });

  test("parent login redirects to profile selection", async ({ page }) => {
    await loginViaUi(page);
    await expect(page.getByRole("heading", { name: "Who is using StarLiz Academy?" })).toBeVisible();
  });

  test("parent profile asks for PIN", async ({ page }) => {
    await loginViaApi(page);
    await page.getByTestId("profile-card-parent").click();
    await expect(page.getByTestId("parent-pin-input")).toBeVisible();
  });

  test("parent dashboard is blocked without parent PIN unlock", async ({ page }) => {
    await loginViaApi(page);

    const reloginResponse = await page.request.post("/api/auth/login", {
      data: { email: PARENT_EMAIL, password: PARENT_PASSWORD },
    });
    expect(reloginResponse.ok()).toBeTruthy();

    await clearParentUnlockCookie(page);
    const pinStatusResponse = await page.request.get("/api/pin/status");
    expect(pinStatusResponse.ok()).toBeTruthy();
    const pinStatus = (await pinStatusResponse.json()) as { unlocked?: boolean };
    expect(pinStatus.unlocked).toBeFalsy();

    await page.goto("/parent/dashboard");
    await expect(page).toHaveURL(/\/parent\/profiles/);
  });

  test("child without PIN opens student dashboard", async ({ page }) => {
    await loginViaApi(page);
    const childCard = page.locator('[data-testid^="profile-card-child-"]').first();
    const childEntryResponsePromise = page.waitForResponse((response) => response.url().includes("/api/parent/profiles/verify-child-pin") && response.request().method() === "POST");
    await childCard.click();
    const childEntryResponse = await childEntryResponsePromise;
    expect(childEntryResponse.ok()).toBeTruthy();
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/(student\/dashboard|dashboard)/);
  });

  test("parent route requires PIN again after leaving parent area", async ({ page }) => {
    await loginViaApi(page);
    await unlockParentFromProfiles(page);

    await page.goto("/parent/profiles");
    await clearParentUnlockCookie(page);
    await page.goto("/parent/dashboard");

    await expect(page).toHaveURL(/\/parent\/profiles/);
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
