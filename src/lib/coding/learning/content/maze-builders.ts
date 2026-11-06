import { authorLesson, visual, move, scenario, eq, range, read, calc, branch, set } from "../authoring";
import type { Json, Predicate } from "../types";

type Direction = "right" | "up" | "left" | "down";
type Point = { x: number; y: number };
const vectors = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const program = (handlers: Record<string, unknown[]>, variables: Record<string, Json> = {}) => visual({ variables, handlers });
const say = (value: string) => ({ op: "say", value });
const emit = (name: string) => ({ op: "emit", name });
const not = (test: ReturnType<typeof read> | ReturnType<typeof calc>) => calc("not", test);
const empty = program({ start: [] });
function visits(directions: Direction[], start: Point): Json[] { let { x, y } = start; return [{ x, y }, ...directions.map((direction) => { x += vectors[direction][0]; y += vectors[direction][1]; return { x, y }; })]; }
function fixture(id: string, events: string[], path: Direction[], checks: Predicate[] = [], patch: Record<string, Json> = {}) {
  const start = patch.start as Point | undefined ?? { x: 1, y: 1 };
  return scenario(id, { start, width: 6, height: 6, ...patch, events: events.map((name) => ({ name, value: 0 })) }, eq("visits", visits(path, start), "Every successful movement follows the planned control sequence"), ...checks);
}
const choiceProgram = (threshold: number, fault = false) => program({ start: [], choose: [branch(calc(fault ? "less" : "greater", read("event"), threshold), [move(0, 1), say("Upper route")], [move(1, 0), say("Lower route")])] });
function choiceCases(id: string, threshold: number) { return [threshold + 2, threshold, threshold - 2].map((value, index) => scenario(`${id}-${index}`, { start: { x: 1, y: 1 }, width: 6, height: 6, events: [{ name: "choose", value }] }, eq("visits", visits(value > threshold ? ["up"] : ["right"], { x: 1, y: 1 }), "The condition selects exactly the intended route"), eq("speech", [value > threshold ? "Upper route" : "Lower route"], "Feedback identifies the selected branch"), range("decisions", 1, 1, "Exactly one choice is evaluated"))); }
const choice = authorLesson({ id: "Y3.07", concepts: ["condition", "true", "false", "input"],
  explanation: "A condition selects one of two actions. In the choose handler, compare the event input with three. If it is greater than three, move up once and say Upper route. Otherwise move right once and say Lower route. Use the Event input value control to try both cases, including exactly three. A value equal to three is not greater than three. Only the selected branch should run; adding both routes in sequence does not implement a choice.",
  reasoning: ["Input five makes greater-than-three true, so the upper route runs. Input one selects the lower route.", "The boundary value three belongs in Otherwise. Test it separately instead of assuming that the two ordinary cases cover equality."],
  starter: program({ start: [], choose: [] }), reference: choiceProgram(3), faulty: choiceProgram(3, true), cases: choiceCases("two-route-choice", 3),
  transfer: [{ task: "Make choose select Up and Upper route only when the event input is greater than five; otherwise select Right and Lower route. Test above, equal and below five.", reference: choiceProgram(5), cases: choiceCases("new-choice-five", 5) }, { task: "Make choose select Up and Upper route only when the event input is greater than zero; otherwise select Right and Lower route. Include zero and a negative input.", reference: choiceProgram(0), cases: choiceCases("new-choice-zero", 0) }],
  prediction: { prompt: "The condition is input greater than three. Which branch runs for input three?", choices: ["The true branch", "Both branches", "Otherwise"], correct: 2 },
});

