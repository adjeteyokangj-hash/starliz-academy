import { visual, scenario, eq } from "../authoring";
import { engineeringBase } from "./team-increment-lessons";
import { inventoryContexts } from "./inventory-service-tools";
import { inventoryWebArtifact, webServiceCases } from "./inventory-web-tools";

export function capstonePlan(index: number, faulty = false) {
  return visual({ ...engineeringBase(index), purpose: `Let the fictional organiser of ${inventoryContexts[index]!.title} save and reopen a bounded stock change with truthful failure feedback.`, audience: "A fictional organiser using keyboard or touch; no real learner records", notes: "Included: private Add/Remove, confirmed revisions, refusal feedback, snapshot reopening. Excluded: public hosting, payment, personal data, offline operation and untested safety claims. Evidence: actual HTTP receipts, DOM controls, SQLite reopening and separately recorded browser checks.", milestoneBudget: 10 + index,
    tasks: [{ id: "brief", dependsOn: [], effort: 1, need: "The organiser needs one bounded observable task and explicit exclusions.", criterion: { measure: "documented included and excluded behaviours", comparison: "at-least", target: 4 } }, { id: "prototype", dependsOn: ["brief"], effort: 2, need: "A keyboard user needs native named controls for the core save task.", criterion: { measure: "reachable native actions", comparison: "at-least", target: 2 } }, { id: "integrate", dependsOn: ["prototype"], effort: faulty ? 30 : 4 + index, need: "The organiser needs the displayed result to match actual persisted service state.", criterion: { measure: "passing real read/write/reopen cases", comparison: "at-least", target: 3 } }, { id: "evaluate", dependsOn: ["integrate"], effort: 3, need: "A reviewer needs all accepted and refused outcomes and explicit limitations.", criterion: { measure: "observed success and refusal cases", comparison: "at-least", target: 3 } }] });
}
export function capstonePlanCases(id: string, index: number) { return ["owner", "editor"].map(role => scenario(`${id}-${role}`, { role }, eq("taskOrder", ["brief", "prototype", "integrate", "evaluate"], "The bounded evidence plan has an executable dependency order"), eq("estimatedEffort", 10 + index, "The actual planned effort respects the brief's stated available capacity"), eq("budgetFits", true, "The repaired scope fits the supplied capacity rather than keeping an impossible commitment"), eq("needsExplicit", true, "Every real planned task ties a user need to an observable measurable criterion"), eq("audience", "A fictional organiser using keyboard or touch; no real learner records", "The brief identifies a bounded fictional user without requesting personal information"), eq("notes", "Included: private Add/Remove, confirmed revisions, refusal feedback, snapshot reopening. Excluded: public hosting, payment, personal data, offline operation and untested safety claims. Evidence: actual HTTP receipts, DOM controls, SQLite reopening and separately recorded browser checks.", "Scope exclusions and the evidence plan remain explicit, separate from delivery claims"))); }
export type CapstoneFault = "prototype" | "contract" | "keyboard" | "saved-version";
export function capstoneArtifact(index: number, fault?: CapstoneFault) {
  const artifact = inventoryWebArtifact(index, fault === "keyboard" ? "keyboard" : null);
  if (artifact.type !== "source") throw new Error("A capstone requires the actual source workspace");
  let source = artifact.source;
  if (fault === "prototype") source = source.replace("save.disabled=false;", "save.disabled=true;");
  if (fault === "contract") source = source.replace("expectedRevision:current.revision", "expected_revision:current.revision");
  if (fault === "saved-version") source = source.replace("render(body.item);", "render({...body.item,quantity:0});");
  return { ...artifact, source };
}
export function capstoneCases(id: string, index: number) { return webServiceCases(id, index); }
