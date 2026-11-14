import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { firstRouteActivities } from '../../src/lib/coding/learning/content/routes';
import { initialActivityState, artifactHash } from '../../src/lib/coding/learning/state-machine';
import { publicActivityView } from '../../src/lib/coding/learning/public-view';
import { codingComponentStyles } from './coding-styles';

test('completed Discover shows its next step and teaching checks never appear as learner results', async ({page})=>{
  test.setTimeout(180000);
  const directory='artifacts/coding-teaching-output-2026-11-04';mkdirSync(directory,{recursive:true});
  const activity=firstRouteActivities[0]!, state=initialActivityState(activity);
  state.completed=['discover'];state.lastRunStage='discover';state.lastRunArtifactHash=artifactHash(activity.example);
  state.lastExecution={ok:true,output:{},trace:[],stdout:'',stderr:'',runtime:'fictional-ui-metadata',steps:0};
  state.lastChecks=[{description:'Teaching-only check must not appear as learner evidence',passed:true}];
  const view=()=>({...publicActivityView(activity,state),revision:'fictional-revision',versions:[]});
  const initial=view();
  const styles=await codingComponentStyles();
  const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';createRoot(document.getElementById('root')).render(<Workspace boundLearner="guide-fixture" initial={${JSON.stringify(initial)}}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const actions:string[]=[];const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/__teaching')return route.fulfill({contentType:'text/html',body:`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${built.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>`});
    if(url.pathname.startsWith('/coding/blockly/'))return route.fulfill({body:readFileSync(`public${url.pathname}`),contentType:url.pathname.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
    if(url.pathname===`/api/student/coding/activities/${activity.id}`){const body=route.request().postDataJSON();actions.push(body.action);if(body.action==='open')state.stage=body.stage;return route.fulfill({json:{workspace:{...view(),message:'Your saved activity is open.'}}});}
    return route.abort();
  });
  await page.setViewportSize({width:1440,height:900});await page.goto('/__teaching');
  const own=page.getByRole('region',{name:'My Program',exact:true});
  await expect(own.getByRole('status')).toHaveText('Your program starts in Build',{timeout:30000});
  await expect(own.getByText('Teaching-only check must not appear as learner evidence')).toHaveCount(0);
  await expect(own.getByText('Execution finished',{exact:false})).toHaveCount(0);
  await expect(own.getByText('Run your work to see what it actually does.',{exact:false})).toHaveCount(0);
  await expect(own.getByText('Watch the independent Lesson Example',{exact:false})).toBeVisible();
  const guide = page.locator(".starliz-guide-widget");
  const task = page.locator("[data-guide-target='coding-task-description']").first();
  await expect(task).toBeHidden();
  await guide.getByText("Helper settings", { exact: true }).click();
  await page.getByRole("dialog", { name: "Helper settings" }).getByRole("button", { name: "Find instructions" }).click();
  await expect(task).toBeVisible();
  await expect(task).toHaveAttribute("data-guide-highlight", "");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const showMe = page.getByRole("button", { name: "Show me" });
    if (await showMe.isVisible()) await showMe.click();
    await expect(task).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/instructions-${width}.png` });
  }
  await page.getByRole("dialog", { name: "Helper settings" }).getByRole("button", { name: "Close" }).click();
  await guide.getByRole("button", { name: "Minimise helper" }).click();
  const panel=page.locator('.studio-guide-content');await panel.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  const collapse=page.getByText("Instructions", { exact: true });
  await expect(collapse).toBeVisible();await collapse.click();
  await expect(collapse).toBeVisible();
  await page.screenshot({path:`${directory}/completed-discover.png`,fullPage:true});
  const nav=page.getByRole('region',{name:'Stage navigation',exact:true});
  await expect(nav).toContainText('Discover · Completed');
  await nav.getByRole('button',{name:'Continue to Predict',exact:false}).click();
  await expect(page.getByRole('button',{name:'2. Predict',exact:true})).toHaveAttribute('aria-current','step');
  await expect(page.getByRole('region',{name:'Your prediction',exact:true}).getByRole('radio').first()).toBeVisible();
  expect(actions.filter(action=>action==='open')).toHaveLength(1);
  expect(actions.filter(action=>action==='check')).toHaveLength(0);
  await page.screenshot({path:`${directory}/predict.png`,fullPage:true});
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`,JSON.stringify({passed:true,teachingEvidenceExcluded:true,completedStageContinuation:true,noRegrading:true,collapseControlStaysVisible:true,browserErrors:errors,authenticated:false},null,2));
});
