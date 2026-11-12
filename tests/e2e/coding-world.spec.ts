import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { codingComponentStyles } from "./coding-styles";
let applicationStyles: Promise<string> | undefined;
const globalStyles = () => applicationStyles ??= codingComponentStyles();
import { readFileSync, mkdirSync } from "node:fs";
import { UNDERSTANDING_LOOPS, stageBrief } from "../../src/lib/coding/catalog";
import { assessCodingStage, freshEvidence, deriveSkillStatus } from "../../src/lib/coding/assessment";
import { activityDefinition } from "../../src/lib/coding/learning/catalogue";
import { initialActivityState, transitionActivity } from "../../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../../src/lib/coding/learning/public-view";
import { activityActionSchema } from "../../src/lib/coding/learning/types";
import { executePractical } from "../../src/lib/coding/learning/runtime";
import { initialWorld, transitionWorld, worldActionSchema } from "../../src/lib/coding/world/model";

test.use(process.platform === "win32" ? { channel: "msedge" } : {});
// Component acceptance only: synthetic API responses, actual component/Blockly/runtime.
// No production, authentication or database writes are involved.
for (const width of [1440, 1280, 768, 390]) test(`world exploration, authoring, playback, versions and preferences at ${width}px`, async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width, height: 1000 });
  const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import World from './src/components/coding/world/CodingWorld';createRoot(document.getElementById('root')).render(<World/>);` }, bundle: true, write: false, outdir: "out", platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const js = bundled.outputFiles.find(f => f.path.endsWith(".js"))!.text;
  const css = await globalStyles() + bundled.outputFiles.find(f => f.path.endsWith(".css"))!.text;
  let state = initialWorld(); const versions: unknown[] = [];
  const errors: string[] = []; page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__world") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}button,select{font:inherit}${css}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>` });
    if (url.pathname.startsWith("/coding/blockly/")) return route.fulfill({ body: readFileSync(`public${url.pathname}`), contentType: "image/svg+xml" });
    if (url.pathname === "/api/student/coding/world/guided") return route.fulfill({ json: { learnerId: "synthetic-world", entries: [{ id: "understanding-loops", kind: "lesson", title: "Understanding Loops", objective: "Use a loop to repeat movement.", year: 3, location: "robot", status: "learning", unlocked: true, assignmentStatus: "assigned", href: "/student/coding/world/lessons/understanding-loops", prerequisites: [], stage: "build" }], recommendation: null } });
    if (url.pathname === "/api/student/coding/world") {
      if (route.request().method() === "GET") return route.fulfill({ json: { learnerId: "synthetic-world", state, versions } });
      const body = route.request().postDataJSON(); expect(body.learnerId).toBe("synthetic-world"); expect(body.revision).toBe(state.revision);
      const action = worldActionSchema.parse(body.action), result = transitionWorld(state, action); state = result.state;
      if (action.type === "snapshot") versions.push({ id: "v1", label: action.missionId, missionId: action.missionId, commands: action.commands, createdAt: new Date().toISOString() });
      return route.fulfill({ json: { ...result, versions } });
    }
    return route.abort();
  });
  await page.goto("http://world.test/__world");
  await expect(page.getByRole("heading", { name: "A little code. A world of possibilities." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Travel to Pizza Restaurant" })).toBeVisible();
  for (const name of ["Pizza Restaurant", "Robot Factory", "Happy Farm", "Traffic City", "Space Centre", "Pet Care Centre", "Happy Farm"]) {
    await page.getByRole("button", { name: `Travel to ${name}` }).click();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /A thoughtful invention/ })).toBeDisabled();
  const worldMap = page.getByRole("region", { name: "Connected world" });
  const avatar = page.locator("[aria-label='Your avatar']");
  const beforeMove = await avatar.boundingBox();
  await worldMap.getByRole("button", { name: "Move avatar right" }).click();
  await expect.poll(async () => (await avatar.boundingBox())?.x ?? 0).toBeGreaterThan((beforeMove?.x ?? 0) + 1);
  const map = page.getByRole("group", { name: /World map/ });
  await map.focus();
  const beforeKey = await avatar.boundingBox();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await avatar.boundingBox())?.x ?? 0).toBeGreaterThan((beforeKey?.x ?? 0) + 1);
  const place = page.getByRole("button", { name: "Travel to Pizza Restaurant" });
  const beforeZoom = await place.boundingBox();
  await worldMap.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Math.round((await place.boundingBox())?.x ?? 0)).not.toBe(Math.round(beforeZoom?.x ?? 0));
  await worldMap.getByRole("button", { name: "Rotate" }).click();
  await worldMap.getByRole("button", { name: "Reset view" }).click();
  const joystick = page.getByRole("group", { name: "On-screen joystick" });
  const pad = await joystick.boundingBox();
  const beforeStick = await avatar.boundingBox();
  if (pad && beforeStick) {
    await page.mouse.move(pad.x + pad.width - 4, pad.y + pad.height / 2);
    await page.mouse.down();
    await expect.poll(async () => (await avatar.boundingBox())?.x ?? 0).toBeGreaterThan(beforeStick.x + 1);
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText("Guided hint: Read the mission board and name what must happen first.")).toBeVisible();
  await page.getByRole("button", { name: "Run invention" }).click();
  await expect(page.getByText("Your routine stopped early. Next, the simulation needs plant.")).toBeVisible();
  await page.getByText("Simple keyboard and touch controls", { exact: true }).click();
  for (const action of ["plant", "water", "grow", "harvest"]) {
    await page.getByLabel("Action name").selectOption(action);
    await page.getByRole("button", { name: "Add action", exact: true }).click();
  }
  await page.getByRole("button", { name: "Run invention" }).click();
  await expect(page.getByText("Your invention works! Try stepping through to explain each action.")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect.poll(() => state.completed.includes("farm-sequence")).toBe(true);
  await page.getByRole("button", { name: "Step →", exact: true }).click();
  await expect(page.getByText("Action 1: plant", { exact: true })).toBeVisible();
  await page.getByLabel("Project name", { exact: true }).fill("My farm invention");
  await page.getByRole("button", { name: "Create named project", exact: true }).click();
  await expect.poll(() => state.projects[0]?.title).toBe("My farm invention");
  await page.getByRole("button", { name: "Save project version" }).click();
  await expect.poll(() => versions.length).toBe(1);
  await page.getByRole("button", { name: "Write Python", exact: true }).click();
  await expect(page.getByText("Write", { exact: false }).filter({ hasText: "solve(world)" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Visual blocks", exact: true }).click();
  await page.getByRole("button", { name: "Clear program", exact: true }).click();
  await expect.poll(() => state.programs["farm-sequence"]?.length).toBe(0);
  await page.getByRole("button", { name: "My clubhouse" }).click();
  await page.getByLabel("My companion").selectOption("Pixel");
  await expect.poll(() => state.companion).toBe("Pixel");
  await page.getByRole("button", { name: "Room square 1,1: empty", exact: true }).click();
  await expect.poll(() => state.room.decorations.length).toBe(1);
  await page.getByRole("button", { name: "Rotate selected item", exact: true }).click();
  await expect.poll(() => state.room.decorations[0]?.rotation).toBe("90");
  await page.getByLabel("Skin tone", { exact: true }).selectOption("deep");
  await expect.poll(() => state.appearance.skin).toBe("deep");
  mkdirSync("artifacts/coding-world", { recursive: true });
  await page.getByRole("region", { name: "Clubhouse decoration designer" }).screenshot({ path: `artifacts/coding-world/clubhouse-${width}.png` });
  await page.getByLabel("Reduced motion").check();
  await expect.poll(() => state.reducedMotion).toBe(true);
  await page.getByLabel("High contrast").check();
  await expect.poll(() => state.highContrast).toBe(true);
  await page.getByRole("button", { name: "Inventions & skills" }).click();
  await expect(page.getByText("Practice achievements stay separate from formal lesson mastery.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync("artifacts/coding-world", { recursive: true });
  await page.screenshot({ path: `artifacts/coding-world/portfolio-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Restore as draft", exact: true }).click();
  await expect.poll(() => state.programs["farm-sequence"]?.length).toBe(4);
  await page.getByRole("button", { name: "Explore world" }).click();
  await expect.poll(async () => page.locator("[aria-label='Your avatar']").evaluate(node => getComputedStyle(node).transitionProperty)).toBe("none");
  const living = page.getByRole("region", { name: "Happy Farm living simulation" });
  await living.getByLabel("Situation").selectOption("true");
  for (const action of ["bed1","plant","water","bed2","plant","water","wait","wait","bed1","harvest","bed2","harvest"]) await living.getByRole("button", { name: action, exact: true }).click();
  await expect.poll(() => state.simulations.farm?.values.harvested).toBe(2);
  expect(state.completed).toEqual(["farm-sequence"]);
  await living.screenshot({ path: `artifacts/coding-world/farm-sandbox-${width}.png` });
  await expect(page.getByRole("button", { name: "Run invention" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("region", { name: "Happy Farm living simulation" }).getByText("Weather:", { exact: false })).toContainText("Harvest 2/2");
  await page.screenshot({ path: `artifacts/coding-world/world-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});






// The actual admin component preserves disabled publication and independent review.
test("content studio creates immutable drafts and prevents publishing while disabled", async ({ page }) => {
  const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import Studio from './src/components/coding/world/WorldContentStudio';createRoot(document.getElementById('root')).render(<Studio/>);` }, bundle: true, write: false, outdir: "out", platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const js = bundled.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  const studioCss = await globalStyles();
  const versions = [{ id: "reviewed", missionId: "pizza-sequence", version: 1, status: "approved", title: "A helpful beginning", objective: "Prepare ingredients in the correct order.", dialogue: "What happens before the pizza is baked?", createdBy: "other-author" }];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/__studio") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${studioCss}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:'production'}};</script><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>` });
    if (url.pathname.startsWith("/coding/blockly/")) return route.fulfill({ body: readFileSync(`public${url.pathname}`), contentType: "image/svg+xml" });
    if (url.pathname === "/api/admin/coding/world/catalogue") return route.fulfill({ json: { lessons: [{ id: "understanding-loops", kind: "lesson", title: "Understanding Loops", published: true }] } });
    if (url.pathname === "/api/admin/coding/world") {
      if (route.request().method() === "GET") return route.fulfill({ json: { versions, publicationEnabled: false, viewerId: "reviewer" } });
      const body = route.request().postDataJSON(); expect(body.type).toBe("draft"); expect(Object.keys(body.content).sort()).toEqual(["dialogue", "metadata", "missionId", "objective", "title"]); expect(body.content.metadata.curriculumLinks[0].id).toBe("understanding-loops"); expect(body.content.metadata.extensions).toHaveLength(1);
      const version = { ...body.content, version: 2, id: "new-draft", createdBy: "reviewer", status: "draft" }; versions.push(version);
      return route.fulfill({ json: { version } });
    }
    return route.abort();
  });
  await page.goto("http://world.test/__studio");
  await expect(page.getByRole("button", { name: "Publish approved practice text" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("My new pizza mission");
  await page.getByLabel("Chapter title", { exact: true }).fill("Restaurant inventions");
  await page.getByLabel("Existing curriculum lesson", { exact: true }).selectOption("lesson:understanding-loops");
  await page.getByRole("button", { name: "Add curriculum mapping" }).click();
  await page.getByRole("button", { name: "Add a template mission" }).click();
  await page.getByRole("button", { name: "Save a new draft version" }).click();
  await expect(page.getByText("Version 2 is draft.")).toBeVisible();
  expect(versions[0]!.title).toBe("A helpful beginning");
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
});

test("guided legacy mission retains canonical run API, target and mastery rules", async ({ page }) => {


  const brief = stageBrief(UNDERSTANDING_LOOPS,"build");
  const program={blocks:[{id:"repeat",kind:"repeat" as const,times:brief.goal?.x ?? 0,body:[{id:"move",kind:"move" as const,direction:"right" as const}]},...(brief.goal?.y ? [{id:"up-repeat",kind:"repeat" as const,times:brief.goal.y,body:[{id:"up",kind:"move" as const,direction:"up" as const}]}] : [])]};
  let workspace={lesson:UNDERSTANDING_LOOPS,stage:"build",completedStages:["discover","predict"],program,evidence:freshEvidence(),skillStatus:"learning",feedback:null as string|null,run:null as ReturnType<typeof assessCodingStage>["run"],teacherFeedback:null,hintCount:0,attemptCount:0,checksPassed:0};
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`import React from 'react';import{createRoot}from'react-dom/client';import Lesson from './src/components/coding/CodingLessonWorkspace';createRoot(document.getElementById('root')).render(<Lesson lessonId="understanding-loops" bookingId="owned-booking" daytimePeriodId="owned-period" worldLocation="robot"/>);`},bundle:true,write:false,outdir:"out",platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
  const js=bundle.outputFiles.find(file=>file.path.endsWith(".js"))!.text;
  const css=await globalStyles()+(bundle.outputFiles.find(file=>file.path.endsWith(".css"))?.text??"");
  let runs=0,practiceCalls=0;const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/__guided")return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>${css}body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:'production'}};</script><script>${js.replaceAll("</script","<\\/script")}</script></body></html>`});
    if(url.pathname.startsWith("/coding/blockly/"))return route.fulfill({body:readFileSync(`public${url.pathname}`),contentType:"image/svg+xml"});
    if(url.pathname.startsWith("/api/student/coding/world")){practiceCalls++;return route.abort();}
    if(url.pathname==="/api/student/coding/lessons/understanding-loops"){
      if(route.request().method()==="GET"){expect(url.searchParams.get("bookingId")).toBe("owned-booking");return route.fulfill({headers:{"X-Coding-Learner":"owned-child"},json:{workspace,humanAssistanceEnabled:false}});}
      expect(route.request().headers()["x-coding-learner"]).toBe("owned-child");const action=route.request().postDataJSON();expect(action.action).toBe("run");expect(action.bookingId).toBe("owned-booking");expect(action.daytimePeriodId).toBe("owned-period");
      const assessed=assessCodingStage({lesson:UNDERSTANDING_LOOPS,stage:"build",program:action.program,evidence:workspace.evidence,revealingHints:0});
      workspace={...workspace,evidence:assessed.evidence,skillStatus:deriveSkillStatus(true,assessed.evidence),run:assessed.run,feedback:assessed.feedback};runs++;
      return route.fulfill({json:{ok:true,workspace,run:assessed.run,runSource:"learner"}});
    }
    return route.abort();
  });
  await page.goto("http://world.test/__guided");
  await expect(page.getByRole("region",{name:"Guided world mission"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Understanding Loops",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Run my blocks",exact:true}).click();
  await expect.poll(()=>runs).toBe(1);expect(workspace.run?.reachedGoal).toBe(true);expect(workspace.skillStatus).not.toBe("mastered");
  expect(workspace.run?.final).toEqual(brief.goal);expect(practiceCalls).toBe(0);expect(errors).toEqual([]);
  await expect(page.getByRole("img",{name:"Robot Factory guided simulation showing recorded lesson movements"}).first()).toBeVisible();
  mkdirSync("artifacts/coding-world",{recursive:true});await page.screenshot({path:"artifacts/coding-world/guided-legacy.png",fullPage:true});
});

test("guided curriculum activity uses its real state machine and canonical activity API",async({page})=>{





  const activity=activityDefinition("what-is-an-instruction")!;let state=initialActivityState(activity);state.stage="build";state.completed=["discover","predict"];state.artifacts.build=activity.reference;state.tutorMessages=[{stage:"build",purpose:"instruction",source:"fallback",revealing:false,message:activity.instruction.explanation}];let revision=0,nativeRuns=0,practiceCalls=0;
  const view=()=>({...publicActivityView(activity,state),revision:String(revision),versions:[]});
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`import React from 'react';import{createRoot}from'react-dom/client';import Loader from './src/components/coding/ActivityLoader';createRoot(document.getElementById('root')).render(<Loader activityId="what-is-an-instruction" bookingId="owned-booking" worldLocation="traffic"/>);`},bundle:true,write:false,outdir:"out",platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
  const js=bundle.outputFiles.find(file=>file.path.endsWith(".js"))!.text,css=await globalStyles()+(bundle.outputFiles.find(file=>file.path.endsWith(".css"))?.text??"");
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/__guided-activity")return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><style>${css}body{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:'production'}};</script><script>${js.replaceAll("</script","<\\/script")}</script></body></html>`});
    if(url.pathname.startsWith("/coding/blockly/"))return route.fulfill({body:readFileSync(`public${url.pathname}`),contentType:"image/svg+xml"});
    if(url.pathname.startsWith("/api/student/coding/world")){practiceCalls++;return route.abort();}
    if(url.pathname==="/api/student/coding/activities/what-is-an-instruction"){
      if(route.request().method()==="GET"){expect(url.searchParams.get("bookingId")).toBe("owned-booking");return route.fulfill({headers:{"X-Coding-Learner":"owned-child"},json:{workspace:view(),humanAssistanceEnabled:false}});}
      expect(route.request().headers()["x-coding-learner"]).toBe("owned-child");const action=activityActionSchema.parse(route.request().postDataJSON());expect(action.bookingId).toBe("owned-booking");expect(action.revision).toBe(String(revision));
      const result=await transitionActivity(activity,state,action,{run:async(engine,artifact,input)=>{expect(artifact.type).toBe("visual");nativeRuns++;return executePractical(engine,artifact,input);},teach:async()=>({message:"Inspect the instructions.",source:"fallback",revealing:false}),reflect:async()=>({passed:false,message:"Not assessed in this check.",source:"evidence",confidence:0})});state=result.state;revision++;
      expect(result.newlyMastered).toBe(false);return route.fulfill({json:{workspace:view()}});
    }
    return route.abort();
  });
  await page.goto("http://world.test/__guided-activity");await expect(page.getByRole("region",{name:"Guided world mission"})).toBeVisible();
  await page.getByRole("button",{name:"Run program",exact:true}).click();await expect.poll(()=>nativeRuns).toBeGreaterThan(0);expect(practiceCalls).toBe(0);expect(view().mastered).toBe(false);expect(errors).toEqual([]);
  await expect(page.getByRole("img",{name:"Traffic City guided simulation showing recorded lesson movements"}).first()).toBeVisible();
  mkdirSync("artifacts/coding-world",{recursive:true});await page.screenshot({path:"artifacts/coding-world/guided-activity.png",fullPage:true});
});
