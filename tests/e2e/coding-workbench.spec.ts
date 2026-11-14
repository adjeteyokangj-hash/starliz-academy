import { test, expect, type APIRequestContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";

test.describe.configure({ mode: "serial" });
const runId = `coding-workbench-${randomUUID()}`, password = randomBytes(32).toString("base64url");
const accounts: Array<{ id: string; email: string; profileId?: string }> = [];
const directory = `artifacts/coding-workbench-uat/${runId}`;
const evidence: { runId: string; fixturesOnly: boolean; checks: Array<Record<string, unknown>> } = { runId, fixturesOnly: true, checks: [] };
async function login(request: APIRequestContext, account = accounts[0]!) {
  expect((await request.post("/api/auth/login", { data: { identifier: account.email, password } })).status()).toBe(200);
}
test.beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  expect(createHash("sha256").update(`${target.hostname}/${target.pathname}/${target.username}`).digest("hex"), "QA fixtures must use the previously reviewed database target").toBe("6e8331571ea9c13c393cd1c2c96adda278376e3aca6606a738c4e85a7b8b0295");
  const failed = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  expect(Number(failed[0]!.count)).toBe(0);
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.adminRole.create({ data: { name: runId, permissions: JSON.stringify(["MANAGE_CONTENT"]) } });
    const result: typeof accounts = [];
    for (const suffix of ["owner", "other"]) {
      const user = await tx.user.create({ data: { email: `${runId}-${suffix}@example.invalid`, passwordHash, role: "admin", name: "Coding author-workbench QA only" } });
      const profile = await tx.adminUser.create({ data: { userId: user.id, roleId: role.id, title: "Temporary Coding verification account" } });
      result.push({ id: user.id, email: user.email!, profileId: profile.id });
    }
    const parent = await tx.user.create({ data: { email: `${runId}-parent@example.invalid`, passwordHash, role: "parent", name: "Coding author-workbench role-denial QA" } });
    result.push({ id: parent.id, email: parent.email! });
    return result;
  }, { timeout: 60000 });
  accounts.push(...created); mkdirSync(directory, { recursive: true });
});
test.beforeEach(async ({ page }) => {
  page.on("response", async (response) => {
    if (response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.status() >= 400) evidence.checks.push({ action: response.request().postDataJSON()?.action, status: response.status(), result: await response.json().catch(() => ({})) });
  });
});
test.afterEach(async ({ page }, info) => {
  evidence.checks.push({ title: info.title, status: info.status });
  if (info.status !== info.expectedStatus) {
    const label = info.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 90);
    await page.screenshot({ path: `${directory}/failure-${label}.png`, fullPage: true }).catch(() => {});
    writeFileSync(`${directory}/failure-${label}.txt`, await page.locator("body").innerText().catch(() => "The page could not be inspected."), { flag: "wx" });
  }
});
test.afterAll(async () => {
  const profiles = accounts.flatMap((account) => account.profileId ? [account.profileId] : []);
  if (profiles.length) await prisma.adminUser.updateMany({ where: { id: { in: profiles } }, data: { active: false } });
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/result.json`, JSON.stringify({ ...evidence, retainedFixtureIds: accounts.map(({ id, profileId }) => ({ id, profileId })), fixtureAdminsDisabled: profiles.length }, null, 2), { flag: "wx" });
  await prisma.$disconnect();
});

test("author sessions enforce role, ownership and revision without publishing activities", async ({ playwright, baseURL }) => {
  const owner = await playwright.request.newContext({ baseURL }), other = await playwright.request.newContext({ baseURL }), parent = await playwright.request.newContext({ baseURL });
  try {
    expect((await owner.get("/api/admin/coding/workbench/y1-14")).status()).toBe(401);
    await login(owner); await login(other, accounts[1]); await login(parent, accounts[2]);
    expect((await parent.get("/api/admin/coding/workbench/y1-14")).status()).toBe(403);
    const initial = await (await owner.get("/api/admin/coding/workbench/y1-14")).json();
    const action = { action: "open", stage: "discover", revision: initial.workspace.revision };
    expect((await other.post("/api/admin/coding/workbench/y1-14", { data: action })).status()).toBe(409);
    expect((await owner.post("/api/admin/coding/workbench/y1-14", { data: action })).status()).toBe(200);
    expect((await owner.post("/api/admin/coding/workbench/y1-14", { data: action })).status()).toBe(409);
    expect((await owner.post("/api/admin/coding/workbench/y1-14", { data: { ...action, revision: "untrusted", action: "support" } })).status()).toBe(409);
    const dto = JSON.stringify(initial.workspace);
    expect(dto).not.toContain('"reference"'); expect(dto).not.toContain('"correctId"');
    evidence.checks.push({ authorisation: "role, owner and stale revisions rejected", learnerPublication: "unchanged" });
  } finally { await owner.dispose(); await other.dispose(); await parent.dispose(); }
});

test("visual workspace builds a real repeat program and fits desktop, tablet and mobile", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request);
  page.on("response", async (response) => {
    if (response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST") {
      const action = response.request().postDataJSON(), result = await response.json().catch(() => ({}));
      evidence.checks.push({ action: action?.action, sentRevision: action?.revision, returnedRevision: result.workspace?.revision, status: response.status(), error: result.error });
    }
  });
  await page.goto("/admin/coding/workbench/y1-14");
  await expect(page.getByRole("heading", { name: "Repeat one action", exact: true })).toBeVisible();
  const next = () => page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(next()).toBeEnabled({ timeout: 30000 }); await next().click();
  await page.getByRole("radio", { name: "Three", exact: true }).check();
  await expect(page.getByRole("button", { name: "Record prediction" })).toBeEnabled();
  await page.getByRole("button", { name: "Record prediction" }).click();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  await expect(next()).toBeEnabled({ timeout: 30000 });
  for (const number of [3, 2, 1]) await page.getByRole("button", { name: `Remove action ${number}`, exact: true }).click();
  await page.getByRole("button", { name: "Repeat group", exact: true }).click();
  await page.getByLabel("How many times?", { exact: true }).fill("3");
  await page.getByRole("group", { name: "Inside the group", exact: true }).getByRole("button", { name: "Right →", exact: true }).click();
  await next().click();
  await expect(page.getByRole("heading", { name: "Practise", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run program", exact: true })).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Run program", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replay actual movements" })).toBeVisible();
  for (const [label, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1180], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("heading", { name: "Practise", exact: true })).toBeVisible();
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(horizontalOverflow, `${label} viewport must not scroll horizontally`).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${directory}/${label}.png`, fullPage: true });
    evidence.checks.push({ viewport: label, width, height, horizontalOverflow });
  }
});

