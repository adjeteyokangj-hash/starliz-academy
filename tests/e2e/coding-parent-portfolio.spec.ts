import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { build } from "esbuild";
import { prisma } from "../../src/lib/db";
import { firstRouteActivities } from "../../src/lib/coding/learning/content/routes";
import { activityContentHash } from "../../src/lib/coding/learning/catalogue";
import { artifactHash, initialActivityState } from "../../src/lib/coding/learning/state-machine";
import { executePractical } from "../../src/lib/coding/learning/runtime";
import { checkExecution } from "../../src/lib/coding/learning/checks";
import { codingComponentStyles } from "./coding-styles";
import { getTrialSessionLimit } from "../../src/lib/subscriptions/enforcement";

// Authenticated portfolio transport/UI verification with labelled, newly
// created fixtures. This does not claim a genuine earned learner achievement.
const runId = `coding-portfolio-${randomUUID()}`, directory = `artifacts/coding-parent-uat/${runId}`, password = randomBytes(32).toString("base64url");
const activity = firstRouteActivities[0]!;
const families: Array<{ parentId: string; childId: string; parentEmail: string; studentEmail: string; workspaceId: string; versionId: string }> = [];
let bundle = "", learnerBundle = "", styles = "", originalSnapshot = "";
const evidence: Record<string, unknown> = { runId, authenticatedBackend: true, syntheticSnapshotFixtures: true, genuineLearnerMasteryJourneyClaim: false, fixtureRecordsOnly: true };
const outcomes: Array<{ title: string; status: string }> = [];
test.beforeAll(async () => {
  test.setTimeout(180000);
  const target = new URL(process.env.DATABASE_URL!);
  expect(createHash("sha256").update(`${target.hostname}/${target.pathname}/${target.username}`).digest("hex")).toBe("6e8331571ea9c13c393cd1c2c96adda278376e3aca6606a738c4e85a7b8b0295");
  const failed = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  expect(Number(failed[0]!.count)).toBe(0);
  styles = await codingComponentStyles();
  expect(styles.length).toBeGreaterThan(0);
  mkdirSync(directory, { recursive: true });
  const execution = await executePractical(activity.workbench, activity.reference, activity.cases[0]!.input);
  expect(execution.ok).toBe(true);
  const checks = checkExecution(execution, activity.cases[0]!.assertions);
  expect(checks.every((check) => check.passed)).toBe(true);
  originalSnapshot = JSON.stringify({ schema: 1, version: activity.version, activityId: activity.id, activityHash: activityContentHash(activity), artifact: activity.reference, artifactHash: artifactHash(activity.reference), input: activity.cases[0]!.input, files: {}, explanation: "Synthetic portfolio fixture: the executed instructions reach the stated destination.", checks, independent: true, execution });
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    for (const kind of ["owner", "other"]) {
      const parentEmail = `${runId}-${kind}-parent@example.invalid`, studentEmail = `${runId}-${kind}-student@example.invalid`;
      const parent = await tx.user.create({ data: { email: parentEmail, passwordHash, role: "parent", name: "Coding portfolio QA only", consentAcceptedAt: new Date(), consentVersion: "coding-portfolio-qa" } });
      const student = await tx.user.create({ data: { email: studentEmail, passwordHash, role: "student", name: "Coding portfolio QA only" } });
      const child = await tx.childProfile.create({ data: { id: randomUUID(), parentId: parent.id, userId: student.id, name: "Fictional portfolio learner", yearGroup: "Year 1" } });
      await tx.user.update({ where: { id: parent.id }, data: { activeChildId: child.id } });
      const workspace = await tx.codingWorkspace.create({ data: { childId: child.id, lessonId: `curriculum:${activity.version}:${activity.id}`, yearGroup: "Year 1", pathwayId: activity.pathwayId, programsJson: JSON.stringify(initialActivityState(activity)), privateProject: true } });
      const version = await tx.codingProjectVersion.create({ data: { workspaceId: workspace.id, stage: "create", label: "independent-mastery", programJson: originalSnapshot } });
      const unique = createHash("sha256").update(`${runId}:${kind}`).digest("hex");
      await tx.certificate.create({ data: { studentId: child.id, certificateNumber: `QA-${unique.slice(0, 12)}`, verificationCode: unique.slice(12, 24), idempotencyKey: `coding:${activity.version}:${activity.id}:${child.id}`, certificateType: "subject_achievement", title: "QA portfolio snapshot fixture; not a genuine earned achievement", awardReason: "Synthetic fixture for authenticated private portfolio verification only", subject: "coding", issuedAt: new Date(), awardSourceType: "coding_activity", awardSourceId: activity.id, metadataJson: JSON.stringify({ curriculumVersion: activity.version, activityId: activity.id, activityHash: activityContentHash(activity), artifactVersionId: version.id, independent: true, syntheticQaFixture: true }) } });
      families.push({ parentId: parent.id, childId: child.id, parentEmail, studentEmail, workspaceId: workspace.id, versionId: version.id });
    }
  }, { timeout: 60000 });
  evidence.fixtureIds = families.map(({ parentId, childId, workspaceId, versionId }) => ({ parentId, childId, workspaceId, versionId }));
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Portfolio from'./src/components/coding/ParentProjectPortfolio';fetch('/api/parent/coding?studentId=${families[0]!.childId}',{credentials:'same-origin'}).then(response=>response.json()).then(data=>createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'auto',padding:16}}><Portfolio childId="${families[0]!.childId}" projects={data.portfolio}/></main>));` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = built.outputFiles[0]!.text;
  const learnerBuilt = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import React from'react';import{createRoot}from'react-dom/client';import Library from'./src/components/coding/LearnerProjectLibrary';import Evidence from'./src/components/coding/SavedEvidenceLibrary';createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'auto',padding:16}}><Library/><Evidence/></main>);" }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '\"production\"' } });
  learnerBundle = learnerBuilt.outputFiles[0]!.text;
});
test.afterAll(async () => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" });
  await prisma.$disconnect();
});
test.afterEach(async ({}, info) => { outcomes.push({ title: info.title, status: info.status ?? "unknown" }); evidence.tests = outcomes; evidence.status = outcomes.every((outcome) => outcome.status === "passed") ? "passed" : "failed"; });
test("a parent sees the actual frozen fixture project while other families and student roles are denied", async ({ page, playwright, baseURL }) => {
  test.setTimeout(240000);
  const owner = families[0]!, other = families[1]!;
  expect((await page.request.post("/api/auth/login", { data: { identifier: owner.parentEmail, password }, timeout: 60000 })).status()).toBe(200);
  const index = await page.request.get(`/api/parent/coding?studentId=${owner.childId}`, { timeout: 60000 });
  expect(index.status()).toBe(200); expect((await index.json()).portfolio.map((project: { versionId: string }) => project.versionId)).toEqual([owner.versionId]);
  const projectUrl = `/api/parent/coding?studentId=${owner.childId}&versionId=${owner.versionId}`;
  const before = await page.request.get(projectUrl); expect(before.status()).toBe(200); expect(before.headers()["cache-control"]).toContain("no-store");
  expect((await before.json()).project.artifact).toEqual(activity.reference);
  const parentEvidence = await page.request.get(`/api/parent/coding?studentId=${owner.childId}&evidenceVersionId=${owner.versionId}`);
  expect(parentEvidence.status()).toBe(200); expect(parentEvidence.headers()["cache-control"]).toContain("no-store");
  expect((await parentEvidence.json()).project.artifact).toEqual(activity.reference);
  expect((await page.request.get(`/api/parent/coding?studentId=${owner.childId}&evidenceVersionId=${other.versionId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/parent/coding?studentId=${other.childId}&evidenceVersionId=${other.versionId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/parent/coding?studentId=${other.childId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/parent/coding?studentId=${owner.childId}&versionId=${other.versionId}`)).status()).toBe(404);
  await prisma.codingWorkspace.update({ where: { id: owner.workspaceId, childId: owner.childId }, data: { programsJson: JSON.stringify({ ...initialActivityState(activity), explanation: "A later synthetic QA draft must not replace the frozen project." }) } });
  expect((await (await page.request.get(projectUrl)).json()).project.artifact).toEqual(activity.reference);
  expect((await prisma.codingProjectVersion.findUniqueOrThrow({ where: { id: owner.versionId } })).programJson).toBe(originalSnapshot);
  const student = await playwright.request.newContext({ baseURL });
  try {
    expect((await student.post("/api/auth/login", { data: { identifier: owner.studentEmail, password } })).status()).toBe(200);
    expect((await student.get(projectUrl)).status()).toBe(403);
    expect((await student.get(`/api/parent/coding?studentId=${owner.childId}&evidenceVersionId=${owner.versionId}`)).status()).toBe(403);
    const ownLibrary = await student.get("/api/student/coding/portfolio");
    expect(ownLibrary.status()).toBe(200); expect(ownLibrary.headers()["cache-control"]).toContain("no-store");
    expect((await ownLibrary.json()).projects.map((project: { versionId: string }) => project.versionId)).toEqual([owner.versionId]);
    const ownCreation = await student.get(`/api/student/coding/portfolio?versionId=${owner.versionId}`);
    expect(ownCreation.status()).toBe(200); expect((await ownCreation.json()).project.artifact).toEqual(activity.reference);
    const savedIndex = await student.get("/api/student/coding/evidence");
    expect(savedIndex.status()).toBe(200); expect(savedIndex.headers()["cache-control"]).toContain("no-store");
    const savedEntries = (await savedIndex.json()).projects;
    expect(savedEntries.map((entry: { versionId: string }) => entry.versionId)).toEqual([owner.versionId]);
    expect(savedEntries[0].artifact).toBeUndefined(); expect(savedEntries[0].execution).toBeUndefined();
    const savedDetail = await student.get(`/api/student/coding/evidence?versionId=${owner.versionId}`);
    expect(savedDetail.status()).toBe(200); expect((await savedDetail.json()).project.artifact).toEqual(activity.reference);
    expect((await student.get(`/api/student/coding/evidence?versionId=${other.versionId}`)).status()).toBe(404);
    expect((await student.get(`/api/student/coding/evidence?childId=${other.childId}`)).status()).toBe(400);
    expect((await student.get(`/api/student/coding/portfolio?versionId=${other.versionId}`)).status()).toBe(404);
    expect((await student.get(`/api/student/coding/portfolio?studentId=${other.childId}`)).status()).toBe(400);
    const learnerContext = await page.context().browser()!.newContext({ baseURL, storageState: await student.storageState() });
    try {
      const learnerPage = await learnerContext.newPage();
      await learnerPage.route("**/__coding-learner-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${learnerBundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
      await learnerPage.goto("/__coding-learner-fixture");
      await expect(learnerPage.getByRole("heading", { name: "Your assessed curriculum creations", exact: true })).toBeVisible();
      await expect(learnerPage.getByRole("heading", { name: "Your saved work evidence", exact: true })).toBeVisible();
      await expect(learnerPage.getByRole("combobox", { name: "Choose saved evidence", exact: true })).toBeVisible();
      await expect(learnerPage.getByRole("region", { name: "Private saved work evidence", exact: true }).getByText("Inspect this frozen source and files", { exact: true })).toBeVisible();
      await learnerPage.getByText("View evidence", { exact: true }).click();
      await expect(learnerPage.getByText("Synthetic portfolio fixture: the executed instructions reach the stated destination.", { exact: true })).toBeVisible();
      for (const width of [390, 820, 1440]) { await learnerPage.setViewportSize({ width, height: 1000 }); expect(await learnerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await learnerPage.screenshot({ path: `${directory}/learner-${width}.png`, fullPage: true }); }
    } finally { await learnerContext.close(); }
  } finally { await student.dispose(); }
  await page.route("**/__coding-parent-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("/__coding-parent-fixture");
  await expect(page.getByRole("heading", { name: "Your child’s actual work" })).toBeVisible();
  await expect(page.getByText("Synthetic portfolio fixture: the executed instructions reach the stated destination.", { exact: true })).toBeVisible();
  for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true }); }
  evidence.checks = { ownFrozenProject: true, foreignChildDenied: true, foreignVersionDenied: true, studentRoleDenied: true, learnerOwnIndexAndSnapshot: true, learnerForeignVersionDenied: true, clientChildOverrideRejected: true, frozenSnapshotRetainedAfterDraftEdit: true, realAuthenticatedApiWithPortfolioComponent: true, learnerLibraryWithRealAuthenticatedApi: true, wholeParentDashboardJourneyClaim: false, genuineLearnerMasteryJourneyClaim: false, responsiveViewports: [390, 820, 1440] };
});

test("learner library enforces the trial limit while the parent retains access to the frozen creation", async ({ playwright, baseURL }) => {
  const owner = families[0]!;
  expect(owner.parentEmail.startsWith(runId)).toBe(true);
  await prisma.user.update({ where: { id: owner.parentId, email: owner.parentEmail, name: "Coding portfolio QA only", role: "parent" }, data: { trialSessionsUsed: getTrialSessionLimit() } });
  const learner = await playwright.request.newContext({ baseURL }), parent = await playwright.request.newContext({ baseURL });
  try {
    expect((await learner.post("/api/auth/login", { data: { identifier: owner.studentEmail, password } })).status()).toBe(200);
    const denied = await learner.get("/api/student/coding/portfolio");
    expect(denied.status()).toBe(402); expect(denied.headers()["cache-control"]).toContain("no-store");
    expect((await learner.get(`/api/student/coding/portfolio?versionId=${owner.versionId}`)).status()).toBe(402);
    expect((await learner.get("/api/student/coding/evidence")).status()).toBe(402);
    expect((await learner.get(`/api/student/coding/evidence?versionId=${owner.versionId}`)).status()).toBe(402);
    expect((await parent.post("/api/auth/login", { data: { identifier: owner.parentEmail, password } })).status()).toBe(200);
    const retained = await parent.get(`/api/parent/coding?studentId=${owner.childId}&versionId=${owner.versionId}`);
    expect(retained.status()).toBe(200); expect((await retained.json()).project.artifact).toEqual(activity.reference);
    const retainedEvidence = await parent.get(`/api/parent/coding?studentId=${owner.childId}&evidenceVersionId=${owner.versionId}`);
    expect(retainedEvidence.status()).toBe(200); expect((await retainedEvidence.json()).project.artifact).toEqual(activity.reference);
    expect((await prisma.codingProjectVersion.findUniqueOrThrow({ where: { id: owner.versionId } })).programJson).toBe(originalSnapshot);
    evidence.accessChecks = { trialExhaustionDeniesLearnerIndexAndDetail: true, parentRetainsOwnFrozenCreation: true, originalAssessedVersionUnchanged: true, onlyNewLabelledQaParentUpdated: true };
  } finally { await learner.dispose(); await parent.dispose(); }
});
