import { authorLesson, visual, move, repeat, scenario, eq, range, read, calc } from "../authoring";
import type { Json, Predicate } from "../types";

type Direction = "right" | "up" | "left" | "down";
const vectors = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const code = (directions: Direction[]) => directions.map((direction) => move(vectors[direction][0], vectors[direction][1]));
const program = (handlers: Record<string, unknown[]>) => visual({ variables: {}, handlers });
const say = (value: string) => ({ op: "say", value });
function trail(directions: Direction[], start: { x: number; y: number }): Json[] {
  let { x, y } = start; const visits: Json[] = [{ x, y }];
  for (const direction of directions) { x += vectors[direction][0]; y += vectors[direction][1]; visits.push({ x, y }); }
  return visits;
}
const routeChecks = (directions: Direction[], start: { x: number; y: number }): Predicate[] => [eq("visits", trail(directions, start), "The actual trail follows every required coordinate in order"), eq("collision", false, "The animation stays on its stage")];
const empty = program({ start: [] });
const eventProgram = (first: Direction[], second: Direction[], fault = false) => program({ start: [], east: code(first), north: code(fault ? first : second) });
function eventCases(id: string, first: Direction[], second: Direction[]) {
  const start = { x: 2, y: 2 };
  return [
    scenario(`${id}-north`, { start, width: 12, height: 12, events: ["start", "north"].map((name) => ({ name, value: 0 })) }, ...routeChecks(second, start)),
    scenario(`${id}-east`, { start, width: 12, height: 12, events: ["start", "east"].map((name) => ({ name, value: 0 })) }, ...routeChecks(first, start)),
    scenario(`${id}-reset`, { start, width: 12, height: 12, events: ["start", "east", "restart", "north"].map((name) => ({ name, value: 0 })) }, ...routeChecks(second, start)),
    scenario(`${id}-wait`, { start, width: 12, height: 12, events: [{ name: "start", value: 0 }] }, ...routeChecks([], start)),
  ];
}
const event = authorLesson({ id: "Y3.01", concepts: ["event", "handler", "restart"],
  explanation: "An event selects its own instructions. Build two different inputs: east moves right twice and north moves up twice. Leave start empty so neither route runs before a choice. Test each event separately, then run east, restart and north to verify that the second journey begins from the original position. Copying east into north gives two button names but only one behaviour. An event handler is the named group of actions that responds to an input.",
  reasoning: ["The north input should change the vertical coordinate while east changes the horizontal coordinate. Inspect both actual trails.", "Restart clears earlier movement before another event is selected. The final north trail must not include the previous east run."],
  starter: program({ start: [], east: [], north: [] }), reference: eventProgram(["right", "right"], ["up", "up"]), faulty: eventProgram(["right", "right"], ["up", "up"], true), cases: eventCases("distinct-events", ["right", "right"], ["up", "up"]),
  transfer: [
    { task: "Give east the route right, up, right and north the route up, right, up. Keep start empty and verify both choices after restart.", reference: eventProgram(["right", "up", "right"], ["up", "right", "up"]), cases: eventCases("new-distinct-events", ["right", "up", "right"], ["up", "right", "up"]) },
    { task: "Give east right, right, down and north up, up, left. Test waiting, each input and east-restart-north without duplicating triggers.", reference: eventProgram(["right", "right", "down"], ["up", "up", "left"]), cases: eventCases("corner-events", ["right", "right", "down"], ["up", "up", "left"]) },
  ], prediction: { prompt: "Both handlers contain Right twice. What will north do?", choices: ["Move up automatically because of its name", "Move right, because its instructions determine the action", "Run both handlers"], correct: 1 },
});

