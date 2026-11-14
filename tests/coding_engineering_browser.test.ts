import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";
import { teamIncrementTools } from "../src/lib/coding/learning/content/team-increment-lessons";
import { executeEngineering } from "../src/lib/coding/learning/engineering-engine";

test("engineering dependencies are repairable by keyboard and read-only stages protect all project fields", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-engineering-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const initial = teamIncrementTools.plan(0, true); if (initial.type !== "visual") throw new Error("Expected actual native task document");
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Editor from'./src/components/coding/EngineeringStudio';import View from'./src/components/coding/EngineeringExecution';const initial=${JSON.stringify(initial.document)};function App(){const[value,setValue]=useState(initial),[result,setResult]=useState(null),[readOnly,setReadOnly]=useState(false);window.readProject=()=>value;return <main style={{maxWidth:1000,margin:'auto',padding:16}}><button style={{minHeight:44}} onClick={()=>setReadOnly(previous=>!previous)}>Toggle read-only stage</button><Editor value={value} input={{role:'owner'}} readOnly={readOnly} onChange={setValue}/><button style={{minHeight:44}} onClick={async()=>setResult(await window.runActualTaskModel(value))}>Run actual dependency model</button>{result&&!result.ok&&<p role="alert">{result.error}</p>}{result&&result.ok&&<View output={result.output}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const evidence: Record<string, unknown> = { realBrowser: true, actualNativeDependencyEngine: true, fullAuthenticatedJourneyClaim: false };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1100 } });
    await page.exposeBinding("runActualTaskModel", async (_, value: unknown) => {
      if (!value || typeof value !== "object" || (value as { run?: unknown }).run !== false) throw new Error("This test accepts native-only task plans, never source execution");
      return executeEngineering(value, { role: "owner" });
    });
    await page.setContent(`<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: built.outputFiles[0]!.text });
    const run = page.getByRole("button", { name: "Run actual dependency model", exact: true }); await run.click();
    await page.getByRole("alert").filter({ hasText: "cycle" }).waitFor();
    const dependency = page.getByRole("group", { name: "Prerequisites for contract", exact: true }).getByRole("checkbox", { name: "interface", exact: true });
    await dependency.focus(); await dependency.press("Space"); assert.equal(await dependency.isChecked(), false);
    await run.click(); await page.getByRole("region", { name: "Calculated dependency order" }).waitFor();
    assert.deepEqual(await page.getByRole("region", { name: "Calculated dependency order" }).locator("li").allTextContents(), ["contract", "logic", "interface", "retest"]);
    await page.getByRole("button", { name: "Add measurable task", exact: true }).click();
    await page.getByLabel("User need for task1", { exact: true }).fill("The fictional organiser needs a documented review of the current evidence.");
    await page.getByRole("button", { name: "Remove task task1", exact: true }).click();
    assert.equal(await page.getByLabel("User need for task1", { exact: true }).count(), 0);
    await page.getByText("Reproducible handover", { exact: true }).click();
    await page.getByLabel("Known limitation", { exact: true }).fill("Only the synthetic task plan is checked here; real-user usability still needs evidence.");
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1100 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Toggle read-only stage", exact: true }).click();
    assert.equal(await dependency.isDisabled(), true); assert.equal(await page.getByLabel("User need for contract", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Known limitation", { exact: true }).isDisabled(), true);
    Object.assign(evidence, { seededCycleReproduced: true, keyboardRepairRanActualEngine: true, taskAddRemove: true, handoverEditable: true, readOnlyProtection: true, viewports: [390, 820, 1440], passed: true });
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
