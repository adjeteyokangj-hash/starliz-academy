import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";

test("practical bridge cards retain keyboard access and readable layout on phone, tablet and desktop", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-readiness-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const proof: Record<string, unknown> = { passed: false, componentPresentationOnly: true, authenticatedAssessmentClaim: false, fixtureResponses: true };
  const styles = await codingComponentStyles();
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Bridges from'./src/components/coding/ReadinessBridges';createRoot(document.getElementById('root')).render(<main style={{maxWidth:1100,margin:'auto',padding:16}}><Bridges yearGroup="Year 10"/></main>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' } });
  const plans = [{ id: "block-coding", entryYear: 3, title: "Visual programming readiness" }, { id: "blocks-to-text", entryYear: 5, title: "Visual-to-text bridge readiness" }, { id: "programming-web", entryYear: 7, title: "Programming and web readiness" }, { id: "applied", entryYear: 10, title: "Applied software readiness" }].map(plan => ({ ...plan, ready: false, benchmarks: Array.from({ length: plan.entryYear === 7 ? 5 : 4 }, (_, index) => ({ id: `synthetic-${plan.id}-${index}`, title: `Synthetic ${plan.title} benchmark ${index + 1}`, objective: "Use a real working project to explain an independent decision, reproduce a fault and verify the repair.", status: index === 0 ? "mastered" : "not_started", year: plan.entryYear - 1, kind: "project" })) }));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(); const pageErrors: string[] = []; proof.pageErrors = pageErrors; page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("https://coding-readiness.test/**", route => route.request().url().includes("/api/student/coding/readiness") ? route.fulfill({ json: { plans, entryYear: 1, scope: "Synthetic presentation fixture only." } }) : route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>` }));
    await page.goto("https://coding-readiness.test/fixture"); await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const selection = page.getByLabel("Choose a practical bridge", { exact: true }); await selection.waitFor();
    assert.equal(await selection.inputValue(), "applied");
    assert.equal(await page.getByRole("status").count(), 0, "Year-group presentation alone cannot claim verified entry readiness.");
    const observations = [];
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await selection.focus(); await selection.press("Tab");
      const first = page.getByRole("link").first(); assert.equal(await first.evaluate(element => document.activeElement === element), true);
      assert.equal(await first.getAttribute("href"), "/student/coding/readiness/applied/synthetic-applied-0");
      await first.scrollIntoViewIfNeeded(); const box = await first.boundingBox(); assert.ok(box && box.height >= 44);
      assert.equal(await first.evaluate(element => { const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === element || element.contains(hit); }), true);
      observations.push({ width, noHorizontalOverflow: true, keyboardFocus: true, uncoveredAction: true });
      await page.screenshot({ path: `${directory}/bridge-${width}.png`, fullPage: true });
    }
    await selection.selectOption("programming-web"); assert.equal(await page.getByRole("link").count(), 5);
    assert.deepEqual(pageErrors, []); Object.assign(proof, { passed: true, observations, correctFiveBenchmarkWebBridge: true, yearGroupDoesNotClaimReadiness: true, pageErrors });
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(proof, null, 2), { flag: "wx" }); }
});
