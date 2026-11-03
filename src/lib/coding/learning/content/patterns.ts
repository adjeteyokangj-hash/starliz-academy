import { authorLesson, machine, move, repeat, scenario, eq, range, visual } from "../authoring";
import type { PracticalArtifact, PracticalCase } from "../types";

const right = move(1, 0), up = move(0, 1), left = move(-1, 0), down = move(0, -1);
const program = (commands: unknown[]) => ({ variables: {}, handlers: { start: commands } });
function pathCase(id: string, start: { x: number; y: number }, offsets: Array<[number, number]>, useRepeat = true): PracticalCase {
  const visits = [{ ...start }];
  for (const [dx, dy] of offsets) { const previous = visits.at(-1)!; visits.push({ x: previous.x + dx, y: previous.y + dy }); }
  return scenario(id, { start }, eq("visits", visits, "Every movement follows the pictured pattern in order"),
    eq("moves", offsets.length, "The pattern has the required number of movements"),
    ...(useRepeat ? [range("loopMoves", offsets.length, offsets.length, "The repeated group produces every movement")] : []));
}
const stair = [[1, 0], [0, 1], [1, 0], [0, 1]] as Array<[number, number]>;
const returnPath = [[-1, 0], [0, 1], [-1, 0], [0, 1]] as Array<[number, number]>;
const downward = [[1, 0], [0, -1], [1, 0], [0, -1]] as Array<[number, number]>;
const staircase = machine({ start: [repeat(2, [right, up])] });
const stairCases = [pathCase("lower-start", { x: 0, y: 0 }, stair), pathCase("shifted-start", { x: 1, y: 1 }, stair)];
const stairTransfers = [
  { task: "Make a new two-part pattern: left then up, twice. Start at column 4, row 1. Keep both arrows inside the repeated group.", reference: machine({ start: [repeat(2, [left, up])] }), cases: [pathCase("left-pattern", { x: 3, y: 0 }, returnPath), pathCase("left-pattern-shifted", { x: 4, y: 1 }, returnPath)] },
  { task: "Make a new two-part pattern: right then down, twice. Start at column 1, row 4. Check each movement, including the last down arrow.", reference: machine({ start: [repeat(2, [right, down])] }), cases: [pathCase("down-pattern", { x: 0, y: 3 }, downward), pathCase("down-pattern-shifted", { x: 1, y: 4 }, downward)] },
];

const first = authorLesson({ id: "Y1.13", concepts: ["pattern", "continuation"],
  explanation: "A pattern has a part that happens again. Read these arrows aloud: right, up, right, up. The part is right then up. To continue, use that same pair in that same order. A repeated group is a way to tell the character to perform the pair again. Look at all the visited squares, not only the last square: a different route can finish in the same place.",
  reasoning: ["Circle the smallest part that repeats: right then up. Count two copies of that part.", "Trace right, up, right, up from the marked start. The path makes two rising steps."],
  starter: machine({ start: [right] }), reference: machine({ start: [right, up, right, up] }), faulty: machine({ start: [right, up, right, right] }),
  cases: [pathCase("spot-pattern", { x: 0, y: 0 }, stair, false), pathCase("spot-pattern-shifted", { x: 1, y: 1 }, stair, false)],
  transfer: [
    { ...stairTransfers[0]!, task: "Continue left then up, left then up. Start at column 4, row 1. Use separate arrows to complete the repeating pattern.", reference: machine({ start: [left, up, left, up] }), cases: stairTransfers[0]!.cases.map((test) => ({ ...test, assertions: test.assertions.filter((check) => check.path !== "loopMoves") })) },
    { ...stairTransfers[1]!, task: "Continue right then down, right then down. Start at column 1, row 4. Use separate arrows and check their order.", reference: machine({ start: [right, down, right, down] }), cases: stairTransfers[1]!.cases.map((test) => ({ ...test, assertions: test.assertions.filter((check) => check.path !== "loopMoves") })) },
  ],
  prediction: { prompt: "The group says right then up. It runs twice. Which arrows will play?", choices: ["Right, up, right, up", "Right, right, up, up", "Right, up, up"], correct: 0 },
  misconception: "A repeated pattern keeps the order inside its group. Swapping or replacing one arrow changes the pattern." });

