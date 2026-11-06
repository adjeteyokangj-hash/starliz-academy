import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { codingComponentStyles } from "./coding-styles";
import { activityDefinition } from "../../src/lib/coding/learning/catalogue";
import { initialActivityState, transitionActivity } from "../../src/lib/coding/learning/state-machine";
import { publicActivityView } from "../../src/lib/coding/learning/public-view";
import { activityActionSchema } from "../../src/lib/coding/learning/types";
import { executePractical } from "../../src/lib/coding/learning/runtime";

// Actual production components and native execution. Synthetic build-stage fixture:
// not authenticated-route, database-persistence, source-isolation or live-AI evidence.
test("studio authoring, native run, save/resume and five age bands render in real browsers", async ({ page }) => {
  test.setTimeout(300000);
  const directory=`artifacts/coding-studio-browser/${randomUUID()}`;mkdirSync(directory,{recursive:true});
  const styles=await codingComponentStyles();
  const result=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';import * as B from'blockly/core';const root=createRoot(document.getElementById('root'));window.studioBlockly=B;window.mountStudio=(initial)=>root.render(<Workspace key={initial.activity.id} initial={initial} endpoint="/api/__studio"/>);`},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
  const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.replaceAll("</style","<\\/style")}#root{display:contents}</style></head><body class="flex min-h-full flex-col"><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${result.outputFiles[0]!.text.replaceAll("</script","<\\/script")}</script></body></html>`;
  const errors:string[]=[];page.on("pageerror",error=>{errors.push(error.message);writeFileSync(`${directory}/browser-errors.json`,JSON.stringify(errors,null,2));});
  await page.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/__studio")return route.fulfill({contentType:"text/html",body:html});
    if(url.pathname.startsWith("/coding/blockly/")||url.pathname==="/brand/starliz-logo.png"){
      const path=`public${url.pathname}`;return route.fulfill({body:readFileSync(path),contentType:path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'application/octet-stream'});
    }
    if(url.pathname!=="/api/__studio")return route.abort();
    return route.fallback();
  });
  let nativeRuns=0,saves=0;const samples:unknown[]=[];
  for(const id of ["Y1.01","Y3.01","Y6.01","Y8.01","Y10.01"]){
    const activity=activityDefinition(id)!;let state=initialActivityState(activity),revision=0;
    state.stage="build";state.completed=["discover","predict"];
    state.tutorMessages=[{stage:"build",purpose:"instruction",source:"fallback",revealing:false,message:activity.instruction.explanation}];
    const versions:Array<{id:string;label:string;stage:string;createdAt:string}>=[];
    const view=()=>({...publicActivityView(activity,state),revision:String(revision),versions});
    await page.route("**/api/__studio*",async route=>{
      try{
        if(new URL(route.request().url()).searchParams.has('lessonExample')){
          if(activity.example.type==='source')throw Error('Source runner deliberately not called in component acceptance');
          const execution=await executePractical(activity.engine,activity.example,activity.cases[0]!.input);nativeRuns++;
          return route.fulfill({json:{lessonExample:{artifact:activity.example,input:activity.cases[0]!.input,execution}}});
        }
        const action=activityActionSchema.parse(route.request().postDataJSON());expect(action.revision).toBe(String(revision));
        const next=await transitionActivity(activity,state,action,{run:async(engine,artifact,input)=>{if(artifact.type==='source')throw Error('Source isolation not part of this test');nativeRuns++;return executePractical(engine,artifact,input);},teach:async()=>({message:'Local fallback guidance; no live model request.',source:'fallback',revealing:false}),reflect:async()=>({passed:false,pending:true,confidence:0,source:'evidence',message:'No mastery review claimed'})});
        state=next.state;revision++;
        if(action.action==='save'){saves++;versions.push({id:`local-version-${revision}`,label:'saved-work',stage:state.stage,createdAt:new Date().toISOString()});writeFileSync(`${directory}/${id}-saved-state.json`,JSON.stringify(state));}
        return route.fulfill({json:{workspace:{...view(),message:next.message}}});
      }catch(error){return route.fulfill({status:400,json:{error:error instanceof Error?error.message:String(error)}});}
    });
    await page.goto('/__studio');await page.waitForFunction(()=>typeof (window as unknown as {mountStudio:unknown}).mountStudio==='function');await page.evaluate(serialized=>(window as unknown as {mountStudio:(initial:unknown)=>void}).mountStudio(JSON.parse(serialized)),JSON.stringify(view()));
    await expect(page.getByRole('heading',{name:activity.title,exact:true})).toBeVisible();
    const example=page.getByRole('region',{name:'Lesson Example',exact:true});
    const own=page.getByRole('region',{name:'My Program',exact:true});
    await expect(example).toBeVisible();await expect(own).toBeVisible();
    if(id==='Y1.01'){
      await expect(page.getByText('Opening the visual workspace…',{exact:false})).toHaveCount(0,{timeout:30000});
      await example.getByRole('button',{name:'Run lesson example',exact:true}).click();
      await expect(example.locator('svg[role="img"]').first()).toBeVisible();
      const before=await example.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML);
      await page.getByRole('button',{name:'Use accessible action controls',exact:true}).focus();await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Up ↑',exact:true}).focus();await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Run program',exact:true}).click();
      await expect(own.locator('svg[role="img"]').first()).toBeVisible();
      expect(await example.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML)).toBe(before);
      await page.getByRole('button',{name:'Save version',exact:true}).click();
      await expect(page.getByText('Your work has been saved.',{exact:true})).toBeVisible();
      const savedArtifact=JSON.stringify(state.artifacts.build);
      state=JSON.parse(readFileSync(`${directory}/${id}-saved-state.json`,'utf8'));
      await page.goto('/__studio');await page.evaluate(serialized=>(window as unknown as {mountStudio:(initial:unknown)=>void}).mountStudio(JSON.parse(serialized)),JSON.stringify(view()));
      await expect(page.getByRole('heading',{name:activity.title,exact:true})).toBeVisible();
      expect(JSON.stringify(state.artifacts.build)).toBe(savedArtifact);
      await expect(page.locator('.blocklySvg').first()).toBeVisible({timeout:30000});
      await example.getByRole('button',{name:'Run lesson example',exact:true}).click();
      await expect(example.locator('svg[role="img"]').first()).toBeVisible();
      const preservedOwn=await own.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML);
      await example.getByRole('button',{name:'Replay Example',exact:true}).click();
      await expect(example.getByRole('button',{name:'Pause Example',exact:true})).toBeVisible();
      expect(await own.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML)).toBe(preservedOwn);
      await example.getByRole('button',{name:'Pause Example',exact:true}).click();
      const preservedExample=await example.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML);
      await own.getByRole('button',{name:'Replay My Program',exact:true}).click();
      await expect(own.getByRole('button',{name:'Pause My Program',exact:true})).toBeVisible();
      expect(await example.locator('svg[role="img"]').first().evaluate(n=>n.outerHTML)).toBe(preservedExample);
      await own.getByRole('button',{name:'Pause My Program',exact:true}).click();
      await example.getByRole('slider',{name:'Replay movement',exact:true}).focus();await page.keyboard.press('End');
      await own.getByRole('slider',{name:'Replay movement',exact:true}).focus();await page.keyboard.press('End');
      await page.getByRole('button',{name:'Replay steps',exact:true}).click();
      await expect(page.locator('.blocklyHighlightedConnectionPath,.blocklyHighlighted')).not.toHaveCount(0,{timeout:5000});
    }
    if(id==='Y8.01'){
      const code=page.getByRole('textbox',{name:/ source code$/}).first();
      await expect(code).toBeVisible();await code.click();await code.press('ControlOrMeta+End');await page.keyboard.insertText('\n// browser editing check');
      await expect(code).toContainText('browser editing check');await code.press('ControlOrMeta+z');await expect(code).not.toContainText('browser editing check');
    }
    for(const width of [1600,820,390]){
      await page.setViewportSize({width,height:1100});
      if(width===1600){
        const slider=page.getByRole('slider',{name:'Results panel width',exact:true});await slider.focus();await slider.press('End');
        expect(await page.locator('.studio-results').evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(620);
        await slider.press('Home');await slider.press('ArrowRight');await slider.press('ArrowRight');await slider.press('ArrowRight');
      }
      await expect(example).toBeVisible();await expect(own).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.evaluate(()=>window.scrollTo(0,0));
      if(width===1600){
        const referenceBounds=await example.boundingBox(),learnerBounds=await own.boundingBox();
        expect(referenceBounds).not.toBeNull();expect(learnerBounds).not.toBeNull();
        expect(Math.abs(referenceBounds!.y-learnerBounds!.y)).toBeLessThan(8);
        expect(learnerBounds!.x).toBeGreaterThan(referenceBounds!.x);
        expect(referenceBounds!.y).toBeLessThan(900);expect(learnerBounds!.y).toBeLessThan(900);
      }
      await page.screenshot({path:`${directory}/${id}-${width}.png`,fullPage:true});samples.push({id,year:activity.year,width,workbench:activity.workbench});
      if(width===1600)await page.screenshot({path:`${directory}/${id}-desktop-viewport.png`});
      if(width===1600 && ['Y1.01','Y8.01'].includes(id)){
        await page.getByRole('button',{name:'Expand AI tutor',exact:true}).click();
        const expandedQuestion=page.getByRole('textbox',{name:'What are you thinking about?',exact:true});
        await expect(expandedQuestion).toBeFocused();
        expect(await expandedQuestion.evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThan(450);
        expect(await expandedQuestion.evaluate(node=>{const box=node.getBoundingClientRect();return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===node;})).toBe(true);
        await page.screenshot({path:`${directory}/${id}-expanded-tutor-desktop.png`});
        await page.getByRole('button',{name:'Close tutor',exact:true}).click();
      }
    }
    await page.getByRole('button',{name:'Collapse Learn & Explore',exact:true}).click();await expect(example).toBeVisible();await expect(own).toBeVisible();
    await page.getByRole('button',{name:'Show Learn & Explore',exact:true}).click();
    await page.getByRole('button',{name:'Expand AI tutor',exact:true}).click();
    const question=page.getByRole('textbox',{name:'What are you thinking about?',exact:true});
    await expect(question).toBeFocused();await question.fill('Where should I look for the repeating pattern?');
    expect(await question.evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThan(300);
    if(id==='Y1.01')await page.screenshot({path:`${directory}/expanded-ai-tutor.png`,fullPage:true});
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Expand AI tutor',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'Expand AI tutor',exact:true}).click();
    await expect(question).toHaveValue('Where should I look for the repeating pattern?');
    await page.getByRole('button',{name:'Close tutor',exact:true}).click();
    await page.unroute('**/api/__studio*');
  }
  expect(errors).toEqual([]);expect(nativeRuns).toBe(3);expect(saves).toBe(1);
  writeFileSync(`${directory}/result.json`,JSON.stringify({componentOnly:true,syntheticBuildStageFixture:true,authenticatedRouteAcceptance:false,databasePersistenceClaim:false,sourceIsolationClaim:false,liveModelClaim:false,nativeRuns,saves,localFileSaveResume:true,accessibleKeyboardAuthoring:true,independentOutputs:true,samples,browserErrors:errors},null,2));
});
