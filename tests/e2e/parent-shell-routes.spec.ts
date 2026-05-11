import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const RUN_ID = Date.now().toString(36);
const PARENT_EMAIL = process.env.E2E_PARENT_EMAIL ?? `portal-parent+${RUN_ID}@starliz.dev`;
const PARENT_PASSWORD = process.env.E2E_PARENT_PASSWORD ?? "Parent#2026";
const PARENT_NAME = process.env.E2E_PARENT_NAME ?? "Portal Parent";
const PARENT_CHILD_NAME = "E2E Parent Child";

function resolveAuthSecret(): string {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }

  const envFiles = [".env.local", ".env.development.local", ".env.development", ".env"];
  const roots = [process.cwd(), path.resolve(process.cwd(), "starliz-academy")];

  for (const root of roots) {
    for (const file of envFiles) {
      const filePath = path.resolve(root, file);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf8");
      const match = content.match(/^AUTH_SECRET\s*=\s*(.+)$/m);
      if (!match) {
        continue;
      }

      return match[1].trim().replace(/^['\"]|['\"]$/g, "");
    }
  }

  throw new Error("AUTH_SECRET must be available in Playwright environment.");
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT token format.");
  }

  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const json = Buffer.from(base64 + padding, "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

function extractCookieValue(setCookie: string, expectedName: string): string | null {
  const [firstPair] = setCookie.split(";");
  const [name, ...rest] = firstPair.split("=");
  if (name !== expectedName || !rest.length) {
    return null;
  }
  return rest.join("=");
}

async function ensureParentAccount(request: APIRequestContext) {
  const signupResponse = await request.post("/api/auth/signup", {
    data: {
      email: PARENT_EMAIL,
      password: PARENT_PASSWORD,
      name: PARENT_NAME,
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
    data: {
      email: PARENT_EMAIL,
      password: PARENT_PASSWORD,
    },
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login failed during parent setup: ${loginResponse.status()}`);
  }

  const childrenResponse = await request.get("/api/children");
  if (!childrenResponse.ok()) {
    throw new Error(`Unable to read child profiles during setup: ${childrenResponse.status()}`);
  }
  const childrenPayload = (await childrenResponse.json()) as { children?: Array<{ id: string }> };
  if (!childrenPayload.children?.length) {
    const createChildResponse = await request.post("/api/children", {
      data: {
        name: PARENT_CHILD_NAME,
        avatar: "star",
        ageRange: "5-7",
        ageYears: 7,
        startLevelChoice: "Beginner",
      },
    });
    if (!createChildResponse.ok()) {
      throw new Error(`Child bootstrap failed: ${createChildResponse.status()}`);
    }
  }

  const consentResponse = await request.post("/api/consent", {
    data: { accepted: true, version: "1.0" },
  });
  if (!consentResponse.ok()) {
    throw new Error(`Consent setup failed: ${consentResponse.status()}`);
  }
}

async function authenticateParent(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      email: PARENT_EMAIL,
      password: PARENT_PASSWORD,
    },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const setCookies = loginResponse
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value);

  const sessionToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_session"))
    .find((value): value is string => Boolean(value));

  if (!sessionToken) {
    throw new Error("Login response did not contain starliz_session cookie.");
  }

  const payload = decodeJwtPayload(sessionToken);
  const userId = String(payload.userId ?? "");
  if (!userId) {
    throw new Error("Unable to resolve parent user id from session cookie.");
  }

  const authSecret = resolveAuthSecret();

  const unlockToken = await new SignJWT({ userId, scope: "parent-unlock" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("600s")
    .sign(new TextEncoder().encode(authSecret));

  const refreshToken = setCookies
    .map((setCookie) => extractCookieValue(setCookie, "starliz_refresh"))
    .find((value): value is string => Boolean(value));

  const cookieUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

  const cookiesToSet = [
    {
      name: "starliz_session",
      value: sessionToken,
      url: cookieUrl,
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    {
      name: "starliz_parent_unlock",
      value: unlockToken,
      url: cookieUrl,
      httpOnly: true,
      sameSite: "Lax" as const,
    },
  ];

  if (refreshToken) {
    cookiesToSet.push({
      name: "starliz_refresh",
      value: refreshToken,
      url: cookieUrl,
      httpOnly: true,
      sameSite: "Lax" as const,
    });
  }

  await page.context().addCookies(cookiesToSet);

  await page.addInitScript(() => {
    const profileId = "e2e-parent-shell-child";
    const serializedProfiles = JSON.stringify([
      {
        id: profileId,
        name: "E2E Parent Child",
        avatar: "star",
        ageRange: "5-7",
        ageYears: 7,
        startLevelChoice: "Beginner",
      },
    ]);

    ["starliz.profiles", "starliz.childProfiles", "childProfiles"].forEach((key) => {
      window.localStorage.setItem(key, serializedProfiles);
    });

    ["starliz.activeProfileId", "activeChildId", "activeProfileId"].forEach((key) => {
      window.localStorage.setItem(key, profileId);
    });
  });
}

test.describe("Parent Shell Routes", () => {
  test.beforeAll(async ({ request }) => {
    await ensureParentAccount(request);
  });

  test("redirects /parent to /parent/dashboard", async ({ page }) => {
    await authenticateParent(page);
    await page.goto("/parent");
    await expect(page).toHaveURL(/\/parent\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("renders key parent shell sections", async ({ page }) => {
    await authenticateParent(page);

    const cases = [
      { path: "/parent/dashboard", heading: "Dashboard" },
      { path: "/parent/children", heading: "Children" },
      { path: "/parent/billing", heading: "Billing" },
      { path: "/parent/progress", heading: "Progress" },
      { path: "/parent/tutor-history", heading: "Tutor history" },
      { path: "/parent/rewards", heading: "Rewards" },
      { path: "/parent/consent", heading: "Consent" },
      { path: "/parent/messages", heading: "Messages" },
      { path: "/parent/notifications", heading: "Notifications" },
      { path: "/parent/support", heading: "Support" },
      { path: "/parent/security", heading: "Security" },
    ] as const;

    for (const sectionCase of cases) {
      await page.goto(sectionCase.path);
      await expect(page).toHaveURL(new RegExp(`${sectionCase.path}$`));
      await expect(page.getByRole("heading", { name: sectionCase.heading })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Quick facts" })).toBeVisible();
    }
  });
});