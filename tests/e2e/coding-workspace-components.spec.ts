import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { codingComponentStyles } from "./coding-styles";
import { UNDERSTANDING_LOOPS, stageBrief } from "../../src/lib/coding/catalog";
import { REFERENCE_PROGRAMS } from "../../src/lib/coding/answers";
import { runCodingProgram } from "../../src/lib/coding/runner";
import { EMPTY_EVIDENCE } from "../../src/lib/coding/types";

// Component/browser checks use a deliberately isolated API fixture. They do not
// log in, write learner records or represent authenticated end-to-end UAT.
let bundle = "";
let styles = "";
test.beforeAll(async () => {
  styles = `<style>${await codingComponentStyles()}</style>`;
  const result = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import Workspace from './src/components/coding/CodingLessonWorkspace';
      import ParentPanel from './src/components/coding/CodingProgressPanel';
      import Settings from './src/components/coding/CodingAssistanceSettings';
      const screen = new URLSearchParams(location.search).get('screen');
      createRoot(document.getElementById('root')).render(screen === 'parent' ? <ParentPanel childId="fixture-child"/> : screen === 'settings' ? <Settings/> : <Workspace lessonId="understanding-loops"/>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  });
  bundle = result.outputFiles[0].text;
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`workspace editing, saved hints and assistance policy at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("Coding component browser error:", error.message); });
    const workspace = {
      lesson: UNDERSTANDING_LOOPS, stage: "build", completedStages: ["discover", "predict"],
      program: { blocks: [] as unknown[] }, explainedProgram: null, evidence: { ...EMPTY_EVIDENCE },
      skillStatus: "learning", feedback: null, run: null, teacherFeedback: null,
      hintCount: 0, attemptCount: 0, checksPassed: 0,
    };
    await page.route("**/__coding-harness*", (route) => route.fulfill({ contentType: "text/html", body: `<html><head>${styles}</head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
    await page.route("**/api/**", async (route) => {
      if (!route.request().url().includes("/student/coding/lessons/")) return route.fulfill({ json: {} });
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        workspace.program = body.program;
        if (body.action === "hint") { workspace.hintCount++; return route.fulfill({ json: { ok: true, tutor: { message: "Which number would repeat this move four times?" }, workspace } }); }
      }
      return route.fulfill({ json: { ok: true, workspace, humanAssistanceEnabled: false } });
    });
    await page.goto("/__coding-harness");
    await expect(page.getByRole("heading", { name: "Understanding Loops", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ask AI for help" }).click();
    await expect(page.getByRole("button", { name: "Ask a person" })).toBeDisabled();
    await page.getByRole("button", { name: "Close tutor" }).click();
    await expect(page.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
    await page.getByText("Choose another way to edit", { exact: true }).click();
    await page.getByRole("button", { name: "Use accessible action controls" }).click();
    await page.getByRole("button", { name: "Add repeat", exact: true }).click();
    await expect(page.getByText("You have unsaved changes.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Ask AI for help" }).click();
    await page.getByRole("button", { name: "Ask for a hint" }).click();
    await expect(page.getByText("Which number would repeat this move four times?")).toBeVisible();
    await expect(page.getByText("Your workspace matches the saved version.")).toBeVisible();
    expect(workspace.program.blocks).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/coding-completion-${viewport.width}.png`, fullPage: true });
  });
}

test("parent can inspect and step through their child's saved project", async ({ page }) => {
  const program = REFERENCE_PROGRAMS.create;
  await page.route("**/__coding-harness*", (route) => route.fulfill({ contentType: "text/html", body: `<html><head>${styles}</head><body style="background:#0f172a;color:white"><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.route("**/api/parent/coding*", (route) => route.fulfill({ json: { summary: {
    started: true, lessonTitle: UNDERSTANDING_LOOPS.title, pathwayTitle: UNDERSTANDING_LOOPS.pathwayTitle,
    skillStatus: "mastered", evidence: { prediction: true, practical: true, debugging: true, explanation: true, independent: true },
    skills: UNDERSTANDING_LOOPS.skills, project: UNDERSTANDING_LOOPS.project, supportNeeded: false,
    attempts: 6, checksPassed: 6, teacherFeedback: null, certificate: null, placement: null,
    projectPreview: { program, run: runCodingProgram(program, stageBrief(UNDERSTANDING_LOOPS, "create").goal), updatedAt: "2026-11-02T12:00:00.000Z" },
  } } }));
  await page.goto("/__coding-harness?screen=parent");
  await expect(page.getByText("Your child’s saved project", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /column 1, row 0/);
  await page.getByText("Inspect saved blocks").click();
  await expect(page.locator("pre")).toContainText('"repeat"');
  await page.getByRole("button", { name: "Replay project" }).click();
  await expect(page.getByRole("img")).toHaveAttribute("aria-label", /column 2, row 2/);
  await page.screenshot({ path: "artifacts/coding-completion-parent.png", fullPage: true });
});

test("admin assistance control starts disabled and saves an explicit enable", async ({ page }) => {
  let enabled = false;
  await page.route("**/__coding-harness*", (route) => route.fulfill({ contentType: "text/html", body: `<html><head>${styles}</head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.route("**/api/admin/coding/settings", (route) => {
    if (route.request().method() === "PUT") enabled = route.request().postDataJSON().humanAssistanceEnabled;
    return route.fulfill({ json: { humanAssistanceEnabled: enabled } });
  });
  await page.goto("/__coding-harness?screen=settings");
  const control = page.getByRole("checkbox", { name: "Enable optional human assistance" });
  await expect(control).toBeEnabled();
  await expect(control).not.toBeChecked();
  await control.check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Coding assistance settings saved.");
  expect(enabled).toBe(true);
});

test("PP and EN wait for workspace responses and reject unsuccessful saves", async ({ page }) => {
  const learner = "guide-response-fixture";
  const guide = "coding-project:first:understanding-loops:build";
  const workspace = {
    lesson: UNDERSTANDING_LOOPS, stage: "build", completedStages: ["discover", "predict"],
    program: REFERENCE_PROGRAMS.create, explainedProgram: null, evidence: { ...EMPTY_EVIDENCE },
    skillStatus: "learning", feedback: null, run: null, teacherFeedback: null,
    hintCount: 0, attemptCount: 0, checksPassed: 0,
  };
  await page.route("http://guide-response.test/__coding-harness", route => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script>`,
  }));
  let release: (() => void) | undefined;
  let status = 200;
  let result: object = {};
  await page.route("**/api/student/coding/lessons/understanding-loops", async route => {
    if (route.request().method() === "GET") return route.fulfill({ headers: { "X-Coding-Learner": learner }, json: { workspace } });
    await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ status, json: result });
  });
  await page.addInitScript(({ learner, guide }) => {
    const key = "starliz-guide:" + learner;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      enabled: true, character: "StarLiz Guide", level: "full", completed: [], progress: { [guide]: "run" },
    }));
  }, { learner, guide });
  await page.goto("http://guide-response.test/__coding-harness");
  const step = () => page.evaluate(({ learner, guide }) => JSON.parse(localStorage.getItem("starliz-guide:" + learner)!).progress[guide], { learner, guide });
  const pending = async (button: string) => {
    release = undefined;
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
  };
  await pending("Run my blocks");
  expect(await step()).toBe("run");
  result = { ok: true, workspace, run: { ...runCodingProgram(workspace.program, stageBrief(UNDERSTANDING_LOOPS, "build").goal), reachedGoal: true } };
  release!();
  await expect.poll(step).toBe("result");
  await page.evaluate(({ learner, guide }) => {
    const key = "starliz-guide:" + learner;
    const prefs = JSON.parse(localStorage.getItem(key)!);
    prefs.progress[guide] = "save";
    localStorage.setItem(key, JSON.stringify(prefs));
  }, { learner, guide });
  await page.reload();

  for (const rejected of [409, 200]) {
    status = rejected;
    result = { ok: false, error: "Fixture save rejected" };
    await pending("Save");
    expect(await step()).toBe("save");
    await expect(page.getByText("Work saved. Reopen this lesson", { exact: false })).toHaveCount(0);
    release!();
    await expect(page.getByText("Fixture save rejected").first()).toBeVisible();
    expect(await step()).toBe("save");
    await expect(page.getByText("Work saved. Reopen this lesson", { exact: false })).toHaveCount(0);
  }
  status = 200;
  result = { ok: true, workspace };
  await pending("Save");
  expect(await step()).toBe("save");
  release!();
  await expect.poll(step).toBe("check");
  await expect(page.getByText("Work saved. Reopen this lesson", { exact: false })).toBeVisible();
});
