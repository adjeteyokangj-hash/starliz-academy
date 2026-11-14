import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";

test("guide follows real actions, remembers preferences, and fits the viewport", async ({ page }) => {
  test.setTimeout(180000);
  const styles = await codingComponentStyles();
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import {createRoot} from "react-dom/client";
      import Helper from "./src/components/guidance/StarLizHelper";
      import {firstProjectGuide,secondProjectGuide} from "./src/components/guidance/coding-guides";
      import {guideEvent} from "./src/components/guidance/guide";
      const project = new URLSearchParams(location.search).get("project") || "one";
      createRoot(document.getElementById("root")).render(<main className="starliz-page mx-auto max-w-4xl space-y-4 p-4">
        <Helper learner="fictional-learner" guide="project" project={project} steps={firstProjectGuide} secondSteps={secondProjectGuide} context="run-program"/>
        <h1 data-guide-target="lesson-task">Make a route</h1>
        <h2 data-guide-target="lesson-instructions">Learn & Explore</h2>
        <button data-guide-target="existing-tutor" onClick={() => guideEvent("tutor-open")}>Existing tutor</button>
        <section data-guide-target="block-editor"><button data-guide-target="block-tools" data-guide-action="block-tools">Block tools</button>
        <button data-guide-target="fit-blocks" data-guide-action="fit-blocks">Fit blocks</button>
        <button onClick={() => guideEvent("edit")}>Add action</button></section>
        <button data-guide-target="run-program" onClick={() => guideEvent("run-needs-work")}>Run with a mistake</button>
        <button onClick={() => guideEvent("run")}>Run successfully</button>
        <section data-guide-target="program-result">Program result</section>
        <button data-guide-target="check-program" onClick={() => guideEvent("check")}>Check</button>
        <button data-guide-target="save-project" onClick={() => guideEvent("save")}>Save</button>
        <section data-guide-target="saved-versions">Saved versions</section>
      </main>);
    ` }, bundle: true, write: false, jsx: "automatic", platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"development"' },
  });
  await page.route("http://guide.test/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (/^\/coding\/guide\/[a-z-]+\.webp$/.test(path)) return route.fulfill({ contentType: "image/webp", body: readFileSync("public" + path) });
    return route.request().resourceType() === "document" ? route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div><script>window.process={env:{NODE_ENV:"development"}}</script><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script>` }) : route.abort();
  });
  const fragmentWarnings: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("React.Fragment")) fragmentWarnings.push(message.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class extends EventTarget {
        constructor(public text: string) { super(); }
      },
    });
    const calls: string[] = [];
    Object.defineProperty(window, "guideSpeechCalls", { value: calls });
    Object.defineProperty(window, "speechSynthesis", { value: {
      getVoices: () => [
        { voiceURI: "us", name: "US Fixture", lang: "en-US", localService: true },
        { voiceURI: "gb", name: "Hazel Fixture", lang: "en-GB", localService: true },
        { voiceURI: "astro", name: "George Fixture", lang: "en-GB", localService: true },
        { voiceURI: "remote", name: "Remote Fixture", lang: "en-GB", localService: false },
      ],
      speak: (utterance: SpeechSynthesisUtterance) => {
        calls.push(utterance.voice?.name ?? "missing voice");
        calls.push(utterance.lang + "/" + utterance.rate + ": " + utterance.text);
        utterance.dispatchEvent(new Event("start"));
        utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
      },
      cancel: () => calls.push("cancelled"),
    } });
  });
  await page.goto("http://guide.test/");
  const bubble = page.locator(".starliz-guide-bubble");
  const gotIt = page.getByRole("button", { name: "Got it", exact: true });
  const settings = page.getByRole("button", { name: "Helper settings", exact: true });
  await settings.click();
  await expect(page.getByRole("button", { name: "Helper: ON" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(bubble).toHaveAttribute("aria-label", "StarLiz Guide");
  await expect(page.locator('[data-guide-target="lesson-task"]')).toHaveAttribute("data-guide-highlight", "");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(bubble).toContainText("Read the task");
  await gotIt.click();
  await expect(bubble).toContainText("Find the instructions");
  const widget = page.locator("body > .starliz-guide-widget");
  await expect(widget).toHaveCSS("position", "fixed");
  await expect(page.locator(".starliz-guide-art")).toBeVisible();
  const directory = "artifacts/starliz-guide-collection";
  mkdirSync(directory, { recursive: true });
  await expect(settings).toBeVisible();
  await expect(page.getByLabel("Speak instructions")).not.toBeVisible();
  await settings.click();
  await expect(page.getByLabel("Speak instructions")).not.toBeChecked();
  await expect(page.getByRole("option", { name: "Remote Fixture (en-GB)" })).toHaveCount(0);
  await page.getByLabel("Speed", { exact: true }).selectOption("fast");
  await page.getByRole("button", { name: "Preview voice" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { guideSpeechCalls: string[] }).guideSpeechCalls.at(-1))).toContain("en-GB/1.2: Hello");
  await expect(page.getByRole("dialog").getByText(/Playing voice: Hazel Fixture/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { guideSpeechCalls: string[] }).guideSpeechCalls.at(-2))).toBe("Hazel Fixture");
  await page.getByLabel("Accent", { exact: true }).selectOption("en-US");
  await expect(page.getByRole("option", { name: "Hazel Fixture (en-GB)" })).toHaveCount(0);
  await page.getByLabel("Voice", { exact: true }).selectOption("us");
  await page.getByRole("button", { name: "Replay instruction" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { guideSpeechCalls: string[] }).guideSpeechCalls.at(-1))).toContain("en-US/1.2:");
  await page.getByRole("button", { name: "Stop speaking" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { guideSpeechCalls: string[] }).guideSpeechCalls.at(-1))).toBe("cancelled");
  await page.getByLabel("Speak instructions").check();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(widget).toHaveAttribute("data-speaking", "true");
  await page.screenshot({ path: `${directory}/speaking.png` });
  await page.getByRole("button", { name: "Minimise helper" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { guideSpeechCalls: string[] }).guideSpeechCalls.at(-1))).toBe("cancelled");
  await page.getByRole("button", { name: "Expand helper" }).click();
  await settings.click();
  await page.getByLabel("Speak instructions").uncheck();
  await expect(widget).not.toHaveAttribute("data-speaking", "true");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect.poll(async () => {
      const rect = await widget.boundingBox();
      const viewport = page.viewportSize()!;
      return !!rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height;
    }).toBe(true);
    const target = page.locator('[data-guide-target="lesson-instructions"]');
    await expect(target).toHaveAttribute("data-guide-highlight", "");
    expect(await target.evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.evaluate(() => { document.body.style.minHeight = "250vh"; window.scrollTo(0, 1000); });
    await expect(widget).toHaveAttribute("data-guide-away", "");
    await expect(target).not.toBeInViewport();
    if (width === 1440) {
      await widget.evaluate(node => {
        const animate = node.animate.bind(node);
        node.animate = (...args) => {
          const animation = animate(...args);
          animation.pause();
          animation.currentTime = 120;
          return animation;
        };
      });
    }
    await bubble.getByRole("button", { name: "Show me" }).click();
    if (width === 1440) {
      await expect.poll(() => widget.evaluate(node => node.getAnimations().some(animation => animation.playState === "paused"))).toBe(true);
      await page.screenshot({ path: `${directory}/moving.png` });
      await widget.evaluate(node => {
        Reflect.deleteProperty(node, "animate");
        node.getAnimations().forEach(animation => animation.finish());
      });
    }
    await expect(target).toBeInViewport();
    await expect(widget).not.toHaveAttribute("data-guide-away", "");
    await expect(widget).toHaveAttribute("data-pointing", "");
    await expect(bubble).toBeVisible();
    await settings.click();
    const dialog = page.getByRole("dialog", { name: "Helper settings" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    expect(await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
        && node.parentElement === document.body && node.scrollWidth <= node.clientWidth;
    })).toBe(true);
    await expect(bubble).toBeVisible();
    expect(await dialog.evaluate(node => {
      const target = document.querySelector('[data-guide-target="lesson-instructions"]')!;
      const a = node.getBoundingClientRect(), b = target.getBoundingClientRect();
      return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
    })).toBe(true);
    if (width === 1440) {
      await page.getByLabel("Alternate appearance").check();
      await expect(widget.locator("image")).toHaveAttribute("href", /-alternate\.webp$/);
      await page.getByLabel("Alternate appearance").uncheck();
      await page.screenshot({ path: `${directory}/desktop-settings.png` });
      await dialog.locator(".starliz-guide-picker").screenshot({ path: `${directory}/collection-with-finn.png` });
      for (const name of ["Nova", "Byte", "Pip", "Astro", "Spark", "Pixel", "Lumi", "Gear", "Orbit", "Finn", "StarLiz Guide"]) {
        await dialog.getByRole("radio", { name, exact: true }).check();
        await expect(widget).toHaveAttribute("data-character", name);
        await expect(target).toHaveAttribute("data-guide-highlight", "");
        const animation = await widget.locator(".starliz-guide-figure").evaluate(node => getComputedStyle(node).animationName);
        expect(animation).not.toBe("none");
        if (name === "Orbit" || name === "Byte" || name === "Finn") {
          await dialog.getByRole("button", { name: "Close" }).click();
          await page.screenshot({ path: `${directory}/pointing-${name.toLowerCase()}.png` });
          await settings.click();
        }
      }
      await dialog.getByRole("radio", { name: "StarLiz Guide" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(dialog.getByRole("radio", { name: "Nova" })).toBeChecked();
      await page.keyboard.press("ArrowLeft");
      await expect(dialog.getByRole("radio", { name: "StarLiz Guide" })).toBeChecked();
    }
    if (width === 390) {
      await page.screenshot({ path: `${directory}/mobile-settings.png` });
      const cdp = await page.context().newCDPSession(page);
      const tile = dialog.getByRole("radio", { name: "Spark" });
      await tile.scrollIntoViewIfNeeded();
      const bounds = (await tile.boundingBox())!;
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(tile).toBeChecked();
      await expect(widget).toHaveAttribute("data-character", "Spark");
      await dialog.getByRole("radio", { name: "StarLiz Guide" }).check();
      await cdp.detach();
    }
    if (width === 320) {
      await page.setViewportSize({ width, height: 430 });
      const scroll = dialog.locator(".starliz-guide-settings-scroll");
      await expect.poll(() => scroll.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
      await dialog.getByRole("radio", { name: "Orbit" }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Close" })).toBeInViewport();
      await expect(dialog.getByRole("radio", { name: "Orbit" })).toBeInViewport();
      await page.screenshot({ path: `${directory}/mobile-settings-scroll.png` });
      await page.setViewportSize({ width: 390, height: 800 });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
  }
  await gotIt.click();
  await gotIt.click();
  await page.getByRole("button", { name: "Block tools" }).click();
  await page.getByRole("button", { name: "Fit blocks" }).click();
  await gotIt.click();
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByRole("button", { name: "Run with a mistake" }).click();
  await expect(bubble).toContainText("Try one change");
  await page.getByRole("button", { name: "Add action" }).click();
  await page.getByRole("button", { name: "Run successfully" }).click();
  await gotIt.click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await gotIt.click();
  await expect(bubble).toHaveCount(0);
  const icon = page.getByRole("button", { name: "Expand helper" });
  await expect(icon).toBeVisible();
  await expect.poll(() => widget.evaluate(node => node.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
  const before = (await icon.boundingBox())!;
  await page.mouse.move(before.x + 25, before.y + 25);
  await page.mouse.down();
  await page.mouse.move(55, 560, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await icon.boundingBox())?.x).toBeLessThan(before.x - 40);
  await page.screenshot({ path: `${directory}/floating-minimised.png` });
  await page.reload();
  await expect.poll(async () => (await icon.boundingBox())?.x).toBeLessThan(before.x - 40);
  await expect(bubble).toHaveCount(0);
  await page.goto("http://guide.test/?project=two");
  await expect(bubble).toContainText("Make a plan from the task.");
  await settings.click();
  await page.getByRole("radio", { name: "Finn" }).check();
  await expect(bubble).toHaveAttribute("aria-label", "Finn");
  await page.getByLabel("Assistance").selectOption("gentle");
  await expect(page.locator("[data-guide-highlight]")).toHaveCount(0);
  await page.getByLabel("Assistance").selectOption("minimal");
  await expect(bubble).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Find instructions" }).click();
  await expect(bubble).toContainText("Learn & Explore has the task");
  await expect(widget.locator(".starliz-finn-open")).toHaveCSS("opacity", "1");
  expect(await widget.locator(".starliz-guide-figure").evaluate(node => getComputedStyle(node).animationName)).toBe("none");
  await page.getByRole("button", { name: "Find AI tutor" }).click({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Existing tutor" })).toBeFocused();
  await page.getByRole("button", { name: "Helper: ON" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Helper: OFF" })).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await page.getByRole("button", { name: "Helper: OFF" }).click();
  await page.getByRole("button", { name: "Expand helper" }).click();
  await settings.click();
  await expect(page.getByRole("radio", { name: "Finn" })).toBeChecked();
  await expect(page.getByLabel("Assistance")).toHaveValue("minimal");
  expect(fragmentWarnings).toEqual([]);
});
