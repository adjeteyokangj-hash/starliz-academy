import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";

test("query and local-service tables preserve missing versus zero values, inert text and accessible horizontal navigation", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-result-tables-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const proof: Record<string, unknown> = { passed: false, presentationFixturesOnly: true, actualSqlOrHttpExecutionClaim: false };
  const styles = await codingComponentStyles();
  const unsafe = '<img src="https://external.invalid/forbidden" onerror="window.fixtureExecuted=true">';
  const results = [{ columns: ["Missing value", "Actual zero", "Escaped entered text", "A deliberately wide retained column heading"], rows: [[null, 0, unsafe, "An ordinary long returned value for keyboard panning."]] }, { columns: ["Empty result retains its header"], rows: [] }];
  const service = { kind: "inventory-v1", requests: [{ method: "GET", path: "/api/inventory", status: 200 }, { method: "POST", path: "/api/inventory", status: 503 }], before: [{ id: "paper", title: unsafe, quantity: 0 }], after: [{ id: "paper", title: unsafe, quantity: 0, revision: 0 }], acceptedWrites: 0, restored: true, databaseReopened: true };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Sql from'./src/components/coding/SqlExecution';import Service from'./src/components/coding/FixtureServiceExecution';createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'auto',padding:16}}><Sql results={${JSON.stringify(results)}}/><Service service={${JSON.stringify(service)}}/></main>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); const externalRequests: string[] = [], pageErrors: string[] = [];
    page.on("request", request => { if (request.url().startsWith("https://external.invalid/")) externalRequests.push(request.url()); }); page.on("pageerror", error => pageErrors.push(error.message));
    await page.setContent(`<html lang="en"><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>`); await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const query = page.getByRole("region", { name: "Query 1 table", exact: true }); await query.waitFor();
    assert.equal(await query.getByLabel("SQL NULL, missing value", { exact: true }).count(), 1);
    assert.equal(await query.getByRole("cell", { name: "0", exact: true }).count(), 1);
    assert.equal(await page.getByRole("columnheader", { name: "Empty result retains its header", exact: true }).count(), 1);
    assert.equal(await page.getByText("No matching rows. The returned column structure is shown above.", { exact: true }).count(), 1);
    assert.equal(await page.locator("img").count(), 0);
    assert.equal(await query.getByRole("cell", { name: unsafe, exact: true }).count(), 1);
    const observations = [];
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1100 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await query.focus(); assert.equal(await query.evaluate(element => document.activeElement === element), true);
      if (width === 390) { assert.equal(await query.evaluate(element => element.scrollWidth > element.clientWidth), true); await query.press("ArrowRight"); await page.waitForTimeout(200); assert.equal(await query.evaluate(element => element.scrollLeft > 0), true); }
      for (const name of ["Actual local API request table", "Actual saved inventory table"]) { const region = page.getByRole("region", { name, exact: true }); await region.focus(); assert.equal(await region.evaluate(element => document.activeElement === element), true); }
      observations.push({ width, pageHasNoHorizontalOverflow: true, tablesKeyboardFocusable: true }); await page.screenshot({ path: `${directory}/tables-${width}.png`, fullPage: true });
    }
    assert.deepEqual(externalRequests, []); assert.deepEqual(pageErrors, []); Object.assign(proof, { passed: true, observations, missingZeroAndEmptyColumnsPreserved: true, enteredMarkupRemainsText: true, externalRequests, pageErrors });
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(proof, null, 2), { flag: "wx" }); }
});
