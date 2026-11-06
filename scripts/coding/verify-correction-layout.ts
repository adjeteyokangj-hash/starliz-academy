import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";
import { codingComponentStyles } from "../../tests/e2e/coding-styles";
async function main() {
const directory="artifacts/coding-correction/layout";mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true});
try {const page=await browser.newPage();const checks:string[]=[];
    const styles = await codingComponentStyles();
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import Frame from'./src/components/coding/CodingStudioFrame';createRoot(document.getElementById('root')).render(<Frame year={7} learning={<p>Instructions</p>} outputs={<section><h2>Output</h2></section>}><textarea aria-label="Editor draft" defaultValue="Keep this code"/></Frame>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
    await page.route("**/__correction-frame", route => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root" style="padding:24px"></div><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>` }));
    for (const width of [1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto("http://127.0.0.1/__correction-frame");
      const slider = page.getByRole("slider", { name: "Results panel width" }); await slider.focus(); await page.keyboard.press("Home");
      await expect.poll(async () => Math.round((await page.locator(".studio-results").boundingBox())!.width)).toBe(440);
      await page.keyboard.press("End"); await expect.poll(async () => Math.round((await page.locator(".studio-results").boundingBox())!.width)).toBe(620);
      await expect(page.getByRole("textbox", { name: "Editor draft" })).toHaveValue("Keep this code"); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 900 }); await expect(page.getByRole("slider", { name: "Results panel width" })).toBeHidden(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push("Actual studio component/CSS: desktop width is 440–620px, editor survives, mobile stacks and hides slider");

await page.screenshot({path:directory+"/mobile.png",fullPage:true});
writeFileSync(directory+"/result.json",JSON.stringify({passed:true,checks},null,2));console.log(checks);
} finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
