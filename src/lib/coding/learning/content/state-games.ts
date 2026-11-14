import { authorLesson, visual, scenario, eq, range, read, calc, branch, set, change, repeat, move } from "../authoring";
import type { Json } from "../types";

const program = (handlers: Record<string, unknown[]>, variables: Record<string, Json> = {}) => visual({ variables, handlers });
const say = (value: unknown) => ({ op: "say", value });
const emit = (name: string) => ({ op: "emit", name });
const events = (names: string[]) => names.map((name) => ({ name, value: 0 }));
const empty = program({ start: [] });
const scoreProgram = (points: number, fault = false) => program({ start: [set("score", 0)], coin: [change("score", points)], restart: fault ? [set("score", points * 2)] : [] }, { score: 0 });
function scoreCases(id: string, points: number) { return [
  scenario(`${id}-two-coins`, { events: events(["start", "coin", "coin"]) }, eq("variables.score", points * 2, "Each coin input updates the score exactly once")),
  scenario(`${id}-restart`, { events: events(["start", "coin", "coin", "restart"]) }, eq("variables.score", 0, "Restart restores the actual initial score")),
  scenario(`${id}-play-again`, { events: events(["start", "coin", "restart", "coin"]) }, eq("variables.score", points, "A new play updates from the clean initial state")),
]; }
const scoreTests = scoreCases("remember-score", 1);
const score = authorLesson({ id: "Y4.01", concepts: ["variable", "score", "initialise", "restart"],
  explanation: "A score variable remembers changes during one play. Initialise score to zero and make each coin input add one exactly once. Test two coins, restart and a new coin after restart. The engine resets the world and runs start, then any explicit restart handler. A faulty restart handler writes the old two-coin value back after that reset; remove that reassignment rather than changing the coin value to compensate. Inspect the variable trace and actual score after each sequence.",
  reasoning: ["Two separate coin inputs should produce score two. One input should not emit the scoring action twice.", "Restart must initialise a new play, not assign the previous play's total. A coin after restart should therefore produce one."],
  starter: program({ start: [], coin: [], restart: [] }, { score: 0 }), reference: scoreProgram(1), faulty: scoreProgram(1, true), cases: scoreTests, debugCases: [scoreTests[1]!, scoreTests[0]!, scoreTests[2]!],
  transfer: [2, 3].map((points, index) => { const cases = scoreCases(`new-score-${index}`, points); return { task: `Build a new scoring rule: each coin adds ${points}, initialise at zero and verify two coins, clean restart and one coin in a new play.`, reference: scoreProgram(points), cases }; }),
  prediction: { prompt: "The score is two, then a clean restart initialises it to zero. What should one new one-point coin produce?", choices: ["Three", "One", "Two"], correct: 1 },
});

