import { test, expect } from "@playwright/test";
import { build } from "esbuild";

test("VD shows a separate practice diagram without changing the learner program", async ({ page }) => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import { createRoot } from "react-dom/client";
      import CodingGuideTools from "./src/components/coding/CodingGuideTools";
      import { codingOutcome } from "./src/components/coding/coding-guide-outcomes";
      createRoot(document.getElementById("root")).render(<>
        <textarea aria-label="Learner program" defaultValue="My saved program" />
        <button onClick={() => codingOutcome({kind:"run",passed:false,error:"SyntaxError"})}>Fail run</button>
        <button onClick={() => codingOutcome({kind:"run",passed:true})}>Pass run</button>
        <button onClick={() => codingOutcome({kind:"save",location:"versions"})}>Save version</button>
        <CodingGuideTools blocks />
      </>);
    ` },
    bundle: true, write: false, jsx: "automatic", format: "iife",
  });
  await page.route("http://guide-upgrade.test/", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><div id="root"></div><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script>`,
  }));
  await page.goto("http://guide-upgrade.test/");
  const program = page.getByRole("textbox", { name: "Learner program" });
  await page.getByRole("button", { name: "Show how blocks connect" }).click();
  await expect(page.locator("figure svg")).toBeVisible();
  await page.getByRole("button", { name: "Try it myself" }).click();
  await expect(page.locator("figure")).toHaveCount(0);
  await expect(program).toHaveValue("My saved program");
  await page.getByRole("button", { name: "Fail run" }).click();
  await expect(page.getByRole("status")).toContainText("punctuation");
  await page.getByRole("button", { name: "Pass run" }).click();
  await expect(page.getByRole("status")).toContainText("improved");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByRole("status")).toContainText("Saved versions");
});