const straight = machine({ start: [repeat(3, [right])] });
const straightCases = [pathCase("three-right", { x: 0, y: 0 }, [[1, 0], [1, 0], [1, 0]]), pathCase("three-right-shifted", { x: 1, y: 1 }, [[1, 0], [1, 0], [1, 0]])];
const second = authorLesson({ id: "Y1.14", concepts: ["repeat", "count"],
  explanation: "Three right arrows can be written as repeat 3 with one right arrow inside. The number tells us how many times the inside action runs. It is not a destination and it does not mean three extra moves. Start with one arrow inside the group, then count each visit as it runs. When the character starts somewhere else, the same program still moves three squares.",
  reasoning: ["One right arrow runs once for each count: one, two, three.", "Repeat 4 overshoots by one square. Repair the count rather than adding a left arrow afterward."],
  starter: machine({ start: [right, right, right] }), reference: straight, faulty: machine({ start: [repeat(4, [right])] }), cases: straightCases,
  transfer: [
    { task: "Reach two squares to the right using one right arrow inside a repeat. Test from both marked starts.", reference: machine({ start: [repeat(2, [right])] }), cases: [pathCase("two-right", { x: 0, y: 0 }, [[1, 0], [1, 0]]), pathCase("two-right-shifted", { x: 2, y: 1 }, [[1, 0], [1, 0]])] },
    { task: "Reach four squares above the start using one up arrow inside a repeat. Explain what the count controls.", reference: machine({ start: [repeat(4, [up])] }), cases: [pathCase("four-up", { x: 0, y: 0 }, [[0, 1], [0, 1], [0, 1], [0, 1]]), pathCase("four-up-shifted", { x: 1, y: 1 }, [[0, 1], [0, 1], [0, 1], [0, 1]])] },
  ], prediction: { prompt: "Repeat 3 contains one right arrow. How many moves happen?", choices: ["One", "Three", "Four"], correct: 1 },
  misconception: "The repeat count includes the first action; repeat 3 is three moves in total." });

const third = authorLesson({ id: "Y1.15", concepts: ["group", "order"],
  explanation: "A repeat can hold more than one action. Put right and up together inside repeat 2. Each turn through the group does right and then up. The computer finishes the whole group before starting it again. An up arrow outside the group runs only once, after every repeated right arrow. Move that arrow inside when both actions belong to the pattern.",
  reasoning: ["Read the inside group as a small sequence: right then up.", "Repeat the whole small sequence twice. Four moves happen, with up appearing second and fourth."],
  starter: machine({ start: [repeat(2, [right]), up] }), reference: staircase, faulty: machine({ start: [repeat(2, [right]), up] }), cases: stairCases, transfer: stairTransfers,
  prediction: { prompt: "Which action happens fourth in repeat 2 containing right then up?", choices: ["Right", "Up", "There is no fourth action"], correct: 1 },
  misconception: "An arrow placed after a repeat is not part of the repeated group." });