const playing = calc("equal", read("status"), "playing");
function counterProgram(lives: number, time: number, fault = false) { return program({ start: [], hit: [branch(fault ? true : calc("and", playing, calc("greater", read("lives"), 0)), [change("lives", -1), branch(calc("equal", read("lives"), 0), [set("status", "lost")], [])], [])], tick: [branch(calc("and", playing, calc("greater", read("time"), 0)), [change("time", -1), branch(calc("equal", read("time"), 0), [set("status", "timeout")], [])], [])] }, { lives, time, status: "playing" }); }
function counterCases(id: string, lives: number, time: number) { return [
  scenario(`${id}-lost`, { events: events(Array<string>(lives + 2).fill("hit")) }, eq("variables.lives", 0, "Lives stop at zero rather than becoming negative"), eq("variables.status", "lost", "Losing the final life creates the correct end state"), eq("variables.time", time, "Life loss does not silently alter the clock")),
  scenario(`${id}-timeout`, { events: events(Array<string>(time + 2).fill("tick")) }, eq("variables.time", 0, "The clock stops at zero"), eq("variables.status", "timeout", "The end state distinguishes timeout from life loss"), eq("variables.lives", lives, "Clock ticks do not remove lives")),
  scenario(`${id}-restart`, { events: events(["hit", "tick", "restart"]) }, eq("variables", { lives, time, status: "playing" }, "Restart restores both counters and the playing state")),
]; }
const counters = authorLesson({ id: "Y4.02", concepts: ["counter", "lives", "time", "end state"],
  explanation: "Lives and time are counters with lower limits and distinct end states. Begin with three lives and five clock units. Hit removes one life only while playing and above zero; losing the last life sets status lost. Tick removes one time unit only while playing and above zero; reaching zero sets status timeout. Later inputs must not make either counter negative. These are explicit inspectable clock ticks, not a claim that each server request lasts one second. Restart restores the initial counters and playing state.",
  reasoning: ["Guard the update before subtracting. Clamping a display while the actual lives variable is negative would not repair its state.", "A timeout and a lost life are different causes. Keep their state labels and untouched counters distinct."],
  starter: program({ start: [], hit: [], tick: [] }, { lives: 3, time: 5, status: "playing" }), reference: counterProgram(3, 5), faulty: counterProgram(3, 5, true), cases: counterCases("bounded-counters", 3, 5),
  transfer: [{ task: "Use two lives and four clock units. Prevent negative counters, distinguish lost from timeout and restore the complete initial state on restart.", reference: counterProgram(2, 4), cases: counterCases("new-counter-two-four", 2, 4) }, { task: "Use four lives and three clock units. Test repeated end-state inputs and a fresh restart rather than changing only the visible labels.", reference: counterProgram(4, 3), cases: counterCases("new-counter-four-three", 4, 3) }],
  prediction: { prompt: "Lives are zero and status is lost. What should another Hit do?", choices: ["Make lives negative", "Increase the time", "Leave the ended counters unchanged"], correct: 2 },
});

type Message = { name: string; value: number; dx: number; dy: number };
const messages: Message[] = [{ name: "parcel", value: 2, dx: 1, dy: 0 }, { name: "water", value: 3, dx: 0, dy: 1 }, { name: "light", value: 1, dx: -1, dy: 0 }];
function messageProgram(spec: Message, starter = false, faulty = false) { return visual({ actors: {
  sender: { origin: { x: 1, y: 1 }, program: { variables: {}, handlers: { start: [], launch: starter ? [] : [{ op: "broadcast", name: spec.name, value: spec.value }] } } },
  receiver: { origin: { x: 4, y: 2 }, program: { variables: { count: 0 }, handlers: { start: [], [faulty ? "wrong_message" : spec.name]: starter ? [] : [change("count", read("event")), move(spec.dx, spec.dy)] } } },
  bystander: { origin: { x: 7, y: 1 }, program: { variables: {}, handlers: { start: [], unrelated: [move(0, 1)] } } },
} }); }
function messageCases(id: string, spec: Message) { return [{ names: ["launch"], delivered: 1, total: 1 }, { names: ["launch", "launch"], delivered: 2, total: 2 }, { names: ["launch", "restart", "launch"], delivered: 1, total: 2 }].map((test, index) => scenario(`${id}-${index}`, { start: { x: 0, y: 0 }, width: 10, height: 10, events: events(test.names) }, eq("actorCount", 3, "The sender, intended receiver and unrelated character all exist"), range("broadcastCount", test.total, test.total, "Each launch actually sends one shared message"), eq("actors.receiver.variables.count", spec.value * test.delivered, "The intended receiver processes the actual payload once"), eq("actors.receiver.x", 4 + spec.dx * test.delivered, "The receiver's horizontal response is correct"), eq("actors.receiver.y", 2 + spec.dy * test.delivered, "The receiver's vertical response is correct"), eq("actors.bystander.visits", [{ x: 7, y: 1 }], "A character listening to another message remains still"))); }
const messaging = authorLesson({ id: "Y4.03", concepts: ["broadcast", "receiver", "message"],
  explanation: "A broadcast coordinates separate characters through a named message. Sender's launch input broadcasts parcel with value two. Receiver listens for parcel, adds the received event value to count and moves Right once. Bystander listens only for unrelated and must wait. Broadcast sends a queued message to matching handlers in all characters; Emit selects a local handler within one character. Test one launch, two launches and a launch after restart, checking that each delivered message acts once.",
  reasoning: ["The sender does not directly change Receiver's count. The named broadcast and receiver handler form the communication contract.", "Bystander's unrelated handler must not run merely because another message was sent. Restart should remove the receiver's earlier state before a new launch."],
  starter: messageProgram(messages[0]!, true), reference: messageProgram(messages[0]!), faulty: messageProgram(messages[0]!, false, true), cases: messageCases("parcel-broadcast", messages[0]!),
  transfer: messages.slice(1).map((spec, index) => ({ task: `Broadcast ${spec.name} with value ${spec.value} from launch. Receiver must add that payload and move ${spec.dx ? spec.dx > 0 ? "Right" : "Left" : "Up"} once; unrelated Bystander must wait. Verify repeated delivery and restart.`, starter: messageProgram(spec, true), reference: messageProgram(spec), cases: messageCases(`new-broadcast-${index}`, spec) })),
  prediction: { prompt: "Receiver listens for parcel but Sender broadcasts a different name. What happens to Receiver?", choices: ["It waits because the names do not match", "It always moves anyway", "It changes every character's score"], correct: 0 },
});

