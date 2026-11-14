import { authorModuleActivity, visual } from "../authoring";
import { mazeTools as tools } from "./maze-builders";
import type { Json } from "../types";

const moduleId = "first-games/decisions";
const blank = visual({ variables: {}, handlers: { start: [], choose: [] } });
const recall = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1,
  title: "Recall a choice at its boundary", objective: "Reconstruct a two-branch game choice and retrieve the exact meaning of its equality boundary.",
  concepts: ["condition", "input", "boundary", "retrieve"], essentialChecks: ["Above-threshold input selects one branch", "Equality and below select Otherwise", "Only one route and response execute"], faultDescription: "The comparison direction is reversed, so ordinary cases choose the wrong route.",
  explanation: "Reconstruct a choose handler without copying an earlier program. If the event input is greater than four, move Up and say Upper route; otherwise move Right and say Lower route. Test above four, exactly four and below four. Use the typed event input control and restart between plays so you can compare the two branches from the same position. Equality belongs to Otherwise, not the greater-than branch.",
  reasoning: ["Input six selects Up, while input two selects Right. A reversed comparison swaps those ordinary cases.", "Exactly four is a separate boundary case. It does not satisfy greater than four."],
  starter: blank, reference: tools.choiceProgram(4), faulty: tools.choiceProgram(4, true), cases: tools.choiceCases("recall-choice-four", 4),
  transfer: [{ task: "Reconstruct choose with threshold seven: input greater than seven selects Up and Upper route; equality or below selects Right and Lower route.", reference: tools.choiceProgram(7), cases: tools.choiceCases("new-choice-seven", 7) }, { task: "Use threshold minus two. A greater input selects Up and Upper route; exactly minus two and below select Right and Lower route. Check negative typed inputs.", reference: tools.choiceProgram(-2), cases: tools.choiceCases("new-negative-choice", -2) }],
  prediction: { prompt: "Is input four greater than four?", choices: ["No, equality belongs to Otherwise", "Yes, equal means greater", "Both branches must run"], correct: 0 },
});

type Direction = "right" | "up" | "left" | "down";
function falseContact(direction: Direction) {
  const artifact = tools.collisionProgram(direction);
  if (artifact.type === "visual") {
    const document = artifact.document as { handlers: { start: Array<Record<string, Json>> } };
    document.handlers.start[1]!.test = true;
  }
  return artifact;
}
const repairCases = (id: string, direction: Direction, start = { x: 3, y: 3 }) => tools.collisionCases(id, direction, start).reverse();
const repair = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2,
  title: "Repair a false contact alarm", objective: "Diagnose an unconditional collision response that mistakes a near miss for contact.",
  concepts: ["collision", "near miss", "debug"], essentialChecks: ["A nearby obstacle does not trigger contact feedback", "An actually blocked move does trigger it", "Each attempt has one bounded response"], faultDescription: "The response condition is always true, so a nearby wall falsely raises contact.",
  explanation: "A downward attempt reports Contact even when the wall is only beside its destination. Its response condition is always true. Replace that unconditional choice with the actual collision reading immediately after the move. Contact should set hit true and say Contact; a clear move should set hit false and say Clear. Test the unfamiliar near-miss layout first, then the genuinely blocked square, keeping one response for each attempt.",
  reasoning: ["The movement engine already distinguishes actual contact from a near miss. The fault is in how the program uses that result.", "A test with a blocking wall alone would let an always-true alarm pass. The near-miss case is necessary evidence."],
  starter: falseContact("down"), reference: tools.collisionProgram("down"), faulty: falseContact("down"), cases: repairCases("false-down-contact", "down"),
  transfer: (["right", "up"] as const).map((direction, index) => ({ task: `Repair an always-true ${direction} contact alarm from the new starting square. Use actual collision, return the right hit value and words, and ignore the nearby obstacle.`, starter: falseContact(direction), reference: tools.collisionProgram(direction), cases: repairCases(`new-false-contact-${index}`, direction, { x: index ? 2 : 3, y: index ? 3 : 2 }) })),
  prediction: { prompt: "Which test exposes an alarm that always reports Contact?", choices: ["Only a blocking wall", "A nearby wall that does not block the destination", "Only the project name"], correct: 1 },
});

