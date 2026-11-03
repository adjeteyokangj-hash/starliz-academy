import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { modeDiagram } from "../src/lib/coding/learning/content/model-control-tools";
import { codingComponentStyles } from "./e2e/coding-styles";

test("declared control diagrams retain readable geometry, complete tables and keyboard panning", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-state-diagram-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: "import React from'react';import{createRoot}from'react-dom/client';import Diagram from'./src/components/coding/StateTransitionDiagram';const root=createRoot(document.getElementById('root'));window.showDiagram=diagram=>root.render(<main style={{maxWidth:900,margin:'auto',padding:16}}><Diagram diagram={diagram}/></main>);" }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const evidence: Record<string, unknown> = { realBrowser: true, declaredInstructionDiagram: true, simulatedExecutionClaim: false };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1100 } }), requests: string[] = [];
    page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.setContent(`<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: built.outputFiles[0]!.text });
    for (let index = 0; index < 3; index++) {
      const diagram = modeDiagram(index);
      await page.evaluate(value => (window as unknown as { showDiagram: (value: unknown) => void }).showDiagram(value), diagram);
      const image = page.getByRole("img", { name: diagram.title, exact: true }), table = page.getByRole("table", { name: "Complete declared transitions", exact: true });
      await image.waitFor(); await page.getByText("Declared instruction diagram.", { exact: false }).waitFor();
      assert.equal(await table.getByRole("row").count(), diagram.transitions.length + 1);
      assert.equal(await image.locator("rect").count(), diagram.states.length);
      assert.equal(await table.getByRole("cell", { name: diagram.transitions[0]!.event, exact: true }).count(), 1);
      for (const width of [390, 820, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const labels = await image.locator("text").evaluateAll(elements => elements.map(element => { const box = (element as SVGGraphicsElement).getBBox(); return { x: box.x, y: box.y, width: box.width, height: box.height, renderedHeight: element.getBoundingClientRect().height }; }));
        assert.ok(labels.every(label => label.x >= 0 && label.y >= 0 && label.x + label.width <= 640 && label.y + label.height <= 350), "No declared label is clipped by the actual SVG view box");
        assert.ok(labels.every(label => label.renderedHeight >= 12), "A narrow screen must not shrink diagram labels into unreadable text");
        if (width === 390) {
          const canvas = page.getByRole("region", { name: "State diagram canvas", exact: true }); await canvas.evaluate(element => { element.scrollLeft = 0; }); await canvas.focus(); await canvas.press("ArrowRight");
          await page.waitForFunction(() => document.querySelector('[aria-label="State diagram canvas"]')!.scrollLeft > 0);
        }
        await page.screenshot({ path: `${directory}/context-${index}-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(requests, []); evidence.contexts = 3; evidence.viewports = [390, 820, 1440]; evidence.labelsInsideViewBox = true; evidence.keyboardPan = true; evidence.completeEquivalentTables = true; evidence.externalRequests = requests; evidence.passed = true;
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
