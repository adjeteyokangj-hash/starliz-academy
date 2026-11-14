import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";

test("shared cards and controls contain long content at supported widths", async ({ page }) => {
  test.setTimeout(180000);
  const css = await codingComponentStyles();
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import { createRoot } from "react-dom/client";
      import Card from "./src/components/ui/Card";
      import Button from "./src/components/ui/Button";
      import ParentCard from "./src/components/parent/ParentCollapsibleCard";
      import AdminCard from "./src/components/admin/AdminSectionCard";
      import SchoolCard from "./src/components/school-admin/CollapsibleCard";
      const long = "LongProjectName".repeat(22);
      const controls = <div className="flex flex-wrap gap-2"><Button>{long}</Button><select aria-label="Choose work"><option>{long}</option></select></div>;
      createRoot(document.getElementById("root")).render(
        <main className="starliz-page mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-2 sm:px-6">
          <Card title="Student card">{controls}</Card>
          <ParentCard title="Parent card" description={long} headerExtra={<Button>Open parent report</Button>}>{controls}</ParentCard>
          <AdminCard title="Admin card" subtitle={long} action={<Button>Open admin report</Button>}>{controls}</AdminCard>
          <SchoolCard title="School card">{controls}</SchoolCard>
        </main>);
    ` },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.route("http://layout.test/", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto("http://layout.test/");
  await expect(page.getByText("Student card", { exact: true })).toBeVisible();
  const directory = "artifacts/starliz-responsive";
  mkdirSync(directory, { recursive: true });
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
    const cards = page.locator("main > .starliz-panel");
    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      expect(await card.evaluate(element => {
        const rect = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
        return rect.left >= parent.left && rect.right <= parent.right && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
    }
    if (width === 1440 || width === 390) await page.screenshot({ path: `${directory}/shared-cards-${width}.png`, fullPage: true });
  }
});
