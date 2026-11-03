import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { executeData } from "../../src/lib/coding/learning/studio-engines";

// Real component interaction with locally calculated synthetic data. This is
// deliberately separate from authenticated learner-persistence verification.
const directory = `artifacts/coding-workbench-uat/data-display-${randomUUID()}`;
let bundle = "", styles = "";
test.beforeAll(async ({ request }) => {
  mkdirSync(directory, { recursive: true });
  const execution = executeData({ question: "Compare fictional numbered categories", rows: Array.from({ length: 55 }, (_, index) => ({ category: `category${index + 1}`, count: index === 0 ? -10 : index + 1 })), operations: [], chart: { type: "bar", title: "All 55 fictional categories", category: "category", value: "count", startAtZero: true }, conclusion: "Every category remains inspectable.", source: "Synthetic component verification", licence: "original", credit: "", alternatives: "The calculated table gives every exact value.", fontSize: 20, representation: { mode: "none", values: [], text: "", bits: 8 } }, {});
  expect(execution.ok).toBe(true);
  writeFileSync(`${directory}/engine-result.json`, JSON.stringify(execution, null, 2), { flag: "wx" });
  const html = await (await request.get("/auth/login")).text();
  styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((match) => match[0]).join("");
  const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Display from './src/components/coding/DataExecution'; createRoot(document.getElementById('root')).render(<main style={{maxWidth:900,margin:'auto',padding:16}}><Display output={${JSON.stringify(execution.output)}} /></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = result.outputFiles[0]!.text;
});

test("every category and table row can be reached without changing the chart scale", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__coding-data-display", (route) => route.fulfill({ contentType: "text/html", body: `<html><head>${styles}</head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("/__coding-data-display");
  await expect(page.getByRole("heading", { name: "All 55 fictional categories" })).toBeVisible();
  const scale = page.getByText("Value axis: -10 to 55. The scale is shared by every page.", { exact: true });
  await expect(scale).toBeVisible();
  await expect(page.getByRole("img", { name: "category1: -10; axis begins at -10", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next chart categories", exact: true }).click();
  await page.getByRole("button", { name: "Next chart categories", exact: true }).click();
  await expect(page.getByRole("img", { name: "category55: 55; axis begins at -10", exact: true })).toBeVisible();
  await expect(scale).toBeVisible();
  await expect(page.getByRole("button", { name: "Next chart categories", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Next table rows", exact: true }).click();
  await page.getByRole("button", { name: "Next table rows", exact: true }).click();
  await expect(page.getByRole("cell", { name: "category55", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next table rows", exact: true })).toBeDisabled();
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`, JSON.stringify({ componentOnly: true, authenticatedPersistenceClaim: false, all55CategoriesReachable: true, all55RowsReachable: true, sharedScale: [-10, 55], viewports: [390, 820, 1440], browserErrors: errors }, null, 2), { flag: "wx" });
});
