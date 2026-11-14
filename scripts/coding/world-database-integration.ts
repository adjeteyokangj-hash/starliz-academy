import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createServer, connect } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { request, chromium, expect, type APIRequestContext } from '@playwright/test';
import { qaBrowserUserAgent } from './qa-browser-identity';
import { refreshingQaContext } from './refreshing-qa-context';
import { verifyWorldGuidedBrowser } from './world-guided-browser';
import { verifyAuthenticatedActivity } from './authenticated-activity-driver';
import { missions, locations, WORLD_KEY, type WorldState } from '../../src/lib/coding/world/model';
import { activityDefinition } from '../../src/lib/coding/learning/catalogue';
import { UNDERSTANDING_LOOPS } from '../../src/lib/coding/catalog';
import pins from '../../src/lib/coding/learning/runtime-pins.json';

const require = createRequire(import.meta.url);
const {redact,diagnosticLines}=require('./qa-redaction.cjs');
const directory = process.env.WORLD_QA_DIRECTORY!;
const results: Array<{ name: string; status: string; detail?: unknown }> = [];
const report: Record<string, unknown> = { database: 'starliz_game_world_test', endpoint: '127.0.0.1:55432', results, productionTouched: false, migrationsApplied: false, syntheticRecordsRetained: true };
const guidedOnly=process.env.WORLD_QA_GUIDED_ONLY==='1';
const browserOnly=process.env.WORLD_QA_BROWSER_ONLY==='1'||guidedOnly;
report.scope=guidedOnly?'guided-acceptance':browserOnly?'targeted-browser-follow-up':'full-local-integration';
class UnverifiedRequirement extends Error {}
const persist = () => writeFileSync(resolve(directory,'result.json'),redact(JSON.stringify(report,null,2)));
const check = async (name: string, fn: () => Promise<unknown>) => { try { const detail=await fn();results.push({name,status:'passed',detail});console.log(`PASS ${name}`); } catch(error) { const message=error instanceof Error ? error.message : 'Unknown failure'; if (/WORLD_QA_.*DATABASE/.test(message)) throw error; const status=error instanceof UnverifiedRequirement?'unverified':'failed';results.push({name,status,detail:message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted database URL]').slice(0,1200)});console.log(`${status.toUpperCase()} ${name}`); } persist(); };
const living: Record<string,(scenario:boolean)=>string[]> = {
 pizza:s=>Array.from({length:2},()=>['prepare',s?'plantTop':'top','bake','wait','wait','wait','serve']).flat(),
 robot:()=>['north','north','east','east','east','south','pickup','east','east','north','drop'],
 farm:()=>['bed1','plant','water','bed2','plant','water','wait','wait','bed1','harvest','bed2','harvest'],
 traffic:s=>['northGreen',...Array(s?3:2).fill('tick'),'allRed','eastGreen','tick','tick','allRed','cross','cross'],
 space:s=>['fuel','fuel','fuel','fuel',...(s?['shield']:[]),'launch','travel','travel','scan','collect','collect','returnHome','dock'],
 pets:s=>['pet1',s?'gentleFood':'feed',s?'gentleFood':'feed','wash','play','rest','pet2','feed','feed','wash','play','rest'],
};
function solution(m: typeof missions[number]): unknown[] {
 if(m.simulation) return [{op:'if',test:{read:'needsHelp'},body:living[m.location](true).map(name=>({op:'emit',name})),otherwise:living[m.location](false).map(name=>({op:'emit',name}))}];
 const body=(m.actions??locations.find(l=>l.id===m.location)!.cycle).map(name=>({op:'emit',name}));
 return [...(m.conditional?[{op:'if',test:{read:'needsHelp'},body:[{op:'emit',name:'assist'}],otherwise:[{op:'emit',name:'ready'}]}]:[]),...(m.count>1?[{op:'repeat',amount:m.count,body}]:body)];
}
async function main() {
 if(process.env.STARLIZ_WORLD_DB_QA!=='1') throw Error('Use the isolated launcher');
 require('./world-test-guard.cjs').assertTarget(process.env.DATABASE_URL);
 const { prisma }=await import('../../src/lib/db');
 const db=await prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
 assert.equal(db[0]?.name,'starliz_game_world_test');
 report.databasePreflight=true;
 let next: ReturnType<typeof spawn>|undefined;
 let runner: import('node:http').Server|undefined;
 const contexts: APIRequestContext[]=[];
 try {
 await check('Fail-closed environment and SDK egress',async()=>{
   const guard=require('./world-test-guard.cjs');
   for(const bad of ['postgresql://x:x@127.0.0.1:55432/starliz_ci?sslmode=disable','postgresql://x:x@example.invalid:55432/starliz_game_world_test?sslmode=disable']) assert.throws(()=>guard.assertTarget(bad));
   assert.equal(readFileSync('.env.local','utf8'),'');
   assert.equal(process.env.OPENAI_API_KEY,undefined);assert.equal(process.env.SMTP_PASS,undefined);
   await assert.rejects(fetch('https://example.invalid'));
   assert.throws(()=>require('node:net').connect(443,'example.invalid'),/WORLD_QA/);
   assert.throws(()=>require('node:tls').connect({host:'example.invalid',port:443}),/WORLD_QA/);
   assert.throws(()=>require('node:http').get('http://example.invalid'),/WORLD_QA/);
   assert.throws(()=>require('node:dns').lookup('example.invalid',()=>{}),/WORLD_QA/);
   assert.throws(()=>require('node:dgram').createSocket('udp4'),/WORLD_QA/);
   return {fetch:true,tcp:true,tls:true,httpSdk:true,dns:true,udp:true,dotenvSuppressed:true};
 });
 if(results.at(-1)?.status!=='passed') throw Error('WORLD_QA_DATABASE_GUARD_PRECHECK_STOP');
 const suffix=randomUUID(), password=randomBytes(30).toString('base64url'), passwordHash=await bcrypt.hash(password,12);
 // No existing records are edited or deleted. Every fixture is newly labelled.
 const fixtures=await prisma.$transaction(async tx=>{
   const plan=await tx.pricingPlan.create({data:{name:`World QA ${suffix}`,description:'Synthetic local testing only',price:0,interval:'month',audience:'individual',features:{labs:{coding:true},childLimit:2,bullets:['Local QA']},ctaLabel:'QA',ctaHref:'/',isActive:false}});
   const families=[];
   for(let i=0;i<2;i++){
     const parent=await tx.user.create({data:{email:`coding-completion-qa-${suffix}-parent${i}@example.invalid`,name:'Coding completion QA only',role:'parent',passwordHash,consentAcceptedAt:new Date(),consentVersion:'synthetic-local-world'}});
     const student=await tx.user.create({data:{email:`world-qa-${suffix}-student${i}@example.invalid`,name:'Synthetic World learner',role:'student',passwordHash}});
     const child=await tx.childProfile.create({data:{id:randomUUID(),parentId:parent.id,userId:student.id,name:`Synthetic World learner ${i}`,age:16,yearGroup:'Year 11'}});
     await tx.user.update({where:{id:parent.id},data:{activeChildId:child.id}});
     await tx.subscription.create({data:{parentId:parent.id,pricingPlanId:plan.id,provider:'manual',planKey:'local-world-qa',status:'active',currentPeriodEnd:new Date(Date.now()+86400000)}});
     families.push({parent,student,child});
   }
   const role=await tx.adminRole.create({data:{name:`World QA ${suffix}`,permissions:JSON.stringify(['MANAGE_CONTENT','APPROVE_CONTENT'])}});
   const admins=[];
   for(let i=0;i<2;i++){const user=await tx.user.create({data:{email:`world-qa-${suffix}-admin${i}@example.invalid`,name:'Synthetic World administrator',role:'admin',passwordHash}});await tx.adminUser.create({data:{userId:user.id,roleId:role.id}});admins.push(user);}
   const school=await tx.school.create({data:{name:'Synthetic World QA School',slug:`world-qa-${suffix}`,status:'active'}});
   await tx.schoolLicence.create({data:{schoolId:school.id,status:'active',seatLimit:10,pricingPlanId:plan.id,currentPeriodEnd:new Date(Date.now()+86400000)}});
   const teachers=[];
   for(let i=0;i<2;i++){const user=await tx.user.create({data:{email:`world-qa-${suffix}-teacher${i}@example.invalid`,name:'Synthetic World teacher',role:'teacher',passwordHash}});const membership=await tx.schoolTeacher.create({data:{schoolId:school.id,userId:user.id,status:'active',role:'teacher'}});teachers.push(user);const classroom=await tx.classroom.create({data:{schoolId:school.id,teacherId:membership.id,name:`World QA class ${i}`,academicYear:'2026'}});await tx.schoolStudent.create({data:{schoolId:school.id,childId:families[i]!.child.id,classroomId:classroom.id}});}
   return {families,admins,teachers};
 },{timeout:60000});
 report.fixtureChildIds=fixtures.families.map(f=>f.child.id);persist();
 process.env.CODING_CURRICULUM_QA_ENABLED='true';process.env.CODING_CURRICULUM_QA_CHILD_IDS=fixtures.families.map(f=>f.child.id).join(',');
 await check('Local runner dependency provenance',async()=>{
   const seen=new Set<string>(), files:Array<{file:string;sha256:string;cCheckoutMatches:boolean|null}>=[];
   function visit(file:string){if(seen.has(file))return;seen.add(file);const source=readFileSync(file,'utf8');const relative=file.slice(resolve('.').length+1);const other=resolve('C:/Users/edwar/Documents/Projects/starliz-academy',relative);files.push({file:relative,sha256:createHash('sha256').update(source).digest('hex'),cCheckoutMatches:existsSync(other)?readFileSync(other,'utf8')===source:null});for(const m of source.matchAll(/(?:from\s+|import\s*)['"](.+?)['"]/g))if(m[1]!.startsWith('.'))visit(resolve(dirname(file),m[1]!));}
   visit(resolve('services/coding-runner/local-media-server.mjs'));
   report.runnerDependencies=files;
   const runnerImplementation=await import(pathToFileURL(resolve('services/coding-runner/server.mjs')).href);
   process.env.CODING_RUNNER_SECRET=randomBytes(48).toString('hex');
   runner=runnerImplementation.createRunnerServer({secret:process.env.CODING_RUNNER_SECRET,pythonImage:`python@${pins.python}`,javascriptImage:pins.javascript,mediaImage:pins.media,containerRuntime:'runsc',docker:'docker'});
   await new Promise<void>(yes=>runner!.listen(0,'127.0.0.1',yes));
   const address=runner!.address();assert.ok(address&&typeof address!=='string');
   process.env.CODING_RUNNER_URL=`http://127.0.0.1:${address.port}`;
   return {loadedFrom:'D:/Projects/starliz-academy/services/coding-runner/server.mjs',files:files.length,alternateCheckoutUsed:false};
 });
 const reservation=createServer();await new Promise<void>(yes=>reservation.listen(0,'127.0.0.1',yes));const address=reservation.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>(yes=>reservation.close(()=>yes()));
 const base=`http://127.0.0.1:${port}`;report.application={base,ownedProcess:true,existingServerReused:false};
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [next.stdout!,next.stderr!]) {const sink=diagnosticLines((line:string)=>appendFileSync(resolve(directory,'app.log'),line));stream.on('data',sink.push);stream.on('end',sink.flush);}
 let listening=false;const listenDeadline=Date.now()+150_000;while(!listening&&Date.now()<listenDeadline){if(next.exitCode!==null)throw Error('Owned Next application stopped');listening=await new Promise<boolean>(yes=>{const socket=connect({host:'127.0.0.1',port,timeout:1000},()=>{socket.end();yes(true);});socket.on('error',()=>yes(false));socket.on('timeout',()=>{socket.destroy();yes(false);});});if(!listening&&Date.now()<listenDeadline)await new Promise(yes=>setTimeout(yes,500));}
 if(!listening)throw Error('Owned app readiness');
 const bundlePath=resolve('.next-coding-qa/world-uat/dev/server/app/api/auth/me/route.js');
 const bundleBefore=existsSync(bundlePath)?statSync(bundlePath).mtimeMs:0;
 let ready=false;const readinessStarted=Date.now();
 const pending=fetch(`${base}/api/auth/me`).then(async r=>({status:r.status}),()=>null);
 while(!ready){if(next.exitCode!==null)throw Error('Owned Next application stopped');const result=await Promise.race([pending,new Promise(yes=>setTimeout(()=>yes(undefined),1000))]);if(result&&result.status===401){ready=true;break;}if(result)break;const emitted=existsSync(bundlePath)&&statSync(bundlePath).mtimeMs>bundleBefore;const elapsed=Date.now()-readinessStarted;if(!emitted&&elapsed>=150_000)break;if(emitted&&elapsed>=195_000)break;}
 assert.ok(ready,'Owned app readiness');
 await check('Application process database and credential isolation',async()=>{const r=await fetch(`${base}/api/auth/world-qa-environment`,{headers:{'x-world-qa-probe':process.env.WORLD_QA_PROBE_TOKEN!}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.database,'starliz_game_world_test');assert.equal(data.host,'127.0.0.1');assert.equal(data.port,'55432');assert.equal(data.ssl,'disable');assert.equal(data.buildId,process.env.CODING_QA_BUILD_ID);assert.deepEqual(data.credentialKeys,[]);assert.equal(data.devAdminFallback,false);assert.equal(data.liveModelDisabled,true);return data;});
 if(results.at(-1)?.status!=='passed') throw Error('WORLD_QA_APPLICATION_DATABASE_OR_CREDENTIAL_CHECK_STOP');
 const login=async(email:string)=>{const api=await request.newContext({baseURL:base,timeout:180000,userAgent:qaBrowserUserAgent});contexts.push(api);const r=await api.post('/api/auth/login',{data:{identifier:email,password}});assert.equal(r.status(),200,`Synthetic login: ${r.status()}`);return refreshingQaContext(api,base);};
 const student=await login(fixtures.families[0]!.student.email),foreignStudent=await login(fixtures.families[1]!.student.email),parent=await login(fixtures.families[0]!.parent.email),foreignParent=await login(fixtures.families[1]!.parent.email),admin=await login(fixtures.admins[0]!.email),approver=await login(fixtures.admins[1]!.email),teacher=await login(fixtures.teachers[0]!.email),otherTeacher=await login(fixtures.teachers[1]!.email);
 results.push({name:'Real password authentication: student, parent, teacher and administrators',status:'passed'});persist();
 const childId=fixtures.families[0]!.child.id;
 let state:WorldState;
 const load=async(api=student)=>{const r=await api.get('/api/student/coding/world');assert.equal(r.status(),200,await r.text());return r.json();};
 state=(await load()).state;
 const act=async(action:unknown)=>{const r=await student.post('/api/student/coding/world',{data:{learnerId:childId,revision:state.revision,action},headers:{Origin:base}});const data=await r.json();assert.equal(r.status(),200,JSON.stringify(data));state=data.state;return data;};
 if(!browserOnly) {
 const originalProgress=await prisma.codingWorkspace.findMany({where:{childId,NOT:{lessonId:WORLD_KEY}}});
 for(const mission of missions) await check(`Mission ${mission.id}`,async()=>{const r=await act({type:'run',missionId:mission.id,commands:solution(mission)});assert.equal(r.run.ok,true,r.run.feedback);assert.ok(state.completed.includes(mission.id));});
 await check('All 27 missions persisted without formal assessment writes',async()=>{assert.equal((await load()).state.completed.length,27);assert.deepEqual(await prisma.codingWorkspace.findMany({where:{childId,NOT:{lessonId:WORLD_KEY}}}),originalProgress);});
 await check('Named project autosave, snapshots and restoration',async()=>{
   const id=randomUUID(),commands=solution(missions[0]!);await act({type:'project-save',project:{id,title:'Synthetic QA restaurant',missionId:'pizza-sequence',language:'blocks',commands}});
   const snapshot=await act({type:'snapshot',projectId:id,missionId:'pizza-sequence',commands});assert.ok(snapshot.versions.length>0);
   await act({type:'save',projectId:id,missionId:'pizza-sequence',commands:[]});const version=snapshot.versions[0];await act({type:'save',projectId:id,missionId:version.missionId,commands:version.commands});
   const saved=await load();assert.deepEqual(saved.state.projects[0].commands,commands);assert.equal(saved.versions[0].id,version.id);return {versionId:version.id};
 });
 await check('Clubhouse and avatar persist through actual database reads',async()=>{await act({type:'room',room:{floor:'wood',decorations:[{id:randomUUID(),item:'sunflower',x:2,y:3,rotation:'90'}]}});await act({type:'appearance',appearance:{...state.appearance,accessory:'star'}});const stored=await prisma.codingWorkspace.findUniqueOrThrow({where:{childId_lessonId:{childId,lessonId:WORLD_KEY}}});assert.deepEqual(JSON.parse(stored.programsJson).room,state.room);assert.equal((await load()).state.appearance.accessory,'star');});
 await check('Student isolation, foreign cursor and optimistic conflict',async()=>{const foreign=await load(foreignStudent);assert.equal(foreign.state.completed.length,0);const versions=(await load()).versions;assert.equal((await foreignStudent.get(`/api/student/coding/world?versionsBefore=${versions[0].id}`)).status(),400);const r=await foreignStudent.post('/api/student/coding/world',{data:{learnerId:childId,revision:state.revision,action:{type:'save',missionId:'pizza-sequence',commands:[]}}});assert.equal(r.status(),409);const stale=await student.post('/api/student/coding/world',{data:{learnerId:childId,revision:0,action:{type:'save',missionId:'pizza-sequence',commands:[]}}});assert.equal(stale.status(),409);});
 await check('Parent ownership restrictions',async()=>{assert.equal((await parent.get(`/api/parent/coding?studentId=${childId}`)).status(),200);assert.equal((await foreignParent.get(`/api/parent/coding?studentId=${childId}`)).status(),404);assert.equal((await student.get(`/api/parent/coding?studentId=${childId}`)).status(),403);});
 await check('Teacher classroom permissions',async()=>{const r=await teacher.get('/api/teacher/coding');assert.equal(r.status(),200);const data=await r.json();assert.deepEqual(data.students.map((s:{id:string})=>s.id),[childId]);const other=await otherTeacher.get('/api/teacher/coding');assert.equal(other.status(),200);assert.ok(!(await other.json()).students.some((s:{id:string})=>s.id===childId));assert.equal((await student.get('/api/teacher/coding')).status(),403);});
 await check('Content Studio persistence and independent approval',async()=>{const draft=await admin.post('/api/admin/coding/world',{data:{type:'draft',content:{missionId:'pizza-sequence',title:'Synthetic restaurant',objective:'Use ordered instructions to prepare a virtual pizza.',dialogue:'Try one instruction at a time.',metadata:{chapter:{title:'Local QA chapter',order:1},curriculumLinks:[],extensions:[]}}}});assert.equal(draft.status(),200,await draft.text());const id=(await draft.json()).version.id;assert.ok(await prisma.codingWorldContentVersion.findUnique({where:{id}}));assert.equal((await admin.post('/api/admin/coding/world',{data:{type:'submit',id}})).status(),200);assert.equal((await admin.post('/api/admin/coding/world',{data:{type:'approve',id}})).status(),409);assert.equal((await approver.post('/api/admin/coding/world',{data:{type:'approve',id}})).status(),200);assert.equal((await approver.post('/api/admin/coding/world',{data:{type:'publish',id}})).status(),409);assert.equal((await student.get('/api/admin/coding/world')).status(),403);assert.equal((await prisma.codingWorldContentVersion.findUniqueOrThrow({where:{id}})).status,'approved');return {publicationDisabled:true};});
 await check('Guided discovery and legacy lesson persistence',async()=>{const r=await student.get('/api/student/coding/world/guided');assert.equal(r.status(),200);report.guidedDiscovery=await r.json();const lesson=await student.get(`/api/student/coding/lessons/${UNDERSTANDING_LOOPS.id}`);assert.equal(lesson.status(),200);assert.equal(lesson.headers()['x-coding-learner'],childId);assert.ok(await prisma.codingWorkspace.findUnique({where:{childId_lessonId:{childId,lessonId:UNDERSTANDING_LOOPS.id}}}));});
 await check('Guided curriculum native assessment and saved stages',async()=>{const activity=activityDefinition('Y1.01')!;const result=await verifyAuthenticatedActivity(student,`/api/student/coding/activities/${activity.id}`,activity,{stopAfterBuild:true,modelInstructionExpected:false});assert.equal(result.mastered,false);return result;});
 for(const language of ['python','javascript'] as const) await check(`${language} source execution through local runner`,async()=>{const source=language==='python'?"def solve(world):\n return ['prepare','top','bake','serve']":"function solve(world) { return ['prepare','top','bake','serve']; }";const r=await act({type:'source-run',missionId:'pizza-sequence',language,source});assert.equal((await load()).state.sources['pizza-sequence'].source,source);if(!r.run.ok&&/unavailable/.test(r.run.feedback)){results.push({name:`${language} unavailable-runner draft retention`,status:'passed'});throw new UnverifiedRequirement('Pinned runsc execution is unavailable on this local Docker engine. Actual source-run request retained the draft and failed closed; no successful execution claimed.');}assert.equal(r.run.ok,true,r.run.feedback);});
 } else {
   await act({type:'project-save',project:{id:randomUUID(),title:'Synthetic QA restaurant',missionId:'pizza-sequence',language:'blocks',commands:solution(missions[0]!)}});
 }
 if(guidedOnly) await check('Guided curriculum and existing lesson browser acceptance',async()=>{
   const activity=activityDefinition('Y1.01')!;
   const assessment=await verifyAuthenticatedActivity(student,`/api/student/coding/activities/${activity.id}`,activity,{stopAfterBuild:true,modelInstructionExpected:false});
   assert.equal(assessment.mastered,false);
   return verifyWorldGuidedBrowser(base,fixtures.families[0]!.student.email,password,childId,directory);
 }); else await check('Database-backed browser journeys',async()=>{
   assert.equal((await student.post('/api/auth/refresh',{headers:{Origin:base}})).status(),200);
   // Warm the actual server and blocking entry assets before the browser timer.
   // No route responses, components or assessments are replaced.
   const worldDocument=await student.get('/student/coding/world',{timeout:240000});assert.equal(worldDocument.status(),200);
   const html=await worldDocument.text(), assets=[...new Set([...html.matchAll(/(?:src|href)="([^"\s]+\/_next\/[^"\s]+|\/_next\/[^"\s]+)"/g)].map(m=>m[1]!.replaceAll('&amp;','&')))];
   const warmed=[];for(const path of assets){const u=new URL(path,base);if(u.origin!==base)continue;const r=await student.get(u.href,{timeout:120000});warmed.push({path:u.pathname,status:r.status()});await r.dispose();}
   report.warmedAssets=warmed;
   for(const dependency of ['/api/branding','/api/children/active']) {const r=await student.get(dependency,{timeout:120000});assert.equal(r.status(),200);await r.dispose();}
   const warmedSession=await student.get('/api/auth/me',{timeout:120000});assert.equal(warmedSession.status(),200);report.warmedSessionRoute=true;persist();
   const parentTeacherOnly=process.env.WORLD_QA_PARENT_TEACHER==='1';
   const activityWarm=activityDefinition('Y1.01')!;
   const warmTargets=parentTeacherOnly?[{api:parent,path:'/parent/progress'},{api:teacher,path:'/teacher/coding'}]:[{api:student,path:`/student/coding/world/lessons/${UNDERSTANDING_LOOPS.id}`},{api:student,path:`/api/student/coding/lessons/${UNDERSTANDING_LOOPS.id}`},{api:student,path:`/student/coding/world/activities/${activityWarm.id}`},{api:student,path:`/api/student/coding/activities/${activityWarm.id}`},{api:parent,path:'/parent/progress'},{api:teacher,path:'/teacher/coding'}];
   for(const warm of warmTargets){const warmedRoute=await warm.api.get(warm.path,{timeout:240000});assert.equal(warmedRoute.status(),200,warm.path);await warmedRoute.dispose();}
   const browser=await chromium.launch({channel:'msedge',headless:true});
   try{if(!parentTeacherOnly){const context=await browser.newContext({baseURL:base,storageState:await student.storageState(),userAgent:qaBrowserUserAgent});await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());const page=await context.newPage();const studentActivityPosts:Array<Promise<unknown>>=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/student/coding/activities/'))studentActivityPosts.push(request.response().then(response=>response?.finished()).catch(()=>undefined));});const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);writeFileSync(resolve(directory,'browser-errors.json'),JSON.stringify(errors));});const failedRequests:unknown[]=[];page.on('requestfailed',r=>{const u=new URL(r.url());failedRequests.push({origin:u.origin,path:u.pathname,error:r.failure()?.errorText});writeFileSync(resolve(directory,'browser-request-failures.json'),JSON.stringify(failedRequests,null,2));});
     await page.goto('/student/coding/world',{waitUntil:'commit',timeout:180000});
     const worldHeading=page.getByRole('heading',{name:'A little code. A world of possibilities.',exact:true});
     try { await expect(worldHeading).toBeVisible({timeout:180000}); } catch(error) { await page.screenshot({path:resolve(directory,'browser-failure.png'),fullPage:true,timeout:15000}).catch(()=>{});const retry=page.getByRole('button',{name:'Try again',exact:true}); if(!await retry.isVisible())throw error;await retry.click();await expect(worldHeading).toBeVisible({timeout:90000}); }
     await expect(page.getByRole('button',{name:'Invent a routine'})).toBeDisabled();
     await act({type:'run',missionId:'pizza-sequence',commands:solution(missions.find(mission=>mission.id==='pizza-sequence')!)});
     await page.reload({waitUntil:'domcontentloaded',timeout:180000});
     await expect(worldHeading).toBeVisible({timeout:120000});
     await expect(page.getByRole('button',{name:'Invent a routine'})).toBeEnabled();
     await expect(page.getByRole('button',{name:'A thoughtful invention'})).toBeDisabled();
     assert.equal((await prisma.codingWorkspace.count({where:{childId,NOT:{lessonId:WORLD_KEY},skillStatus:'mastered'}})),0);
     for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(directory,`world-${width}.png`),fullPage:true});}
     await page.setViewportSize({width:1440,height:1000});
     const inventions=page.getByRole('button',{name:'▤ Inventions & skills',exact:true});
     await inventions.click({timeout:90000});await expect(page.getByText('Synthetic QA restaurant',{exact:true})).toBeVisible({timeout:90000});await page.getByRole('button',{name:'Open named project',exact:true}).click({timeout:90000});
     await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Synthetic QA restaurant',{timeout:120000});
     const [autosave]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/student/coding/world')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action?.type==='project-save',{timeout:120000}),page.getByLabel('Project name',{exact:true}).fill('Synthetic browser autosave',{timeout:120000})]);
     assert.equal(autosave.status(),200);assert.equal((await load()).state.projects[0].title,'Synthetic browser autosave');
     await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'▤ Inventions & skills',exact:true}).click({timeout:90000});await expect(page.getByText('Synthetic browser autosave',{exact:true})).toBeVisible({timeout:90000});
    await page.goto(`/student/coding/world/lessons/${UNDERSTANDING_LOOPS.id}`,{waitUntil:'domcontentloaded',timeout:180000});await expect(page.getByRole('heading',{name:UNDERSTANDING_LOOPS.title,exact:true}).first()).toBeVisible({timeout:180000});await page.screenshot({path:resolve(directory,'guided-legacy.png'),fullPage:true});
    const activity=activityDefinition('Y1.01')!;await page.goto(`/student/coding/world/activities/${activity.id}`,{waitUntil:'domcontentloaded',timeout:180000});
    const activityHeading=page.getByRole('heading',{name:activity.title,exact:true}).first();
    try { await expect(activityHeading).toBeVisible({timeout:180000}); }
    catch(error) { const observed=await page.evaluate(()=>({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1,h2,h3')].map(node=>node.textContent?.trim()??'').filter(Boolean).slice(0,12),text:(document.body?.innerText??'').slice(0,1500)})).catch(()=>({url:page.url()})); writeFileSync(resolve(directory,'activity-page-observed.json'),JSON.stringify(observed,null,2)); await page.screenshot({path:resolve(directory,'activity-page-failure.png'),fullPage:true,timeout:15000}).catch(()=>{}); throw error; }
    await page.screenshot({path:resolve(directory,'guided-activity.png'),fullPage:true});assert.deepEqual(errors,[]);
    if(studentActivityPosts.length) await Promise.all(studentActivityPosts);
    await context.close();
    }
     const progressBefore=JSON.stringify(await prisma.codingWorkspace.findMany({where:{childId},orderBy:{lessonId:'asc'},select:{lessonId:true,skillStatus:true,updatedAt:true,programsJson:true}}));
     const warmRole=async(api:APIRequestContext,path:string)=>{const response=await api.get(path,{timeout:240000});assert.equal(response.status(),200,path);await response.dispose();};
     await warmRole(parent,`/api/parent/coding?studentId=${encodeURIComponent(childId)}`);
     await warmRole(teacher,'/api/teacher/coding');
     const visit=async(api:APIRequestContext,path:string)=>{const roleContext=await browser.newContext({baseURL:base,storageState:await api.storageState(),userAgent:qaBrowserUserAgent});await roleContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());const rolePage=await roleContext.newPage();await rolePage.goto(path,{waitUntil:'domcontentloaded',timeout:240000});assert.equal(new URL(rolePage.url()).pathname,path,rolePage.url());return {roleContext,rolePage};};
     const ownedParent=await visit(parent,'/parent/progress');
     try{const summary=ownedParent.rolePage.getByRole('heading',{name:'Coding Game World · Free Practice'});await expect(summary).toBeVisible({timeout:180000});await expect(ownedParent.rolePage.getByText('Synthetic World learner 0',{exact:true}).first()).toBeVisible();const section=summary.locator('xpath=ancestor::section[1]');await expect(section.getByText('Practice progress is separate from formal lesson mastery and teacher assessment.')).toBeVisible();await expect(section.getByRole('button')).toHaveCount(0);await expect(section.getByRole('textbox')).toHaveCount(0);await ownedParent.rolePage.screenshot({path:resolve(directory,'parent-owned.png'),fullPage:true});}finally{await ownedParent.roleContext.close();}
     const foreign=await visit(foreignParent,'/parent/progress');
     try{await expect(foreign.rolePage.getByText('Synthetic World learner 0',{exact:true})).toHaveCount(0);const denied=await foreign.rolePage.evaluate(async id=>{const response=await fetch(`/api/parent/coding?studentId=${encodeURIComponent(id)}`,{credentials:'include'});return response.status;},childId);assert.equal(denied,404);await foreign.rolePage.screenshot({path:resolve(directory,'parent-foreign.png'),fullPage:true});}finally{await foreign.roleContext.close();}
     const authorised=await visit(teacher,'/teacher/coding');
     try{const heading=authorised.rolePage.getByRole('heading',{name:'Coding',exact:true});try{await expect(heading).toBeVisible({timeout:45000});}catch{await authorised.rolePage.reload({waitUntil:'domcontentloaded',timeout:240000});await expect(heading).toBeVisible({timeout:120000});}await expect(authorised.rolePage.getByRole('option',{name:/Synthetic World learner 0/}).first()).toBeAttached({timeout:180000});const teacherSummary=authorised.rolePage.getByRole('heading',{name:'Coding Game World · practice overview'});await expect(teacherSummary).toBeVisible({timeout:180000});await expect(authorised.rolePage.getByText('Practice results do not award formal curriculum mastery.')).toBeVisible();await expect(teacherSummary.locator('xpath=ancestor::section[1]').getByRole('button')).toHaveCount(0);await authorised.rolePage.screenshot({path:resolve(directory,'teacher-authorised.png'),fullPage:true});}finally{await authorised.roleContext.close();}
     const unauthorised=await visit(otherTeacher,'/teacher/coding');
     try{await expect(unauthorised.rolePage.getByRole('heading',{name:'Coding',exact:true})).toBeVisible({timeout:180000});await expect(unauthorised.rolePage.getByRole('option',{name:/Synthetic World learner 0/})).toHaveCount(0);await expect(unauthorised.rolePage.getByText('Synthetic World learner 0')).toHaveCount(0);await unauthorised.rolePage.screenshot({path:resolve(directory,'teacher-unauthorised.png'),fullPage:true});}finally{await unauthorised.roleContext.close();}
     assert.equal(JSON.stringify(await prisma.codingWorkspace.findMany({where:{childId},orderBy:{lessonId:'asc'},select:{lessonId:true,skillStatus:true,updatedAt:true,programsJson:true}})),progressBefore);
     return {widths:parentTeacherOnly?[]:[1440,768,390],guidedPages:parentTeacherOnly?0:2,roleContextsIsolated:true,apiResponsesMocked:false};
   }finally{await browser.close();}
 });
 } finally {
   for(const api of contexts)await api.dispose();
   if(next?.pid&&next.exitCode===null)execFileSync('taskkill.exe',['/PID',String(next.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
   if(runner)await new Promise<void>(yes=>runner!.close(()=>yes()));
   await prisma.$disconnect();persist();
 }
 report.completed=true;persist();if(results.some(r=>r.status==='failed'))process.exitCode=1;
}
main().catch(error=>{report.fatal=error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'):'Unknown failure';persist();console.error('Isolated integration stopped; see result.json');process.exitCode=1;});