function loopCases(id: string, count: number, direction: Direction) { return [0, 1].map((shift) => {
  const start = { x: 1 + shift, y: 2 + shift };
  return scenario(`${id}-${shift}`, { start, width: 12, height: 12 }, ...routeChecks(Array<Direction>(count).fill(direction), start), range("loopMoves", count, count, "Every required movement executes inside the repeat"), range("repeatIterations", count, count, "The repeat count matches the planned number of steps"));
}); }
const loops = authorLesson({ id: "Y3.02", concepts: ["repeat", "iteration", "predict"],
  explanation: "A repeat block executes the actions inside it a counted number of times. Predict where three right moves will finish, then build Repeat three containing one Right action. Run and compare the complete trail with the prediction. The repeat count is the number of iterations, not the number of written movement blocks. Repair a Left action inside the group rather than adding compensating moves afterward. From a shifted starting square, the same three-step pattern should keep its direction and movement count.",
  reasoning: ["One written Right instruction inside Repeat three produces three actual moves and three iterations.", "If the repeated action points Left, changing only the count cannot make it the intended rightward route. Repair the direction and rerun."],
  starter: program({ start: [] }), reference: program({ start: [repeat(3, code(["right"]))] }), faulty: program({ start: [repeat(3, code(["left"]))] }), cases: loopCases("counted-loop", 3, "right"),
  transfer: [{ task: "Use one repeated Right action to travel four squares. Predict the endpoint and check four actual iterations from both starts.", reference: program({ start: [repeat(4, code(["right"]))] }), cases: loopCases("four-step-loop", 4, "right") }, { task: "Use one repeated Up action to travel five squares. Check the vertical trail and five actual iterations from both starts.", reference: program({ start: [repeat(5, code(["up"]))] }), cases: loopCases("five-step-loop", 5, "up") }],
  prediction: { prompt: "Repeat three contains one Right move. How many movements execute?", choices: ["One", "Three", "Four"], correct: 1 },
});

const positioned = (x: number, y: number, route: Direction[], fault = false) => program({ start: [{ op: "position", x: fault ? y : x, y: fault ? x : y }, ...code(route)] });
function coordinateCases(id: string, x: number, y: number, route: Direction[]) { return [0, 1].map((shift) => {
  const start = { x: shift, y: shift }, visits = [start, ...trail(route, { x, y })];
  const end = visits.at(-1)! as { x: number; y: number };
  return scenario(`${id}-${shift}`, { start, width: 12, height: 12 }, eq("visits", visits, "Position uses x horizontally and y vertically before the requested moves"), eq("x", end.x, "The final horizontal coordinate is correct"), eq("y", end.y, "The final vertical coordinate is correct"), eq("collision", false, "Every coordinate is within the stage"));
}); }
const coordinates = authorLesson({ id: "Y3.03", concepts: ["coordinate", "x", "y"],
  explanation: "Coordinates name an exact position. This visual machine uses x increasing to the right and y increasing upward, with zero at the left and bottom. Grid column one is x zero; row one is y zero. The replay gives both the friendly cell numbers and actual x and y values. Use Position to place the sprite at x two, y one, then move right, up, right. Position sets an absolute coordinate; Move changes the current position. Swapping x and y changes the starting point even when the later arrows are correct.",
  reasoning: ["Position x two, y one selects the third column and second row. Its values are not a request to move two squares from wherever the sprite began.", "After right, up, right the coordinate is x four, y two. The same absolute placement works from either supplied initial position."],
  starter: empty, reference: positioned(2, 1, ["right", "up", "right"]), faulty: positioned(2, 1, ["right", "up", "right"], true), cases: coordinateCases("placed-sprite", 2, 1, ["right", "up", "right"]),
  transfer: [{ task: "Place a sprite at x one, y three, then move right twice and down once. Check the absolute placement and final x three, y two.", reference: positioned(1, 3, ["right", "right", "down"]), cases: coordinateCases("new-placement", 1, 3, ["right", "right", "down"]) }, { task: "Place a sprite at x four, y two, then move left, up, left. Check each coordinate and finish at x two, y three.", reference: positioned(4, 2, ["left", "up", "left"]), cases: coordinateCases("other-placement", 4, 2, ["left", "up", "left"]) }],
  prediction: { prompt: "From x two, y one, one Up action gives which coordinate?", choices: ["x three, y one", "x one, y two", "x two, y two"], correct: 2 },
});

