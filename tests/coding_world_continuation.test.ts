import test from "node:test";
import assert from "node:assert/strict";
import { missions, initialWorld, transitionWorld, worldActionSchema, worldStateSchema, runMission } from "../src/lib/coding/world/model";
import { runSimulation } from "../src/lib/coding/world/simulation";
import { guidedLocation, guidedHref, recommendGuided, type GuidedEntry } from "../src/lib/coding/world/guided-mapping";
import type { LocationId } from "../src/lib/coding/world/model";
const programs: Record<LocationId, (scenario: boolean) => string[]> = {
  pizza: s => Array.from({ length: 2 }, () => ["prepare", s ? "plantTop" : "top", "bake", "wait", "wait", "wait", "serve"]).flat(),
  robot: () => ["north","north","east","east","east","south","pickup","east","east","north","drop"],
  farm: () => ["bed1","plant","water","bed2","plant","water","wait","wait","bed1","harvest","bed2","harvest"],
  traffic: s => ["northGreen", ...Array(s ? 3 : 2).fill("tick"), "allRed", "eastGreen", "tick", "tick", "allRed", "cross", "cross"],
  space: s => ["fuel","fuel","fuel","fuel", ...(s ? ["shield"] : []), "launch","travel","travel","scan","collect","collect","returnHome","dock"],
  pets: s => ["pet1", s ? "gentleFood" : "feed", s ? "gentleFood" : "feed", "wash","play","rest","pet2","feed","feed","wash","play","rest"],
};
for (const location of Object.keys(programs) as LocationId[]) test(`${location} living system changes actual resources and passes both situations`, () => {
  for (const scenario of [false,true]) {
    const result = runSimulation(location, programs[location](scenario), scenario);
    assert.equal(result.ok, true, result.feedback);
    assert.equal(result.state.tick, programs[location](scenario).length);
    assert.ok(result.frames.length > 5);
    const run = runMission(`${location}-living`, programs[location](scenario).map(name => ({ op: "emit", name })), { fixtures: [scenario] });
    assert.equal(run.ok, true, run.feedback); assert.ok(run.frames.at(-1)!.simulation);
  }
});
test("living systems reject unsafe serving, traffic, collisions, fuel and diets", () => {
  assert.equal(runSimulation("pizza",["prepare","top","bake","serve"]).ok,false);
  assert.match(runSimulation("traffic",["northGreen","cross"]).feedback,/Pedestrians/);
  assert.match(runSimulation("robot",["east","east"]).feedback,/obstacle/);
  assert.match(runSimulation("space",["launch"]).feedback,/fuel/);
  assert.match(runSimulation("pets",["feed"],true).feedback,/gentleFood/);
  assert.equal(runSimulation("farm",["plant","harvest"]).ok,false);
});
test("old saves receive additive personalisation defaults and every original mission remains", () => {
  const current=initialWorld(); const { appearance, room, projects, position, simulations, ...legacy }=current;
  assert.deepEqual(worldStateSchema.parse(legacy), current);
  assert.equal(missions.filter(m=>m.chapter<5).length,21);
  assert.equal(missions.length,27);
  void appearance;void room;void projects;void position;void simulations;
});
test("decoration occupancy, locked accessories and malformed room data fail closed", () => {
  const state=initialWorld(), item={id:"89bc83ba-27be-4c5e-b858-c95679ee5e5a",item:"sunflower" as const,x:2,y:3,rotation:"0" as const};
  const saved=transitionWorld(state,{type:"room",room:{floor:"wood",decorations:[item]}}).state;
  assert.equal(saved.room.decorations.length,1); assert.equal(state.room.decorations.length,0);
  assert.throws(()=>transitionWorld(saved,{type:"room",room:{floor:"wood",decorations:[item,{...item,id:"28e3df75-92af-477e-92bc-eb5b8eb3a19e"}]}}));
  assert.throws(()=>transitionWorld(state,{type:"appearance",appearance:{...state.appearance,accessory:"star"}}));
  assert.equal(worldActionSchema.safeParse({type:"room",room:{floor:"wood",decorations:[{...item,x:999}]}}).success,false);
});
test("named projects autosave separately and cannot grant lesson or practice completion", () => {
  const project={id:"89bc83ba-27be-4c5e-b858-c95679ee5e5a",title:"My first restaurant",missionId:"pizza-sequence",language:"blocks" as const,commands:[]};
  const state=transitionWorld(initialWorld(),{type:"project-save",project}).state;
  const next=transitionWorld(state,{type:"save",missionId:project.missionId,projectId:project.id,commands:[{op:"emit",name:"prepare"}]}).state;
  assert.equal(next.projects[0]!.commands.length,1); assert.equal(state.projects[0]!.commands.length,0); assert.equal(next.completed.length,0);
  assert.throws(()=>transitionWorld(state,{type:"save",missionId:"farm-sequence",projectId:project.id,commands:[]}));
});
test("guided recommendations respect assignments and existing unlock decisions", () => {
  const entry: GuidedEntry={id:"lesson",kind:"activity",title:"Lesson",objective:"Objective",year:3,location:"robot",status:"not_started",unlocked:true,assignmentStatus:"available",href:"/lesson",prerequisites:[],stage:"discover"};
  assert.equal(recommendGuided([entry,{...entry,id:"assigned",assignmentStatus:"assigned",year:6},{...entry,id:"locked",assignmentStatus:"assigned",unlocked:false}],3)?.id,"assigned");
  assert.equal(guidedLocation({engine:"data",year:3}),"farm");
  assert.match(guidedHref("activity","Y3.02",{bookingId:"booking 1",daytimePeriodId:"period"}),/world\/activities\/Y3.02\?bookingId=booking\+1&daytimePeriodId=period/);
});

test("sandbox state resumes without awarding progress or running a background clock", () => {
  const state=transitionWorld(initialWorld(),{type:"sandbox",location:"pizza",command:"prepare"}).state;
  const restored=worldStateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.simulations.pizza?.values.flour,1);assert.equal(restored.simulations.pizza?.tick,1);assert.equal(restored.completed.length,0);
  assert.deepEqual(restored.simulations,state.simulations);
  assert.throws(()=>transitionWorld(state,{type:"sandbox",location:"pizza",command:"eval"}));
});
import { newWorldId } from "../src/lib/coding/world/identity";
test("local preview record IDs remain valid UUIDs without randomUUID",()=>{
  const provider={getRandomValues<T extends ArrayBufferView|null>(array:T):T{if(array)new Uint8Array(array.buffer,array.byteOffset,array.byteLength).fill(7);return array;}};
  assert.match(newWorldId(provider),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
