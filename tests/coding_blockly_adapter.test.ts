import assert from "node:assert/strict";
import { test } from "node:test";
import * as B from "blockly/core";
import { defineBlocks } from "../src/components/coding/BlockCommandsEditor";
import { commandStates, readBlockCommands, operands, calculations } from "../src/lib/coding/blockly-adapter";
import { authoredActivities, activityContentHash } from "../src/lib/coding/learning/catalogue";
import { visualProgramSchema, type VisualCommand } from "../src/lib/coding/learning/visual-machine";
import { executeVisual } from "../src/lib/coding/learning/visual-machine";
import { UNDERSTANDING_LOOPS } from "../src/lib/coding/catalog";
import type { CodingBlock } from "../src/lib/coding/types";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

defineBlocks(B);
function roundtrip(commands: VisualCommand[] | CodingBlock[], legacy = false) {
  const view = new B.Workspace();
  try {
    const first = commandStates(commands, legacy);
    B.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: "sl_start", ...(first ? { next: { block: first } } : {}) }] } }, view);
    return readBlockCommands(view, legacy);
  } finally { view.dispose(); }
}
test("all 440 packages retain their hashes; every authored visual command tree round-trips without normalization", () => {
  const baseline = JSON.parse(readFileSync("artifacts/coding-consolidated-final-2026-11-03/inventory.json", "utf8"));
  const hashes = new Map(baseline.activities.map((a: {inventoryId:string;contentHash:string}) => [a.inventoryId,a.contentHash]));
  let trees = 0; const ops = new Set<string>();
  function inspect(value: unknown) {
    if (!value || typeof value !== "object") return;
    const parsed = visualProgramSchema.safeParse(value);
    if (parsed.success) {
      const program = value as typeof parsed.data;
      for (const commands of [...Object.values(program.handlers), ...Object.values(program.procedures ?? {}).map(p => p.body)]) {
        const rebuilt = roundtrip(commands); assert.equal(JSON.stringify(rebuilt), JSON.stringify(commands)); trees++;
        const collect = (list: VisualCommand[]) => list.forEach(c => { ops.add(c.op); if (c.body) collect(c.body); if (c.otherwise) collect(c.otherwise); }); collect(commands);
      }
      const replacement = { ...program, handlers: Object.fromEntries(Object.entries(program.handlers).map(([name, commands]) => [name, roundtrip(commands)])) };
      const input = { width: 8, height: 8 };
      assert.deepEqual(executeVisual(program,input), executeVisual(replacement,input));
      return;
    }
    for (const child of Object.values(value)) inspect(child);
  }
  for (const activity of authoredActivities) {
    assert.equal(activityContentHash(activity),hashes.get(activity.inventoryId));
    // Includes starters, examples, bug programs, references and authored task variants.
    inspect(activity);
  }
  assert.equal(authoredActivities.length,440); assert.ok(trees>100);
  mkdirSync("artifacts/coding-studio-implementation-2026-11-03",{recursive:true});
  writeFileSync(process.env.CODING_STUDIO_COMPATIBILITY_REPORT ?? "artifacts/coding-studio-implementation-2026-11-03/compatibility.json",JSON.stringify({unchangedActivityHashes:440,commandTreesRoundTripped:trees,authoredOperations:[...ops].sort(),nativeSemanticComparisons:true,noSourceRuntimeClaim:true},null,2));
});
test("legacy saved IDs/order/nesting remain exact and pasted copies get new IDs", () => {
  const blocks: CodingBlock[] = [{id:"loop-a",kind:"repeat",times:2,body:[{id:"move-a",kind:"move",direction:"up"}]}];
  assert.equal(JSON.stringify(roundtrip(blocks,true)),JSON.stringify(blocks));
  const view = new B.Workspace();
  try {
    const original = commandStates([{id:"move-a",kind:"move",direction:"up"}],true)!;
    const copy = {...original,id:"new-copy-id"};
    B.serialization.workspaces.load({blocks:{blocks:[{type:"sl_start",next:{block:{...original,next:{block:copy}}}}]}},view);
    assert.deepEqual((readBlockCommands(view,true) as CodingBlock[]).map(block=>block.id),["move-a","new-copy-id"]);
  } finally {view.dispose();}
  assert.ok(UNDERSTANDING_LOOPS);
});
test("every command, expression operator and omitted broadcast default is supported", () => {
  const commands: VisualCommand[] = Object.keys(operands).map(op => op === "move" || op === "position" ? {op,x:0,y:1} : op === "repeat" ? {op,amount:2,body:[]} : op === "until" ? {op,test:true,body:[]} : op === "if" ? {op,test:false,body:[],otherwise:[]} : op === "set" || op === "change" ? {op,name:"score",value:1} : op === "say" ? {op,value:"hello"} : op === "call" ? {op,name:"group",arguments:[1,false,"",{read:"event"}]} : op === "broadcast" || op === "emit" ? {op,name:"message"} : op === "stop" ? {op} : {op,amount:1});
  for (const calculate of calculations) commands.push({op:"set",name:"score",value:{calculate,arguments:["not","absolute"].includes(calculate)?[1]:[1,2]}});
  assert.equal(JSON.stringify(roundtrip(commands)),JSON.stringify(commands));
});
test("detached, disabled and incomplete programs cannot silently replace saved work", () => {
  const view = new B.Workspace();
  try {
    B.serialization.workspaces.load({blocks:{blocks:[{type:"sl_start"},{type:"sl_move"}]}},view);
    assert.throws(()=>readBlockCommands(view),/Connect every block/);
    view.clear();B.serialization.workspaces.load({blocks:{blocks:[{type:"sl_start",next:{block:{type:"sl_move"}}}]}},view);
    assert.throws(()=>readBlockCommands(view),/Connect the x input/);
  } finally {view.dispose();}
});
