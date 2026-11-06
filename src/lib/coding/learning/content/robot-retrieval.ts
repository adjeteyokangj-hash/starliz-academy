import { authorModuleActivity, visual, move, repeat, scenario, eq, range } from "../authoring";
import type { Json, Predicate } from "../types";

type Direction = "right" | "up" | "left" | "down";
const vectors = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const arrows = (directions: Direction[]) => directions.map((direction) => move(vectors[direction][0], vectors[direction][1]));
const program = (handlers: Record<string, unknown[]>) => visual({ variables: {}, handlers });
function route(id: string, directions: Direction[], shift: number, events: string[], extra: Predicate[] = [], heading = 0) {
  let x = 2 + shift, y = 2 + shift; const visits: Json[] = [{ x, y }];
  for (const direction of directions) { x += vectors[direction][0]; y += vectors[direction][1]; visits.push({ x, y }); }
  return scenario(id, { start: { x: 2 + shift, y: 2 + shift }, width: 10, height: 10, heading, events: events.map((name) => ({ name, value: 0 })) }, eq("visits", visits, "The whole ordered trail meets the delivery brief"), eq("collision", false, "The robot stays within its map"), range("moves", directions.length, directions.length, "Every required move occurs exactly once"), ...extra);
}
const movedCases = (id: string, directions: Direction[], extra: Predicate[] = [], heading = 0) => [0, 1].map((shift) => route(`${id}-${shift}`, directions, shift, [shift ? "restart" : "start"], extra, heading));
const forward = (amount = 1) => ({ op: "forward", amount });
const turn = (amount: number) => ({ op: "turn", amount });
const empty = program({ start: [] });
const moduleId = "stories-in-steps/planning";
const headingPlan = (count: number, left: boolean) => program({ start: [forward(count), turn(left ? -1 : 1), forward(1)] });
const headingCase = (id: string, count: number, left: boolean, heading = 0) => {
  const directions: Direction[] = ["right", "down", "left", "up"];
  const first = directions[heading]!, final = (heading + (left ? 3 : 1)) % 4, second = directions[final]!;
  return movedCases(id, [...Array<Direction>(count).fill(first), second], [eq("heading", final, "The final heading agrees with the last turn")], heading);
};
const recall = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1,
  title: "Remember forward and turning", objective: "Retrieve the distinction between a robot's heading, a turn and a forward move in a new route.",
  concepts: ["heading", "turn", "forward", "retrieve"], essentialChecks: ["Turns change heading without adding a visit", "Forward follows the current heading", "Both starting maps produce the complete route"], faultDescription: "A right turn is used where a left turn is required.",
  explanation: "Without copying the earlier lesson, reconstruct this new route. Start facing right, move forward three squares, turn left once, then move forward one square. Before running, say which way the final step will travel. Inspect the heading arrow and every visited square. A turn should not add a movement, and Forward should not always mean Right. The second test moves the starting point while keeping the same directions.",
  reasoning: ["Three forward moves from a right-facing start visit three squares to the right. A left turn then points up.", "A shifted start changes the coordinates but not the relative trail. Check the heading as well as the final square."],
  starter: empty, reference: headingPlan(3, true), faulty: headingPlan(3, false), cases: headingCase("heading-recall", 3, true),
  transfer: [
    { task: "Start facing down, move forward twice, turn left and move forward once. Check the full trail and finish facing right.", reference: headingPlan(2, true), cases: headingCase("down-recall", 2, true, 1) },
    { task: "Start facing up, move forward three times, turn right and move forward once. Check that the last step goes right.", reference: headingPlan(3, false), cases: headingCase("up-recall", 3, false, 3) },
  ], prediction: { prompt: "Facing right, you turn left without moving. Which direction are you facing?", choices: ["Up", "Down", "Still right"], correct: 0 },
});

