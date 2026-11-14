import { authorModuleActivity, visual, move, repeat, scenario, eq, range } from "../authoring";
import { animationTools as tools } from "./animation-builders";
import type { Json } from "../types";

type Direction = "right" | "up" | "left" | "down";
const vectors = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const commands = (directions: Direction[]) => directions.map((direction) => move(vectors[direction][0], vectors[direction][1]));
const moduleId = "first-games/repeating-actions";
const blank = visual({ variables: {}, handlers: { start: [] } });
const recall = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1,
  title: "Recall condition-controlled arrival", objective: "Retrieve a repeat-until stopping rule that adapts to new starting positions rather than relying on a memorised repeat count.",
  concepts: ["until", "condition", "event", "retrieve"], essentialChecks: ["The condition handles changing initial distances", "An already-reached destination needs zero moves", "Arrival triggers one stopping response"], faultDescription: "The repeated animation never checks its destination condition.",
  explanation: "Recall how an arrival-controlled animation works. Move right until x equals seven, then emit arrived to say Destination reached and stop. Do not use a fixed number of repetitions. The assessor starts the sprite at different distances, including directly at the goal. Before running, predict each movement count and explain how checking the condition before the body handles the zero-movement case.",
  reasoning: ["A destination coordinate is fixed while the initial distance can change. A condition adapts; a copied repeat count does not.", "When x is already seven, arrived should run once without taking an extra movement."],
  starter: blank, reference: tools.untilProgram(7, "x"), faulty: tools.untilProgram(7, "x", true), cases: tools.untilCases("recall-until-seven", 7, "x"),
  transfer: [{ task: "Reconstruct an upward arrival animation ending at y seven. Use repeat-until, one arrived event and a stopped actuator; include the already-arrived case.", reference: tools.untilProgram(7, "y"), cases: tools.untilCases("recall-new-vertical", 7, "y") }, { task: "Reconstruct a rightward arrival animation ending at x eight. Handle changing starts and zero required movement without a fixed repeat count.", reference: tools.untilProgram(8, "x"), cases: tools.untilCases("recall-new-horizontal", 8, "x") }],
  prediction: { prompt: "A fixed repeat count passes from one start. What new case best checks whether it really adapts?", choices: ["A different initial distance", "A different project title", "The same start again"], correct: 0 },
});

const routes: Direction[][] = [["right", "up", "right", "up", "left"], ["up", "right", "right", "down", "up"], ["right", "right", "up", "left", "up"]];
function brokenParts(route: Direction[]) {
  const artifact = tools.partsProgram(route);
  if (artifact.type === "visual") {
    const document = artifact.document as { handlers: Record<string, Json[]> };
    document.handlers.travel = document.handlers.travel!.slice(0, -1);
  }
  return artifact;
}
const repair = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2,
  title: "Repair a missing animation part", objective: "Diagnose a missing final movement inside a correctly ordered set of named animation sections.",
  concepts: ["decompose", "debug", "trace"], essentialChecks: ["The named section order remains correct", "The missing travel action is restored", "Finish occurs at the actual intended destination"], faultDescription: "The message order is correct but Travel omits its final movement.",
  explanation: "This animation emits begin, travel and finish in the right order, yet its closing bubble appears at the wrong destination. Inspect the Travel handler rather than rearranging messages that already work. Its full route should be right, up, right, up, left. Find the omitted final move, repair that part and retest the complete timeline from both starts. Keep Journey begins and Journey finished in their own named sections.",
  reasoning: ["A correct section order cannot compensate for incomplete work inside Travel. Compare the full visited trail with the brief.", "After repair, verify both the new final position and the closing bubble's actual timeline position."],
  starter: brokenParts(routes[0]!), reference: tools.partsProgram(routes[0]!), faulty: brokenParts(routes[0]!), cases: tools.partsCases("missing-travel-action", routes[0]!),
  transfer: routes.slice(1).map((route, index) => ({ task: `Repair a new incomplete Travel handler to follow ${route.join(", ")}. Preserve begin-travel-finish order and the two requested speech bubbles; retest every move.`, starter: brokenParts(route), reference: tools.partsProgram(route), cases: tools.partsCases(`new-missing-travel-${index}`, route) })),
  prediction: { prompt: "The messages are ordered correctly, but Travel omits a step. Where should the repair begin?", choices: ["Delete Finish", "Inspect Travel's actual actions", "Rename the project"], correct: 1 },
});

