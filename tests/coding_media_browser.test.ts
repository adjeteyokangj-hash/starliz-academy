import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";

test("actual browser renders bounded source pixels and plays a real low-amplitude waveform buffer", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-media-uat/${randomUUID()}`;
  mkdirSync(directory, { recursive: true });
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import View from'./src/components/coding/DataRepresentationExecution';const root=createRoot(document.getElementById('root'));window.renderMedia=values=>root.render(<main style={{maxWidth:900,margin:'auto',padding:16}}>{values.map((output,index)=><View key={index} output={output}/>)}</main>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--mute-audio"] });
  const evidence: Record<string, unknown> = { realBrowser: true, realWebAudioBuffer: false, physicalAudibilityClaim: false, untrustedSourceExecutedInBrowser: false };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    const requests: string[] = []; page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await page.setContent(`<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>`);
    await page.evaluate(() => {
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer) {
          const samples = this.buffer.getChannelData(0);
          let minimum = 1, maximum = -1, finite = true;
          for (const sample of samples) { minimum = Math.min(minimum, sample); maximum = Math.max(maximum, sample); finite &&= Number.isFinite(sample); }
          (window as unknown as { audioEvidence: unknown }).audioEvidence = { length: samples.length, sampleRate: this.buffer.sampleRate, duration: this.buffer.duration, minimum, maximum, finite };
        }
        return Reflect.apply(original, this, args);
      };
    });
    await page.addScriptTag({ content: built.outputFiles[0]!.text });
    await page.evaluate(() => (window as unknown as { renderMedia: (values: unknown[]) => void }).renderMedia([
      { representationMode: "pixels", quantised: [0, 4, 8, 15], representationDepth: 4, representationWidth: 2, representationBits: 9999 },
      { representationMode: "sound", quantised: [0, 8, 15, 8], representationDepth: 4, sampleRate: 8000, representationBits: 9999, durationSeconds: 99, bitRate: 7 },
    ]));
    await page.getByRole("heading", { name: "Actual pixels representation" }).waitFor();
    assert.equal(await page.getByRole("img", { name: "Actual greyscale image with 4 pixels, 2 pixels per row" }).locator("rect").count(), 4);
    assert.equal(await page.getByRole("img", { name: "Actual quantised sample waveform" }).locator("polyline").count(), 1);
    assert.equal((await page.locator("body").innerText()).includes("9999"), false, "Displayed payload size is derived from actual values and depth rather than a claimed bit count");
    await page.getByText(/Original duration: 0\.0005 seconds/).waitFor();
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Play looped samples" }).click();
    await page.getByRole("status").filter({ hasText: "Playing the actual quantised waveform" }).waitFor();
    const audio = await page.evaluate(() => (window as unknown as { audioEvidence: { length: number; sampleRate: number; duration: number; minimum: number; maximum: number; finite: boolean } }).audioEvidence);
    assert.equal(audio.duration, 1); assert.equal(audio.length, audio.sampleRate); assert.equal(audio.finite, true);
    assert.ok(audio.minimum < -0.079 && audio.minimum >= -0.080001);
    assert.ok(audio.maximum > 0.079 && audio.maximum <= 0.080001);
    evidence.realWebAudioBuffer = true; evidence.audio = audio;
    for (const quantised of [[1e100], [-1], [1.5], Array(257).fill(0)]) {
      await page.evaluate(values => (window as unknown as { renderMedia: (values: unknown[]) => void }).renderMedia([{ representationMode: "sound", quantised: values, representationDepth: 4, sampleRate: 8000 }]), quantised);
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByRole("button", { name: "Play looped samples" }).count(), 0);
    }
    for (const representation of [
      { representationMode: "sound", quantised: [0], representationDepth: 0, sampleRate: 8000 },
      { representationMode: "sound", quantised: [0], representationDepth: 2.5, sampleRate: 8000 },
      { representationMode: "sound", quantised: [0], representationDepth: 4, sampleRate: 0 },
      { representationMode: "pixels", quantised: [0], representationDepth: 4, representationWidth: 0.5 },
    ]) {
      await page.evaluate(value => (window as unknown as { renderMedia: (values: unknown[]) => void }).renderMedia([value]), representation);
      await page.getByRole("alert").waitFor(); assert.equal(await page.getByRole("button", { name: "Play looped samples" }).count(), 0);
    }
    assert.deepEqual(requests, []);
    evidence.invalidSamplesBlocked = true; evidence.viewports = [390, 820, 1440]; evidence.externalRequests = requests; evidence.passed = true;
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