test("Python source runs through the authenticated gateway and retains edits and undo during AI help", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request);
  await page.goto("/admin/coding/workbench/what-is-a-variable");
  await expect(page.getByRole("heading", { name: "What is a variable?", exact: true })).toBeVisible();
  const run = () => page.getByRole("button", { name: "Run program", exact: true });
  await expect(run()).toBeEnabled({ timeout: 30000 });
  const actualRun = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
  await run().click();
  const result = await (await actualRun).json();
  expect(result.workspace.lastExecution.ok).toBe(true);
  expect(result.workspace.lastExecution.runtime).toContain("runsc:sha256:b18b261e");
  expect(result.workspace.lastExecution.output.variables.score).toBe(5);
  await expect(page.getByRole("heading", { name: "Interpreter debugger" })).toBeVisible();
  evidence.checks.push({ actualGatewayExecution: true, runtime: result.workspace.lastExecution.runtime, tutorSources: result.workspace.tutorMessages.map((turn: { source: string }) => turn.source) });
  await page.getByRole("button", { name: "Check and continue", exact: true }).click();
  await page.getByRole("radio", { name: "5", exact: true }).check();
  await expect(page.getByRole("button", { name: "Record prediction" })).toBeEnabled();
  await page.getByRole("button", { name: "Record prediction" }).click();
  const editor = page.getByRole("textbox", { name: "python source code", exact: true });
  await expect(page.getByRole("button", { name: "Save version" })).toBeEnabled({ timeout: 30000 });
  await editor.fill("score = score + 2\nprint(score)");
  await page.getByLabel("What are you thinking about?", { exact: true }).fill("How does assignment use the previous value?");
  await page.getByRole("button", { name: "Ask my AI tutor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save version" })).toBeEnabled({ timeout: 30000 });
  await expect(editor).toContainText("score = score + 2");
  await editor.press("Control+z");
  await expect(editor).not.toContainText("score = score + 2");
  await editor.press("Control+y");
  await expect(editor).toContainText("score = score + 2");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByRole("button", { name: "Save version" })).toBeEnabled();
  await expect(page.getByLabel("Choose a version").locator("option").filter({ hasText: "Saved work" }).first()).toBeAttached();
  await page.screenshot({ path: `${directory}/python-workspace.png`, fullPage: true });
});