const repairRoute: Direction[] = ["right", "up", "up", "left", "right"];
const badRoute: Direction[] = ["up", "right", "up", "left", "right"];
const repaired = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2,
  title: "Find the missed collection stop", objective: "Diagnose a new route whose endpoint is correct but whose early collection stop is missed.",
  concepts: ["debug", "trace", "test"], essentialChecks: ["The first differing move is repaired", "All collection stops occur in order", "A changed starting map is retested"], faultDescription: "The first two moves are swapped, so the final position hides the missed first stop.",
  explanation: "The collection robot reaches the correct destination, but that does not prove it visited every stop. Its required trail is right, up, up, left, right. Compare the current trail with that order and locate the first difference before editing. Repair the cause, then test the complete route from both starting positions. Keep the return step at the end; removing it merely to match one coordinate creates another fault.",
  reasoning: ["Swapping the first right and up still reaches the same endpoint. The first visited square shows the real difference.", "After repairing the order, count all five moves and check the middle stops as well as the last square."],
  starter: program({ start: arrows(badRoute) }), reference: program({ start: arrows(repairRoute) }), faulty: program({ start: arrows(badRoute) }), cases: movedCases("collection-repair", repairRoute),
  transfer: [
    { task: "Repair a new route to visit up, right, down, right, up in exactly that order. Its current first pair is swapped; verify the first and middle stops.", starter: program({ start: arrows(["right", "up", "down", "right", "up"]) }), reference: program({ start: arrows(["up", "right", "down", "right", "up"]) }), cases: movedCases("new-collection", ["up", "right", "down", "right", "up"]) },
    { task: "Repair another route to follow right, right, up, left, up. A wrong middle pair can hide behind the same endpoint. Retest both maps.", starter: program({ start: arrows(["right", "up", "right", "left", "up"]) }), reference: program({ start: arrows(["right", "right", "up", "left", "up"]) }), cases: movedCases("middle-collection", ["right", "right", "up", "left", "up"]) },
  ], prediction: { prompt: "What evidence can reveal two swapped moves with the same endpoint?", choices: ["The file name", "The full ordered trail", "The last square only"], correct: 1 },
});

const repeatedInput = (event: string, unit: Direction[], count: number, faulty = false) => program({ start: faulty ? [repeat(count, arrows(unit))] : [], [event]: faulty ? [] : [repeat(count, arrows(unit))] });
function inputCases(id: string, event: string, unit: Direction[], count: number) {
  const directions = Array.from({ length: count }, () => unit).flat(), checks = [range("loopMoves", directions.length, directions.length, "The complete route unit executes inside its repeat")];
  return [route(`${id}-waiting`, [], 1, ["start"]), route(`${id}-pressed`, directions, 0, ["start", event], checks), route(`${id}-restart`, [], 0, ["start", event, "restart"])];
}
const improved = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3,
  title: "Improve a button-controlled delivery", objective: "Replace an expanded route with a repeated unit while preserving waiting, input and restart behaviour.",
  concepts: ["repeat", "event", "restart", "improve"], essentialChecks: ["The robot waits before input", "The full repeated unit preserves every stop", "Restart returns to waiting"], faultDescription: "The route was moved into start while its button event was left empty.",
  explanation: "Improve a delivery program without changing when it runs. The parcel button must repeat right, up three times. Put the whole two-move unit in one repeat under parcel and leave start empty. Run first to see a waiting robot, then press parcel and inspect all six movements. Restart should return to the original square and wait again. A shorter program is only an improvement if its timing and complete trail remain correct.",
  reasoning: ["Repeating only Right changes the staircase. Both Right and Up belong inside the repeated unit.", "Moving the same actions into start makes the robot leave before its button is pressed. Test waiting and restart, not just a pressed button."],
  starter: program({ start: [], parcel: arrows(["right", "up", "right", "up", "right", "up"]) }), reference: repeatedInput("parcel", ["right", "up"], 3), faulty: repeatedInput("parcel", ["right", "up"], 3, true), cases: inputCases("parcel-improvement", "parcel", ["right", "up"], 3),
  transfer: [
    { task: "Improve the water button: repeat up, right twice, keep start empty and verify waiting, the whole trail and restart.", starter: program({ start: [], water: arrows(["up", "right", "up", "right"]) }), reference: repeatedInput("water", ["up", "right"], 2), cases: inputCases("water-improvement", "water", ["up", "right"], 2) },
    { task: "Improve the return button: repeat right, down twice. The robot must wait until return is pressed and wait again after restart.", starter: program({ start: [], return: arrows(["right", "down", "right", "down"]) }), reference: repeatedInput("return", ["right", "down"], 2), cases: inputCases("return-improvement", "return", ["right", "down"], 2) },
  ], prediction: { prompt: "The route is correct, but it runs before the button is pressed. What must change?", choices: ["The map colour", "The final square", "Move the route from start to its button event"], correct: 2 },
});

