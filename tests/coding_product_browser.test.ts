import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { previewDocument } from "../src/components/coding/ProjectPreview";
import { plannerArtifact, plannerContexts } from "../src/lib/coding/learning/content/product-planner-tools";

test("private product references retain uncovered native keyboard actions at the stated widths", { timeout: 180000 }, async () => {
  const directory = `artifacts/coding-product-uat/${randomUUID()}`;
  mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const evidence: Record<string, unknown> = { realBrowser: true, learnerCodeExecutedInBrowser: false, canonicalReferencesOnly: true, fullAuthenticatedJourneyClaim: false };
  try {
    const page = await browser.newPage();
    const requests: string[] = []; page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    const observations = [];
    for (let index = 0; index < plannerContexts.length; index++) for (const width of [320, 768, 1024]) {
      const artifact = plannerArtifact(index); if (artifact.type !== "source") throw new Error("Expected a real source artifact");
      await page.setViewportSize({ width, height: 1400 });
      await page.setContent('<html><body style="margin:0"><iframe title="Private product preview" sandbox="allow-scripts" style="width:100%;height:1350px;border:0"></iframe></body></html>');
      await page.evaluate(srcdoc => {
        (window as unknown as { interactions: unknown[] }).interactions = [];
        window.addEventListener("message", event => (window as unknown as { interactions: unknown[] }).interactions.push(event.data));
        document.querySelector("iframe")!.srcdoc = srcdoc;
      }, previewDocument(artifact.html!, artifact.css!, "product-uat", "productnonce", true));
      const frame = page.frameLocator("iframe"), quantity = frame.getByLabel(`Fictional participant count (0 to ${plannerContexts[index]!.max})`), action = frame.getByRole("button", { name: "Calculate supplies", exact: true });
      await quantity.waitFor(); await quantity.fill("0"); await quantity.focus(); await quantity.press("Tab");
      assert.equal(await action.evaluate(element => document.activeElement === element), true);
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox(); assert.ok(box && box.height >= 44);
      assert.equal(await action.evaluate(element => { const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === element || element.contains(hit); }), true);
      assert.equal(await frame.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await action.press("Enter");
      await page.waitForFunction(() => (window as unknown as { interactions: Array<{ kind: string; target: string }> }).interactions.some(event => event.kind === "interaction" && event.target === "calculate"));
      assert.equal(await frame.locator("#feedback").getAttribute("aria-live"), "polite");
      observations.push({ index, width, keyboardEnterForwarded: true, uncoveredActionHeight: box.height });
      await page.screenshot({ path: `${directory}/context-${index}-${width}.png`, fullPage: true });
    }
    const faulty = plannerArtifact(0, "keyboard"); if (faulty.type !== "source") throw new Error("Expected source fault");
    await page.evaluate(srcdoc => { document.querySelector("iframe")!.srcdoc = srcdoc; }, previewDocument(faulty.html!, faulty.css!, "product-uat", "faultnonce", true));
    const frame = page.frameLocator("iframe"), input = frame.locator("#quantity"); await input.waitFor(); await input.focus(); await input.press("Tab");
    assert.equal(await frame.locator("#calculate").evaluate(element => document.activeElement === element), false, "The seeded div is actually skipped by sequential keyboard focus");
    assert.deepEqual(requests, []);
    Object.assign(evidence, { observations, seededKeyboardRegressionReproduced: true, externalRequests: requests, passed: true });
  } finally { await browser.close(); writeFileSync(`${directory}/result.json`, JSON.stringify(evidence, null, 2), { flag: "wx" }); }
});