const nestedProgram = (outer: number, inner: number, up = false, faulty = false) => program({ start: [repeat(outer, [repeat(faulty ? outer : inner, [move(up ? 0 : 1, up ? 1 : 0)])])] });
function nestedCases(id: string, outer: number, inner: number, up = false) { return [0, 1].map((shift) => {
  const start = { x: 1 + shift, y: 1 + shift }, count = outer * inner;
  const visits = [start, ...Array.from({ length: count }, (_, index) => ({ x: start.x + (up ? 0 : index + 1), y: start.y + (up ? index + 1 : 0) }))];
  return scenario(`${id}-${shift}`, { start, width: 12, height: 12 }, eq("visits", visits, "The nested groups execute the predicted product of movements"), range("loopMoves", count, count, "Every actual movement happens inside the nested repetition"), range("repeatIterations", outer + outer * inner, outer + outer * inner, "The trace includes outer iterations and all inner iterations"), range("writtenCommands", 3, 3, "Two nested repeats contain one movement command"));
}); }
const nested = authorLesson({ id: "Y4.04", concepts: ["nested loop", "outer", "inner", "iteration"],
  explanation: "A loop inside another loop repeats a complete inner loop for every outer iteration. Build Repeat two containing Repeat three containing one Right move. Predict six actual moves: two groups of three. The iteration counter records two outer iterations plus six inner iterations, for eight loop iterations in total; that is different from the number of movements. Keep both counts bounded and inspect the trace from a shifted start as well.",
  reasoning: ["The inner count is three for each outer group, so the total is two times three rather than three alone.", "Changing the inner count to match the outer count produces only four moves. The full trail exposes that mistaken multiplication."],
  starter: empty, reference: nestedProgram(2, 3), faulty: nestedProgram(2, 3, false, true), cases: nestedCases("two-by-three", 2, 3),
  transfer: [{ task: "Build outer Repeat three and inner Repeat two around one Up move. Predict six movements and distinguish the three outer plus six inner iterations.", reference: nestedProgram(3, 2, true), cases: nestedCases("three-by-two-up", 3, 2, true) }, { task: "Build outer Repeat two and inner Repeat four around Right. Predict eight movements and verify both loops and the full shifted-start trail.", reference: nestedProgram(2, 4), cases: nestedCases("two-by-four-right", 2, 4) }],
  prediction: { prompt: "Outer Repeat two contains inner Repeat three with one movement. How many movements execute?", choices: ["Three", "Six", "Five"], correct: 1 },
});

