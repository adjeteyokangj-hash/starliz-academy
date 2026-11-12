import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { firstRouteActivities } from '../../src/lib/coding/learning/content/routes';
import { initialActivityState, transitionActivity, artifactHash } from '../../src/lib/coding/learning/state-machine';
import { publicActivityView } from '../../src/lib/coding/learning/public-view';
import { executePractical } from '../../src/lib/coding/learning/runtime';
import { visualReview, checkVisualReview } from '../../src/lib/coding/learning/visual-review';
import { codingComponentStyles } from './coding-styles';

for (const activityIndex of [0, 1]) test(`introductory lesson ${activityIndex + 1}: no-typing review, save/resume and mastery progression`, async ({page})=>{
  test.setTimeout(180000);
  const directory=`artifacts/coding-visual-review-2026-11-04/lesson-${activityIndex + 1}`;mkdirSync(directory,{recursive:true});
  const activity=firstRouteActivities[activityIndex]!, next=firstRouteActivities[activityIndex + 1]!;
  let state=initialActivityState(activity);state.stage='review';state.completed=['discover','predict','build','practise','debug','create'];
  state.artifacts.create=activity.independent[0]!.reference;
  state.lastExecution=await executePractical(activity.workbench,state.artifacts.create,activity.independent[0]!.cases[0]!.input);
  state.lastRunStage='create';state.lastRunArtifactHash=artifactHash(state.artifacts.create);state.explanation='Earlier saved written draft';
  const challenge=visualReview(activity,state.artifacts.create,state.lastExecution)!;
  if(activityIndex===1)state.lastExecution=null;
  const view=()=>({...publicActivityView(activity,state),revision:'fictional-review-revision',versions:[]});
  const styles=await codingComponentStyles();
  const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import Workspace from'./src/components/coding/LearningWorkspace';createRoot(document.getElementById('root')).render(<Workspace initial={window.initialWorkspace}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const errors:string[]=[];let modelRequests=0;page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/__visual-review')return route.fulfill({contentType:'text/html',body:`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};window.initialWorkspace=${JSON.stringify(view()).replaceAll('<','\\u003c')};</script><script>${built.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>`});
    if(url.pathname.startsWith('/coding/blockly/'))return route.fulfill({body:readFileSync(`public${url.pathname}`),contentType:url.pathname.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
    if(url.pathname===`/api/student/coding/activities/${activity.id}`){
      const action=route.request().postDataJSON();
      if(action.action==='teach')return route.fulfill({json:{workspace:view()}});
      const result=await transitionActivity(activity,state,action,{run:executePractical,teach:async()=>({message:'Choose what your program does.',source:'fallback',revealing:false}),reflect:async(...args)=>checkVisualReview(...args)});
      state=result.state;return route.fulfill({json:{workspace:{...view(),message:result.message}}});
    }
    if(url.pathname==='/api/student/coding/next')return route.fulfill({json:{state:'next',activity:{title:next.title,href:`/student/coding/activities/${next.id}`}}});
    if(url.pathname===`/student/coding/activities/${next.id}`)return route.fulfill({contentType:'text/html',body:'<h1>Next approved activity opened</h1>'});
    if(url.pathname.includes('coach')||url.hostname!=='127.0.0.1')modelRequests++;
    return route.abort();
  });
  await page.setViewportSize({width:1440,height:1000});await page.goto('/__visual-review');
  if(activityIndex===1){await expect(page.getByRole('textbox',{name:'Your explanation',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Load my review choices',exact:true}).click();}
  const review=page.getByRole('region',{name:'Show what you learned',exact:true});
  await expect(review).toBeVisible({timeout:30000});await expect(page.getByRole('textbox',{name:'Your explanation',exact:true})).toHaveCount(0);
  await expect(review.getByRole('button',{name:'Check my choices',exact:true})).toBeDisabled();
  await review.getByRole('group').nth(0).getByRole('radio').nth(Number(challenge.correct[challenge.public.questions[0]!.id])).check();
  await review.getByRole('button',{name:'Save my choices',exact:true}).click();
  await expect.poll(()=>state.explanation.includes('visual-review-v1')).toBe(true);
  await page.reload();await expect(review.getByRole('group').nth(0).getByRole('radio').nth(Number(challenge.correct[challenge.public.questions[0]!.id]))).toBeChecked();
  for(let index=0;index<challenge.public.questions.length;index++){
    const question=challenge.public.questions[index]!;
    const answer=index===0?(Number(challenge.correct[question.id])+1)%question.choices.length:Number(challenge.correct[question.id]);
    await review.getByRole('group').nth(index).getByRole('radio').nth(answer).check();
  }
  await review.getByRole('button',{name:'Check my choices',exact:true}).click();
  await expect(page.getByText('Not quite yet.',{exact:false}).first()).toBeVisible();expect(state.mastered).toBe(false);
  await review.getByRole('group').nth(0).getByRole('radio').nth(Number(challenge.correct[challenge.public.questions[0]!.id])).check();
  for(const width of [1440,820,390]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${directory}/choices-${width}.png`,fullPage:true});}
  await review.getByRole('button',{name:'Check my choices',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Activity mastered — achievement saved',exact:true})).toBeVisible();
  expect(state.mastered).toBe(true);expect(state.completed).toHaveLength(7);
  const continueLink=page.getByRole('link',{name:'Continue to next activity',exact:false});await expect(continueLink).toBeVisible();
  await page.screenshot({path:`${directory}/mastered.png`,fullPage:true});await continueLink.click();
  await expect(page.getByRole('heading',{name:'Next approved activity opened'})).toBeVisible();
  expect(errors).toEqual([]);expect(modelRequests).toBe(0);
  writeFileSync(`${directory}/result.json`,JSON.stringify({passed:true,nativePracticalReassessment:true,noTyping:true,savedChoicesResumed:true,wrongAnswerRejected:true,masteryAndNextActivity:true,responsiveWidths:[1440,820,390],modelRequests,browserErrors:errors,authenticated:false},null,2));
});
