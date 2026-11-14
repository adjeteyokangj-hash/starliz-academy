import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { previewDocument } from "../src/components/coding/ProjectPreview";
import { semanticInterfaceTools } from "../src/lib/coding/learning/content/semantic-interfaces";
import { interfaceContexts } from "../src/lib/coding/learning/content/semantic-interface-tools";

test("canonical interface layouts retain real keyboard controls and uncover the action at three widths", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-interface-uat/${randomUUID()}`;
  mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const evidence: Record<string, unknown> = { realBrowserGeometry: true, learnerCodeExecutedInBrowser: false, fullLearnerJourneyClaim: false, canonicalReferencesOnly: true };
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 1200 } });
    const requests: string[] = []; page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const observations: Array<{ context: number; width: number; actionHeight: number }> = [];
    for (let index = 0; index < interfaceContexts.length; index++) for (const width of [320, 768, 1024]) {
      const artifact = semanticInterfaceTools.flow(index);
      assert.equal(artifact.type, "source"); if (artifact.type !== "source") throw new Error("Expected actual web artifact");
      await page.setViewportSize({ width, height: 1200 });
      await page.setContent('<html><body style="margin:0"><iframe title="Actual private interface" sandbox="allow-scripts" style="display:block;width:100%;height:1100px;border:0"></iframe></body></html>');
      await page.evaluate(srcdoc => {
        (window as unknown as { interactions: Array<{ kind: string; target: string }> }).interactions = [];
        window.addEventListener("message", event => (window as unknown as { interactions: unknown[] }).interactions.push(event.data), { once: false });
        document.querySelector("iframe")!.srcdoc = srcdoc;
      }, previewDocument(artifact.html!, artifact.css!, "interface-uat", "interfacenonce", true));
      const frame = page.frameLocator("iframe"), name = frame.getByLabel(interfaceContexts[index]!.label), apply = frame.getByRole("button", { name: `Apply ${interfaceContexts[index]!.noun}`, exact: true });
      await name.waitFor(); await name.fill("Paper prototype");
      assert.equal(await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await apply.evaluate(element => { const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === element || element.contains(hit); }), true);
      const box = await apply.boundingBox(); assert.ok(box); assert.ok(box.height >= 44);
      const link = frame.getByRole("link", { name: "Read revision instructions" });
      await link.focus(); await link.press("Tab"); assert.equal(await name.evaluate(element => document.activeElement === element), true);
      await name.press("Tab"); assert.equal(await apply.evaluate(element => document.activeElement === element), true);
      await apply.press("Enter");
      await page.waitForFunction(() => (window as unknown as { interactions: Array<{ kind: string; target: string }> }).interactions.some(event => event.kind === "interaction" && event.target === "apply"));
      assert.equal(await frame.getByRole("heading", { name: "Revision instructions", exact: true }).count(), 1);
      observations.push({ context: index, width, actionHeight: box.height });
      await page.screenshot({ path: `${directory}/context-${index}-${width}.png`, fullPage: true });
    }
    const fault = semanticInterfaceTools.flow(0, true); if (fault.type !== "source") throw new Error("Expected actual web fault");
    await page.setViewportSize({ width: 320, height: 1200 });
    await page.evaluate(srcdoc => { document.querySelector("iframe")!.srcdoc = srcdoc; }, previewDocument(fault.html!, fault.css!, "interface-uat", "faultnonce", true));
    const action = page.frameLocator("iframe").getByRole("button", { name: "Apply model", exact: true }); await action.waitFor();
    assert.equal(await action.evaluate(element => { const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === element || element.contains(hit); }), false, "The real browser reproduces the seeded covering-overlay fault");
    assert.deepEqual(requests, []);
    evidence.observations = observations; evidence.seededOverlayReproduced = true; evidence.externalRequests = requests; evidence.passed = true;
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
