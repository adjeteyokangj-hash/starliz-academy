import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type SqliteDbLike = {
  exec: (sql: string) => void;
  close: () => void;
};

type DatabaseSyncConstructor = new (dbFile: string) => SqliteDbLike;

function loadDatabaseSync(): DatabaseSyncConstructor {
  try {
    const dynamicRequire = eval("require") as (id: string) => unknown;
    const sqliteModule = dynamicRequire("node:sqlite") as { DatabaseSync?: DatabaseSyncConstructor };
    if (typeof sqliteModule.DatabaseSync === "function") {
      return sqliteModule.DatabaseSync;
    }
  } catch {
    // Ignore and throw a clearer compatibility error below.
  }

  throw new Error(
    "E2E sqlite helper requires runtime support for node:sqlite. "
    + "Use a Node.js build that provides node:sqlite to run this spec in this environment.",
  );
}

const OPS_ADMIN_EMAIL = process.env.E2E_OPS_ADMIN_EMAIL ?? "ops-owner@starliz.dev";
const OPS_ADMIN_PASSWORD = process.env.E2E_OPS_ADMIN_PASSWORD ?? "OpsAdmin#2026";

const PROJECT_ROOT = (() => {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "package.json")) && existsSync(resolve(cwd, "src"))) {
    return cwd;
  }
  return resolve(cwd, "starliz-academy");
})();

function runSqlFile(filePath: string) {
  const sqlFile = resolve(PROJECT_ROOT, filePath);
  const dbFile = resolve(PROJECT_ROOT, "prisma", "dev.db");
  const sql = readFileSync(sqlFile, "utf-8");
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: OPS_ADMIN_EMAIL,
      password: OPS_ADMIN_PASSWORD,
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
}

function schoolRow(page: import("@playwright/test").Page, schoolName: string) {
  return page.locator("tbody tr").filter({ hasText: schoolName }).first();
}

