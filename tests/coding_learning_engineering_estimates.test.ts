import test from "node:test";
import assert from "node:assert/strict";
import { engineeringBase } from "../src/lib/coding/learning/content/team-increment-lessons";
import { executeEngineering } from "../src/lib/coding/learning/engineering-engine";

test("the real plan computes total and dependency-path effort without treating unknown estimates as zero", async () => {
  const document = { ...engineeringBase(0), milestoneBudget: 8, tasks: [{ id: "contract", dependsOn: [], effort: 2, need: "The user needs an explicit contract.", criterion: { measure: "contract cases", comparison: "at-least", target: 2 } }, { id: "logic", dependsOn: ["contract"], effort: 3, need: "The user needs actual working logic.", criterion: { measure: "passing checks", comparison: "at-least", target: 3 } }, { id: "interface", dependsOn: ["contract"], effort: 4, need: "The user needs a keyboard interface.", criterion: { measure: "reachable controls", comparison: "at-least", target: 2 } }] };
  const execution = await executeEngineering(document, { role: "owner" }); assert.equal(execution.ok, true);
  const output = execution.output as Record<string, unknown>; assert.equal(output.estimatedEffort, 9); assert.equal(output.criticalPathEffort, 6); assert.equal(output.budgetFits, false);
  const incomplete = { ...document, tasks: document.tasks.map((item, index) => { const next: Omit<typeof item, "effort"> & { effort?: number } = { ...item }; if (index === 1) delete next.effort; return next; }) };
  const unknown = (await executeEngineering(incomplete, { role: "owner" })).output as Record<string, unknown>;
  assert.equal(unknown.estimatesComplete, false); assert.equal(unknown.estimatedEffort, null); assert.equal(unknown.budgetFits, null);
});