function contactProgram(lives: number, faulty = false) { return program({ start: [], touch: [move(1, 0), emit("frame")], away: [move(-1, 0), emit("frame")], frame: [branch(calc("and", faulty ? read("collision") : calc("and", read("collision"), calc("not", read("wasTouching"))), calc("greater", read("lives"), 0)), [change("lives", -1)], []), set("wasTouching", read("collision"))] }, { lives, wasTouching: false }); }
function contactCases(id: string, lives: number, x = 1) { const start = { x, y: 1 }, obstacles = [{ x: x + 1, y: 1 }]; return [
  scenario(`${id}-held-contact`, { start, obstacles, events: events(["touch", "frame", "frame"]) }, eq("variables.lives", lives - 1, "One contact removes one life despite repeated frames"), eq("variables.wasTouching", true, "The contact flag records the continuing contact")),
  scenario(`${id}-new-contact`, { start, obstacles, events: events(["touch", "away", "touch", "touch"]) }, eq("variables.lives", Math.max(0, lives - 2), "Leaving contact clears the flag so a genuinely new contact can count")),
  scenario(`${id}-restart`, { start, obstacles, events: events(["touch", "restart", "touch"]) }, eq("variables.lives", lives - 1, "Restart clears the old contact flag before a new contact")),
]; }
const changing = authorLesson({ id: "Y4.05", concepts: ["state", "collision", "flag", "debug"],
  explanation: "A collision may remain true for several frames, but one contact should remove one life. Use wasTouching to remember whether that contact was already handled. Touch attempts Right into the wall and emits frame; frame subtracts only when collision is true, wasTouching is false and lives remain. Then update wasTouching from the actual collision reading. Away moves left and updates the flag. Inspect repeated frames, leaving and touching again, and restart. Do not merely slow the clock to hide repeated life loss.",
  reasoning: ["Repeated frames during one blocked contact must leave lives at two from an initial three. Without the flag guard they subtract again.", "Leaving contact must clear the flag. Otherwise a genuinely new contact would never remove a life."],
  starter: contactProgram(3, true), reference: contactProgram(3), faulty: contactProgram(3, true), cases: contactCases("contact-state-trace", 3),
  transfer: [{ task: "Repair the same continuing-contact fault with four initial lives and the shifted wall. One contact counts once, leaving permits a new contact, and restart clears the flag.", starter: contactProgram(4, true), reference: contactProgram(4), cases: contactCases("new-four-life-contact", 4, 2) }, { task: "Use two lives and a new wall position. Preserve one-life-per-contact behaviour, allow a genuinely new contact after leaving, and reset the flag on restart.", starter: contactProgram(2, true), reference: contactProgram(2), cases: contactCases("new-two-life-contact", 2, 3) }],
  prediction: { prompt: "Collision remains true for three frames of one contact. How many lives should this rule remove?", choices: ["Three", "Zero forever", "One"], correct: 2 },
});