const improve = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3,
  title: "Improve edge handling on unfamiliar boards", objective: "Replace an unsafe movement attempt with a dimension-aware boundary guard on new board sizes.",
  concepts: ["boundary", "dimension", "test", "improve"], essentialChecks: ["An ordinary inside step remains possible", "The outer edge is refused before movement", "The guard works on both new board sizes"], faultDescription: "The Down step executes unconditionally and can leave the board.",
  explanation: "Improve a Down control on five-by-five and seven-by-seven boards. Before the step, check that the next coordinate remains within zero and one less than the actual world size. A legal move says Inside; an edge attempt says Edge and stays still. Preserve normal inside movement while repairing the unsafe boundary. Use world.height and world.width rather than copying a number from one map. Test the bottom edge as well as an ordinary square.",
  reasoning: ["The bottom boundary is y zero regardless of the board height. Down from zero must be refused.", "A useful improvement keeps legal movement working. A program that always refuses avoids errors but does not meet the normal case."],
  starter: tools.safeMove("down", true), reference: tools.safeMove("down"), faulty: tools.safeMove("down", true), cases: tools.edgeCases("new-down-edges", "down", [5, 7]).reverse(),
  transfer: (["right", "up"] as const).map((direction, index) => ({ task: `Improve ${direction} movement on seven-by-seven and nine-by-nine boards. Use actual dimensions, preserve a legal step and refuse an out-of-bounds step with Edge feedback.`, starter: tools.safeMove(direction, true), reference: tools.safeMove(direction), cases: tools.edgeCases(`new-board-guard-${index}`, direction, [7, 9]) })),
  prediction: { prompt: "A program always refuses every move. Has it solved the boundary task?", choices: ["Yes, refusing is enough", "Yes, if it never crashes", "No, legal inside movement must still work"], correct: 2 },
});

const mazes: Parameters<typeof tools.mazeProgram>[0][] = [
  { goal: { x: 5, y: 4 }, path: ["up", "up", "up", "right", "right", "right", "right"], obstacles: [{ x: 2, y: 1 }, { x: 2, y: 2 }] },
  { goal: { x: 4, y: 4 }, path: ["up", "up", "up", "right", "right", "right"], obstacles: [{ x: 2, y: 1 }, { x: 3, y: 2 }] },
  { goal: { x: 3, y: 5 }, path: ["up", "up", "up", "up", "right", "right"], obstacles: [{ x: 2, y: 1 }, { x: 2, y: 3 }] },
];
const starter = () => visual({ variables: { dx: 0, dy: 0, won: false }, handlers: { start: [], restart: [], right: [], left: [], up: [], down: [], release: [], tick: [] } });
const portfolio = authorModuleActivity({ moduleId, kind: "project",
  title: "Portfolio: visitor maze game", objective: "Build a new visitor maze with responsive directional controls, bounded collision and edge handling, a genuine goal and a replayable second game.",
  concepts: ["maze", "input", "collision", "goal", "restart", "version"], essentialChecks: ["The supplied goal can actually be reached", "Walls and edges do not award wins", "Release and a won game stop further movement", "Restart permits another complete game", "The saved maze restores and replays"], faultDescription: "The restart handler marks the fresh game as already won and prevents a second play.",
  explanation: "Create a visitor maze on a six-by-six board from x one, y one to x five, y four with the supplied walls. Direction inputs should take one step and support an extra held tick; Release clears movement. Refuse boundaries, report actual Wall contact and award Goal reached only at the target. After winning, further inputs should not move the character. Restart must return to a playable state and allow another complete game. Save the maze, restore its working copy and replay success, wall, edge, release and restart cases.",
  reasoning: ["A working first game cannot prove restart. Play to the goal, restart and complete it again to expose a stale won state.", "A blocked first Right and an attempted Right at the outer edge are different failure cases. Neither should award a win."],
  starter: starter(), reference: tools.mazeProgram(mazes[0]!), faulty: tools.mazeProgram(mazes[0]!, true), cases: tools.mazeCases("visitor-maze-portfolio", mazes[0]!), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: mazes.slice(1).map((spec, index) => ({ task: `Build a new visitor maze with goal x ${spec.goal.x}, y ${spec.goal.y} and the new supplied walls. Preserve controls, release, wall and edge handling, goal-only wins and a second playable game after restart. Save, restore and replay.`, starter: starter(), reference: tools.mazeProgram(spec), cases: tools.mazeCases(`new-visitor-maze-${index}`, spec) })),
  prediction: { prompt: "Which evidence verifies that a won maze can genuinely restart?", choices: ["Completing a second game after restart", "Changing its title", "Inspecting only the first win"], correct: 0 },
});

export const mazeRetrievalActivities = [recall, repair, improve, portfolio];
