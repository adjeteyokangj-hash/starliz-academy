import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";
import { assertDisposableDatabase } from "../../../scripts/ci/disposable-db";

export async function seedAuthScenario(tag: string) {
  assertDisposableDatabase();
  const prisma = new PrismaClient();
  const suffix = `${tag}-${randomUUID()}`;
  const password = `CI-${tag}-Password#2026`;
  const passwordHash = await bcrypt.hash(password, 12);
  const parent = await prisma.user.create({ data: { email: `${suffix}@example.test`, passwordHash, name: `CI ${tag} parent`, role: "parent", consentVersion: "1.0", consentAcceptedAt: new Date(), parentProfile: { create: { phone: `ci-${suffix}`, country: "GB", status: "active" } } } });
  const student = await prisma.user.create({ data: { email: `student-${suffix}@example.test`, username: `ci-${suffix}`, passwordHash, name: "CI child", role: "student" } });
  const child = await prisma.childProfile.create({ data: { id: `child-${suffix}`, parentId: parent.id, userId: student.id, name: "CI child", age: 7, yearGroup: "Year 2", avatar: "star" } });
  const other = await prisma.user.create({ data: { email: `other-${suffix}@example.test`, passwordHash, role: "parent", name: "Other CI parent", consentVersion: "1.0", consentAcceptedAt: new Date() } });
  const foreignChild = await prisma.childProfile.create({ data: { id: `foreign-${suffix}`, parentId: other.id, name: "Other CI child", age: 8, yearGroup: "Year 3" } });
  const admin = await prisma.user.create({ data: { email: `admin-${suffix}@example.test`, passwordHash, name: "CI admin", role: "admin", adminProfile: { create: { active: true, role: { create: { name: `ci-${suffix}`, permissions: JSON.stringify(["VIEW_REPORTS", "VIEW_PROGRESS"]) } } } } } });
  return { prisma, password, parent, child, foreignChild, admin, student };
}
export type AuthScenario = Awaited<ReturnType<typeof seedAuthScenario>>;

export function origin(page: Page) { return new URL(page.url() === "about:blank" ? "http://127.0.0.1:3000" : page.url()).origin; }

export async function login(page: Page, scenario: AuthScenario, actor = scenario.parent) {
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post("/api/auth/login", { data: { identifier: actor.email, password: scenario.password } });
    if (response.status() === 429 && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, Math.min(65000, Math.max(1000, Number(response.headers()["retry-after"] ?? 61) * 1000)))); continue;
    }
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).user.role).toBe(actor.role);
    const cookies = await page.context().cookies();
    expect(cookies.some(cookie => cookie.name === "starliz_session")).toBe(true);
    expect(cookies.some(cookie => cookie.name === "starliz_refresh")).toBe(true);
    expect(cookies.some(cookie => cookie.name === "starliz_parent_unlock")).toBe(false);
    return;
  }
  throw new Error("CI login rate limit did not clear");
}

export async function staleAccess(page: Page) {
  const existing = (await page.context().cookies()).find(cookie => cookie.name === "starliz_session");
  expect(existing).toBeTruthy();
  await page.context().addCookies([{ ...existing!, value: "stale.invalid.session" }]);
}
