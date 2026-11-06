import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { ownedQaEnvironment } from "./owned-qa-environment";
import { codingComponentStyles } from "../../tests/e2e/coding-styles";
import type { Execution } from "../../src/lib/coding/learning/types";
import type { PlaygroundAssessment } from "../../src/lib/coding/learning/playground-assessment";

/** Local-only real application/isolated runner. No account, learner or database
 * writes. The unused random QA ID cannot identify an existing learner. */
async function main() {
  const directory = `artifacts/coding-correction/browser-${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const checks: string[] = [];
  const proof: Record<string, unknown> = { directory, actualApp: true, actualRunner: true, noDatabaseWrites: true, checks, passed: false };
  let environment: Awaited<ReturnType<typeof ownedQaEnvironment>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let observedPage: Page | undefined;
  try {
    environment = await ownedQaEnvironment([randomUUID()], `${directory}/owned-app.log`);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({ baseURL: environment.base, viewport: { width: 1600, height: 1000 } });
    await context.route("**/*", route => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const page = await context.newPage(); observedPage = page;
    const errors: string[] = [], bootstrapRequests: string[] = [];
    page.on("console", message => { if (message.type() === "error") writeFileSync(`${directory}/browser-console.txt`, message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/\/api\/(consent|profiles)(?:\/|$)/.test(new URL(request.url()).pathname)) bootstrapRequests.push(request.url()); });
    await page.goto("/dev/coding", { timeout: 180000, waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Let’s make something!" })).toBeVisible({ timeout: 120000 });
    assert.equal(bootstrapRequests.length, 0); assert(page.url().endsWith("/dev/coding")); checks.push("Development playground opens without profile/consent redirects");
    const editor = page.getByRole("textbox", { name: "Your code", exact: true });
    const write = async (source: string) => { await editor.fill(source); };
    const run = async (web = false, retry = false): Promise<{ execution: Execution; assessment: PlaygroundAssessment }> => {
      const response = page.waitForResponse(response => response.url().endsWith("/api/dev/coding-preview") && response.request().method() === "POST", { timeout: 120000 });
      await page.getByRole("button", { name: web ? "See my page" : "Run code", exact: true }).click();
      const result = await response, data = await result.json();
      writeFileSync(`${directory}/latest-execution.json`, JSON.stringify(data, null, 2));
      if (result.status() === 503 && !retry) { proof.runnerUnavailableAttempts = Number(proof.runnerUnavailableAttempts ?? 0) + 1; return run(web, true); }
      assert.equal(result.status(), 200, JSON.stringify(data)); assert.equal(data.execution.ok, true, data.execution.error);
      assert.match(data.execution.runtime, /^runsc:/); return data;
    };
    if (!process.argv.includes("--web-only")) {
    assert.equal((await run()).assessment.completed, false);
    await write('robot = "Aurora"\nprint("Hello! I am " + robot + ".")'); assert.equal((await run()).assessment.completed, true);
    await expect(page.getByRole("button", { name: "Next step" })).toBeEnabled();
    await write('print(2 + 3)'); await expect(page.getByRole("button", { name: "Next step" })).toBeDisabled(); assert.equal((await run()).assessment.completed, false);
    checks.push("Real Python rejects unchanged/unrelated output, accepts a variable-based solution, clears stale completion");
    await page.getByRole("button", { name: "2. Functions", exact: true }).click(); assert.equal((await run()).assessment.completed, true);
    await page.getByRole("button", { name: "Next step" }).click();
    await write('def greet(name):\n    print("Hello, " + name)\n\ngreet("Spark")\ngreet("Orion")'); assert.equal((await run()).assessment.completed, true);
    await page.getByRole("button", { name: "Next step" }).click(); assert.equal((await run()).assessment.completed, false);
    await write('print("Go, Orion!")'); assert.equal((await run()).assessment.completed, false);
    await write('def greet(name):\n    print("Hello, " + name)\ngreet("Spark")\ndef cheer(name):\n    print(f"Go, {name}!")\ncheer("Orion")'); assert.equal((await run()).assessment.completed, true);
    checks.push("Real Functions sequence validates parameters, authored cheer, varied names and an executed call");
    }
    if (process.argv.includes("--python-only")) { assert.deepEqual(errors, []); proof.passed = true; return; }
    await page.getByRole("button", { name: /Build a website/ }).click();
    await write('<main><h1 id="planet">Planet Aurora</h1><p>My violet sky</p></main>'); assert.equal((await run(true)).assessment.completed, true);
    await page.getByRole("button", { name: "Next step" }).click(); await write('#planet { color: #0000ff; padding: 12px; }'); assert.equal((await run(true)).assessment.completed, true);
    try { await expect(page.frameLocator('iframe[title="Your planet page"]').getByRole("heading", { name: "Planet Aurora" })).toBeVisible(); }
    catch (error) { await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }); writeFileSync(`${directory}/failure-dom.html`, await page.content()); writeFileSync(`${directory}/frames.json`, JSON.stringify(await Promise.all(page.frames().map(async frame => ({ url: frame.url(), html: await frame.content() }))))); throw error; }
    await page.getByRole("button", { name: "Next step" }).click();
    const js = await editor.innerText(); await write(js.replace("Hello, explorer!", "Welcome to Aurora!")); assert.equal((await run(true)).assessment.completed, false);
    const [clickedResponse] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/api/dev/coding-preview") && response.request().method() === "POST", { timeout: 120000 }),
      page.frameLocator('iframe[title="Your planet page"]').getByRole("button", { name: "Say hello", exact: true }).click(),
    ]);
    const clickedData = await clickedResponse.json(); assert.equal(clickedResponse.status(), 200); assert.equal(clickedData.assessment.completed, true);
    await expect(page.frameLocator('iframe[title="Your planet page"]').getByText("Welcome to Aurora!", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Previous step" }).click(); await expect(editor).toContainText("#0000ff");
    await page.getByRole("button", { name: "Previous step" }).click(); await expect(editor).toContainText("My violet sky");
    await write('<h1>Planet Later</h1>'); assert.equal((await run(true)).assessment.completed, true);
    await page.getByRole("button", { name: "Next step" }).click(); await expect(editor).toContainText("#0000ff");
    await page.reload({ waitUntil: "domcontentloaded" }); await expect(editor).toContainText("#0000ff", { timeout: 60000 });
    assert.equal((await run(true)).assessment.completed, true); await expect(page.frameLocator('iframe[title="Your planet page"]').getByRole("heading", { name: "Planet Aurora" })).toBeVisible();
    checks.push("HTML/CSS/JS build the same page; click behaviour is assessed; previous, reload and existing downstream drafts preserve work");
    await page.getByRole("button", { name: "Next step" }).click(); await expect(editor).toContainText("Welcome to Aurora!");
    await page.getByRole("button", { name: "Start again", exact: true }).click(); await expect(editor).toContainText("Hello, explorer!"); assert.equal((await run(true)).assessment.completed, false);
    await expect(page.frameLocator('iframe[title="Your planet page"]').getByRole("heading", { name: "Planet Aurora" })).toBeVisible();
    checks.push("Reset changes only the current editable file and retains earlier HTML/CSS");
    for (const width of [1920, 820, 390]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert((await editor.boundingBox())!.width >= 250, "The code editor must remain readable at every viewport"); await page.screenshot({ path: `${directory}/playground-${width}.png`, fullPage: true }); }
    checks.push("Playground remains usable without horizontal overflow at desktop, tablet and mobile widths");
    assert.equal((await context.request.post("/api/dev/coding-preview", { headers: { Origin: "https://example.invalid" }, data: {} })).status(), 403);
    const protectedResponse = await context.request.get("/api/student/coding/activities", { maxRedirects: 0 }); assert([401, 403, 307].includes(protectedResponse.status()));
    checks.push("Cross-origin playground execution and unauthenticated real student access remain denied");

    const styles = await codingComponentStyles();
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import Frame from'./src/components/coding/CodingStudioFrame';createRoot(document.getElementById('root')).render(<Frame year={7} learning={<p>Instructions</p>} outputs={<section><h2>Output</h2></section>}><textarea aria-label="Editor draft" defaultValue="Keep this code"/></Frame>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
    await page.route("**/__correction-frame", route => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root" style="padding:24px"></div><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>` }));
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto("/__correction-frame");
      const slider = page.getByRole("slider", { name: "Results panel width" }); await slider.focus(); await page.keyboard.press("Home");
      await expect.poll(async () => Math.round((await page.locator(".studio-results").boundingBox())!.width)).toBe(440);
      await page.keyboard.press("End"); await expect.poll(async () => Math.round((await page.locator(".studio-results").boundingBox())!.width)).toBe(620);
      await expect(page.getByRole("textbox", { name: "Editor draft" })).toHaveValue("Keep this code"); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 900 }); await expect(page.getByRole("slider", { name: "Results panel width" })).toBeHidden(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push("Actual studio component/CSS: desktop width is 440–620px, editor survives, mobile stacks and hides slider");
    assert.deepEqual(errors, []); proof.passed = true;
  } catch (error) { proof.error = error instanceof Error ? error.message : String(error);
    if (observedPage && !observedPage.isClosed()) {
      await observedPage.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
      writeFileSync(`${directory}/frames.json`, JSON.stringify(await Promise.all(observedPage.frames().map(async frame => ({ url: frame.url(), html: await frame.content().catch(() => "unavailable") })))));
    }
    throw error; }
  finally { writeFileSync(`${directory}/result.json`, JSON.stringify(proof, null, 2)); await browser?.close(); await environment?.stop(); console.log(JSON.stringify(proof)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