const untilProgram = (goal: number, axis: "x" | "y", fault = false) => program({ start: [{ op: "until", test: fault ? false : calc("equal", read(axis), goal), body: [axis === "x" ? move(1, 0) : move(0, 1)] }, { op: "emit", name: "arrived" }], arrived: [say("Destination reached"), { op: "stop" }] });
function untilCases(id: string, goal: number, axis: "x" | "y") { return [1, 2, goal].map((from, index) => {
  const start = axis === "x" ? { x: from, y: 1 } : { x: 1, y: from }, distance = goal - from;
  return scenario(`${id}-${index}`, { start, width: 12, height: 12 }, ...routeChecks(Array<Direction>(distance).fill(axis === "x" ? "right" : "up"), start), eq(axis, goal, "The repeated animation stops at the required coordinate"), eq("stopped", true, "The reached condition emits the actual stopping response"), eq("messages", ["arrived"], "The arrival event fires once after the condition is met"), eq("speech", ["Destination reached"], "Feedback identifies the reached destination"), range("repeatIterations", distance, distance, "The condition is checked before each required iteration, including zero"));
}); }
const until = authorLesson({ id: "Y3.04", concepts: ["until", "condition", "event", "stop"],
  explanation: "A repeat-until loop checks a condition before repeating. Move right until x equals four, then emit the arrived event. That event says Destination reached and stops the animation. Starting at x one needs three moves; starting at x two needs two; starting at x four needs none. A fixed repeat count cannot satisfy all three starts. This is a bounded animation that responds to reaching its condition, not a background loop waiting for a later button. The engine stops invalid programs rather than running forever.",
  reasoning: ["The condition x equals four becomes true at the destination. Testing before the body prevents an extra step when the sprite starts there.", "Emit arrived only after the loop ends. Its stop action proves that the reached event leads to a separate response."],
  starter: program({ start: [], arrived: [] }), reference: untilProgram(4, "x"), faulty: untilProgram(4, "x", true), cases: untilCases("arrival-condition", 4, "x"),
  transfer: [{ task: "Move upward until y equals five, then emit arrived to say Destination reached and stop. Handle different starts including already at y five.", reference: untilProgram(5, "y"), cases: untilCases("vertical-arrival", 5, "y") }, { task: "Move right until x equals six, then emit arrived and stop with the same destination feedback. Do not use a fixed movement count.", reference: untilProgram(6, "x"), cases: untilCases("further-arrival", 6, "x") }],
  prediction: { prompt: "The sprite starts where the until condition is already true. How many body movements are needed?", choices: ["Zero", "One", "Always four"], correct: 0 },
});

const partsProgram = (route: Direction[], fault = false) => program({ start: [{ op: "emit", name: "begin" }, { op: "emit", name: fault ? "finish" : "travel" }, { op: "emit", name: fault ? "travel" : "finish" }], begin: [say("Journey begins")], travel: code(route), finish: [say("Journey finished")] });
function partsCases(id: string, route: Direction[]) { return [0, 1].map((shift) => {
  const start = { x: 1 + shift, y: 1 + shift }, end = trail(route, start).at(-1)! as { x: number; y: number };
  const events: Json[] = [{ type: "say", text: "Journey begins", ...start }, ...trail(route, start).slice(1).map((point) => ({ type: "move", ...(point as { x: number; y: number }) })), { type: "say", text: "Journey finished", ...end }];
  return scenario(`${id}-${shift}`, { start, width: 12, height: 12 }, ...routeChecks(route, start), eq("messages", ["begin", "travel", "finish"], "The named sections are selected in their planned order"), eq("storyEvents", events, "Finish feedback happens after the actual movement section"));
}); }
const parts = authorLesson({ id: "Y3.05", concepts: ["decompose", "message", "sequence"],
  explanation: "Decomposition divides an animation into parts with clear jobs. Create named event groups begin, travel and finish. Start should emit begin, then travel, then finish. Begin says Journey begins; travel moves right, up, right, up; finish says Journey finished. A named group does not run merely because it exists: emit selects it. Inspect the actual message order and the combined timeline so the finish bubble cannot happen before travel has completed.",
  reasoning: ["The begin group handles opening words while travel handles motion. Their distinct names make the plan easier to inspect and repair.", "Emitting finish before travel produces the right words but in the wrong place. Compare their actual timeline positions, not just the speech list."],
  starter: program({ start: [], begin: [], travel: [], finish: [] }), reference: partsProgram(["right", "up", "right", "up"]), faulty: partsProgram(["right", "up", "right", "up"], true), cases: partsCases("named-parts", ["right", "up", "right", "up"]),
  transfer: [{ task: "Build named begin, travel and finish groups for right, right, up, left. Use the same opening and closing words and emit the groups in order.", reference: partsProgram(["right", "right", "up", "left"]), cases: partsCases("new-named-parts", ["right", "right", "up", "left"]) }, { task: "Decompose up, right, down, right into begin, travel and finish. Prove that the finish speech follows all four actual moves.", reference: partsProgram(["up", "right", "down", "right"]), cases: partsCases("other-named-parts", ["up", "right", "down", "right"]) }],
  prediction: { prompt: "A finish group exists but start never emits finish. What happens?", choices: ["It always runs automatically", "It does not run merely because it exists", "It replaces every other group"], correct: 1 },
});

