import test from "node:test";
import assert from "node:assert/strict";
import { publicationTransition, worldContentDraftSchema } from "../src/lib/coding/world/content-policy";
test("world content requires independent sequential approval and explicit publication enablement", () => {
  assert.equal(publicationTransition("draft", "submit", "author", "author", false), "review");
  assert.throws(() => publicationTransition("review", "approve", "author", "author", true));
  assert.equal(publicationTransition("review", "approve", "author", "reviewer", false), "approved");
  assert.throws(() => publicationTransition("approved", "publish", "author", "reviewer", false));
  assert.equal(publicationTransition("approved", "publish", "author", "reviewer", true), "published");
  assert.throws(() => publicationTransition("draft", "publish", "author", "reviewer", true));
});
test("content studio cannot publish executable code, unknown missions or unsafe contact instructions", () => {
  const draft = { missionId: "pizza-sequence", title: "A good beginning", objective: "Prepare the ingredients in a clear sequence.", dialogue: "What happens before the pizza is baked?" };
  assert.equal(worldContentDraftSchema.safeParse(draft).success, true);
  assert.equal(worldContentDraftSchema.safeParse({ ...draft, script: "eval('anything')" }).success, false);
  assert.equal(worldContentDraftSchema.safeParse({ ...draft, missionId: "new-unreviewed-engine" }).success, false);
  assert.equal(worldContentDraftSchema.safeParse({ ...draft, dialogue: "Tell me your phone number." }).success, false);
});
import { worldContentMetadataSchema, assertWorldPackConflicts } from "../src/lib/coding/world/content-policy";
import { validateWorldCurriculumLinks } from "../src/lib/coding/world/content-references";
import { extendWorldMissions } from "../src/lib/coding/world/content";
import { initialWorld, transitionWorld, missionCompletionCount } from "../src/lib/coding/world/model";

test("studio metadata accepts chapters and fixed templates but rejects executable payloads and unknown prerequisites",()=>{
  const metadata={chapter:{title:"Restaurant inventors",order:2},curriculumLinks:[{kind:"lesson",id:"understanding-loops"}],extensions:[{id:"extra-pizza-catering",title:"Careful catering",objective:"Serve the academy orders safely with the requested toppings.",simulation:"pizza",prerequisites:["pizza-loop"]}]};
  assert.equal(worldContentMetadataSchema.safeParse(metadata).success,true);
  assert.equal(worldContentMetadataSchema.safeParse({...metadata,engineSource:"eval('run')"}).success,false);
  assert.equal(worldContentMetadataSchema.safeParse({...metadata,extensions:[{...metadata.extensions[0],prerequisites:["unknown-mission"]}]}).success,false);
  const parsed=worldContentMetadataSchema.parse(metadata);assert.throws(()=>assertWorldPackConflicts(parsed,[parsed]));
  const content={missionId:"pizza-sequence",title:"A good beginning",objective:"Prepare ingredients in a safe order.",dialogue:"What is your first action?",metadata:parsed};
  validateWorldCurriculumLinks(content,true);
  assert.throws(()=>validateWorldCurriculumLinks({...content,metadata:{...parsed,curriculumLinks:[{kind:"activity",id:"missing-lesson"}]}},false));
  const missions=extendWorldMissions([{...content,version:1}]);const extra=missions.find(mission=>mission.id==="extra-pizza-catering")!;
  assert.equal(extra.simulation,"pizza");const earned=initialWorld();earned.completed=[extra.id];assert.equal(missionCompletionCount(earned,"pizza",missions),1);assert.deepEqual(extra.prerequisites,["pizza-sequence","pizza-loop"]);
  assert.throws(()=>transitionWorld(initialWorld(),{type:"run",missionId:extra.id,commands:[]},missions));
});
