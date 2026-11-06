import { firstInstructionsPackages } from "../../curriculum/first-instructions";
import { routeEvaluationSchema, type RouteCase } from "../../curriculum/route-engine";
import type { CodingBlock, CodingProgram } from "../../types";
import { authorLesson, machine, move, repeat, scenario, eq, range, includes } from "../authoring";
import type { PracticalArtifact, Predicate } from "../types";

function commands(blocks: CodingBlock[]): unknown[] {
  return blocks.map((block) => block.kind === "repeat" ? repeat(block.times, commands(block.body)) :
    move(block.direction === "right" ? 1 : block.direction === "left" ? -1 : 0, block.direction === "up" ? 1 : block.direction === "down" ? -1 : 0));
}
function convert(artifact: unknown): PracticalArtifact { return machine({ start: commands((artifact as CodingProgram).blocks) }); }
function routeCase(id: string, specification: RouteCase) {
  return scenario(id, { start: specification.start }, eq("x", specification.goal.x, "The route reaches the correct column"),
    eq("y", specification.goal.y, "The route reaches the correct row"), range("moves", 1, specification.maxSteps, "The route stays within its movement budget"),
    ...specification.checkpoints.map((stop) => includes("visits", stop, `The route visits parcel stop ${stop.x + 1}, ${stop.y + 1}`)),
    { path: "visits", ordered: specification.checkpoints, description: "Parcel stops are visited in delivery order" } satisfies Predicate);
}
const shifted = (spec: RouteCase): RouteCase => ({ ...spec, start: { x: spec.start.x + 1, y: spec.start.y + 1 }, goal: { x: spec.goal.x + 1, y: spec.goal.y + 1 }, checkpoints: spec.checkpoints.map((p) => ({ x: p.x + 1, y: p.y + 1 })) });

const concepts = [["command", "action"], ["sequence", "order"], ["prediction", "trace"], ["debug", "direction"], ["plan", "destination"], ["project", "route"]];
export const firstRouteActivities = firstInstructionsPackages.map((draft, index) => {
  const spec = routeEvaluationSchema.parse(draft.evaluationSpec), prediction = spec.stages.predict!, build = spec.stages.build!, debug = spec.stages.debug!;
  const reference = (stage: string) => convert(draft.referenceArtifacts.find((artifact) => artifact.stage === stage)!.artifact);
  return authorLesson({ id: draft.inventoryId, explanation: `${draft.stages[0]!.instruction} The dot shows where the character is now. The star is the destination. Run starts from the same square each time, so you can compare one change fairly.`,
    reasoning: [draft.stages[0]!.teacherGuide, "Read the trace from the starting square. Check each arrow in order; a correct final square alone does not prove that every required stop was visited."],
    concepts: concepts[index]!, reference: reference("build"), starter: machine({ start: [] }), faulty: convert(draft.fault.artifact),
    cases: [routeCase("delivery", build), routeCase("new-start", shifted(build))],
    debugReference: reference("debug"), debugCases: [routeCase("repair", debug), routeCase("repair-new-start", shifted(debug))],
    transfer: draft.independentVariants.map((variant) => ({ task: variant.task + ` Start at column ${spec.independent[variant.id]![variant.heldOutCaseIds[0]!]!.start.x + 1}, row ${spec.independent[variant.id]![variant.heldOutCaseIds[0]!]!.start.y + 1}; follow the new map's destination and stops.`,
      reference: convert(variant.referenceArtifact), cases: variant.heldOutCaseIds.map((id) => routeCase(id, spec.independent[variant.id]![id]!)) })),
    prediction: { artifact: reference("predict"), input: { start: prediction.start }, prompt: "Follow the supplied arrows without running. Where will the character finish?",
      choices: [`Column ${prediction.goal.x + 1}, row ${prediction.goal.y + 1}`, `Column ${(prediction.goal.x + 1) % 6 + 1}, row ${prediction.goal.y + 1}`, `Column ${prediction.goal.x + 1}, row ${(prediction.goal.y + 1) % 6 + 1}`], correct: 0 },
    misconception: draft.stages.find((stage) => stage.id === "debug")!.instruction,
  });
});