const moving = calc("or", not(calc("equal", read("dx"), 0)), not(calc("equal", read("dy"), 0)));
function motionProgram(fault = false) { return program({ start: [], right: [set("dx", fault ? 0 : 1), set("dy", fault ? 1 : 0), emit("tick")], left: [set("dx", -1), set("dy", 0), emit("tick")], up: [set("dx", 0), set("dy", 1), emit("tick")], down: [set("dx", 0), set("dy", -1), emit("tick")], release: [set("dx", 0), set("dy", 0)], tick: [branch(moving, [move(read("dx"), read("dy"))], [])] }, { dx: 0, dy: 0 }); }
const motionCases = (id: string, first: Direction, second: Direction) => [fixture(`${id}-held-release`, [first, "tick", "release", "tick"], [first, first], [eq("variables", { dx: 0, dy: 0 }, "Release clears both movement components")], { start: { x: 2, y: 2 } }), fixture(`${id}-new-axis`, [second, "release", "tick"], [second], [], { start: { x: 2, y: 2 } }), fixture(`${id}-restart`, [first, "tick", "restart", "tick"], [], [eq("variables", { dx: 0, dy: 0 }, "Restart returns to a released input state")], { start: { x: 2, y: 2 } })];
const input = authorLesson({ id: "Y3.08", concepts: ["input", "direction", "release", "tick"],
  explanation: "Directional input controls a character's movement components: dx changes x, and dy changes y. Press right to set dx one and dy zero, then emit tick to take one step. An extra tick repeats the held direction. Release sets both values to zero, so later ticks do not move. Left uses negative dx; Up and Down use positive and negative dy. This is a discrete, inspectable game clock: each tick is one movement opportunity, rather than a hidden continuous animation.",
  reasoning: ["Right must change x while preserving y. A right control wired to dy moves on the wrong axis.", "Release should clear both components. Test another tick after releasing, and verify that restart also returns to zero movement."],
  starter: program({ start: [], right: [], left: [], up: [], down: [], release: [], tick: [] }, { dx: 0, dy: 0 }), reference: motionProgram(), faulty: motionProgram(true), cases: motionCases("player-input", "right", "up"),
  transfer: [{ task: "Test left movement: its press and one extra tick must move left twice. Release then tick must stop it. Verify Down separately and restart from a released state.", reference: motionProgram(), cases: motionCases("left-down-input", "left", "down") }, { task: "Test upward movement: press Up and tick once more, then release and tick without further movement. Verify Right separately and check restart.", reference: motionProgram(), cases: motionCases("up-right-input", "up", "right") }],
  prediction: { prompt: "Release sets dx and dy to zero. What should a later tick do?", choices: ["Keep moving right", "Make no movement", "Choose a random direction"], correct: 1 },
});

const collisionProgram = (direction: Direction, fault = false) => program({ start: [move(vectors[direction][0], vectors[direction][1]), branch(fault ? not(read("collision")) : read("collision"), [set("hit", true), say("Contact")], [set("hit", false), say("Clear")])] }, { hit: false });
function collisionCases(id: string, direction: Direction, start = { x: 2, y: 2 }) { const [dx, dy] = vectors[direction], next = { x: start.x + dx, y: start.y + dy }, nearby = { x: next.x + (dy ? 1 : 0), y: next.y + (dx ? 1 : 0) }; return [true, false].map((touching) => scenario(`${id}-${touching ? "contact" : "near-miss"}`, { start, width: 7, height: 7, obstacles: [touching ? next : nearby] }, eq("collision", touching, "Only actual contact reports a collision"), eq("variables.hit", touching, "The response uses the actual contact state"), eq("speech", [touching ? "Contact" : "Clear"], "The bounded response distinguishes contact from a near miss"), eq("visits", touching ? [start] : [start, next], "A wall blocks movement but a nearby object does not"))); }
const collision = authorLesson({ id: "Y3.09", concepts: ["collision", "condition", "near miss"],
  explanation: "A collision is actual contact with a blocked square, not simply being near it. Try one Right move and read collision immediately afterward. If contact occurred, set hit true and say Contact; otherwise set hit false and say Clear. The wall blocks the move, so a contact run remains at its starting square. A wall beside the destination is a near miss and must allow movement. Use a single bounded response instead of repeatedly producing contact messages.",
  reasoning: ["The engine calculates collision from the attempted destination and the supplied wall positions. A learner-written success label cannot create contact.", "The contact and near-miss cases need opposite responses. A reversed condition can appear plausible on one picture while failing the other."],
  starter: empty, reference: collisionProgram("right"), faulty: collisionProgram("right", true), cases: collisionCases("right-contact", "right"),
  transfer: [{ task: "Respond to an upward attempt: report Contact and hit true only when the destination itself is blocked; ignore a wall beside it.", reference: collisionProgram("up"), cases: collisionCases("up-contact", "up") }, { task: "Build the same bounded contact decision for a leftward attempt. Verify actual blocking and a nearby object that must not trigger it.", reference: collisionProgram("left"), cases: collisionCases("left-contact", "left") }],
  prediction: { prompt: "A wall is beside the destination but not on it. Should a Right attempt report Contact?", choices: ["No, a near miss is not a collision", "Yes, every nearby wall counts", "Only if the sprite's name is Contact"], correct: 0 },
});

