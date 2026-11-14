import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { codingComponentStyles } from "./e2e/coding-styles";

test("original video controls decode actual browser-recorded frames and retain accessible alternatives across viewport sizes", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-demonstration-uat/${randomUUID()}`; mkdirSync(directory, { recursive: true });
  const proof: Record<string, unknown> = { passed: false, actualMediaRecorder: true, screenChooserVerified: false, authenticatedStorageVerified: false, learnerOriginalityClaim: false };
  const styles = await codingComponentStyles();
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Recorder from'./src/components/coding/DemonstrationRecorder';createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'auto',padding:16}}><Recorder activityId="private-author-recording-test" artifact={{type:'source',language:'javascript',entry:'dom',source:'document.body.textContent="Synthetic private project";',html:'<main>Synthetic private project</main>'}} taskHash={"e".repeat(64)} disabled={false} attached={null} authorPreview onAttach={async()=>{throw new Error('No authenticated upload is performed by this author-only browser test')}}/></main>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message)); proof.pageErrors = pageErrors;
    await page.route("https://coding-media.test/**", route => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div></body></html>` }));
    await page.goto("https://coding-media.test/author");
    // tsx preserves nested function names with this helper when Playwright
    // serialises the fixture callback into the separate browser context.
    await page.addScriptTag({ content: "globalThis.__name=value=>value;" });
    const encoded = await page.evaluate(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext("2d")!; const stream = canvas.captureStream(12), chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 250000 });
      let frame = 0; const draw = () => { context.fillStyle = frame % 2 ? "#0c4a6e" : "#164e63"; context.fillRect(0, 0, 640, 360); context.fillStyle = "white"; context.font = "24px sans-serif"; context.fillText("Synthetic media validation fixture", 30, 100); context.fillText(`Actual recorded frame ${frame++}`, 30, 160); };
      draw(); const interval = setInterval(draw, 80);
      const stopped = new Promise<Blob>(resolve => { recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
      recorder.start(300); await new Promise(resolve => setTimeout(resolve, 2200)); recorder.stop(); const blob = await stopped;
      clearInterval(interval); stream.getTracks().forEach(track => track.stop()); return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const fixture = `${directory}/actual-browser-recording.webm`; writeFileSync(fixture, Buffer.from(encoded), { flag: "wx" });
    proof.fixturePath = resolve(fixture); proof.recordedBytes = encoded.length;
    await page.addScriptTag({ content: built.outputFiles[0]!.text });
    await page.getByLabel("Or upload your own video-only WebM", { exact: true }).setInputFiles(resolve(fixture));
    await page.getByRole("status").filter({ hasText: "Local recording decoded" }).waitFor({ timeout: 15000 }).catch(async error => { proof.actualStatusMessages = await page.getByRole("status").allTextContents(); await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }); throw error; });
    assert.equal(await page.getByLabel("Inspect your unsaved original recording", { exact: true }).evaluate(video => (video as HTMLVideoElement).videoWidth), 640);
    await page.getByLabel("Written alternative: describe the task, original visual and observed outcome", { exact: true }).fill("Actual synthetic canvas frames change colour and count upward. This fixture tests encoding and playback only, not a learner's original screen demonstration.");
    await page.getByLabel("Source and permission for everything shown", { exact: true }).fill("Original synthetic validation canvas drawn by this browser test. No user application or personal screen was captured.");
    await page.getByLabel("A limitation the demonstration does not prove", { exact: true }).fill("This verifies real MediaRecorder bytes and local playback; it does not verify the screen chooser, authenticated upload or learner mastery.");
    assert.equal(await page.getByRole("button", { name: "Save original demonstration privately", exact: true }).isDisabled(), true, "An author-only test cannot impersonate an authenticated learner attachment");
    assert.equal(await page.getByRole("link", { name: "Keep a local copy", exact: true }).count(), 1);
    for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true }); }
    await page.getByLabel("Or upload your own video-only WebM", { exact: true }).setInputFiles({ name: "fake.webm", mimeType: "video/webm", buffer: Buffer.from("This is not a video recording despite the filename and content type.".repeat(5)) });
    await page.getByRole("status").filter({ hasText: "recording could not be decoded" }).waitFor();
    Object.assign(proof, { passed: true, actualRecordedFramesDecodedInBrowser: true, fakeRenamedFileRefused: true, writtenAlternativeEditable: true, localCopyRetained: true, authorCannotUploadAsLearner: true, viewports: [390, 820, 1440] });
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(proof, null, 2), { flag: "wx" }); }
});
