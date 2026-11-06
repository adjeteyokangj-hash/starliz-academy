import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";
import { UNDERSTANDING_LOOPS } from "../../src/lib/coding/catalog";

// Real lesson component, Blockly and application CSS; fictional read-only API.
// This verifies layout, not authenticated persistence or assessment/provider rules.
test("Understanding Loops fills desktop widths and keeps every panel inside smaller screens", async ({ page }, testInfo) => {
  const css = await codingComponentStyles();
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: "tsx",
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './src/components/coding/CodingLessonWorkspace';createRoot(document.getElementById('root')).render(<Workspace lessonId="understanding-loops"/>);`,
    },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const workspace = {
    lesson: UNDERSTANDING_LOOPS, stage: "discover", completedStages: [],
    program: { blocks: [{ id: "repeat", kind: "repeat", times: 3, body: [{ id: "move", kind: "move", direction: "right" }] }] },
    evidence: {}, skillStatus: "learning", feedback: null, run: null,
    teacherFeedback: null, hintCount: 0, attemptCount: 0, checksPassed: 0,
  };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/student/coding/understanding-loops") return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll("</style", "<\\/style")}#root{display:contents}</style></head><body class="flex min-h-full flex-col overflow-x-hidden"><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>`,
    });
    if (path.startsWith("/coding/blockly/")) return route.fulfill({ body: readFileSync(`public${path}`), contentType: path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" });
    if (path === "/api/student/coding/lessons/understanding-loops" && route.request().method() === "GET") return route.fulfill({ json: { workspace } });
    return route.abort();
  });
  await page.goto("/student/coding/understanding-loops");
  await expect(page.getByRole("heading", { name: "Understanding Loops", exact: true })).toBeVisible();
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  const measurements = [];
  for (const width of [2560, 1920, 1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, right: bounds.right, width: bounds.width };
      };
      return { viewport: innerWidth, shell: rect("#root > div"), guide: rect(".studio-learning"), editor: rect(".studio-editor"), results: rect(".studio-results") };
    });
    measurements.push(layout);
    await page.screenshot({ path: testInfo.outputPath(`understanding-loops-${width}.png`), fullPage: true });
    expect(layout.shell.width).toBeGreaterThanOrEqual(width - 1);
    expect(layout.shell.x).toBeGreaterThanOrEqual(-1);
    expect(layout.shell.right).toBeLessThanOrEqual(width + 1);
    for (const panel of [layout.guide, layout.editor, layout.results]) {
      expect(panel.width).toBeGreaterThan(0);
      expect(panel.x).toBeGreaterThanOrEqual(-1);
      expect(panel.right).toBeLessThanOrEqual(width + 1);
    }
    if (width >= 1600) {
      expect(Math.abs(layout.guide.y - layout.editor.y)).toBeLessThan(2);
      expect(Math.abs(layout.editor.y - layout.results.y)).toBeLessThan(2);
    }
    if (width < 760) {
      expect(layout.editor.y).toBeGreaterThan(layout.guide.y);
      expect(layout.results.y).toBeGreaterThan(layout.editor.y);
    }
  }
  writeFileSync(testInfo.outputPath("layout-measurements.json"), JSON.stringify(measurements, null, 2));
  expect(errors).toEqual([]);
});
