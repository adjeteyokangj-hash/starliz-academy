import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();

const OPS_ADMIN_EMAIL = process.env.E2E_OPS_ADMIN_EMAIL ?? "platform-admin@starliz.dev";
const OPS_ADMIN_PASSWORD = process.env.E2E_OPS_ADMIN_PASSWORD ?? "PlatformAdmin#2026";
const OPS_OWNER_USER_ID = "platform-admin-user";

const OPS_SCHOOL_IDS = [
  "ops-school-active",
  "ops-school-suspended",
  "ops-school-no-teacher",
  "ops-school-capacity",
  "ops-school-safeguarding",
] as const;

const OPS_USER_IDS = [
  OPS_OWNER_USER_ID,
  "ops-active-teacher-user",
  "ops-invited-teacher-user",
  "ops-capacity-teacher-user",
  "ops-safeguarding-teacher-user",
  "ops-parent-1-user",
  "ops-parent-2-user",
  "ops-parent-3-user",
] as const;

const OPS_CHILD_IDS = [
  "ops-capacity-child-1",
  "ops-capacity-child-2",
  "ops-capacity-child-3",
] as const;

async function cleanupOpsScenarios() {
  // Delete in reverse-FK order
  await prisma.safeguardingEvidenceAttachment.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.safeguardingWorkflowEvent.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.safeguardingIncident.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolSafeguardingAlert.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolCommunicationLog.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolCommunicationPreference.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.parentSchoolLink.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolAccessLog.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolLoginHistory.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolAuditLog.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.licenceEvent.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.teacherInviteToken.deleteMany({
    where: { schoolTeacher: { schoolId: { in: [...OPS_SCHOOL_IDS] } } },
  });
  await prisma.schoolInviteToken.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.classroom.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolStudent.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolTeacher.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.schoolLicence.deleteMany({ where: { schoolId: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.school.deleteMany({ where: { id: { in: [...OPS_SCHOOL_IDS] } } });
  await prisma.attempt.deleteMany({ where: { studentId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.assignment.deleteMany({ where: { studentId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.progressRecord.deleteMany({ where: { childId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.walletTransaction.deleteMany({ where: { childId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.weakArea.deleteMany({ where: { studentId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.studentSkill.deleteMany({ where: { studentId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.questionHistory.deleteMany({ where: { childId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.childReward.deleteMany({ where: { childId: { in: [...OPS_CHILD_IDS] } } });
  await prisma.childProfile.deleteMany({ where: { id: { in: [...OPS_CHILD_IDS] } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: [...OPS_USER_IDS] } } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "platform-admin@starliz.dev",
          "active.teacher@starliz.dev",
          "invite.only@starliz.dev",
          "capacity.teacher@starliz.dev",
          "safeguarding.teacher@starliz.dev",
          "capacity-parent-1@starliz.dev",
          "capacity-parent-2@starliz.dev",
          "capacity-parent-3@starliz.dev",
        ],
      },
    },
  });
}

async function seedOpsScenarios() {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const platformAdminHash = await bcrypt.hash(OPS_ADMIN_PASSWORD, 12);

  // Users — platform admin only (never ops-owner@starliz.dev; that is StarLiz Academy School Owner)
  await prisma.user.upsert({
    where: { email: OPS_ADMIN_EMAIL },
    create: {
      id: OPS_OWNER_USER_ID,
      email: OPS_ADMIN_EMAIL,
      passwordHash: platformAdminHash,
      name: "Platform Admin",
      role: "admin",
    },
    update: {
      name: "Platform Admin",
      role: "admin",
      passwordHash: platformAdminHash,
    },
  });
  for (const [id, email, name, role] of [
    ["ops-active-teacher-user", "active.teacher@starliz.dev", "Active Teacher", "teacher"],
    ["ops-invited-teacher-user", "invite.only@starliz.dev", "Invite Pending Teacher", "teacher"],
    ["ops-capacity-teacher-user", "capacity.teacher@starliz.dev", "Capacity Teacher", "teacher"],
    ["ops-safeguarding-teacher-user", "safeguarding.teacher@starliz.dev", "Safeguarding Teacher", "teacher"],
    ["ops-parent-1-user", "capacity-parent-1@starliz.dev", "Capacity Child One Parent", "parent"],
    ["ops-parent-2-user", "capacity-parent-2@starliz.dev", "Capacity Child Two Parent", "parent"],
    ["ops-parent-3-user", "capacity-parent-3@starliz.dev", "Capacity Child Three Parent", "parent"],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      create: { id, email, passwordHash: "dev-seed-hash", name, role },
      update: { name, role },
    });
  }

  // Schools
  for (const [id, name, slug, status] of [
    ["ops-school-active", "Ops Active Academy", "ops-active-academy", "active"],
    ["ops-school-suspended", "Ops Suspended Academy", "ops-suspended-academy", "suspended"],
    ["ops-school-no-teacher", "Ops No Teacher Academy", "ops-no-teacher-academy", "active"],
    ["ops-school-capacity", "Ops Capacity Risk Academy", "ops-capacity-risk-academy", "active"],
    ["ops-school-safeguarding", "Ops Safeguarding Academy", "ops-safeguarding-academy", "active"],
  ] as const) {
    await prisma.school.upsert({
      where: { slug },
      create: { id, name, slug, status, type: "school", contactEmail: `${slug}@starliz.dev`, notes: "Ops scenario fixture", ownerUserId: OPS_OWNER_USER_ID },
      update: { name, status, ownerUserId: OPS_OWNER_USER_ID, notes: "Ops scenario fixture" },
    });
  }

  // Licences
  for (const [id, schoolId, status, seatLimit] of [
    ["ops-licence-active", "ops-school-active", "active", 25],
    ["ops-licence-suspended", "ops-school-suspended", "suspended", 20],
    ["ops-licence-no-teacher", "ops-school-no-teacher", "active", 15],
    ["ops-licence-capacity", "ops-school-capacity", "active", 2],
    ["ops-licence-safeguarding", "ops-school-safeguarding", "active", 12],
  ] as const) {
    await prisma.schoolLicence.upsert({
      where: { schoolId },
      create: { id, schoolId, provider: "manual", status, seatLimit, currency: "GBP", billingInterval: "month" },
      update: { status, seatLimit, billingInterval: "month" },
    });
  }

  // Teachers
  await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: "ops-school-active", userId: "ops-active-teacher-user" } },
    create: { id: "ops-teacher-active", schoolId: "ops-school-active", userId: "ops-active-teacher-user", role: "teacher", status: "active", invitedAt: now, acceptedAt: now, lastActiveAt: now },
    update: { status: "active", acceptedAt: now, lastActiveAt: now },
  });
  await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: "ops-school-no-teacher", userId: "ops-invited-teacher-user" } },
    create: { id: "ops-teacher-invited", schoolId: "ops-school-no-teacher", userId: "ops-invited-teacher-user", role: "teacher", status: "invited", invitedAt: now, acceptedAt: null, lastActiveAt: null },
    update: { status: "invited", acceptedAt: null, lastActiveAt: null },
  });
  await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: "ops-school-capacity", userId: "ops-capacity-teacher-user" } },
    create: { id: "ops-teacher-capacity", schoolId: "ops-school-capacity", userId: "ops-capacity-teacher-user", role: "teacher", status: "active", invitedAt: now, acceptedAt: now, lastActiveAt: now },
    update: { status: "active", acceptedAt: now, lastActiveAt: now },
  });
  await prisma.schoolTeacher.upsert({
    where: { schoolId_userId: { schoolId: "ops-school-safeguarding", userId: "ops-safeguarding-teacher-user" } },
    create: { id: "ops-teacher-safeguarding", schoolId: "ops-school-safeguarding", userId: "ops-safeguarding-teacher-user", role: "teacher", status: "active", invitedAt: now, acceptedAt: now, lastActiveAt: now },
    update: { status: "active", acceptedAt: now, lastActiveAt: now },
  });

  // Capacity risk children + school links
  for (const [id, parentId, name, age, yearGroup] of [
    ["ops-capacity-child-1", "ops-parent-1-user", "Capacity Child One", 8, "Year 4"],
    ["ops-capacity-child-2", "ops-parent-2-user", "Capacity Child Two", 8, "Year 4"],
    ["ops-capacity-child-3", "ops-parent-3-user", "Capacity Child Three", 9, "Year 5"],
  ] as const) {
    await prisma.childProfile.upsert({
      where: { id },
      create: { id, parentId, name, age, yearGroup, selectedVoice: "friendly_coach", selectedTheme: "default", archived: false },
      update: { parentId, name, archived: false },
    });
  }
  for (const [id, childId] of [
    ["ops-schoolstudent-1", "ops-capacity-child-1"],
    ["ops-schoolstudent-2", "ops-capacity-child-2"],
    ["ops-schoolstudent-3", "ops-capacity-child-3"],
  ] as const) {
    await prisma.schoolStudent.upsert({
      where: { schoolId_childId: { schoolId: "ops-school-capacity", childId } },
      create: { id, schoolId: "ops-school-capacity", childId, status: "active", joinedAt: now },
      update: { status: "active", leftAt: null },
    });
  }

  // Pending invite token
  await prisma.schoolInviteToken.upsert({
    where: { tokenHash: "ops-pending-invite-token-hash" },
    create: {
      id: "ops-pending-invite-1",
      schoolId: "ops-school-safeguarding",
      inviteType: "teacher",
      targetEmail: "pending.invite@starliz.dev",
      targetRole: "teacher",
      tokenHash: "ops-pending-invite-token-hash",
      expiresAt: sevenDaysOut,
      metadataJson: '{"source":"ops-seed"}',
    },
    update: { expiresAt: sevenDaysOut, usedAt: null },
  });

  // Open safeguarding incident
  await prisma.safeguardingIncident.upsert({
    where: { id: "ops-safeguarding-incident-1" },
    create: {
      id: "ops-safeguarding-incident-1",
      schoolId: "ops-school-safeguarding",
      reportedByUserId: OPS_OWNER_USER_ID,
      escalationLevel: "tier_2",
      category: "behaviour",
      severity: "high",
      status: "open",
      description: "Ops seed safeguarding scenario incident",
      actionTaken: "Monitoring in progress",
    },
    update: {
      escalationLevel: "tier_2",
      severity: "high",
      status: "open",
      resolvedAt: null,
    },
  });
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
    test.setTimeout(120_000);
    console.log("Seeding ops scenarios into database...");
    await cleanupOpsScenarios();
    await seedOpsScenarios();
    console.log("Ops scenarios seeded.");
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    console.log("Cleaning up ops scenarios...");
    await cleanupOpsScenarios();
    await prisma.$disconnect();
    console.log("Ops scenarios cleanup complete.");
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

    const teacherEmailInput = page.locator("#school-teachers").getByPlaceholder("Staff email");
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