type Pattern = { unit: Direction[]; count: number };
const patterns: Pattern[] = [{ unit: ["right", "up", "right", "down"], count: 2 }, { unit: ["up", "right", "down", "right"], count: 2 }, { unit: ["right", "up", "left", "up"], count: 2 }];
const comparison = (pattern: Pattern, mode: "expanded" | "grouped" | "faulty") => visual({ comparison: {
  left: { variables: {}, handlers: { start: commands(Array.from({ length: pattern.count }, () => pattern.unit).flat()) } },
  right: { variables: {}, handlers: { start: mode === "expanded" ? commands(Array.from({ length: pattern.count }, () => pattern.unit).flat()) : [repeat(pattern.count, commands(mode === "faulty" ? pattern.unit.slice(0, -1) : pattern.unit))] } },
} });
function comparisonCases(id: string, pattern: Pattern) { return [0, 1].map((shift) => {
  let x = 2 + shift, y = 2 + shift; const visits: Json[] = [{ x, y }];
  for (let i = 0; i < pattern.count; i++) for (const direction of pattern.unit) { x += vectors[direction][0]; y += vectors[direction][1]; visits.push({ x, y }); }
  return scenario(`${id}-${shift}`, { start: { x: 2 + shift, y: 2 + shift }, width: 12, height: 12 }, eq("equivalent", true, "The improved program preserves the full actual behaviour"), eq("left.visits", visits, "The expanded baseline remains intact"), eq("right.visits", visits, "The grouped version preserves every milestone"), range("right.writtenCommands", pattern.unit.length + 1, pattern.unit.length + 1, "One complete repeated unit replaces the expanded actions"), range("right.loopMoves", pattern.unit.length * pattern.count, pattern.unit.length * pattern.count, "The entire required route is executed inside the repeat"));
}); }
const improve = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3,
  title: "Improve a zigzag animation", objective: "Reduce repeated written instructions while preserving every coordinate of a new zigzag animation.",
  concepts: ["repeat", "equivalent", "improve"], essentialChecks: ["The baseline and improved full trails match", "The complete four-move unit remains intact", "The improved program uses one repeat"], faultDescription: "The improved repeat leaves out the fourth move of the zigzag unit.",
  explanation: "Improve Program B without changing Program A. The animation repeats right, up, right, down twice. Replace the eight expanded movements with one Repeat two containing that complete four-action unit. Compare actual coordinates rather than only the final square. Omitting the closing Down changes the height of the next unit, so a shorter-looking program can still be wrong. Test the shifted starting map after the improvement.",
  reasoning: ["Eight executed moves can come from five written commands: one Repeat and its four-action body.", "Every intermediate coordinate is evidence. A final-position adjustment after an incomplete group cannot preserve the original full trail."],
  starter: comparison(patterns[0]!, "expanded"), reference: comparison(patterns[0]!, "grouped"), faulty: comparison(patterns[0]!, "faulty"), cases: comparisonCases("zigzag-improvement", patterns[0]!),
  transfer: patterns.slice(1).map((pattern, index) => ({ task: `Improve Program B to repeat ${pattern.unit.join(", ")} ${pattern.count} times. Preserve Program A and every actual visited coordinate while reducing the written instructions.`, starter: comparison(pattern, "expanded"), reference: comparison(pattern, "grouped"), cases: comparisonCases(`new-zigzag-${index}`, pattern) })),
  prediction: { prompt: "Which comparison is strong enough to verify a grouped animation?", choices: ["Its title is shorter", "It has any Repeat block", "Its complete actual trail matches the baseline"], correct: 2 },
});

const animations: Parameters<typeof tools.animationProgram>[0][] = [
  { first: ["right", "up", "right", "down"], firstCount: 2, second: ["up", "up", "right"], secondCount: 2 },
  { first: ["up", "right", "down", "left"], firstCount: 2, second: ["right", "right", "up"], secondCount: 2 },
  { first: ["up", "up", "down", "down"], firstCount: 2, second: ["right", "up", "left"], secondCount: 2 },
];
const describe = (spec: typeof animations[number]) => `dance repeats ${spec.first.join(", ")} ${spec.firstCount} times then says Dance finished; climb repeats ${spec.second.join(", ")} ${spec.secondCount} times then says Journey finished`;
const portfolio = authorModuleActivity({ moduleId, kind: "project",
  title: "Portfolio: loop-powered exhibition", objective: "Create a two-control loop-powered exhibition whose patterns, coordinate trails and restored restart behaviour agree with the visitor brief.",
  concepts: ["event", "coordinate", "pattern", "restart", "version"], essentialChecks: ["Each control selects its distinct full pattern", "Both repeated units are complete", "Restart clears the old position and speech", "The saved exhibition restores and replays"], faultDescription: "An extra start movement shifts the exhibition both initially and after restart.",
  explanation: `Create a two-control exhibition from x three, y four. ${describe(animations[0]!)}. Leave start empty so visitors choose which pattern to watch. Test waiting, both controls and dance-restart-climb. Inspect each full coordinate trail and ensure old closing words do not survive restart. Save the exhibition, restore its version and replay both patterns before explaining how the repeated units meet different visitor choices.`,
  reasoning: ["The zigzag and the rising route have different intermediate and final coordinates. One working pattern cannot prove the other control.", "An extra start movement also runs on restart. Check the untouched waiting position as part of the complete project."],
  starter: visual({ variables: {}, handlers: { start: [], dance: [], climb: [] } }), reference: tools.animationProgram(animations[0]!), faulty: tools.animationProgram(animations[0]!, true), cases: tools.animationCases("loop-exhibition", animations[0]!), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: animations.slice(1).map((spec, index) => ({ task: `Build a new exhibition at x three, y four: ${describe(spec)}. Keep start empty, test both controls and restart, then save, restore and replay.`, starter: visual({ variables: {}, handlers: { start: [], dance: [], climb: [] } }), reference: tools.animationProgram(spec), cases: tools.animationCases(`new-loop-exhibition-${index}`, spec) })),
  prediction: { prompt: "A visitor chooses climb after restarting dance. Which earlier speech should remain?", choices: ["None of the old dance speech", "All earlier closing words", "Only the project title can be checked"], correct: 0 },
});

export const animationRetrievalActivities = [recall, repair, improve, portfolio];