type Animation = { first: Direction[]; firstCount: number; second: Direction[]; secondCount: number };
const animations: Animation[] = [{ first: ["right", "up", "left", "down"], firstCount: 2, second: ["right", "up"], secondCount: 2 }, { first: ["up", "right", "down", "left"], firstCount: 3, second: ["up", "right"], secondCount: 2 }, { first: ["right", "down", "left", "up"], firstCount: 2, second: ["right", "down"], secondCount: 3 }];
const animationProgram = (brief: Animation, fault = false) => program({ start: fault ? [move(1, 0)] : [], dance: [repeat(brief.firstCount, code(brief.first)), say("Dance finished")], climb: [repeat(brief.secondCount, code(brief.second)), say("Journey finished")] });
function animationCases(id: string, brief: Animation) {
  const start = { x: 3, y: 4 }, first = Array.from({ length: brief.firstCount }, () => brief.first).flat(), second = Array.from({ length: brief.secondCount }, () => brief.second).flat();
  return [{ names: ["start"], route: [] as Direction[], words: [] as string[] }, { names: ["start", "dance"], route: first, words: ["Dance finished"] }, { names: ["start", "climb"], route: second, words: ["Journey finished"] }, { names: ["start", "dance", "restart", "climb"], route: second, words: ["Journey finished"] }].map((test, index) => scenario(`${id}-${index}`, { start, width: 12, height: 12, events: test.names.map((name) => ({ name, value: 0 })) }, ...routeChecks(test.route, start), eq("speech", test.words, "Only the selected animation's current finish feedback remains"), ...(test.names.length > 1 ? [range("loopMoves", test.names.includes("restart") ? first.length + second.length : test.route.length, test.names.includes("restart") ? first.length + second.length : test.route.length, "Both complete patterns execute inside their repeats")] : [])));
}
const describe = (brief: Animation) => `dance repeats ${brief.first.join(", ")} ${brief.firstCount} times and says Dance finished; climb repeats ${brief.second.join(", ")} ${brief.secondCount} times and says Journey finished`;
const project = authorLesson({ id: "Y3.06", concepts: ["event", "coordinate", "repeat", "restart"], workflow: { saveAndReplay: true, restoreVersion: true },
  explanation: `Build a loop-powered animation with two distinct controls. Start at x three, y four and keep start empty. ${describe(animations[0]!)}. Test waiting, each animation and dance-restart-climb. Inspect the entire coordinate trail and current speech after restart; no old dance position or finish words should remain. Save the complete project, restore its working copy and replay both controls before explaining how their different repeated units create different journeys.`,
  reasoning: ["The square pattern returns to its start; the staircase does not. Identical endpoints cannot be assumed from both using repeat.", "An extra movement under start also runs after restart and shifts every later coordinate. Check the waiting position before testing either pattern."],
  starter: program({ start: [], dance: [], climb: [] }), reference: animationProgram(animations[0]!), faulty: animationProgram(animations[0]!, true), cases: animationCases("two-pattern-animation", animations[0]!),
  transfer: animations.slice(1).map((brief, index) => ({ task: `Create a new two-pattern animation at x three, y four: ${describe(brief)}. Keep start empty, verify all controls and restart, then save, restore and replay.`, starter: program({ start: [], dance: [], climb: [] }), reference: animationProgram(brief), cases: animationCases(`new-two-pattern-animation-${index}`, brief) })),
  prediction: { prompt: "An extra Right action is placed under start. What happens after restart?", choices: ["It shifts the sprite again before an animation is chosen", "It is ignored after the first run", "It changes only the project name"], correct: 0 },
});

export const animationBuilderActivities = [event, loops, coordinates, until, parts, project];
export const animationTools = { untilProgram, untilCases, partsProgram, partsCases, animationProgram, animationCases };