function pair(repeated: unknown[], expanded: unknown[]): PracticalArtifact { return visual({ comparison: { left: program(repeated), right: program(expanded) } }); }
function comparisonCases(offsets: Array<[number, number]>, starts: Array<{ x: number; y: number }>) {
  return starts.map((start, index) => {
    const checks = pathCase(`pair-${index}`, start, offsets).assertions;
    return scenario(`pair-${index}`, { start }, eq("equivalent", true, "Both programs produce the same movement trace"),
      ...checks.map((check) => ({ ...check, path: `left.${check.path}` })),
      eq("right.repeatIterations", 0, "The second program uses expanded arrows"));
  });
}
const fourth = authorLesson({ id: "Y1.16", concepts: ["equivalent", "trace"],
  explanation: "Two programs can look different and do the same thing. On the left, repeat 2 holds right then up. On the right, four separate arrows say right, up, right, up. Compare the visited squares one by one. The programs are equivalent for this task when their whole movement traces match, including their order. Matching just the finish is not enough.",
  reasoning: ["Expand the repeated group by copying its two actions twice.", "Compare visit 1 with visit 1, visit 2 with visit 2, and continue. An omitted up arrow creates the first difference."],
  starter: pair([repeat(2, [right, up])], [right]), reference: pair([repeat(2, [right, up])], [right, up, right, up]), faulty: pair([repeat(2, [right, up])], [right, up, right]),
  cases: comparisonCases(stair, [{ x: 0, y: 0 }, { x: 1, y: 1 }]),
  transfer: [
    { task: "Compare repeat 2 containing left then up with its separate arrows. Repair the expanded program so every visited square matches.", reference: pair([repeat(2, [left, up])], [left, up, left, up]), cases: comparisonCases(returnPath, [{ x: 3, y: 0 }, { x: 4, y: 1 }]) },
    { task: "Build a repeated right-down program and an equivalent expanded program. Both must follow right, down, right, down.", reference: pair([repeat(2, [right, down])], [right, down, right, down]), cases: comparisonCases(downward, [{ x: 0, y: 3 }, { x: 1, y: 4 }]) },
  ], prediction: { prompt: "Do repeat 2 of right-up and the arrows right-up-right-up visit the same squares?", choices: ["Yes, in the same order", "Only their first square matches", "They always finish on different squares"], correct: 0 },
  misconception: "A repeated and expanded program must agree at every required movement, not just at the destination." });

const gardenProgram = program([repeat(2, [right, up, left, down])]);
const garden = visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: gardenProgram } } });
function gardenCases(actors: Record<string, { moves: number; x: number; y: number; path?: "right" | "up" }>): PracticalCase[] {
  return [false, true].map((restart) => scenario(restart ? "restart" : "first-play", { width: 10, height: 10, events: restart ? [{ name: "start" }, { name: "restart" }] : [{ name: "start" }] },
    eq("actorCount", Object.keys(actors).length, "Every planned flower pattern runs"),
    ...Object.entries(actors).flatMap(([name, expected]) => {
      const offsets: Array<[number, number]> = (expected.path ?? (name === "rose" ? "up" : "right")) === "right" ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[0, 1], [1, 0], [0, -1], [-1, 0]];
      const visits = [{ x: expected.x, y: expected.y }];
      for (let moveIndex = 0; moveIndex < expected.moves; moveIndex++) { const previous = visits.at(-1)!, offset = offsets[moveIndex % 4]!; visits.push({ x: previous.x + offset[0], y: previous.y + offset[1] }); }
      return [eq(`actors.${name}.visits`, visits, `Every ${name} flower movement follows its own pictured pattern`), eq(`actors.${name}.moves`, expected.moves, `The ${name} flower repeats the intended number of moves`), eq(`actors.${name}.x`, expected.x, `The ${name} flower returns to its starting column`), eq(`actors.${name}.y`, expected.y, `The ${name} flower returns to its starting row`), range(`actors.${name}.loopMoves`, expected.moves, expected.moves * 2, `The ${name} flower uses its repeat group`)];
    })));
}
const fifth = authorLesson({ id: "Y1.17", concepts: ["restart", "pattern"],
  explanation: "A flower can dance around a square and return to its starting point. Put right, up, left and down inside repeat 2. The trail shows two journeys around the square. Restart should begin at the flower's original square and clear its old trail before playing again. Compare the first play and the restarted play: the flower should follow the same pattern, not drift away.",
  reasoning: ["One square journey uses four moves and returns to the origin. Two journeys use eight moves.", "Restart restores the starting position before the same arrows run again. A missing down arrow leaves the flower too high."],
  starter: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: program([]) } } }), reference: garden,
  faulty: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: program([repeat(2, [right, up, left])]) } } }), cases: gardenCases({ fern: { moves: 8, x: 0, y: 0 } }),
  transfer: [
    { task: "Animate fern around a square three times. It must return to its start and repeat the same trail after Restart.", reference: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: program([repeat(3, [right, up, left, down])]) } } }), cases: gardenCases({ fern: { moves: 12, x: 0, y: 0 } }) },
    { task: "Place a flower named rose at column 4, row 1. Make it travel up, right, down, left twice and restart consistently.", reference: visual({ actors: { rose: { origin: { x: 3, y: 0 }, program: program([repeat(2, [up, right, down, left])]) } } }), cases: gardenCases({ rose: { moves: 8, x: 3, y: 0 } }) },
  ], prediction: { prompt: "A flower repeats right-up-left-down twice. Where does it finish?", choices: ["At its starting square", "Two squares to the right", "One square above its start"], correct: 0 },
  misconception: "Restart is a fresh play from the original state; it must not continue from the previous finish." });