test("media studio saves, closes and retrieves the actual drawn card across responsive layouts", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request);
  await page.goto("/admin/coding/workbench/y1-07");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 }); await check.click();
  await page.getByRole("radio", { name: "Picture tool", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction" }).click();
  await expect(page.getByLabel("Tool", { exact: true })).toBeEnabled({ timeout: 30000 });
  await page.getByLabel("Tool", { exact: true }).selectOption("picture");
  await page.getByRole("button", { name: "Draw circle", exact: true }).click();
  await page.getByLabel("Save with a meaningful name", { exact: true }).fill("Actual circle card");
  await page.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close card", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Close card", exact: true }).click();
  await expect(page.getByText("The work area is closed. Choose a saved card and open it.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open selected card", exact: true }).click();
  await expect(page.getByLabel("Tool", { exact: true })).toHaveValue("picture");
  const response = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
  await page.getByRole("button", { name: "Preview card", exact: true }).click();
  const result = (await (await response).json()).workspace.lastExecution;
  expect(result.ok).toBe(true); expect(result.output.retrievedCorrectly).toBe(true);
  expect(result.output.document.shapes).toHaveLength(1); expect(result.output.document.shapes[0].kind).toBe("circle");
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/media-${width}.png`, fullPage: true });
  }
  evidence.checks.push({ nativeMedia: "actual circle drawn, saved, closed and reopened", responsiveWidths: [390, 820, 1440], authorPreviewOnly: true });
});

test("scenario controls remove unsafe replies and execute stop-and-help decisions", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request); await page.goto("/admin/coding/workbench/y1-22");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 }); await check.click();
  await page.getByRole("radio", { name: "Stop and ask a trusted adult", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction" }).click();
  await expect(page.getByRole("button", { name: "Remove decision 1", exact: true })).toBeEnabled({ timeout: 30000 });
  await page.getByRole("button", { name: "Remove decision 1", exact: true }).click();
  await page.getByRole("button", { name: "Stop the conversation", exact: true }).click();
  await page.getByRole("button", { name: "Ask a trusted adult", exact: true }).click();
  const response = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
  await page.getByRole("button", { name: "Try your choices", exact: true }).click();
  const result = (await (await response).json()).workspace.lastExecution;
  expect(result.ok).toBe(true); expect(result.output.privacySafe).toBe(true); expect(result.output.contactStopped).toBe(true); expect(result.output.trustedHelp).toBe(true); expect(result.output.realReportSent).toBe(false);
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/scenario-${width}.png`, fullPage: true });
  }
  evidence.checks.push({ nativeScenario: "unsafe reply removed, stop and trusted-adult choices executed", realMessageSent: false, authorPreviewOnly: true });
});

