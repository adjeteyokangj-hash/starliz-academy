import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";
import { webPageActivities } from "../../src/lib/coding/learning/content/web-pages";
import { webGuideContexts } from "../../src/lib/coding/learning/content/web-guide-contexts";
import { initialActivityState, transitionActivity } from "../../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../../src/lib/coding/learning/public-view";
import { activityActionSchema, type ActivityContent, type ActivityState } from "../../src/lib/coding/learning/types";
import { executePractical } from "../../src/lib/coding/learning/runtime";
import { executeSource } from "../../src/lib/coding/learning/source-execution";
import { streamIsolatedExecutor } from "../../scripts/coding/stream-isolated-executor";

test.skip(process.env.CODING_RUNNER_CONTAINER_TESTS !== "1", "Requires real pinned gVisor execution; not a simulated runtime pass.");
const directory = `artifacts/coding-workbench-uat/web-workspace-${randomUUID()}`;
let styles = "", execute: ReturnType<typeof streamIsolatedExecutor> | undefined;
const results: Array<Record<string, unknown>> = [];
test.beforeAll(async () => { mkdirSync(directory, { recursive: true }); styles = await codingComponentStyles(); const evidence = `${directory}/actual-jobs.jsonl`; writeFileSync(evidence, "", { flag: "wx" }); execute = streamIsolatedExecutor(evidence); });
test.afterAll(async () => { await execute?.close(); if (execute) writeFileSync(`${directory}/result.json`, JSON.stringify({ componentWithRealStateMachineAndRunner: true, databasePersistenceClaim: false, authenticatedLearnerJourneyClaim: false, liveModelTutoringClaim: false, checks: results }, null, 2), { flag: "wx" }); });
test.afterEach(async ({}, info) => { results.push({ test: info.title, status: info.status }); });
async function open(page: import("@playwright/test").Page, activity: ActivityContent, reference = false) {
  let state: ActivityState = initialActivityState(activity), revision = 0, failNext = false, activeRequests = 0, maxActiveRequests = 0;
  state.stage = "build"; state.completed = ["discover", "predict"]; state.artifacts.build = reference ? activity.reference : activity.starter;
  state.tutorMessages = [{ stage: "build", purpose: "instruction", source: "fallback", revealing: false, context: "curriculum", message: "Component verification uses the approved lesson brief. This saved fallback instruction is not a live model turn." }];
  const view = () => ({ ...publicActivityView(activity, state), revision: `component-${revision}`, versions: [] });
  const initial = view();
  await page.route("**/api/__coding-web-ui", async (route) => {
    activeRequests++; maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    try {
      const action = activityActionSchema.parse(route.request().postDataJSON());
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: "Deliberate component transport failure; the draft is retained." } }); }
      if (action.revision !== `component-${revision}`) return route.fulfill({ status: 409, json: { error: "The test workspace revision changed." } });
      const transition = await transitionActivity(activity, state, action, { run: (engine, artifact, input) => executePractical(engine, artifact, input, (source, fixture) => executeSource(source, fixture, execute!)),
        teach: async () => ({ message: "Component-only fallback instruction.", source: "fallback", revealing: false }), reflect: async () => ({ passed: false, pending: true, confidence: 0, source: "evidence", message: "No model mastery review is claimed by this component test." }) });
      state = transition.state; revision++;
      await route.fulfill({ json: { workspace: { ...view(), message: transition.message } } });
    } catch (error) { await route.fulfill({ status: 500, json: { error: error instanceof Error ? error.message : "Component runner request failed." } }); }
    finally { activeRequests--; }
  });
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';createRoot(document.getElementById('root')).render(<Workspace initial={${JSON.stringify(initial)}} endpoint="/api/__coding-web-ui"/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  await page.route("**/__coding-web-workspace", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${built.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("/__coding-web-workspace");
  return Object.assign(() => state, { failNext: () => { failNext = true; }, maxConcurrentRequests: () => maxActiveRequests });
}
test("the real CSS editor repair changes both notices without changing the ordinary paragraph", async ({ page }) => {
  test.setTimeout(180000);
  const activity = webPageActivities[1]!, state = await open(page, activity);
  expect(activity.reference.type).toBe("source");
  if (activity.reference.type !== "source") throw new Error("Expected CSS source.");
  const editor = page.getByRole("textbox", { name: "css source code", exact: true });
  await expect(editor).toBeVisible(); await editor.fill(activity.reference.css!);
  await page.getByRole("button", { name: "Run program", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Executed web project"]');
  await expect(frame.locator("#notice")).toBeVisible({ timeout: 60000 });
  expect(await frame.locator("#notice").evaluate((element) => getComputedStyle(element).fontSize)).toBe("20px");
  expect(await frame.locator("#second-notice").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("16px");
  expect(await frame.locator("#ordinary").evaluate((element) => getComputedStyle(element).fontSize)).toBe("18px");
  expect(state().lastExecution?.ok).toBe(true);
  results.push({ actualCssEditorUsed: true, actualGVisorExecution: true, actualBrowserComputedStyles: true, unrelatedParagraphPreserved: true });
});
test("the real guide workspace resolves its supplied PNG and supports keyboard navigation at three sizes", async ({ page }) => {
  test.setTimeout(180000);
  const activity = webPageActivities[2]!; await open(page, activity, true);
  const editor = page.getByRole("textbox", { name: "html source code", exact: true });
  await expect(editor).toBeVisible(); await expect(editor).toContainText('src="bridge.png"'); expect((await editor.textContent())!.includes("data:image/png")).toBe(false);
  await page.getByText("Provided practice materials (3)", { exact: true }).click();
  await expect(page.getByRole("img", { name: webGuideContexts[0].asset.alt, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run program", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Executed web project"]');
  await expect(frame.getByRole("img", { name: webGuideContexts[0].asset.alt, exact: true })).toBeVisible({ timeout: 60000 });
  expect(await frame.locator("#illustration").getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  const link = frame.getByRole("link", { name: "Read evidence and credits", exact: true }); await link.focus(); await link.press("Enter");
  expect(await frame.locator("#evidence").evaluate((element) => document.activeElement === element)).toBe(true);
  for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true }); }
  results.push({ actualGVisorResolvedPng: true, shortEditableImageFilename: true, actualLocalKeyboardNavigation: true, actualBrowserViewports: [390, 820, 1440] });
});

test("complete web entries and immediate clicks execute sequentially, retain focus and recover after an HTTP failure", async ({ page }) => {
  test.setTimeout(240000);
  const activity = structuredClone(webPageActivities[0]!);
  activity.year = 6; activity.concepts = ["javascript", "input", "event"];
  activity.reference = { type: "source", language: "javascript", entry: "dom", html: '<main><h1>Fictional input test</h1><label for="title">Fictional title</label><input id="title" value=""><button id="apply">Apply title</button><p id="echo">Ready</p><p id="count">0</p></main>', css: 'body{color:#111111;background-color:#ffffff;font-size:18px}', source: "const field=document.getElementById('title'),echo=document.getElementById('echo'),count=document.getElementById('count');let clicks=0;field.addEventListener('input',()=>{echo.textContent='Ready: '+field.value});document.getElementById('apply').addEventListener('click',()=>{clicks++;count.textContent=String(clicks);echo.textContent='Saved: '+field.value});" };
  const state = await open(page, activity, true);
  await page.getByRole("button", { name: "Run program", exact: true }).click();
  const frame = page.frameLocator('iframe[title="Executed web project"]');
  const field = frame.getByRole("textbox", { name: "Fictional title", exact: true });
  await expect(field).toBeVisible({ timeout: 60000 });
  await field.pressSequentially("Paper bridge", { delay: 65 });
  await expect(field).toHaveValue("Paper bridge");
  expect(state().webInteractions).toBeUndefined();
  await frame.getByRole("button", { name: "Apply title", exact: true }).click();
  await expect(frame.locator("#echo")).toHaveText("Saved: Paper bridge", { timeout: 90000 });
  await expect(frame.locator("#count")).toHaveText("1");
  expect(state().webInteractions?.events.map(({ target, type, value }) => ({ target, type, value }))).toEqual([{ target: "title", type: "change", value: "Paper bridge" }, { target: "apply", type: "click", value: "" }]);
  expect(await frame.locator("#apply").evaluate((element) => document.activeElement === element)).toBe(true);
  state.failNext();
  await field.fill("Retained entry"); await field.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Deliberate component transport failure");
  await expect(field).toHaveValue("Retained entry");
  await field.press("Enter");
  await expect(frame.locator("#echo")).toHaveText("Ready: Retained entry", { timeout: 90000 });
  await expect(field).toHaveValue("Retained entry");
  expect(await field.evaluate((element) => document.activeElement === element)).toBe(true);
  expect(state.maxConcurrentRequests()).toBe(1); expect(state().mastered).toBe(false);
  results.push({ fictionalComponentFixture: true, actualGVisorEventExecution: true, wholeEntryRetained: true, orderedInputAndClick: true, maximumConcurrentRequests: 1, focusRetained: true, simulatedHttpFailureOnly: true, sameEntryRetryExecutedByRealRunner: true, masteryAwardClaim: false });
});
