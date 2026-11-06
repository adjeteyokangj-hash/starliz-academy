import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import { REFERENCE_PROGRAMS } from "../../src/lib/coding/answers";
import { firstInstructionsPackages } from "../../src/lib/coding/curriculum/first-instructions";
import { routeEvaluationSchema } from "../../src/lib/coding/curriculum/route-engine";

// New, labelled QA records only. Never borrow, reset or delete learner work.
const prisma = new PrismaClient();
const runId = `coding-qa-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const lesson = "/api/student/coding/lessons/understanding-loops";
type Family = { parentId: string; studentId: string; childId: string; parentEmail: string; studentEmail: string };
const families: Family[] = [];
let adminId = "";
let adminEmail = "";
let adminProfileId = "";
let fixturesCommitted = false;
const evidence: Record<string, unknown> = { runId, authenticated: true, fixtureRecordsOnly: true, checks: [] };
const record = (check: string) => (evidence.checks as string[]).push(check);

async function signIn(request: APIRequestContext, identifier: string) {
  const response = await request.post("/api/auth/login", { data: { identifier, password } });
  expect(response.status(), "QA account must authenticate through the real login endpoint").toBe(200);
}

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
  for (const kind of ["owner", "other", "no-consent", "expired"]) {
    const parentEmail = `${runId}-${kind}-parent@example.invalid`;
    const studentEmail = `${runId}-${kind}-student@example.invalid`;
    const parent = await tx.user.create({ data: {
      email: parentEmail, name: `Coding QA ${kind} parent`, passwordHash, role: "parent",
      consentAcceptedAt: kind === "no-consent" ? null : new Date(), consentVersion: "coding-qa",
    } });
    const student = await tx.user.create({ data: { email: studentEmail, name: `Coding QA ${kind}`, passwordHash, role: "student" } });
    const child = await tx.childProfile.create({ data: { id: randomUUID(), parentId: parent.id, userId: student.id, name: `Coding QA ${kind}`, yearGroup: "Year 4" } });
    await tx.user.update({ where: { id: parent.id }, data: { activeChildId: child.id } });
    if (kind === "expired") await tx.subscription.create({ data: { parentId: parent.id, provider: "manual", planKey: "free", status: "expired" } });
    families.push({ parentId: parent.id, studentId: student.id, childId: child.id, parentEmail, studentEmail });
  }
  // Dedicated content/settings QA role, disabled again after verification.
  const role = await tx.adminRole.create({ data: { name: runId, permissions: JSON.stringify(["MANAGE_SETTINGS", "MANAGE_CONTENT"]) } });
  adminEmail = `${runId}-admin@example.invalid`;
  const admin = await tx.user.create({ data: { email: adminEmail, passwordHash, role: "admin", name: "Coding QA settings administrator" } });
  const profile = await tx.adminUser.create({ data: { userId: admin.id, roleId: role.id, title: "Coding QA only" } });
  adminId = admin.id;
  adminProfileId = profile.id;
  }, { timeout: 60_000 });
  fixturesCommitted = true;
  evidence.fixtureIds = { families: families.map(({ parentId, studentId, childId }) => ({ parentId, studentId, childId })), adminId };
});

test.afterAll(async () => {
  if (fixturesCommitted && adminProfileId) await prisma.adminUser.update({ where: { id: adminProfileId }, data: { active: false } });
  evidence.fixtureAdminDisabled = Boolean(adminProfileId);
  fs.mkdirSync("artifacts", { recursive: true });
  fs.mkdirSync("artifacts/coding-authenticated-uat", { recursive: true });
  fs.writeFileSync(`artifacts/coding-authenticated-uat/${runId}.json`, JSON.stringify(evidence, null, 2));
  if (!fs.existsSync("artifacts/coding-authenticated-uat.json")) fs.writeFileSync("artifacts/coding-authenticated-uat.json", JSON.stringify(evidence, null, 2), { flag: "wx" });
  await prisma.$disconnect();
});

// Playwright requires destructuring for this metadata-only hook.
test.afterEach(async ({}, testInfo) => {
  const results = (evidence.testResults ??= []) as Array<{ title: string; status: string | undefined }>;
  results.push({ title: testInfo.title, status: testInfo.status });
});

test("authenticated Coding journey, independent retry, immutable evidence and access denial", async ({ page, playwright, baseURL }) => {
  test.setTimeout(240_000);
  const family = families[0];
  await signIn(page.request, family.studentEmail);
  expect((await page.request.get(lesson)).status()).toBe(200);
  const submit = async (data: Record<string, unknown>, expectedStatus = 200) => {
    const response = await page.request.post(lesson, { data });
    expect(response.status(), `Coding action ${data.action}`).toBe(expectedStatus);
    return response.json();
  };
  await submit({ action: "run", stage: "create", program: REFERENCE_PROGRAMS.create }, 400);
  record("later stages rejected before prerequisites");
  await submit({ action: "discover" });
  await submit({ action: "predict", choiceId: "right-three" });
  await submit({ action: "save", stage: "build", program: REFERENCE_PROGRAMS.build });
  let loaded = await (await page.request.get(lesson)).json();
  expect(loaded.workspace.program).toEqual(REFERENCE_PROGRAMS.build);
  const savedBeforeRead = await prisma.codingWorkspace.findUniqueOrThrow({ where: { childId_lessonId: { childId: family.childId, lessonId: "understanding-loops" } } });
  await page.request.get(lesson);
  const savedAfterRead = await prisma.codingWorkspace.findUniqueOrThrow({ where: { id: savedBeforeRead.id } });
  expect(savedAfterRead.updatedAt.toISOString()).toBe(savedBeforeRead.updatedAt.toISOString());
  record("save/resume and read-only reopen preserve workspace revision");
  await page.goto("/student/coding/understanding-loops");
  await expect(page.getByRole("heading", { name: "Understanding Loops", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask a person" })).toBeDisabled();
  await page.screenshot({ path: `artifacts/coding-authenticated-uat/${runId}-workspace.png`, fullPage: true });
  const tutor = await submit({ action: "hint", stage: "build", program: REFERENCE_PROGRAMS.build });
  expect(tutor.tutor.message.length).toBeGreaterThan(0);
  evidence.tutorSource = tutor.tutor.source;
  record("authenticated teaching endpoint returns contextual guidance");
  await submit({ action: "run", stage: "build", program: REFERENCE_PROGRAMS.build });
  await submit({ action: "run", stage: "practise", program: REFERENCE_PROGRAMS.practise });
  await submit({ action: "run", stage: "debug", program: REFERENCE_PROGRAMS.debug });
  for (let i = 0; i < 3; i++) await submit({ action: "hint", stage: "create", program: REFERENCE_PROGRAMS.create });
  const assisted = await submit({ action: "run", stage: "create", program: REFERENCE_PROGRAMS.create });
  expect(assisted.passed).toBe(false);
  expect(assisted.workspace.evidence.independent).toBe(false);
  const restored = await submit({ action: "restore", stage: "create" });
  const goal = restored.workspace.lesson.stages.find((stage: { stage: string }) => stage.stage === "create").goal;
  expect(goal).not.toEqual({ x: 2, y: 2 });
  const independent = { blocks: [
    { id: "qa-x", kind: "repeat", times: goal.x, body: [{ id: "qa-right", kind: "move", direction: "right" }] },
    { id: "qa-y", kind: "repeat", times: goal.y, body: [{ id: "qa-up", kind: "move", direction: "up" }] },
  ] };
  const created = await submit({ action: "run", stage: "create", program: independent });
  expect(created.passed).toBe(true);
  expect(created.workspace.evidence.independent).toBe(true);
  const reviewResponses = await Promise.all(Array.from({ length: 2 }, () => page.request.post(lesson, {
    data: { action: "review", explanation: `My loops repeat right ${goal.x} times and up ${goal.y} times.` },
  })));
  expect(reviewResponses.some((response) => response.status() === 200)).toBe(true);
  expect(reviewResponses.every((response) => [200, 409].includes(response.status()))).toBe(true);
  const reviewed = await reviewResponses.find((response) => response.status() === 200)!.json();
  expect(reviewed.workspace.skillStatus).toBe("mastered");
  record("all seven stages complete; answer disclosure requires a fresh independent target");
  const certificateCount = await prisma.certificate.count({ where: { studentId: family.childId, awardSourceType: "coding_lesson" } });
  expect(certificateCount).toBe(1);
  expect(await prisma.walletTransaction.count({ where: { childId: family.childId, source: "coding", reason: "You mastered this coding skill" } })).toBe(1);
  await submit({ action: "review", explanation: `The loops repeat right ${goal.x} times and up ${goal.y} times.` });
  expect(await prisma.certificate.count({ where: { studentId: family.childId, awardSourceType: "coding_lesson" } })).toBe(1);
  record("lesson certificate is idempotent");
  await submit({ action: "open", stage: "create" });
  await submit({ action: "save", stage: "create", program: { blocks: [] } });
  const row = await prisma.codingWorkspace.findUniqueOrThrow({ where: { childId_lessonId: { childId: family.childId, lessonId: "understanding-loops" } } });
  await prisma.codingProjectVersion.createMany({ data: Array.from({ length: 20 }, (_, index) => ({ workspaceId: row.id, stage: "create", label: `qa-preserved-${index}`, programJson: JSON.stringify(independent) })) });
  await submit({ action: "save", stage: "create", program: { blocks: [] } });
  expect(await prisma.codingProjectVersion.count({ where: { workspaceId: row.id, label: { startsWith: "qa-preserved-" } } })).toBe(20);
  expect((await page.request.get(`/api/parent/coding?studentId=${family.childId}`)).status()).toBe(403);
  record("saving retains all prior project versions; learner cannot enter the parent portfolio endpoint");
  const parent = await playwright.request.newContext({ baseURL });
  try {
    await signIn(parent, family.parentEmail);
    const own = await parent.get(`/api/parent/coding?studentId=${family.childId}`);
    expect(own.status()).toBe(200);
    const summary = (await own.json()).summary;
    expect(summary.projectPreview.program).toEqual(independent);
    expect(summary.projectPreview.evidenceStatus).toBe("assessed-version");
    expect((await parent.get(`/api/parent/coding?studentId=${families[1].childId}`)).status()).toBe(404);
    record("parent sees own assessed artifact after draft edits; another child is denied");
  } finally { await parent.dispose(); }
  for (const index of [2, 3]) {
    const denied = await playwright.request.newContext({ baseURL });
    try {
      await signIn(denied, families[index].studentEmail);
      const response = await denied.get(lesson);
      expect(response.status()).toBe(index === 2 ? 403 : 402);
    } finally { await denied.dispose(); }
  }
  record("missing consent and expired subscription block Coding access");
  loaded = await (await page.request.get(lesson)).json();
  expect(loaded.workspace.skillStatus).toBe("mastered");
  expect(loaded.workspace.program.blocks).toHaveLength(0);
  const unauthenticated = await playwright.request.newContext({ baseURL });
  try { expect((await unauthenticated.get(lesson)).status()).toBe(401); } finally { await unauthenticated.dispose(); }
  record("anonymous access denied");
});

test("settings require administrator permission and audit a default-off save", async ({ request, playwright, baseURL }) => {
  await signIn(request, families[1].studentEmail);
  expect((await request.put("/api/admin/coding/settings", { data: { humanAssistanceEnabled: true } })).status()).toBe(403);
  const admin = await playwright.request.newContext({ baseURL });
  try {
    await signIn(admin, adminEmail);
    expect((await admin.get("/api/admin/coding/settings")).status()).toBe(200);
    // Keep the global policy disabled throughout this hosted-database test.
    const saved = await admin.put("/api/admin/coding/settings", { data: { humanAssistanceEnabled: false } });
    expect(saved.status()).toBe(200);
    expect((await saved.json()).humanAssistanceEnabled).toBe(false);
    expect(await prisma.auditLog.count({ where: { actorUserId: adminId, action: "coding.assistance.updated" } })).toBeGreaterThan(0);
    record("settings-only administrator can save default-off policy; learner cannot enable it; change audited");
  } finally { await admin.dispose(); }
});

test("all six First Instructions drafts execute through the protected author preview", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page.request, adminEmail);
  const readiness = await page.request.get("/api/admin/coding/curriculum");
  expect(readiness.status()).toBe(200);
  expect((await readiness.json()).curriculum.verifiedNewLessonPackages).toBe(0);
  for (const draft of firstInstructionsPackages) {
    const endpoint = `/api/admin/coding/preview/${draft.id}`;
    const response = await page.request.get(endpoint);
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("referenceArtifacts");
    expect(text).not.toContain("translated-map");
    for (const reference of draft.referenceArtifacts) {
      const prediction = reference.stage === "predict" ? routeEvaluationSchema.parse(draft.evaluationSpec).stages.predict!.goal : undefined;
      const run = await page.request.post(endpoint, { data: { stage: reference.stage, program: reference.artifact, prediction } });
      expect(run.status()).toBe(200);
      expect((await run.json()).assessment.passed).toBe(true);
    }
    const predictionStarter = draft.stages.find((stage) => stage.id === "predict")!.starter;
    expect((await page.request.post(endpoint, { data: { stage: "predict", program: predictionStarter } })).status()).toBe(400);
    for (const variant of draft.independentVariants) {
      const run = await page.request.post(endpoint, { data: { stage: "create", variantId: variant.id, program: variant.referenceArtifact } });
      expect(run.status()).toBe(200);
      expect((await run.json()).assessment.passed).toBe(true);
      const wrong = await page.request.post(endpoint, { data: { stage: "create", variantId: variant.id, program: { blocks: [] } } });
      expect((await wrong.json()).assessment.passed).toBe(false);
    }
    const faulty = await page.request.post(endpoint, { data: { stage: "debug", program: draft.fault.artifact } });
    expect((await faulty.json()).assessment.failureCode).toBe(draft.fault.expectedFailureCode);
  }
  record("six authored drafts: stage references, prediction-required checks, independent variants, seeded faults and hidden-case withholding verified through authenticated APIs");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/coding/preview/what-is-an-instruction");
  await expect(page.getByRole("heading", { name: "What is an instruction?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "build", exact: true }).click();
  await page.getByRole("button", { name: "Move right", exact: true }).click();
  await page.getByRole("button", { name: "Run commands", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("meets this stage");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByRole("img", { name: "Character at 1, 0.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "predict", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run commands", exact: true })).toBeDisabled();
  await page.getByLabel("Column", { exact: true }).selectOption({ value: "1" });
  await page.getByLabel("Row", { exact: true }).selectOption({ value: "0" });
  const predictionResponse = page.waitForResponse((response) => response.url().includes("/api/admin/coding/preview/") && response.request().method() === "POST" && response.request().postDataJSON()?.stage === "predict");
  await page.getByRole("button", { name: "Run commands", exact: true }).click();
  expect((await predictionResponse).request().postDataJSON().prediction).toEqual({ x: 1, y: 0 });
  await expect(page.getByRole("status")).toContainText("Your prediction matches");
  await page.getByRole("button", { name: "create", exact: true }).click();
  await expect(page.getByRole("img", { name: "Character at 2, 2.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Move left", exact: true }).click();
  await page.getByRole("button", { name: "Run commands", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("meets this stage");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/coding-first-instructions-preview.png", fullPage: true });
  record("six authored drafts: all stage references and seeded faults verified through authenticated preview; hidden cases withheld");
});
