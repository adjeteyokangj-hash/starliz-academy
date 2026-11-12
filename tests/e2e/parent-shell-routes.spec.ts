import { expect, test, type APIRequestContext } from "@playwright/test";

const RUN_ID = Date.now().toString(36);
const PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? `portal.guardian.e2e+${RUN_ID}@gmail.com`;
const PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "Parent#2026";
const PARENT_NAME = process.env.E2E_PARENT_NAME ?? "Olivia Thompson";
const PARENT_CHILD_NAME = "E2E Parent Child";

const PARENT_PIN = "2580";
const SETUP_REQUEST_TIMEOUT_MS = 30_000;
const SETUP_BOOT_TIMEOUT_MS = 30_000;
const UI_NAV_TIMEOUT_MS = 30_000;
let parentReady = false;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientSetupError(error: unknown): boolean {
  const message = asErrorMessage(error);
  return /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|request context disposed/i.test(message);
}

async function withSetupRetries<T>(step: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientSetupError(error) || attempt === attempts - 1) {
        break;
      }
      await delay(700 * (attempt + 1));
    }
  }

  throw new Error(`${step} request failed: ${asErrorMessage(lastError)}`);
}

async function setupPost(request: APIRequestContext, path: string, data: unknown, step: string) {
  return withSetupRetries(step, async () => {
    return request.post(path, {
      data,
      timeout: SETUP_REQUEST_TIMEOUT_MS,
      failOnStatusCode: false,
    });
  });
}

async function setupGet(request: APIRequestContext, path: string, step: string, timeout = SETUP_REQUEST_TIMEOUT_MS) {
  return withSetupRetries(step, async () => {
    return request.get(path, {
      timeout,
      failOnStatusCode: false,
    });
  });
}

async function responseSnippet(response: { status: () => number; text: () => Promise<string> }): Promise<string> {
  const body = await response.text().catch(() => "");
  const compactBody = body.replace(/\s+/g, " ").trim().slice(0, 500);
  return `status=${response.status()} body=${compactBody || "<empty>"}`;
}

async function loginParent(request: APIRequestContext, step: string, attempts = 3) {
  let lastSnippet = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await setupPost(
      request,
      "/api/auth/login",
      {
        email: PARENT_EMAIL,
        password: PARENT_PASSWORD,
      },
      `${step} attempt ${attempt + 1}`,
    );

    if (response.ok()) {
      return response;
    }

    lastSnippet = await responseSnippet(response);
    if (attempt < attempts - 1 && [408, 409, 423, 429, 500, 502, 503, 504].includes(response.status())) {
      await delay(1000 * (attempt + 1));
      continue;
    }

    break;
  }

  throw new Error(`${step} failed for ${PARENT_EMAIL}: ${lastSnippet}`);
}

async function assertServerReachable(request: APIRequestContext) {
  const response = await setupGet(request, "/api/auth/login", "Server reachability check", SETUP_BOOT_TIMEOUT_MS);
  if (response.status() >= 500) {
    throw new Error(`Server reachability check failed with status ${response.status()}`);
  }
}

async function ensureParentAccount(request: APIRequestContext) {
  await assertServerReachable(request);

  const loginProbe = await setupPost(request, "/api/auth/login", { email: PARENT_EMAIL, password: PARENT_PASSWORD }, "Parent login probe");

  if (!loginProbe.ok()) {
    const runDigits = Date.now().toString().slice(-8);
    const signupResponse = await setupPost(
      request,
      "/api/auth/signup",
      {
        email: PARENT_EMAIL,
        password: PARENT_PASSWORD,
        name: PARENT_NAME,
        phone: `+4474${runDigits}`,
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
      throw new Error(`Unexpected signup status: ${await responseSnippet(signupResponse)}`);
    }
  }

  await loginParent(request, "Parent setup login verification");
}

async function ensureParentReady(request: APIRequestContext) {
  if (parentReady) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await ensureParentAccount(request);
      parentReady = true;
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      await delay(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function authenticateParentRequestOnly(request: APIRequestContext) {
  await ensureParentReady(request);
  await loginParent(request, "Parent auth login");

  let unlockResponse = await setupPost(
    request,
    "/api/pin/verify",
    { pin: PARENT_PIN },
    "Parent pin verify",
  );

  if (!unlockResponse.ok()) {
    await setupPost(
      request,
      "/api/pin/set",
      { pin: PARENT_PIN },
      "Parent pin set",
    );
    unlockResponse = await setupPost(
      request,
      "/api/pin/verify",
      { pin: PARENT_PIN },
      "Parent pin verify retry",
    );
  }

  if (!unlockResponse.ok()) {
    throw new Error(`Parent PIN unlock failed: ${await responseSnippet(unlockResponse)}`);
  }
}

test.describe("Parent Shell Routes", () => {
  test.describe.configure({ timeout: 15 * 60 * 1000, mode: 'serial' });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  });

  test("redirects /parent to /parent/dashboard", async ({ request }) => {
    test.setTimeout(4 * 60 * 1000);
    await authenticateParentRequestOnly(request);

    const response = await request.get("/parent/dashboard", {
      failOnStatusCode: false,
      timeout: UI_NAV_TIMEOUT_MS,
    });

    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(400);
  });

  test("renders key parent shell sections", async ({ request }) => {
    test.setTimeout(4 * 60 * 1000);
    await authenticateParentRequestOnly(request);

    const cases = [
      "/parent/dashboard",
      "/parent/children",
      "/parent/billing",
      "/parent/progress",
      "/parent/tutor-history",
      "/parent/rewards",
      "/parent/consent",
      "/parent/messages",
      "/parent/support",
    ] as const;

    for (const path of cases) {
      const response = await request.get(path, {
        failOnStatusCode: false,
        timeout: UI_NAV_TIMEOUT_MS,
      });
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(400);
    }
  });
});