type MapBrief = { name: string; count: number; redUnit: Direction[]; blueRoute: Direction[]; blueCode: unknown[]; blueHeading: number };
const main: MapBrief = { name: "Market", count: 2, redUnit: ["right", "up"], blueRoute: ["right", "right", "down"], blueCode: [forward(2), turn(1), forward()], blueHeading: 1 };
const garden: MapBrief = { name: "Orchard", count: 3, redUnit: ["up", "right"], blueRoute: ["up", "up", "right"], blueCode: [turn(-1), forward(2), turn(1), forward()], blueHeading: 0 };
const harbour: MapBrief = { name: "Harbour", count: 2, redUnit: ["right", "down"], blueRoute: ["right", "up", "up"], blueCode: [forward(), turn(-1), forward(2)], blueHeading: 3 };
const mapProgram = (brief: MapBrief, faulty = false) => program({ start: [], red: [repeat(brief.count, arrows(brief.redUnit))], blue: faulty ? [repeat(brief.count, arrows(brief.redUnit))] : brief.blueCode });
function mapCases(brief: MapBrief) {
  const red = Array.from({ length: brief.count }, () => brief.redUnit).flat();
  return [route(`${brief.name}-blue`, brief.blueRoute, 1, ["start", "blue"], [eq("heading", brief.blueHeading, "Blue's turns produce its intended final heading")]), route(`${brief.name}-wait`, [], 0, ["start"]), route(`${brief.name}-red`, red, 0, ["start", "red"], [range("loopMoves", red.length, red.length, "Red uses its complete repeated delivery unit")]), route(`${brief.name}-reset-blue`, brief.blueRoute, 0, ["start", "red", "restart", "blue"], [eq("heading", brief.blueHeading, "Restart restores the initial heading before blue")])];
}
const describe = (brief: MapBrief) => `${brief.name}: red repeats ${brief.redUnit.join(", ")} ${brief.count} times; blue follows ${brief.blueRoute.join(", ")} using Forward and Turn, finishing facing ${["right", "down", "left", "up"][brief.blueHeading]}. Start stays empty.`;
const portfolio = authorModuleActivity({ moduleId, kind: "project",
  title: "Portfolio: robot delivery map", objective: "Build and preserve a two-destination delivery map with repeated movement, heading-dependent turns, separate inputs and reliable restart.",
  concepts: ["input", "heading", "repeat", "restart", "version"], essentialChecks: ["Both inputs select their own full route", "Red uses a repeated unit and blue uses heading", "Waiting and restart work independently", "The saved version is restored and replayed"], faultDescription: "Blue accidentally uses the red delivery program, so one input passes while the other visits the wrong stops.",
  explanation: `Create a delivery map for a fictional market user with two separate destination buttons. ${describe(main)} Test each button from a fresh start and test red, restart, blue. Watch the heading arrow during blue's turns. Inspect every stop, not only each final square. Save the complete project, restore its saved version and replay both deliveries before explaining why the two inputs produce different routes.`,
  reasoning: ["Red's repeated unit and blue's turn-based route solve different journeys. Copying one route into both handlers cannot meet both briefs.", "Restart must reset the position and heading. Test blue after restarting a red run to expose state that was not reset."],
  starter: program({ start: [], red: [], blue: [] }), reference: mapProgram(main), faulty: mapProgram(main, true), cases: mapCases(main), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: [garden, harbour].map((brief) => ({ task: `Build a new independently assessed map. ${describe(brief)} Test waiting, each button and red-restart-blue, then save, restore and replay.`, starter: program({ start: [], red: [], blue: [] }), reference: mapProgram(brief), cases: mapCases(brief) })),
  prediction: { prompt: "Red works, but blue runs the same red route. Is the whole delivery map ready?", choices: ["No, both distinct input routes must pass", "Yes, one successful button proves both", "Yes, saving fixes the blue route"], correct: 0 },
});

export const robotRetrievalActivities = [recall, repaired, improved, portfolio];