test("community version controls retrieve actual source content and replay a saved working copy", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request); await page.goto("/admin/coding/workbench/y2-20");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 }); await check.click();
  await page.getByRole("radio", { name: "Inspecting the saved content and replaying its route", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  const source = page.getByRole("group", { name: "Practice choices", exact: true });
  await source.getByText("Saved source: library-ready", { exact: true }).click();
  const retrieve = page.getByRole("button", { name: "Retrieve library-ready", exact: true });
  await expect(retrieve).toBeEnabled({ timeout: 30000 }); await retrieve.click();
  const run = async () => {
    const response = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
    await page.getByRole("button", { name: "Try your choices", exact: true }).click();
    return (await (await response).json()).workspace;
  };
  const first = await run();
  expect(first.lastExecution.output.restoredVersion).toBe("library-ready");
  expect(first.lastExecution.output.story[0].directions).toEqual(["right", "down"]);
  expect(first.lastExecution.output.availableVersions).toEqual(["library-draft", "library-ready"]);
  const saved = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "save");
  await page.getByRole("button", { name: "Save version", exact: true }).click();
  const savedWorkspace = (await (await saved).json()).workspace;
  const savedVersion = savedWorkspace.versions.find((version: { label: string }) => version.label === "saved-work");
  expect(savedVersion).toBeTruthy();
  await page.getByLabel("Choose a version", { exact: true }).selectOption(savedVersion.id);
  const restored = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "version");
  await page.getByRole("button", { name: "Restore as a new working copy", exact: true }).click();
  expect((await restored).status()).toBe(200);
  const replayed = await run();
  expect(replayed.lastExecution.output.story[0].title).toBe("library visitor guide");
  expect(replayed.versions.some((version: { id: string }) => version.id === savedVersion.id)).toBe(true);
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/community-versions-${width}.png`, fullPage: true });
  }
  evidence.checks.push({ communityVersions: "retrieved source content, saved working copy, restored and replayed without removing originals", authorPreviewOnly: true });
});

test("native condition editor builds and executes both typed input branches without losing a cleared name draft", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request); await page.goto("/admin/coding/workbench/y3-07");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 }); await check.click();
  await page.getByRole("radio", { name: "Otherwise", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  const events = page.getByLabel("When this happens", { exact: true });
  await expect(events).toBeEnabled({ timeout: 30000 }); await events.selectOption("choose");
  const editor = page.getByLabel("Visual program editor", { exact: true });
  await expect(editor.getByLabel("Add another kind of action", { exact: true }).last()).toBeEnabled({ timeout: 30000 });
  await editor.getByLabel("Add another kind of action", { exact: true }).last().selectOption("if");
  await page.getByLabel("Condition kind", { exact: true }).selectOption("calculation");
  await page.getByLabel("Condition operation", { exact: true }).selectOption("greater");
  await page.getByLabel("Condition input 1 kind", { exact: true }).selectOption("variable");
  const variable = page.getByLabel("Condition input 1 variable name", { exact: true });
  await variable.fill("");
  await expect(editor).toBeVisible();
  await expect(page.getByText("This saved program needs a supported visual format.", { exact: false })).toHaveCount(0);
  await variable.fill("event"); await variable.press("Tab");
  await page.getByLabel("Condition input 2", { exact: true }).fill("3");
  const whenTrue = page.getByRole("group", { name: "When true", exact: true });
  await whenTrue.getByRole("button", { name: "Up ↑", exact: true }).click();
  await whenTrue.getByLabel("Add another kind of action", { exact: true }).selectOption("say");
  await whenTrue.getByLabel("Value", { exact: true }).fill("Upper route");
  const otherwise = page.getByRole("group", { name: "Otherwise", exact: true });
  await otherwise.getByRole("button", { name: "Right →", exact: true }).click();
  await otherwise.getByLabel("Add another kind of action", { exact: true }).selectOption("say");
  await otherwise.getByLabel("Value", { exact: true }).fill("Lower route");
  const press = async (value: string) => {
    await page.getByLabel("Event input value", { exact: true }).fill(value);
    const response = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
    await page.getByRole("button", { name: "Press choose", exact: true }).click();
    return (await (await response).json()).workspace.lastExecution;
  };
  const upper = await press("5"); expect(upper.ok).toBe(true); expect(upper.output.speech).toEqual(["Upper route"]); expect(upper.output.visits).toEqual([{ x: 1, y: 1 }, { x: 1, y: 2 }]);
  const reset = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.interaction?.target === "restart");
  await page.getByRole("button", { name: "Restart play", exact: true }).click(); await reset;
  const lower = await press("3"); expect(lower.ok).toBe(true); expect(lower.output.speech).toEqual(["Lower route"]); expect(lower.output.visits).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/native-condition-${width}.png`, fullPage: true });
  }
  evidence.checks.push({ nativeCondition: "constructed through visual controls, true and equality-boundary branches executed, cleared identifier draft retained", authorPreviewOnly: true });
});

