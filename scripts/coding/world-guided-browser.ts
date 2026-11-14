import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { qaBrowserUserAgent } from './qa-browser-identity';
import { activityDefinition } from '../../src/lib/coding/learning/catalogue';
import { UNDERSTANDING_LOOPS } from '../../src/lib/coding/catalog';
const {redact}=createRequire(import.meta.url)('./qa-redaction.cjs');

/** One real browser cookie jar, including its API assertions. No copied,
 * independently rotating refresh-token jar and no application response mocks. */
export async function verifyWorldGuidedBrowser(base:string,email:string,password:string,childId:string,directory:string) {
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext({baseURL:base,userAgent:qaBrowserUserAgent,serviceWorkers:'block',viewport:{width:1440,height:1000}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    assert.equal((await context.request.post('/api/auth/login',{data:{identifier:email,password}})).status(),200);
    assert.equal((await context.request.post('/api/auth/refresh',{headers:{Origin:base}})).status(),200);
    const activity=activityDefinition('Y1.01')!;
    const cases=[{path:`/student/coding/world/activities/${activity.id}`,api:`/api/student/coding/activities/${activity.id}`,title:activity.title,file:'guided-curriculum'},{path:`/student/coding/world/lessons/${UNDERSTANDING_LOOPS.id}`,api:`/api/student/coding/lessons/${UNDERSTANDING_LOOPS.id}`,title:UNDERSTANDING_LOOPS.title,file:'guided-legacy'}];
    const page=await context.newPage(),errors:string[]=[];
    const trace=(event:string,detail:unknown={})=>appendFileSync(resolve(directory,'guided-browser-events.ndjson'),redact(JSON.stringify({at:new Date().toISOString(),event,detail}))+'\n');
    const safeUrl=(raw:string)=>{try {const u=new URL(raw);return {origin:u.origin,path:u.pathname};}catch{return {path:'invalid'};}};
    page.on('pageerror',e=>{errors.push(redact(e.message));trace('pageerror',redact(e.message));writeFileSync(resolve(directory,'guided-browser-errors.json'),JSON.stringify(errors));});
    page.on('console',message=>trace('console',{type:message.type(),text:redact(message.text())}));
    page.on('request',r=>trace('request',{...safeUrl(r.url()),type:r.resourceType(),navigation:r.isNavigationRequest()}));
    page.on('requestfailed',r=>trace('requestfailed',{...safeUrl(r.url()),error:r.failure()?.errorText}));
    page.on('response',r=>trace('response',{...safeUrl(r.url()),status:r.status(),type:r.headers()['content-type']}));
    page.on('framenavigated',frame=>trace('framenavigated',safeUrl(frame.url())));
    page.on('domcontentloaded',()=>trace('domcontentloaded'));
    page.on('load',()=>trace('load'));
    page.on('crash',()=>trace('crash'));
    // Prove browser transport and same-origin routing independently of React.
    await page.goto(`${base}/api/auth/me`,{waitUntil:'domcontentloaded',timeout:30000});
    trace('local-browser-transport-verified');
    for(const item of cases) {
      const html=await context.request.get(item.path,{timeout:180000});assert.equal(html.status(),200);
      const text=await html.text();await html.dispose();
      for(const path of new Set([...text.matchAll(/(?:src|href)="(\/_next\/[^"\s]+)"/g)].map(match=>match[1]!.replaceAll('&amp;','&')))) { const response=await context.request.get(path,{timeout:120000});assert.equal(response.status(),200);await response.dispose(); }
      const workspace=await context.request.get(item.api,{timeout:120000});assert.equal(workspace.status(),200);assert.equal(workspace.headers()['x-coding-learner'],childId);
      // Root layout fetches branding alongside the time-bounded auth probe.
      // Cold dev compilation of branding otherwise stalls that probe. Warm the
      // real shared dependency; do not change auth timeouts or mock responses.
      for(const dependency of ['/api/branding','/api/children/active']) {const response=await context.request.get(dependency,{timeout:120000});assert.equal(response.status(),200);await response.dispose();trace('bootstrap-dependency-ready',{path:dependency});}
      assert.equal((await context.request.get('/api/auth/me')).status(),200);
      try {
        trace('navigation-start',{path:item.path});
        await page.goto(item.path,{waitUntil:'commit',timeout:180000});
        await expect(page.getByRole('heading',{name:item.title,exact:true}).first()).toBeVisible({timeout:120000});
        await page.screenshot({path:resolve(directory,`${item.file}-verified.png`),fullPage:true});
      } catch(error) {
        await page.screenshot({path:resolve(directory,`${item.file}-failure.png`),fullPage:true,timeout:15000}).catch(()=>{});
        writeFileSync(resolve(directory,'guided-browser-failure.json'),JSON.stringify({path:new URL(page.url()).pathname,heading:item.title,errors}));throw error;
      }
    }
    assert.deepEqual(errors,[]);
    assert.equal((await context.request.get('/api/student/coding/world')).status(),200);
    return {nativeActivity:true,legacyLesson:true,realBrowserLogin:true,realRefresh:true,sharedCookieJar:true,learnerBound:childId,applicationResponsesMocked:false};
  } finally {await browser.close();}
}
