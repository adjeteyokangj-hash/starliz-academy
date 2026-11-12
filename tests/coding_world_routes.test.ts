import test, { before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initialWorld, transitionWorld, missions } from "../src/lib/coding/world/model";

// Actual route/store modules, isolated boundary doubles only. No database,
// account, AI, runner or Human Support requests leave this process.
const globalFixture = globalThis as typeof globalThis & { __worldContinuationHarness: Record<string, unknown> };
const requireModule=createRequire(resolve("package.json"));
let route: { GET(request:Request):Promise<Response>; POST(request:Request):Promise<Response> };
let store: { loadWorld(childId:string,year:string|null,options?:{before?:string}):Promise<unknown>; updateWorld(childId:string,year:string|null,revision:number,action:unknown):Promise<unknown> };
let legacyRoute: { GET(request:Request, context:unknown):Promise<Response>; POST(request:Request, context:unknown):Promise<Response> };
let activityRoute: typeof legacyRoute;
let guidedPage: (props:unknown)=>Promise<{props:Record<string,unknown>}>;
let state=initialWorld(), denied=false; const calls:Array<{name:string;args:unknown[]}> = [];
const child={id:"owned-child",yearGroup:"Year 3"};
const row={id:"owned-workspace",childId:child.id,lessonId:"curriculum:game-world:v1",programsJson:JSON.stringify(state)};
let interfere=false;
const fakeDb={
  codingWorkspace:{findUnique:async(args:unknown)=>{calls.push({name:"findWorkspace",args:[args]});return structuredClone(row);},updateMany:async(args:{where:{programsJson:string;childId:string};data:{programsJson:string}})=>{calls.push({name:"compareAndSwap",args:[args]});if(args.where.programsJson!==row.programsJson||args.where.childId!==row.childId)return{count:0};row.programsJson=args.data.programsJson;return{count:1};}},
  codingProjectVersion:{findFirst:async(args:{where:{id:string;workspaceId:string}})=>{calls.push({name:"ownedCursor",args:[args]});return args.where.id==="owned-cursor"&&args.where.workspaceId===row.id?{id:"owned-cursor"}:null;},findMany:async(args:unknown)=>{calls.push({name:"versionsQuery",args:[args]});return [];},create:async(args:unknown)=>{calls.push({name:"snapshotCreate",args:[args]});return{id:"new-version"};}},
  $transaction:async(fn:(db:unknown)=>Promise<unknown>)=>fn(fakeDb),
};
before(async()=>{
  const dir=resolve("artifacts","coding-world-isolated",randomUUID());mkdirSync(dir,{recursive:true});
  const compile=async(entry:string,name:string,storeMode=false)=>{
    const file=resolve(dir,`${name}.cjs`);
    const modules:Record<string,string>={
      "@/lib/coding/student-context":`exports.requireCodingLearner=async context=>globalThis.__worldContinuationHarness.guard(context);`,
      "@/lib/api_guard":`exports.checkRateLimit=()=>({allowed:true});`,
      "@/lib/auth":`exports.readSessionFromCookie=async()=>({userId:"owned-user"});`,
      "@/lib/coding/world/content-references":`exports.publishedGuidedLocation=async(id,kind,fallback)=>fallback;`,
      "@/components/coding/CodingLessonWorkspace":`exports.default=function Lesson(){};`,
      "@/lib/coding/settings":`exports.codingAssistanceEnabled=async()=>false;`,
      "@/lib/coding/human-support":`exports.requestCodingHumanSupport=async()=>({ok:false,error:'No live support',status:403});`,
      "@/lib/coding/workspace-store":`exports.loadCodingWorkspace=async(childId)=>({childId});for(const name of ['askCodingTutor','openCodingStage','restoreCodingStarter','runCodingStage','saveCodingProgram','submitCodingPrompt','undoCodingProgram'])exports[name]=async(...args)=>globalThis.__worldContinuationHarness.legacyWrite(...args);`,
      "@/lib/coding/learning/workspace-store":`exports.loadActivityWorkspace=async(childId)=>({childId});exports.actOnActivityWorkspace=(...args)=>globalThis.__worldContinuationHarness.activityWrite(...args);exports.runLessonExample=(...args)=>globalThis.__worldContinuationHarness.exampleWrite(...args);`,
      "@/lib/db":`exports.prisma=globalThis.__worldContinuationHarness.db;`,
      "@/lib/coding/world/content":`exports.publishedWorldCopy=async()=>[];exports.extendWorldMissions=()=>globalThis.__worldContinuationHarness.missions;`,
    };
    if(!storeMode)modules["@/lib/coding/world/store"]=`exports.WorldConflict=class WorldConflict extends Error{};exports.loadWorld=(...args)=>globalThis.__worldContinuationHarness.load(...args);exports.updateWorld=(...args)=>globalThis.__worldContinuationHarness.update(...args);`;
    await build({entryPoints:[entry],outfile:file,bundle:true,platform:"node",format:"cjs",packages:"external",plugins:[{name:"isolated-boundaries",setup(builder){builder.onResolve({filter:/.*/},args=>{
      if(modules[args.path])return{path:args.path,namespace:"boundary"};
      if(storeMode&&args.importer.endsWith("world\\store.ts")||storeMode&&args.importer.endsWith("world/store.ts")){
        if(args.path==="./content")return{path:"content-double",namespace:"boundary"};
        if(args.path==="./companion")return{path:"companion-double",namespace:"boundary"};
        if(args.path==="./source")return{path:"source-double",namespace:"boundary"};
        if(args.path==="../human-support")return{path:"support-double",namespace:"boundary"};
      }
    });builder.onLoad({filter:/.*/,namespace:"boundary"},args=>({loader:"js",contents:modules[args.path]??({"content-double":`exports.publishedWorldMissions=async()=>globalThis.__worldContinuationHarness.available();`,"companion-double":`exports.worldCompanionHint=async(id,message)=>({message,source:'fallback'});`,"source-double":`exports.runWorldSource=async()=>{throw Error('isolated source unavailable')};`,"support-double":`exports.requestCodingAssistanceForHandoff=async()=>({ok:false,error:'No live support in isolated tests'});`}[args.path]??"")}));}}]});
    return requireModule(file);
  };
  globalFixture.__worldContinuationHarness={
    db:fakeDb,missions,
    legacyWrite:(...args:unknown[])=>{calls.push({name:"legacyWrite",args});return{ok:true};},
    activityWrite:(...args:unknown[])=>{calls.push({name:"activityWrite",args});return{};},
    exampleWrite:(...args:unknown[])=>{calls.push({name:"exampleWrite",args});return{};},
    guard:async(context:unknown)=>{calls.push({name:"guard",args:[context]});return denied?{child:null,response:new Response("Denied",{status:403})}:{child,response:null};},
    load:async(...args:unknown[])=>{calls.push({name:"load",args});return{state,versions:[],nextCursor:null};},
    update:async(...args:unknown[])=>{calls.push({name:"update",args});const result=transitionWorld(state,args[3] as Parameters<typeof transitionWorld>[1]);state=result.state;return{...result,versions:[],nextCursor:null};},
    available:()=>{if(interfere){row.programsJson=JSON.stringify({...initialWorld(),revision:99});interfere=false;}return missions;},
  };
  route=await compile("src/app/api/student/coding/world/route.ts","route");
  store=await compile("src/lib/coding/world/store.ts","store",true);
  legacyRoute=await compile("src/app/api/student/coding/lessons/[lessonId]/route.ts","legacy-route");
  activityRoute=await compile("src/app/api/student/coding/activities/[activityId]/route.ts","activity-route");
  guidedPage=(await compile("src/app/student/coding/world/lessons/[lessonId]/page.tsx","guided-page")).default;
});
const post=(body:unknown)=>new Request("https://world.example.invalid/api/student/coding/world",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
test("world route passes booking context, derives learner scope and rejects stale UI identity",async()=>{
  state=initialWorld();calls.length=0;
  assert.equal((await route.POST(post({learnerId:"other-child",bookingId:"owned-booking",revision:0,action:{type:"save",missionId:"pizza-sequence",commands:[]}}))).status,409);
  assert.equal(calls.some(call=>call.name==="update"),false);
  assert.deepEqual(calls.find(call=>call.name==="guard")?.args,[{bookingId:"owned-booking"}]);
  const response=await route.POST(post({learnerId:child.id,revision:0,action:{type:"save",missionId:"pizza-sequence",commands:[]}}));assert.equal(response.status,200);
  assert.equal(calls.find(call=>call.name==="update")?.args[0],child.id);
});
test("denied, cross-site and oversized world requests never write",async()=>{
  calls.length=0;denied=true;
  assert.equal((await route.GET(new Request("https://world.example.invalid/api/student/coding/world"))).status,403);denied=false;
  const request=post({});request.headers.set("sec-fetch-site","cross-site");assert.equal((await route.POST(request)).status,403);
  assert.equal((await route.POST(post({payload:"x".repeat(70000)}))).status,400);
  assert.equal(calls.some(call=>["load","update"].includes(call.name)),false);
});
test("history pagination validates cursor ownership in the real store before fetching history",async()=>{
  row.programsJson=JSON.stringify(initialWorld());calls.length=0;
  await assert.rejects(store.loadWorld(child.id,child.yearGroup,{before:"foreign-cursor"}),/not available to this learner/);
  assert.equal(calls.some(call=>call.name==="versionsQuery"),false);
  await store.loadWorld(child.id,child.yearGroup,{before:"owned-cursor"});
  const query=calls.find(call=>call.name==="versionsQuery")!.args[0] as {where:{workspaceId:string};cursor:{id:string};take:number};
  assert.equal(query.where.workspaceId,row.id);assert.equal(query.cursor.id,"owned-cursor");assert.equal(query.take,41);
});
test("real store rejects stale revisions and concurrent overwrites before creating a snapshot",async()=>{
  row.programsJson=JSON.stringify(initialWorld());calls.length=0;
  await assert.rejects(store.updateWorld(child.id,child.yearGroup,99,{type:"snapshot",missionId:"pizza-sequence",commands:[]}),/another window/);
  interfere=true;await assert.rejects(store.updateWorld(child.id,child.yearGroup,0,{type:"snapshot",missionId:"pizza-sequence",commands:[]}),/another window/);
  assert.equal(calls.some(call=>call.name==="snapshotCreate"),false);
  assert.equal(JSON.parse(row.programsJson).revision,99);
});

test("real store retains written work when the isolated runner is unavailable",async()=>{
  row.programsJson=JSON.stringify(initialWorld());calls.length=0;
  const source="function solve(world) { return []; }";
  const result=await store.updateWorld(child.id,child.yearGroup,0,{type:"source-run",missionId:"pizza-sequence",language:"javascript",source}) as {run:{ok:boolean;feedback:string}};
  assert.equal(result.run.ok,false);assert.match(result.run.feedback,/unavailable/);
  const saved=JSON.parse(row.programsJson);assert.equal(saved.sources["pizza-sequence"].source,source);assert.deepEqual(saved.completed,[]);
});

test("canonical guided routes reject stale learner headers before saves and example execution",async()=>{
  calls.length=0;denied=false;
  const legacyContext={params:Promise.resolve({lessonId:"understanding-loops"})},activityContext={params:Promise.resolve({activityId:"what-is-an-instruction"})};
  for(const [handler,path,context,body] of [
    [legacyRoute,"/lessons/understanding-loops",legacyContext,{action:"save",stage:"build",program:{blocks:[]}}],
    [activityRoute,"/activities/what-is-an-instruction",activityContext,{action:"save",stage:"build",revision:"1"}],
    [activityRoute,"/activities/what-is-an-instruction?lessonExample=1",activityContext,{}],
  ] as const){
    const request=new Request(`https://world.example.invalid/api/student/coding${path}`,{method:"POST",headers:{"content-type":"application/json","X-Coding-Learner":"previous-child"},body:JSON.stringify(body)});
    assert.equal((await handler.POST(request,context)).status,409);
  }
  assert.equal(calls.some(call=>["legacyWrite","activityWrite","exampleWrite"].includes(call.name)),false);
  assert.equal((await legacyRoute.GET(new Request("https://world.example.invalid/api/student/coding/lessons/understanding-loops"),legacyContext)).headers.get("X-Coding-Learner"),child.id);
  assert.equal((await activityRoute.GET(new Request("https://world.example.invalid/api/student/coding/activities/what-is-an-instruction"),activityContext)).headers.get("X-Coding-Learner"),child.id);
});

test("guided page whitelists booking context instead of forwarding arbitrary query props",async()=>{
  const view=await guidedPage({params:Promise.resolve({lessonId:"understanding-loops"}),searchParams:Promise.resolve({bookingId:"owned-booking",daytimePeriodId:"owned-period",lessonId:"other-lesson",endpoint:"https://example.invalid/collect",worldLocation:"pets"})});
  assert.equal(view.props.lessonId,"understanding-loops");assert.equal(view.props.bookingId,"owned-booking");assert.equal(view.props.daytimePeriodId,"owned-period");assert.equal(view.props.worldLocation,"robot");assert.equal(view.props.endpoint,undefined);
});