const atGoal = (goal: Point) => calc("and", calc("equal", read("x"), goal.x), calc("equal", read("y"), goal.y));
const winProgram = (goal: Point, fault = false) => program({ start: [], go: [move(1, 0), branch(fault ? read("collision") : atGoal(goal), [set("won", true), say("Goal reached")], [set("won", false), say("Not at goal")])] }, { won: false });
function winCases(id: string, goal: Point) { const start = { x: goal.x - 1, y: goal.y }; return [
  fixture(`${id}-wall`, ["go"], [], [eq("variables.won", false, "A blocked move cannot award a win"), eq("speech", ["Not at goal"], "Wall contact is not goal feedback")], { start, obstacles: [goal] }),
  fixture(`${id}-goal`, ["go"], ["right"], [eq("variables.won", true, "Reaching both goal coordinates wins"), eq("speech", ["Goal reached"], "Feedback identifies the actual goal")], { start }),
  fixture(`${id}-ordinary`, ["go"], ["right"], [eq("variables.won", false, "An ordinary unblocked move does not win")], { start: { x: goal.x - 2, y: goal.y } }),
]; }
const winning = authorLesson({ id: "Y3.10", concepts: ["goal", "win", "condition"],
  explanation: "A game wins when its goal condition is satisfied, not whenever movement stops. For this task the goal is x three, y one. The go event attempts one Right move, then checks both actual coordinates. At the goal, set won true and say Goal reached; otherwise set won false and say Not at goal. A wall can stop movement before the goal, and an ordinary clear move may still be short of it. Test those cases separately.",
  reasoning: ["Collision tells us that an attempted move was blocked. It does not establish that the sprite reached its destination.", "The goal condition joins x and y with And. Matching one coordinate alone is insufficient."],
  starter: program({ start: [], go: [] }, { won: false }), reference: winProgram({ x: 3, y: 1 }), faulty: winProgram({ x: 3, y: 1 }, true), cases: winCases("goal-versus-wall", { x: 3, y: 1 }),
  transfer: [{ task: "Use goal x four, y two. The go event attempts Right once and must distinguish reaching that goal, a blocking wall and an ordinary short move.", reference: winProgram({ x: 4, y: 2 }), cases: winCases("new-goal", { x: 4, y: 2 }) }, { task: "Use a different goal at x two, y three. Check both coordinates after go's Right move and never treat a collision as a win.", reference: winProgram({ x: 2, y: 3 }), cases: winCases("other-goal", { x: 2, y: 3 }) }],
  prediction: { prompt: "A wall prevents the sprite from reaching the goal. Has it won?", choices: ["Yes, all stopped movement is winning", "No, the actual goal condition is still false", "Yes, if the wall has a title"], correct: 1 },
});

function inside(dx: number | ReturnType<typeof read>, dy: number | ReturnType<typeof read>) {
  const nextX = calc("add", read("x"), dx), nextY = calc("add", read("y"), dy);
  return calc("and", calc("and", not(calc("less", nextX, 0)), calc("less", nextX, read("world.width"))), calc("and", not(calc("less", nextY, 0)), calc("less", nextY, read("world.height"))));
}
const safeMove = (direction: Direction, fault = false) => { const [dx, dy] = vectors[direction]; return program({ start: [], step: fault ? [move(dx, dy)] : [branch(inside(dx, dy), [move(dx, dy), say("Inside")], [say("Edge")])] }); };
function edgeCases(id: string, direction: Direction, sizes = [6, 8]) { const [dx, dy] = vectors[direction]; return sizes.flatMap((size) => [false, true].map((edge) => {
  const start = { x: dx > 0 ? size - (edge ? 1 : 2) : dx < 0 ? edge ? 0 : 1 : 2, y: dy > 0 ? size - (edge ? 1 : 2) : dy < 0 ? edge ? 0 : 1 : 2 };
  return fixture(`${id}-${size}-${edge ? "edge" : "inside"}`, ["step"], edge ? [] : [direction], [eq("speech", [edge ? "Edge" : "Inside"], "Boundary feedback matches whether a legal move exists")], { start, width: size, height: size });
})); }
const testing = authorLesson({ id: "Y3.11", concepts: ["test", "boundary", "condition"],
  explanation: "Plan tests for a normal move, a boundary and a changed board size. The step event wants to move Right once. Before moving, check that the next x and y remain at least zero and below world.width and world.height. A legal move says Inside; an edge attempt says Edge and leaves the character still. Coordinates run from zero to one less than the size. Use the actual world dimensions rather than hard-coding the edge of one screenshot.",
  reasoning: ["On a six-column board, x five is the last valid coordinate. A move from five to six must be refused before it leaves the board.", "A larger board has a different right edge. Tests at both sizes expose a guard copied from a single picture."],
  starter: safeMove("right", true), reference: safeMove("right"), faulty: safeMove("right", true), cases: [...edgeCases("right-boundary", "right")].reverse(),
  transfer: [{ task: "Guard an upward step using actual world.height. Test ordinary movement and the top boundary on both board sizes, with Inside or Edge feedback.", starter: safeMove("up", true), reference: safeMove("up"), cases: edgeCases("up-boundary", "up") }, { task: "Guard a leftward step at x zero and a normal inside square. Test both board sizes and keep the sprite still on an edge attempt.", starter: safeMove("left", true), reference: safeMove("left"), cases: edgeCases("left-boundary", "left") }],
  prediction: { prompt: "A board has width six and coordinates start at zero. What is the last valid x?", choices: ["Six", "Seven", "Five"], correct: 2 },
});

