import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { audienceGameActivities } from "../../src/lib/coding/learning/content/audience-games";
import { codingComponentStyles } from "./coding-styles";

// Component-only browser evidence. No learner session, database persistence,
// model review or server assessment is claimed by this isolated harness.
const directory = `artifacts/coding-workbench-uat/game-component-${randomUUID()}`;
let bundle = "", styles = "";
test.beforeAll(async () => {
  mkdirSync(directory, { recursive: true });
  const initial = audienceGameActivities[0]!.starter;
  if (initial.type !== "visual") throw new Error("Expected a visual learning game.");
  styles = await codingComponentStyles();
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Studio from './src/components/coding/GameStudio';import Controls from './src/components/coding/LearningGameControls';import State from './src/components/coding/GameState';import{executeLearningGame}from'./src/lib/coding/learning/game-engine';function App(){const[document,setDocument]=useState(${JSON.stringify(initial.document)});const[events,setEvents]=useState([]);const run=executeLearningGame(document,{events,finding:'The tester cannot tell what Go will do'});const output=run.output||{};return <main style={{maxWidth:900,margin:'auto',padding:16}}><button className="min-h-11 rounded-lg border p-3" onClick={()=>setEvents([])}>Run component preview</button><Controls output={output} onInteraction={event=>setEvents(previous=>[...previous,event])}/><State variables={output.variables||{}}/><Studio year={4} value={document} readOnly={false} onChange={value=>{setDocument(value);setEvents([])}}/></main>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = result.outputFiles[0]!.text;
});
test("a repaired learning-game control is keyboard reachable, executes its program and restarts", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>`);
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Button label", exact: true }).first().fill("Check answer");
  await page.getByRole("button", { name: "Run component preview", exact: true }).click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Check answer", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const state = page.getByRole("region", { name: "Game state after execution" }).getByText("Score", { exact: true }).locator("..");
  await expect(state).toContainText("1");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Restart game", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(state).toContainText("0");
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`, JSON.stringify({ componentOnly: true, serverAssessmentClaim: false, authenticatedPersistenceClaim: false, actualKeyboardActivation: true, scoringAndRestart: true, viewports: [390, 820, 1440], browserErrors: errors }, null, 2), { flag: "wx" });
});
