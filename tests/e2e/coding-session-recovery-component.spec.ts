import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { codingComponentStyles } from './coding-styles';

test('activity restores refreshable sessions and gives bounded recovery for failed sign-in or access', async ({ page }) => {
  test.setTimeout(180000);
  const directory='artifacts/coding-session-recovery-2026-11-04'; mkdirSync(directory,{recursive:true});
  const styles=await codingComponentStyles();
  const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import Loader from'./src/components/coding/ActivityLoader';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<Loader activityId="what-is-an-instruction" bookingId="fictional-booking" daytimePeriodId="fictional-period" endpoint={q.get('endpoint')||undefined}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'workspace-boundary',setup(api){api.onResolve({filter:/^\.\/LearningWorkspace$/},()=>({path:'workspace',namespace:'fictional'}));api.onLoad({filter:/.*/,namespace:'fictional'},()=>({resolveDir:process.cwd(),loader:'tsx',contents:`export default function Workspace(){return <h1>Recovered activity workspace</h1>}`}));}}]});
  let status=401, refreshOk=false, activityRequests=0, refreshRequests=0;
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/__session') return route.fulfill({contentType:'text/html',body:`<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};</script><script>${bundle.outputFiles[0]!.text.replaceAll('</script','<\\/script')}</script></body></html>`});
    if(url.pathname==='/api/auth/refresh'){refreshRequests++;if(refreshOk){status=200;return route.fulfill({json:{ok:true}});}return route.fulfill({status:401,json:{error:'Session expired'}});}
    if(url.pathname.startsWith('/api/student/coding/')||url.pathname.startsWith('/api/admin/coding/')){activityRequests++;expect(url.searchParams.get('bookingId')).toBe('fictional-booking');return route.fulfill({status,json:status===200?{workspace:{revision:'fictional-restored'}}:{error:status===401?'Unauthorized':status===403?'This learner does not have Coding access.':'Temporary service problem'}});}
    return route.abort();
  });
  await page.goto('/__session');
  await expect(page.getByRole('alert')).toContainText('We could not restore your sign-in session',{timeout:30000});
  const signIn=page.getByRole('link',{name:'Sign in and return to activity',exact:true});
  await expect(signIn).toHaveAttribute('href',`/auth/login?next=${encodeURIComponent('/student/coding/activities/what-is-an-instruction?bookingId=fictional-booking&daytimePeriodId=fictional-period')}`);
  await expect(page.getByRole('link',{name:'Return to Coding',exact:true})).toHaveAttribute('href','/student/coding?bookingId=fictional-booking');
  expect(refreshRequests).toBe(2); expect(activityRequests).toBe(1);
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${directory}/sign-in-${width}.png`,fullPage:true});}
  status=200;await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Recovered activity workspace'})).toBeVisible();
  status=401;refreshOk=true;activityRequests=0;refreshRequests=0;await page.reload();
  await expect(page.getByRole('heading',{name:'Recovered activity workspace'})).toBeVisible();
  expect(activityRequests).toBe(2);expect(refreshRequests).toBe(1);
  status=403;refreshRequests=0;await page.reload();
  await expect(page.getByRole('alert')).toHaveText('This learner does not have Coding access.');
  await expect(signIn).toHaveCount(0);expect(refreshRequests).toBe(0);
  status=503;await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Temporary service problem');
  await expect(page.getByRole('heading',{name:'Recovered activity workspace'})).toHaveCount(0);
  status=401;refreshOk=false;
  await page.goto('/__session?endpoint='+encodeURIComponent('/api/student/coding/readiness/blocks-to-text/what-is-an-instruction'));
  await expect(signIn).toHaveAttribute('href',`/auth/login?next=${encodeURIComponent('/student/coding/readiness/blocks-to-text/what-is-an-instruction?bookingId=fictional-booking&daytimePeriodId=fictional-period')}`);
  expect(errors).toEqual([]);
  writeFileSync(`${directory}/result.json`,JSON.stringify({passed:true,refreshSuccess:true,refreshFailure:true,retrySuccess:true,deniedAccessPreserved:true,bookingAndReadinessReturnPreserved:true,browserErrors:errors,authenticated:false},null,2));
});
