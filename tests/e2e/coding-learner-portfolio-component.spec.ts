import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { firstRouteActivities } from "../../src/lib/coding/learning/content/routes";
import { visualReview } from "../../src/lib/coding/learning/visual-review";
import { savedReviewAnswers } from "../../src/lib/coding/learning/saved-review-answers";
import { runCodingProgram } from "../../src/lib/coding/runner";
import { codingComponentStyles } from "./coding-styles";
import type { CodingProgram } from "../../src/lib/coding/types";
import type { Execution } from "../../src/lib/coding/learning/types";

test("learner portfolio shows readable saved evidence and keeps replay and bridges accessible", async ({ page }) => {
  test.setTimeout(180000);
  const directory = "artifacts/coding-portfolio-cleanup";
  mkdirSync(directory, { recursive: true });
  const activity = firstRouteActivities[0]!;
  const execution: Execution = { ok: true, output: { visits: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, trace: [{ instruction: "Move right" }], stdout: "", stderr: "", runtime: "fixture", steps: 2 };
  const review = visualReview(activity, activity.reference, execution)!;
  const explanation = JSON.stringify({ type: "visual-review-v1", binding: review.public.binding, answers: { ...review.correct, "first-move": review.public.questions[1]!.choices.find(choice => choice.text === "Left ←")!.id } });
  const reviewAnswers = savedReviewAnswers(activity.id, activity.reference, execution, explanation);
  expect(reviewAnswers.map(answer => answer.answer)).toContain("Left ←");
  expect(savedReviewAnswers(activity.id, activity.reference, execution, explanation.replace(review.public.binding, "stale"))).toEqual([]);
  const program: CodingProgram = { blocks: [{ id: "private-block-id", kind: "move", direction: "right" }] };
  const createdAt = "2026-11-13T09:00:00Z";
  const entry = { versionId: "private-version-id", createdAt, activity };
  const styles = await codingComponentStyles();
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import {createRoot} from "react-dom/client"; import Page from "./src/app/student/coding/portfolio/page"; Page().then(view => createRoot(document.getElementById("root")).render(view));` },
    bundle: true, write: false, format: "iife", jsx: "automatic", platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "portfolio-page-fixtures", setup(builder) {
      builder.onResolve({ filter: /@\/lib\/(auth|coding\/student-context)$/ }, args => ({ path: args.path, namespace: "portfolio-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "portfolio-fixture" }, () => ({ contents: 'export async function readSessionFromCookie(){return {}}; export async function requireCodingLearner(){return {child:{yearGroup:"Year 5"}}}' }));
    } }],
  });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/student/coding/portfolio") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll("</script", "<\\/script")}</script></html>` });
    if (url.pathname === "/api/student/coding/portfolio" && url.searchParams.has("versionId")) return route.fulfill({ json: { project: { ...entry, explanation, execution, artifact: activity.reference, input: { width: 4, height: 4 }, files: { "notes.txt": "My saved route notes" }, checks: [{ description: "The route reaches the correct row", passed: true }] }, reviewAnswers } });
    if (url.pathname === "/api/student/coding/portfolio") return route.fulfill({ json: { learnerId: "fixture", projects: [entry], legacyProjects: [{ lessonId: "understanding-loops", title: "Understanding Loops", projectTitle: "Build a path to the star using loops", preview: { program, run: runCodingProgram(program, { x: 1, y: 0 }), updatedAt: createdAt, evidenceStatus: "assessed-version" } }] } });
    if (url.pathname === "/api/student/coding/readiness") return route.fulfill({ json: { plans: [{ id: "blocks-to-text", entryYear: 5, title: "Visual-to-text bridge", ready: false, benchmarks: [{ id: "practice", title: "Plan a route", objective: "Choose instructions to reach a stop.", status: "not_started" }] }] } });
    if (url.pathname === "/student/coding") return route.fulfill({ contentType: "text/html", body: "<h1>Coding home</h1>" });
    return route.abort();
  });
  await page.goto("/student/coding/portfolio");
  await expect(page.getByRole("heading", { name: "Bring your previous learning" })).toBeVisible();
  await expect(page.getByRole("heading", { name: activity.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your explanation" })).toBeHidden();
  const visibleText = () => page.locator("body").innerText();
  for (const [width, height] of [[1440, 1000], [1280, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${directory}/portfolio-${width}.png`, fullPage: true });
    await page.getByText("View evidence", { exact: true }).click();
    await expect(page.locator("dl > div").filter({ hasText: "Which way did your character move first?" }).getByText("Left ←", { exact: true })).toBeVisible();
    await expect(page.getByText("Your character moved 2 steps: right, up.")).toBeVisible();
    await page.screenshot({ path: `${directory}/evidence-${width}.png`, fullPage: true });
    await page.getByText("Inspect execution", { exact: true }).click();
    await page.getByRole("button", { name: "Replay actual movements" }).click();
    await expect(page.getByRole("button", { name: "Pause replay", exact: true })).toBeVisible();
    await page.getByText("View recorded steps and results", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Execution result" }).getByText("Move right", { exact: true })).toBeVisible();
    await page.getByText("View saved project files", { exact: true }).click();
    await expect(page.getByText("My saved route notes")).toBeVisible();
    await page.getByText("View assessment criteria", { exact: true }).click();
    await expect(page.getByText(/The route reaches the correct row/)).toBeVisible();
    await page.getByText("View saved project", { exact: true }).click();
    await page.getByRole("button", { name: "Replay project" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Step 1 of 1" })).toBeVisible();
    await page.getByText("Inspect saved blocks", { exact: true }).click();
    await page.getByText("Browse practical bridges", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Open Plan a route" })).toHaveAttribute("href", "/student/coding/readiness/blocks-to-text/practice");
    expect(await visibleText()).not.toMatch(/visual-review-v1|private-block-id|private-version-id|\{\s*"/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByText("View evidence", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your explanation" })).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: activity.title })).toBeVisible();
  }
  await page.getByRole("link", { name: /Return to Coding/ }).click();
  await expect(page).toHaveURL(/\/student\/coding$/);
});