const twoFlowers = visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: gardenProgram }, rose: { origin: { x: 3, y: 0 }, program: program([repeat(3, [up, right, down, left])]) } } });
const sixth = authorLesson({ id: "Y1.18", concepts: ["independent", "project"],
  explanation: "Plan two flower dances before you build your garden. Fern starts at column 1 and walks right, up, left, down twice. Rose starts at column 4 and walks up, right, down, left three times. Each flower has its own program and its own start. Check both trails, repair any missing arrow, and save the garden as a version you can reopen. A correct fern does not prove that rose works.",
  reasoning: ["Test fern alone against its eight moves, then rose against its twelve moves.", "Run the whole garden and Restart. Both flowers must return to their own origins. Keep a saved working version before making a new design."],
  starter: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: program([]) }, rose: { origin: { x: 3, y: 0 }, program: program([]) } } }), reference: twoFlowers,
  faulty: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: gardenProgram }, rose: { origin: { x: 3, y: 0 }, program: program([repeat(3, [up, right, down])]) } } }), cases: gardenCases({ fern: { moves: 8, x: 0, y: 0 }, rose: { moves: 12, x: 3, y: 0 } }),
  transfer: [
    { task: "Create two flowers: fern makes one right-up-left-down journey from column 1, row 1; rose makes two right-up-left-down journeys from column 4, row 1. Keep each dance in its own repeat group and test Restart.", reference: visual({ actors: { fern: { origin: { x: 0, y: 0 }, program: program([repeat(1, [right, up, left, down])]) }, rose: { origin: { x: 3, y: 0 }, program: gardenProgram } } }), cases: gardenCases({ fern: { moves: 4, x: 0, y: 0 }, rose: { moves: 8, x: 3, y: 0, path: "right" } }) },
    { task: "Create fern at column 2, row 2 with three square journeys and rose at column 5, row 2 with one. Save, reopen and test both dances, including Restart.", reference: visual({ actors: { fern: { origin: { x: 1, y: 1 }, program: program([repeat(3, [right, up, left, down])]) }, rose: { origin: { x: 4, y: 1 }, program: program([repeat(1, [up, right, down, left])]) } } }), cases: gardenCases({ fern: { moves: 12, x: 1, y: 1 }, rose: { moves: 4, x: 4, y: 1 } }) },
  ], prediction: { prompt: "Fern uses repeat 2 with four arrows; rose uses repeat 3 with four arrows. How many moves does rose make?", choices: ["Three", "Eight", "Twelve"], correct: 2 },
  misconception: "Each flower needs its own correct repeat count and ordered group; checking only one flower leaves the other untested." });

export const patternActivities = [first, second, third, fourth, fifth, sixth];