type Game = { question: number; target: number; lives: number; time: number };
const games: Game[] = [{ question: 2, target: 3, lives: 3, time: 5 }, { question: 5, target: 2, lives: 2, time: 4 }, { question: 3, target: 4, lives: 2, time: 6 }];
function gameProgram(spec: Game, faulty = false) { return program({
  start: [say(calc("add", "Question: ", read("question")))], restart: faulty ? [set("accepting", false)] : [],
  answer: [branch(calc("and", playing, read("accepting")), [set("accepting", false), branch(calc("equal", read("event"), read("question")), [change("score", 1), change("question", 1), say("Correct"), branch(calc("equal", read("score"), spec.target), [set("status", "won"), say("Mission won")], [])], [change("lives", -1), say("Try again"), branch(calc("equal", read("lives"), 0), [set("status", "lost")], [])])], [])],
  next: [branch(playing, [set("accepting", true), say(calc("add", "Question: ", read("question")))], [])],
  tick: [branch(calc("and", playing, calc("greater", read("time"), 0)), [change("time", -1), branch(calc("equal", read("time"), 0), [set("status", "timeout")], [])], [])],
}, { score: 0, lives: spec.lives, time: spec.time, status: "playing", question: spec.question, accepting: true }); }
const winningEvents = (spec: Game) => Array.from({ length: spec.target }, (_, index) => [{ name: "answer", value: spec.question + index }, ...(index < spec.target - 1 ? [{ name: "next", value: 0 }] : [])]).flat();
function gameCases(id: string, spec: Game) { const win = winningEvents(spec); return [
  scenario(`${id}-win-replay-win`, { events: [...win, { name: "restart", value: 0 }, ...win] }, eq("variables.score", spec.target, "The replay scores only its own correct answers"), eq("variables.status", "won", "The new play can reach a genuine win"), eq("variables.lives", spec.lives, "Correct answers do not remove lives"), eq("variables.question", spec.question + spec.target, "Questions advance exactly once per accepted correct answer")),
  scenario(`${id}-duplicate-answer`, { events: [{ name: "answer", value: spec.question }, { name: "answer", value: spec.question + 1 }] }, eq("variables.score", 1, "A second answer cannot score before the next-round flag is enabled")),
  scenario(`${id}-loss`, { events: Array.from({ length: spec.lives + 1 }, () => [{ name: "answer", value: -99 }, { name: "next", value: 0 }]).flat() }, eq("variables.lives", 0, "Wrong answers reach zero lives without going negative"), eq("variables.status", "lost", "The loss state is tested independently of a win")),
  scenario(`${id}-timeout`, { events: events(Array<string>(spec.time + 1).fill("tick")) }, eq("variables.time", 0, "The explicit game clock stops at zero"), eq("variables.status", "timeout", "Time exhaustion has its own end state")),
]; }
const game = authorLesson({ id: "Y4.06", concepts: ["score", "lives", "time", "flag", "replay"], workflow: { saveAndReplay: true, restoreVersion: true },
  explanation: "Build a playable number mission. Start with question two, score zero, three lives and five clock units. Answer accepts the typed event value once per round: a matching answer adds one score and advances the question, while a wrong answer removes one life. Next enables another answer. Win at three correct answers; lose at zero lives; Tick can end the game by timeout. After an answer, accepting must stay false until Next, and ended games must ignore more inputs. Restart must clear that flag for a new playable mission. Save, restore and replay win, loss, timeout and restart cases.",
  reasoning: ["The accepting flag prevents two answer inputs from scoring in one round. Next deliberately opens the next opportunity.", "A replay can have correct counters but remain unplayable if its restart handler sets accepting false. Test another full win after restarting."],
  starter: program({ start: [], restart: [], answer: [], next: [], tick: [] }, { score: 0, lives: 3, time: 5, status: "playing", question: 2, accepting: true }), reference: gameProgram(games[0]!), faulty: gameProgram(games[0]!, true), cases: gameCases("number-mission", games[0]!),
  transfer: games.slice(1).map((spec, index) => ({ task: `Build a new number mission starting at question ${spec.question}, winning at ${spec.target} correct answers, with ${spec.lives} lives and ${spec.time} clock units. Preserve one accepted answer per round, all end states and clean replay; save, restore and play again.`, starter: program({ start: [], restart: [], answer: [], next: [], tick: [] }, { score: 0, lives: spec.lives, time: spec.time, status: "playing", question: spec.question, accepting: true }), reference: gameProgram(spec), cases: gameCases(`new-number-mission-${index}`, spec) })),
  prediction: { prompt: "A replay starts with accepting false and no answer has been taken. What breaks?", choices: ["The first answer is ignored until the flag is correctly reset", "The score automatically wins", "The time counter automatically refills"], correct: 0 },
});

export const stateGameActivities = [score, counters, messaging, nested, changing, game];
export const stateGameTools = { scoreProgram, scoreCases, contactProgram, contactCases, messageProgram, messageCases, gameProgram, gameCases };