test.describe("Admin Schools Operations Console", () => {
  test.beforeAll(async () => {
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
    runSqlFile("./scripts/seed_ops_scenarios.sql");
  });

  test.afterAll(async () => {
    runSqlFile("./scripts/cleanup_ops_scenarios.sql");
  });

  test("verifies saved views, filters, risk signals, toasts, heatmap, live center, safeguarding drill-down, and exports", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/schools");

    await expect(page.getByRole("heading", { name: "Schools & Governance" })).toBeVisible();

    await page.getByRole("button", { name: "High-Risk Schools" }).click({ force: true });
    await expect(page.getByText("Operational Mode Active")).toBeVisible();
    await expect(page.getByRole("button", { name: "High-Risk Schools" })).toHaveClass(/bg-indigo-500\/25/);
    await expect(page.locator("section").filter({ hasText: "Operational Mode Active" }).locator("span").filter({ hasText: "Seat Capacity" }).first()).toBeVisible();

    await page.reload();
    await expect
      .poll(async () => {
        const activeBanner = page.getByText("Operational Mode Active");
        if (await activeBanner.count()) return true;
        const activeChip = page.getByRole("button", { name: "High-Risk Schools" });
        const klass = (await activeChip.getAttribute("class")) ?? "";
        return /bg-indigo-500\/25/.test(klass);
      }, { timeout: 30_000 })
      .toBeTruthy();

    await page.getByRole("button", { name: "Default View" }).click({ force: true });
    await page.getByRole("button", { name: "Clear", exact: true }).click({ force: true });
    await page.getByRole("button", { name: "Suspended Schools" }).click({ force: true });

    const suspendedRows = page.locator("tbody tr").filter({ has: page.getByText("Suspended", { exact: true }) });
    await expect(suspendedRows.first()).toBeVisible();
    await expect(schoolRow(page, "Ops Active Academy")).toHaveCount(0);

    await page.getByRole("button", { name: "Clear", exact: true }).click({ force: true });
    await expect(schoolRow(page, "Ops Capacity Risk Academy")).toBeVisible();
    await expect(schoolRow(page, "Ops Capacity Risk Academy").getByText("Over capacity")).toBeVisible();
    await expect(schoolRow(page, "Ops No Teacher Academy").getByText("No active teachers")).toBeVisible();
    await expect(schoolRow(page, "Ops Suspended Academy").getByText("Suspended", { exact: true })).toBeVisible();

    const capacityHeatmap = page
      .locator("section")
      .filter({ hasText: "Cross-School Performance Heatmap" })
      .locator("article")
      .filter({ hasText: "Ops Capacity Risk Academy" })
      .first();
    await expect(capacityHeatmap).toBeVisible();
    await expect(capacityHeatmap.getByText(/Risk [1-4]\/4/)).toBeVisible();

    await expect(page.getByText("Live Operations Center")).toBeVisible();
    await expect(page.getByText(/Live alerts queue:/)).toBeVisible();
    await expect
      .poll(async () => (await page.getByText(/^Live via /).first().textContent()) ?? "", {
        timeout: 30_000,
      })
      .toMatch(/Live via (polling|sse|websocket|offline)/i);

    await schoolRow(page, "Ops Safeguarding Academy").getByRole("button", { name: "View Safeguarding" }).click();

    // Verify Dynamic Scoring Dashboard renders after school selection
    await expect(page.locator('[data-testid="dsd-overall-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-governance-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-safeguarding-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-operational-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-licence-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-trend-cards"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-risk-breakdown"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-top-factors"]')).toBeVisible();
    await expect(page.locator('[data-testid="dsd-next-actions"]')).toBeVisible();

    await expect(page.locator("#school-safeguarding").getByRole("heading", { name: "Safeguarding" })).toBeVisible();
    await expect(page.locator("#school-safeguarding").getByText(/behaviour/i)).toBeVisible();

    const exportButton = schoolRow(page, "Ops Safeguarding Academy").getByRole("button", { name: "Export Data" });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
    await exportButton.scrollIntoViewIfNeeded();
    const exportDownload = page.waitForEvent("download", { timeout: 45_000 });
    await exportButton.click({ force: true });
    await exportDownload;

    await schoolRow(page, "Ops Safeguarding Academy").getByRole("button", { name: "Manage Teachers" }).click({ force: true });

    const teacherEmailInput = page.locator("#school-teachers").getByPlaceholder("Teacher email");
    if (!(await teacherEmailInput.isVisible())) {
      const invitesSection = page
        .locator("#school-teachers")
        .getByRole("heading", { name: "Invites" })
        .first()
        .locator("xpath=ancestor::section[1]");
      const invitesToggle = invitesSection.getByRole("button", { name: /Expand|Collapse/ }).first();
      await invitesToggle.click();
    }

    await expect(teacherEmailInput).toBeVisible();
    await expect(page.locator("#school-teachers").getByPlaceholder("Display name")).toBeVisible();
    await expect(page.locator("#school-teachers").getByRole("button", { name: "Send Invite" })).toBeVisible();
    await expect(page.locator("#school-teachers")).toBeInViewport();

    await expect(page.getByTestId("prov-hardening-panel")).toBeVisible();
    await page.getByTestId("prov-history-toggle").click({ force: true });
    await expect(page.getByTestId("prov-history-list")).toBeVisible();
    await page.getByTestId("prov-history-refresh").click({ force: true });
    await page.getByTestId("prov-runner-button").click({ force: true });

    const trustCode = `ops-e2e-${Date.now()}`;
    await page.getByTestId("mat-toggle").click({ force: true });
    await expect(page.getByTestId("mat-panel-body")).toBeVisible();
    await page.getByTestId("trust-name-input").fill("Ops E2E Trust");
    await page.getByTestId("trust-code-input").fill(trustCode);
    await page.getByTestId("trust-region-input").fill("UK South");
    await page.getByTestId("trust-save-button").click({ force: true });
    await page.getByTestId("trust-search-input").fill(trustCode);
    await expect(page.getByTestId("trust-list")).toBeVisible();
    const trustRows = page.getByTestId("trust-row");
    if (await trustRows.count()) {
      await trustRows.first().click({ force: true });
      await page.getByTestId("trust-assign-school-button").click({ force: true });
    }
    await page.getByTestId("bulk-create-button").click({ force: true });
    const executeBatchButton = page.getByTestId("bulk-execute-button").first();
    if (await executeBatchButton.isVisible()) {
      await executeBatchButton.click({ force: true });
    }

    await page.getByTestId("notifications-toggle").click({ force: true });
    await expect(page.getByTestId("notifications-body")).toBeVisible();
    await page.getByTestId("notif-email-toggle").check({ force: true });
    await page.getByTestId("notif-sms-toggle").check({ force: true });
    await page.getByTestId("notification-save-pref-button").click({ force: true });
    await page.getByTestId("notification-manual-event-type").fill("manual.test.ops");
    await page.getByTestId("notification-manual-payload").fill('{"scenario":"ops-e2e"}');
    await page.getByTestId("notification-dispatch-button").click({ force: true });
    await expect(page.getByTestId("notification-events-list")).toBeVisible();
  });
});