type Maze = { goal: Point; path: Direction[]; obstacles: Point[] };
const mazes: Maze[] = [{ goal: { x: 4, y: 3 }, path: ["up", "up", "right", "right", "right"], obstacles: [{ x: 2, y: 1 }, { x: 2, y: 2 }] }, { goal: { x: 5, y: 2 }, path: ["up", "right", "right", "right", "right"], obstacles: [{ x: 2, y: 1 }] }, { goal: { x: 2, y: 4 }, path: ["up", "up", "up", "right"], obstacles: [{ x: 2, y: 1 }, { x: 3, y: 3 }] }];
function mazeProgram(maze: Maze, faulty = false) {
  const handlers: Record<string, unknown[]> = { start: [], restart: [set("won", faulty)], release: [set("dx", 0), set("dy", 0)], tick: [branch(calc("and", not(read("won")), moving), [branch(inside(read("dx"), read("dy")), [move(read("dx"), read("dy")), branch(read("collision"), [say("Wall")], [branch(atGoal(maze.goal), [set("won", true), say("Goal reached")], [])])], [say("Edge")])], [])] };
  for (const direction of Object.keys(vectors) as Direction[]) handlers[direction] = [set("dx", vectors[direction][0]), set("dy", vectors[direction][1]), emit("tick")];
  return program(handlers, { dx: 0, dy: 0, won: false });
}
function mazeCases(id: string, maze: Maze) {
  const won = [eq("variables.won", true, "Only the actual goal awards a win"), eq("x", maze.goal.x, "The correct goal column is reached"), eq("y", maze.goal.y, "The correct goal row is reached"), eq("speech", ["Goal reached"], "The completed or restarted play has one current win message")];
  return [
    fixture(`${id}-complete-restart-complete`, [...maze.path, "release", "restart", ...maze.path, "release", "tick"], maze.path, won, { obstacles: maze.obstacles }),
    fixture(`${id}-win-stays-finished`, [...maze.path, "right", "tick"], maze.path, won, { obstacles: maze.obstacles }),
    fixture(`${id}-blocked-release`, ["right", "release", "tick"], [], [eq("variables.won", false, "A wall cannot award a win"), eq("speech", ["Wall"], "Contact is reported once without motion after release")], { obstacles: maze.obstacles }),
    fixture(`${id}-edge`, ["right", "release", "tick"], [], [eq("variables.won", false, "A boundary is not the goal"), eq("speech", ["Edge"], "The edge is refused before leaving the board")], { start: { x: 5, y: 5 }, obstacles: maze.obstacles }),
  ];
}
const maze = authorLesson({ id: "Y3.12", concepts: ["maze", "input", "collision", "win", "restart"], workflow: { saveAndReplay: true, restoreVersion: true },
  explanation: "Build a playable six-by-six maze starting at x one, y one, with goal x four, y three and the supplied walls. Direction buttons set dx and dy and emit one tick immediately. A further tick repeats the held direction; release clears it. Tick must check the board edge, attempt movement, distinguish a wall from the goal and stop further movement once won is true. Restart resets the world and your values, then runs the optional restart handler; keep won false there. Test a complete win, wall contact, release, the edge and a second complete game after restart. Save, restore and replay the maze.",
  reasoning: ["A valid route is Up, Up, Right, Right, Right. The first Right from the start is blocked, so a useful test must inspect actual contact rather than award a win.", "After a completed game, restart must permit a second game. A restart handler that sets won true prevents any new movement despite resetting the position."],
  starter: program({ start: [], restart: [], right: [], left: [], up: [], down: [], release: [], tick: [] }, { dx: 0, dy: 0, won: false }), reference: mazeProgram(mazes[0]!), faulty: mazeProgram(mazes[0]!, true), cases: mazeCases("playable-maze", mazes[0]!),
  transfer: mazes.slice(1).map((brief, index) => ({ task: `Build a new six-by-six maze with goal x ${brief.goal.x}, y ${brief.goal.y} and the supplied walls. One valid route is ${brief.path.join(", ")}. Preserve all directional, release, collision, boundary, win and restart behaviours; save, restore and replay.`, starter: program({ start: [], restart: [], right: [], left: [], up: [], down: [], release: [], tick: [] }, { dx: 0, dy: 0, won: false }), reference: mazeProgram(brief), cases: mazeCases(`new-playable-maze-${index}`, brief) })),
  prediction: { prompt: "The restart handler sets won true. What happens when a new game tries to move?", choices: ["Its won guard prevents movement", "The player instantly reaches the goal", "The walls disappear"], correct: 0 },
});

export const mazeBuilderActivities = [choice, input, collision, winning, testing, maze];
export const mazeTools = { choiceProgram, choiceCases, collisionProgram, collisionCases, safeMove, edgeCases, mazeProgram, mazeCases };
