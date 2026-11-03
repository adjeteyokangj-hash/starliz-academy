import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";
import { firstRouteActivities } from "../../src/lib/coding/learning/content/routes";
import { initialActivityState, currentVariant, artifactHash } from "../../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../../src/lib/coding/learning/public-view";
import { executePractical } from "../../src/lib/coding/learning/runtime";

const directory = `artifacts/coding-workbench-uat/teacher-component-${randomUUID()}`;
let bundle = "", styles = "", detail: unknown;
test.beforeAll(async () => {
  mkdirSync(directory, { recursive: true }); styles = await codingComponentStyles();
  const activity = firstRouteActivities[0]!, state = initialActivityState(activity), variant = currentVariant(activity, state);
  state.stage = "create"; state.completed = ["discover", "predict", "build", "practise", "debug"]; state.artifacts.create = variant.reference;
  state.lastExecution = await executePractical(activity.workbench, variant.reference, variant.cases[0]!.input); expect(state.lastExecution.ok).toBe(true);
  state.lastRunStage = "create"; state.lastRunArtifactHash = artifactHash(variant.reference);
  detail = { id: "fixture-workspace", childId: "fixture-child", teacherFeedback: null, updatedAt: new Date().toISOString(), workspace: publicActivityView(activity, state) };
  const rows = [{ id: "fixture-workspace", childId: "fixture-child", stage: "create", skillStatus: "learning", assignmentStatus: "assigned", attemptCount: 0, checksPassed: 0, updatedAt: new Date().toISOString(), activity: { id: activity.id, title: activity.title, kind: activity.kind, year: activity.year, pathwayId: activity.pathwayId } }];
  const activities = [{ id: activity.id, title: activity.title, year: activity.year, kind: activity.kind, objective: activity.objective }];
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import Desk from'./src/components/coding/TeacherActivityDesk';createRoot(document.getElementById('root')).render(<main style={{maxWidth:1000,margin:'auto',padding:16}}><Desk students={[{id:'fixture-child',name:'Fictional learner',yearGroup:'Year 1'},{id:'other-child',name:'Another fictional learner',yearGroup:'Year 1'}]} activities={${JSON.stringify(activities)}} rows={${JSON.stringify(rows)}} humanAssistanceEnabled={new URLSearchParams(location.search).get('enabled')==='1'} onSaved={async()=>{}}/></main>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  bundle = built.outputFiles[0]!.text;
});
async function open(page: import("@playwright/test").Page, enabled: boolean) {
  const sent: unknown[] = [];
  await page.route("**/api/teacher/coding*", async (route) => {
    if (route.request().method() === "POST") { sent.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); }
    else await route.fulfill({ json: { activityWorkspace: detail } });
  });
  await page.route("**/__coding-teacher-component*", (route) => route.fulfill({ contentType: "text/html", body: `<html><head><style>${styles.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${bundle.replaceAll("</script", "<\\/script")}</script></body></html>` }));
  await page.goto(`/__coding-teacher-component?enabled=${enabled ? 1 : 0}`);
  await page.getByRole("combobox", { name: "Learner", exact: true }).selectOption("fixture-child");
  await page.getByRole("combobox", { name: "Inspect saved activity", exact: true }).selectOption("fixture-workspace");
  await expect(page.getByRole("heading", { name: firstRouteActivities[0]!.title, exact: true })).toBeVisible();
  return sent;
}
test("the teacher component keeps feedback disabled when administrator assistance is off", async ({ page }) => {
  const sent = await open(page, false);
  await expect(page.getByRole("textbox", { name: "Teacher feedback", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save teacher feedback", exact: true })).toBeDisabled();
  expect(sent).toEqual([]);
  writeFileSync(`${directory}/disabled.json`, JSON.stringify({ componentOnly: true, serverPermissionClaim: false, disabledFeedbackUi: true, messagesSentToRealUsers: false }, null, 2), { flag: "wx" });
});
test("the teacher component inspects real engine output, sends scoped action fields and fits three viewports", async ({ page }) => {
  const sent = await open(page, true);
  await page.getByRole("combobox", { name: "Activity", exact: true }).selectOption(firstRouteActivities[0]!.id);
  await page.getByRole("button", { name: "Assign selected activity", exact: true }).click();
  await expect(page.getByText("Activity assigned. Existing progress has been preserved.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Teacher feedback", exact: true }).fill("Check your route evidence and use a fresh independent variation after help.");
  await page.getByRole("button", { name: "Save teacher feedback", exact: true }).click();
  await expect(page.getByText("Feedback saved. Independent-task assistance has been recorded.", { exact: true })).toBeVisible();
  expect(sent).toEqual([{ action: "assign", childId: "fixture-child", activityId: firstRouteActivities[0]!.id }, { action: "feedback", workspaceId: "fixture-workspace", feedback: "Check your route evidence and use a fresh independent variation after help." }]);
  for (const width of [390, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true }); }
  await page.getByRole("combobox", { name: "Learner", exact: true }).selectOption("other-child");
  await expect(page.getByRole("textbox", { name: "Teacher feedback", exact: true })).toHaveCount(0);
  writeFileSync(`${directory}/enabled.json`, JSON.stringify({ componentOnly: true, mockedApiActions: true, serverPermissionClaim: false, messagesSentToRealUsers: false, actualNativeEngineOutput: true, actionFieldsCorrect: true, otherSelectionClearsDetail: true, responsiveViewports: [390, 820, 1440] }, null, 2), { flag: "wx" });
});
