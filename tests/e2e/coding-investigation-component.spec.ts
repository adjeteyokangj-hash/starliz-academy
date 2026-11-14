import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { codingComponentStyles } from "./coding-styles";
import { dataAiFoundationTools } from "../../src/lib/coding/learning/content/data-ai-foundations";
import { dataAiProjectTools } from "../../src/lib/coding/learning/content/data-ai-project";
const directory = `artifacts/coding-workbench-uat/investigation-component-${randomUUID()}`;
let bundle = "", styles = "";
test.beforeAll(async () => {
  mkdirSync(directory, { recursive: true }); styles = await codingComponentStyles();
  const context = dataAiFoundationTools.contexts[0]!, project = dataAiProjectTools.project(context), fixture = { rows: dataAiFoundationTools.observations(context) };
  project.classifier.training = [];
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Studio from'./src/components/coding/InvestigationStudio';import Result from'./src/components/coding/InvestigationExecution';import{executeInvestigation}from'./src/lib/coding/learning/investigation-engine';const fixture=${JSON.stringify(fixture)};function App(){const[document,setDocument]=useState(${JSON.stringify(project)});const[run,setRun]=useState(null);return <main className="mx-auto max-w-5xl space-y-4 p-4"><Studio value={document} input={fixture} readOnly={false} onChange={setDocument}/><button className="min-h-11 rounded-lg border p-3" onClick={()=>setRun(executeInvestigation(document,fixture))}>Run investigation</button>{run&&!run.ok&&<p role="alert">{run.error}</p>}{run?.ok&&<Result output={run.output}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = built.outputFiles[0]!.text;
});
test("a data investigation trains from actual cleaned records and exposes a disconnected model", async ({ page }) => {
  await page.route("**/__coding-investigation-component", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("/__coding-investigation-component");
  await page.getByRole("button", { name: "Use cleaned records as training", exact: true }).click();
  await page.getByRole("button", { name: "Run investigation", exact: true }).click();
  const result = page.getByRole("region", { name: "Executed data investigation", exact: true });
  await expect(result).toContainText("Every training example matches an actual cleaned record");
  await expect(result).toContainText("Actual transformed observations · 3 rows");
  await expect(result).toContainText("2 correct, 0 errors");
  await expect(result).toContainText("Actual data-preparation log");
  await expect(result).toContainText("Calculated summaries");
  await page.getByRole("button", { name: "Remove training c", exact: true }).click();
  await page.getByRole("button", { name: "Run investigation", exact: true }).click();
  await expect(result).toContainText("Training examples do not match all actual cleaned records");
  await expect(result).toContainText("1 correct, 1 errors");
  await page.getByRole("button", { name: "Use cleaned records as training", exact: true }).click();
  await page.getByRole("button", { name: "Run investigation", exact: true }).click();
  await expect(result).toContainText("Every training example matches an actual cleaned record");
  await expect(result).toContainText("2 correct, 0 errors");
  for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await result.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${directory}/result-${width}.png` }); }
  writeFileSync(`${directory}/result.json`, JSON.stringify({ passed: true, actualNativeEngine: true, cleanedDataTrainingConnection: true, actualCleaningLogAndChart: true, missingTrainingExampleChangesPredictions: true, responsiveViewports: [390, 820, 1440], authenticatedPersistence: false, modelProviderCalls: false }, null, 2), { flag: "wx" });
});
