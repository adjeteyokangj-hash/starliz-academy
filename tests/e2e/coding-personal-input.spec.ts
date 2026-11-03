import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";
import { calculatorComponentActivities } from "../../src/lib/coding/learning/content/calculator-components";
import { initialActivityState, transitionActivity } from "../../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../../src/lib/coding/learning/public-view";
import { activityActionSchema } from "../../src/lib/coding/learning/types";
import { executePractical } from "../../src/lib/coding/learning/runtime";
import { executeSource } from "../../src/lib/coding/learning/source-execution";
import { streamIsolatedExecutor } from "../../scripts/coding/stream-isolated-executor";

test.skip(process.env.CODING_RUNNER_CONTAINER_TESTS !== "1", "Requires actual gVisor execution.");
let styles = "";
// Compile the real stylesheet before creating a browser page, so the compiler
// and browser do not compete for the same small host-memory budget.
test.beforeAll(async () => { styles = await codingComponentStyles(); });
test("personal calculator inputs execute, survive resume and stay outside controlled assessment", async ({ page }) => {
  test.setTimeout(300000);
  const directory = `artifacts/coding-workbench-uat/personal-input-${randomUUID()}`;
  mkdirSync(directory, { recursive: true }); const evidence = `${directory}/actual-jobs.jsonl`; writeFileSync(evidence, "", { flag: "wx" });
  const execute = streamIsolatedExecutor(evidence), activity = calculatorComponentActivities[1]!;
  let state = initialActivityState(activity), revision = 0, requests = 0;
  state.stage = "build"; state.completed = ["discover", "predict"]; state.artifacts.build = activity.reference;
  state.tutorMessages = [{ stage: "build", purpose: "instruction", source: "fallback", revealing: false, message: "Component test instruction; no live model turn is claimed." }];
  const view = () => ({ ...publicActivityView(activity, state), revision: String(revision), versions: [] });
  await page.route("**/api/__coding-input", async (route) => {
    requests++;
    try {
      const action = activityActionSchema.parse(route.request().postDataJSON());
      if (action.revision !== String(revision)) throw new Error("Stale component revision");
      const transition = await transitionActivity(activity, state, action, {
        run: (engine, artifact, input) => executePractical(engine, artifact, input, (source, fixture) => executeSource(source, fixture, execute)),
        teach: async () => ({ message: "Component fallback only", source: "fallback", revealing: false }),
        reflect: async () => ({ passed: false, pending: true, confidence: 0, source: "evidence", message: "No provider review claimed" }),
      });
      state = transition.state; revision++;
      await route.fulfill({ json: { workspace: { ...view(), message: transition.message } } });
    } catch (error) { await route.fulfill({ status: 400, json: { error: error instanceof Error ? error.message : "Component request failed" } }); }
  });
  async function mount() {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';createRoot(document.getElementById('root')).render(<Workspace initial={${JSON.stringify(view())}} endpoint="/api/__coding-input"/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
    await page.unroute("**/__coding-input-workspace");
    await page.route("**/__coding-input-workspace", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>` }));
    await page.goto("/__coding-input-workspace");
  }
  try {
    await mount();
    await page.getByRole("checkbox", { name: "Try your own input", exact: true }).check();
    const input = page.getByRole("textbox", { name: "Input variables (JSON)", exact: true });
    await input.fill('{"raw":"250","unit":"cm"}');
    await page.getByRole("button", { name: "Run program", exact: true }).click();
    await expect(page.getByText("Result from your personal test input.", { exact: true })).toBeVisible({ timeout: 60000 });
    expect(state.lastExecution?.ok).toBe(true);
    expect(state.lastExecution?.output).toMatchObject({ variables: { result: { metres: 2.5, quantity: 7.5 } } });
    expect(state.mastered).toBe(false); expect(state.attempts).toBe(0);
    await page.getByRole("button", { name: "Save version", exact: true }).click();
    await expect(page.getByText("Your work has been saved.", { exact: true })).toBeVisible();
    state = JSON.parse(JSON.stringify(state)); await mount();
    await expect(page.getByRole("checkbox", { name: "Try your own input", exact: true })).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Input variables (JSON)", exact: true })).toHaveValue(/250/);
    const before = requests;
    await page.getByRole("textbox", { name: "Input variables (JSON)", exact: true }).fill('{"raw":');
    await page.getByRole("button", { name: "Run program", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Correct your personal test input before saving or running." })).toBeVisible();
    expect(requests).toBe(before);
    await page.getByRole("textbox", { name: "Input variables (JSON)", exact: true }).fill('{"raw":"NaN","unit":"m"}');
    await page.getByRole("button", { name: "Run program", exact: true }).click();
    await expect(page.getByRole("button", { name: "Run program", exact: true })).toBeEnabled({ timeout: 60000 });
    await expect(page.getByText("Result from your personal test input.", { exact: true })).toBeVisible({ timeout: 60000 });
    expect(state.lastExecution?.output).toMatchObject({ variables: { result: { valid: false } } });
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390) { const table = page.getByRole("region", { name: "Final variable values table", exact: true }); await table.focus(); await table.press("ArrowRight"); await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0); }
      await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Check and continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Practise", exact: true })).toBeVisible({ timeout: 150000 });
    await page.getByRole("button", { name: "3. Build ✓", exact: true }).click();
    await expect(page.getByText("Result from the first supplied assessment case.", { exact: true })).toBeVisible({ timeout: 150000 });
    expect(state.lastRunKind).toBe("assessment");
    expect(state.lastExecutionInput).toEqual(activity.cases[0]!.input);
    expect(state.lastChecks.every((check) => check.passed)).toBe(true);
    expect(state.completed).toContain("build"); expect(state.mastered).toBe(false);
    writeFileSync(`${directory}/result.json`, JSON.stringify({ passed: true, realStateMachine: true, realGVisorPython: true, personalCalculationAndInvalidInput: true, jsonResume: true, invalidJsonStopsBeforeRequest: true, controlledAssessmentUnchanged: true, viewports: [390, 820, 1440], databasePersistenceClaim: false, authenticatedJourneyClaim: false }, null, 2), { flag: "wx" });
  } finally { await execute.close(); }
});