test("native network studio builds both connections and delivers along each calculated path", async ({ page }) => {
  test.setTimeout(240000);
  await login(page.request); await page.goto("/admin/coding/workbench/y3-19");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 }); await check.click();
  await page.getByRole("radio", { name: "No, a connected path is required", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  const connect = page.getByLabel("Connect device", { exact: true });
  await expect(connect).toBeEnabled({ timeout: 30000 }); await connect.selectOption("router");
  await page.getByLabel("To device", { exact: true }).selectOption("library");
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  await page.getByLabel("To device", { exact: true }).selectOption("garden");
  await page.getByRole("button", { name: "Add connection", exact: true }).click();
  const run = async () => {
    const response = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
    await page.getByRole("button", { name: "Run network task", exact: true }).click();
    return (await (await response).json()).workspace.lastExecution;
  };
  const library = await run(); expect(library.ok).toBe(true); expect(library.output.path).toEqual(["classroom", "router", "library"]); expect(library.output.serviceResult.text).toBe("Hello community");
  await check.click();
  await expect(page.getByRole("heading", { name: "Practise", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run network task", exact: true })).toBeEnabled({ timeout: 30000 });
  const garden = await run(); expect(garden.ok).toBe(true); expect(garden.output.path).toEqual(["classroom", "router", "garden"]);
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/native-network-${width}.png`, fullPage: true });
  }
  evidence.checks.push({ nativeNetwork: "both connections built through controls; library and changed garden endpoint delivered through real graph search", externalNetworkContact: false, authorPreviewOnly: true });
});

test("evidence poster repairs survive picture retrieval and actual Tab-and-Enter activation", async ({ page }) => {
  test.setTimeout(300000);
  await login(page.request); await page.goto("/admin/coding/workbench/y4-17");
  const check = page.getByRole("button", { name: "Check and continue", exact: true });
  await expect(check).toBeEnabled({ timeout: 30000 });
  evidence.checks.push({ posterInitialLayout: await check.evaluate((element) => { const box = element.getBoundingClientRect(), style = getComputedStyle(element); return { x: box.x, y: box.y, width: box.width, height: box.height, display: style.display, visibility: style.visibility, pageHeight: document.documentElement.scrollHeight }; }) });
  await check.scrollIntoViewIfNeeded({ timeout: 30000 }); await check.click({ timeout: 30000 });
  await page.getByRole("radio", { name: "Ordinary keyboard reachability", exact: true }).check();
  await page.getByRole("button", { name: "Record prediction", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editable picture", exact: true }).click();
  const caption = page.getByLabel("Caption", { exact: true });
  await expect(caption).toBeEnabled({ timeout: 30000 });
  await page.getByText("Layer 1: circle ·", { exact: true }).click();
  await page.getByLabel("Describe this mark", { exact: true }).nth(0).fill("Circle means tree");
  await page.getByText("Layer 2: rectangle ·", { exact: true }).click();
  await page.getByLabel("Describe this mark", { exact: true }).nth(1).fill("Rectangle means boat");
  const legend = "Circle means tree; rectangle means boat. Read the named table for every category.";
  await caption.fill(legend);
  await page.getByLabel("Read-aloud description", { exact: true }).fill(legend);
  await page.getByLabel("Text size", { exact: true }).fill("24");
  await page.getByLabel("Text colour", { exact: true }).fill("#0f172a");
  await page.getByLabel("Save with a meaningful name", { exact: true }).fill("Repaired original picture");
  await page.getByRole("button", { name: "Save card", exact: true }).click();
  const close = page.getByRole("button", { name: "Close card", exact: true });
  await expect(close).toBeEnabled(); await close.click();
  const open = page.getByRole("button", { name: "Open selected card", exact: true });
  await expect(open).toBeEnabled();
  await expect(page.getByLabel("Saved cards", { exact: true })).toHaveValue("Repaired original picture");
  await open.click(); await expect(caption).toHaveValue(legend);
  await page.getByRole("button", { name: "Sources and controls", exact: true }).click();
  await expect(page.getByLabel("Control 1 keyboard access", { exact: true })).toBeEnabled();
  await page.getByLabel("Control 1 keyboard access", { exact: true }).selectOption("button");
  await page.getByLabel("Control 2 keyboard access", { exact: true }).selectOption("button");
  const previewed = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
  await page.getByRole("button", { name: "Preview evidence poster", exact: true }).click();
  const preview = (await (await previewed).json()).workspace.lastExecution;
  expect(preview.ok).toBe(true); expect(preview.output.controlsAccessible).toBe(true); expect(preview.output.picture.accessible).toBe(true); expect(preview.output.pictureHistory.retrievedCorrectly).toBe(true);
  const poster = page.getByLabel("Interactive evidence poster", { exact: true }), explain = poster.getByRole("button", { name: "Explain the largest group", exact: true });
  await expect(explain).toBeEnabled(); await check.focus();
  let reached = false;
  for (let index = 0; index < 8; index++) { await page.keyboard.press("Tab"); if (await explain.evaluate((element) => element === document.activeElement)) { reached = true; break; } }
  expect(reached, "The repaired poster control must be reachable through actual sequential keyboard navigation").toBe(true);
  const activated = page.waitForResponse((response) => response.url().includes("/api/admin/coding/workbench/") && response.request().method() === "POST" && response.request().postDataJSON()?.interaction?.target === "explain");
  await page.keyboard.press("Enter");
  const executed = (await (await activated).json()).workspace.lastExecution;
  expect(executed.ok).toBe(true); expect(executed.output.interaction.view).toBe("explanation"); expect(executed.output.interaction.explanation).toContain("tree has the largest count, with 3");
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/evidence-poster-${width}.png`, fullPage: true });
  }
  await check.click(); await expect(page.getByRole("heading", { name: "Practise", exact: true })).toBeVisible();
  evidence.checks.push({ evidencePoster: "picture repaired, saved and retrieved; actual Tab reached the repaired control and Enter executed a server-calculated explanation; Build assessment passed", authorPreviewOnly: true });
});
