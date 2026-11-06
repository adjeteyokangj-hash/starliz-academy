import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { codingComponentStyles } from "./coding-styles";
const directory = `artifacts/coding-workbench-uat/classifier-component-${randomUUID()}`;
let bundle = "", styles = "";
test.beforeAll(async () => {
  mkdirSync(directory, { recursive: true }); styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import Studio from'./src/components/coding/ClassifierStudio';import Result from'./src/components/coding/ClassifierExecution';import{executeClassifier}from'./src/lib/coding/learning/studio-engines';function App(){const[document,setDocument]=useState({training:[{id:'low',features:[0],label:'short',group:'fictional'},{id:'high',features:[10],label:'long',group:'fictional'}],test:[{id:'unseen',features:[9],label:'long',group:'fictional'}],k:1,abstainBelow:0.6,ruleThreshold:5,modelVersion:'fictional-v1',source:'Fictional measurements',limitation:'A tiny sample cannot establish general reliability.',humanReview:true});const[run,setRun]=useState(null);return <main className="mx-auto max-w-5xl space-y-4 p-4"><Studio value={document} readOnly={false} onChange={setDocument}/><button className="min-h-11 rounded-lg border p-3" onClick={()=>setRun(executeClassifier(document))}>Train and test</button>{run&&!run.ok&&<p role="alert">{run.error}</p>}{run?.ok&&<Result output={run.output}/>}</main>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = built.outputFiles[0]!.text;
});
test("classifier editing changes actual nearest-neighbour outcomes and remains usable at three sizes", async ({ page }) => {
  await page.route("**/__coding-classifier-component", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("/__coding-classifier-component");
  await page.getByRole("button", { name: "Train and test", exact: true }).click();
  await expect(page.getByRole("region", { name: "Classifier evaluation" })).toContainText("1 correct, 0 errors");
  await page.getByRole("button", { name: "Remove training high", exact: true }).click();
  await page.getByRole("button", { name: "Train and test", exact: true }).click();
  await expect(page.getByRole("region", { name: "Classifier evaluation" })).toContainText("0 correct, 1 errors");
  await page.getByRole("textbox", { name: "Example identifier", exact: true }).fill("new-long");
  await page.getByRole("textbox", { name: "Measured features, separated by commas", exact: true }).fill("10");
  await page.getByRole("textbox", { name: "Known category", exact: true }).fill("long");
  await page.getByRole("button", { name: "Add training example", exact: true }).click();
  await page.getByRole("button", { name: "Train and test", exact: true }).click();
  await expect(page.getByRole("region", { name: "Classifier evaluation" })).toContainText("1 correct, 0 errors");
  await page.getByRole("textbox", { name: "Measured features, separated by commas", exact: true }).fill("1,,2");
  await page.getByRole("button", { name: "Add training example", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("comma-separated measurements");
  for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true }); }
  writeFileSync(`${directory}/result.json`, JSON.stringify({ passed: true, actualNativeEngine: true, responsiveViewports: [390, 820, 1440], invalidMeasurementsRejected: true, authenticatedPersistence: false, modelProviderCalls: false }, null, 2), { flag: "wx" });
});
