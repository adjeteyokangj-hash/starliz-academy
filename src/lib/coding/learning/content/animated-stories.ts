import { authorLesson, visual, move, repeat, scenario, eq, range } from "../authoring";
import type { Json, Predicate } from "../types";
type Direction = "right" | "up" | "left" | "down";
type Step = Direction | { say: string };
const vector = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const say = (text: string) => ({ op: "say", value: text });
const code = (steps: Step[]) => steps.map((step) => typeof step === "string" ? move(vector[step][0], vector[step][1]) : say(step.say));
const program = (handlers: Record<string, unknown[]>) => ({ variables: {}, handlers });
const artifact = (steps: Step[], event = "start") => visual(program(event === "start" ? { start: code(steps) } : { start: [], [event]: code(steps) }));
function expected(steps: Step[], x: number, y: number) {
  const visits: Json[] = [{ x, y }], timeline: Json[] = [], speech: string[] = [];
  for (const step of steps) {
    if (typeof step === "string") { x += vector[step][0]; y += vector[step][1]; visits.push({ x, y }); timeline.push({ type: "move", x, y }); }
    else { speech.push(step.say); timeline.push({ type: "say", text: step.say, x, y }); }
  }
  return { visits, timeline, speech };
}
function checks(steps: Step[], x: number, y: number, prefix = "", loopMoves?: number): Predicate[] {
  const run = expected(steps, x, y), at = (path: string) => prefix ? `${prefix}.${path}` : path;
  return [eq(at("visits"), run.visits, "Every movement occurs in the intended story order"), eq(at("storyEvents"), run.timeline, "Speech occurs at its actual intended position between movements"), eq(at("speech"), run.speech, "The story says the requested words in order"), eq(at("collision"), false, "The scene remains on its stage"),
    ...(loopMoves === undefined ? [] : [range(at("loopMoves"), loopMoves, loopMoves, "The complete dance is inside its repeated group")])];
}
function cases(id: string, steps: Step[], loopMoves?: number) { return [0, 1].map((shift) => scenario(`${id}-${shift}`, { start: { x: 1 + shift, y: 1 + shift }, width: 10, height: 9, events: [{ name: shift ? "restart" : "start", value: 0 }] }, ...checks(steps, 1 + shift, 1 + shift, "", loopMoves))); }
const hello: Step[] = [{ say: "Ready" }, "right"], upwards: Step[] = [{ say: "Here" }, "up"], leftwards: Step[] = [{ say: "Hello" }, "left"];
const event = authorLesson({ id: "Y2.07", concepts: ["event", "start", "sprite"],
  explanation: "A sprite responds to the event that has its instructions. Put Say Ready and Move right in the start event. Run or restart the scene to fire start and inspect the actual speech and movement. Instructions saved under an unrelated button event do not run automatically. Use the event selector to find where the actions belong, then test the beginning of the scene again.",
  reasoning: ["The start event first says Ready, then moves the sprite one square right. Speech and movement are separate actual actions.", "A launch event is not automatically the start event. Keeping the right actions under the wrong name leaves the starting scene empty."],
  starter: visual(program({ start: [], launch: [] })), reference: artifact(hello), faulty: visual(program({ start: [], launch: code(hello) })), cases: cases("start-scene", hello),
  transfer: [{ task: "Make a new sprite say Here and move up once when the scene starts. Test both Run and restart.", reference: artifact(upwards), cases: cases("upward-start", upwards) }, { task: "Make another starting scene say Hello and move left once. The actions must belong to start, not an unrelated button.", reference: artifact(leftwards), cases: cases("leftward-start", leftwards) }],
  prediction: { prompt: "The start event is empty, but launch contains the story. What happens when start fires?", choices: ["The launch story runs automatically", "No story action runs", "Every event runs at once"], correct: 1 } });
const journey: Step[] = [{ say: "Starting" }, "right", "up", { say: "Arrived" }];
const pond: Step[] = [{ say: "Set off" }, "right", "right", "down", { say: "At the pond" }];
const bridge: Step[] = [{ say: "Ready" }, "up", "right", { say: "At the bridge" }];
const sequencing = authorLesson({ id: "Y2.08", concepts: ["sequence", "speech", "movement"],
  explanation: "A story's speech must happen at the right point in its movement. Say Starting, move right then up, and say Arrived only at the destination. The same words spoken before travelling tell a different story. Replay the actual event timeline to see which speech bubble appears at each position. Check the order of speech and movement together, rather than checking only their separate lists.",
  reasoning: ["Starting is spoken at the starting square; Arrived is spoken after both movements at the destination.", "Moving Arrived before the arrows keeps the same words and endpoint but gives the wrong meaning. The combined timeline reveals that fault."],
  starter: visual(program({ start: [] })), reference: artifact(journey), faulty: artifact([{ say: "Starting" }, { say: "Arrived" }, "right", "up"]), cases: cases("speech-and-movement", journey),
  transfer: [{ task: "Create a bridge story: say Ready, move up, move right, then say At the bridge. Match each bubble to its actual position.", reference: artifact(bridge), cases: cases("bridge-story", bridge) }, { task: "Create a pond story: say Set off, move right twice, move down once, then say At the pond. Inspect the combined speech-and-movement replay.", reference: artifact(pond), cases: cases("pond-story", pond) }],
  prediction: { prompt: "When should Arrived appear in the demonstrated journey?", choices: ["Before any movement", "After reaching the destination", "Only in the project title"], correct: 1 } });
type Dance = { unit: Direction[]; count: number; opening: string; closing: string };
const square: Dance = { unit: ["right", "up", "left", "down"], count: 2, opening: "Dance begins", closing: "Home again" };
const reverse: Dance = { unit: ["up", "right", "down", "left"], count: 3, opening: "Ready to dance", closing: "Back at home" };
const wide: Dance = { unit: ["right", "right", "up", "left", "left", "down"], count: 2, opening: "Wide dance begins", closing: "Wide dance finished" };
const danceSteps = (dance: Dance): Step[] => [{ say: dance.opening }, ...Array.from({ length: dance.count }, () => dance.unit).flat(), { say: dance.closing }];
const danceProgram = (dance: Dance) => program({ start: [say(dance.opening), repeat(dance.count, code(dance.unit)), say(dance.closing)] });
const danceWords = (dance: Dance) => `Say ${dance.opening}, repeat the whole ${dance.unit.join(", ")} group ${dance.count} times, then say ${dance.closing}.`;
const dance = authorLesson({ id: "Y2.09", concepts: ["repeat", "group", "dance"],
  explanation: "A dance repeats its whole movement pattern. Say Dance begins, repeat right, up, left, down twice, then say Home again. Keep every movement inside the group, including the closing down arrow. Speak the opening once before the repeated dance and the closing once afterward. Replay the complete timeline and count the actual movements, even when the character returns to its starting square.",
  reasoning: ["Two copies of a four-movement group produce eight movements, followed by one closing speech bubble.", "Leaving down outside the group changes both the repeated trail and the point where the final speech happens."],
  starter: visual(program({ start: [] })), reference: visual(danceProgram(square)), faulty: visual(program({ start: [say(square.opening), repeat(2, code(square.unit.slice(0, -1))), say(square.closing)] })), cases: cases("repeated-dance", danceSteps(square), 8),
  transfer: [reverse, wide].map((fresh, index) => ({ task: danceWords(fresh) + " Keep opening and closing speech outside the repeated group, and verify the actual complete trail.", reference: visual(danceProgram(fresh)), cases: cases(`new-dance-${index + 1}`, danceSteps(fresh), fresh.count * fresh.unit.length) })),
  prediction: { prompt: "The opening speech is before repeat 2. How many times is that opening speech spoken?", choices: ["Once", "Twice", "Eight times"], correct: 0 } });
function comparison(dance: Dance, faulty = false) { return visual({ comparison: { left: program({ start: code(danceSteps(dance)) }), right: faulty ? program({ start: [say(dance.opening), repeat(dance.count, code(dance.unit.slice(0, -1))), say(dance.closing)] }) : danceProgram(dance) } }); }
function comparisonCases(id: string, dance: Dance) { const steps = danceSteps(dance); return [0, 1].map((shift) => scenario(`${id}-${shift}`, { start: { x: 1 + shift, y: 1 + shift }, width: 10, height: 9 }, eq("equivalent", true, "Both programs produce the same complete speech-and-movement behaviour"), ...checks(steps, 1 + shift, 1 + shift, "left", 0), ...checks(steps, 1 + shift, 1 + shift, "right", dance.count * dance.unit.length), range("left.writtenCommands", steps.length, steps.length, "Program A retains its expanded baseline"), range("right.writtenCommands", 1, steps.length - 1, "Program B describes the same behaviour with fewer written commands"))); }
const comparing = authorLesson({ id: "Y2.10", concepts: ["equivalent", "clarity", "repeat"],
  explanation: "Two programs can describe the same story with different amounts of written code. Program A lists every dance movement. Make Program B shorter by grouping the repeated pattern, while keeping the opening and closing speech at the same positions. Compare the complete traces and the actual number of written commands. A shorter program is useful only if it still does the intended job.",
  reasoning: ["Program A writes eight movements separately. Program B writes the four-movement unit once inside repeat 2.", "Both must preserve the opening, each actual movement and the final speech. Making both programs equally wrong is not a correct comparison."],
  starter: visual({ comparison: { left: program({ start: code(danceSteps(square)) }), right: program({ start: [] }) } }), reference: comparison(square), faulty: comparison(square, true), cases: comparisonCases("same-goal", square),
  transfer: [reverse, wide].map((fresh, index) => ({ task: `Keep Program A's expanded baseline. Make Program B shorter while meeting this exact brief: ${danceWords(fresh)} Compare both complete traces and the number of written commands.`, starter: visual({ comparison: { left: program({ start: code(danceSteps(fresh)) }), right: program({ start: [] }) } }), reference: comparison(fresh), cases: comparisonCases(`new-comparison-${index + 1}`, fresh) })),
  prediction: { prompt: "A shorter program has a different speech-and-movement order. Is it equivalent?", choices: ["Yes, because it is shorter", "Yes, if the final square matches", "No, its observed behaviour differs"], correct: 2 } });
function inputCases(id: string, steps: Step[]) { return [scenario(`${id}-before-input`, { start: { x: 1, y: 1 }, width: 10, height: 9, events: [{ name: "start", value: 0 }] }, ...checks([], 1, 1)), scenario(`${id}-go`, { start: { x: 2, y: 2 }, width: 10, height: 9, events: [{ name: "start", value: 0 }, { name: "go", value: 0 }] }, ...checks(steps, 2, 2))]; }
const debugging = authorLesson({ id: "Y2.11", concepts: ["event", "debug", "order"],
  explanation: "Debug both the event that starts a scene and the order of its actions. This scene must wait until go is pressed, then say Ready, move up and right, and say At the bridge. Test waiting as well as the button press. If the story runs too early, inspect the event name. If a bubble appears too soon, inspect the action order. Repair one cause, then retest the whole scene.",
  reasoning: ["A story under start runs before the go input. Leave start empty and place the intended actions under go.", "A correct endpoint does not prove a correctly timed bubble. Inspect the combined timeline after repairing the trigger."],
  starter: visual(program({ start: code(bridge), go: [] })), reference: artifact(bridge, "go"), faulty: visual(program({ start: code(bridge), go: [] })), cases: inputCases("debug-trigger", bridge),
  transfer: [{ task: "Repair go's pond story so it waits for input and says At the pond after right, right, down, rather than before travelling.", starter: artifact([{ say: "Set off" }, { say: "At the pond" }, "right", "right", "down"], "go"), reference: artifact(pond, "go"), cases: inputCases("debug-new-timing", pond) }, { task: "Repair a different trigger fault: go must start Say Starting, right, up, Say Arrived. The scene must remain still before go is pressed.", starter: visual(program({ start: code(journey), go: [] })), reference: artifact(journey, "go"), cases: inputCases("debug-new-trigger", journey) }],
  prediction: { prompt: "A scene moves before go is pressed. What should you inspect first?", choices: ["Which event contains the actions", "The parent's dashboard", "Only the project title"], correct: 0 } });
type Chapters = { first: Dance; next: Dance; firstName: string; nextName: string };
const chapters: Chapters = { first: square, next: { unit: ["right", "up"], count: 2, opening: "Next scene begins", closing: "At the hill" }, firstName: "fox", nextName: "owl" };
function book(spec: Chapters, starter = false, faulty = false) { return visual({ actors: {
  [spec.firstName]: { origin: { x: 1, y: 1 }, program: program({ start: [], first: starter ? [] : (danceProgram(spec.first).handlers.start) }) },
  [spec.nextName]: { origin: { x: 4, y: 1 }, program: program({ start: [], next: starter || faulty ? [] : danceProgram(spec.next).handlers.start, ...(faulty ? { first: danceProgram(spec.next).handlers.start } : {}) }) },
} }); }
function bookCases(id: string, spec: Chapters) { return [
  { events: ["start", "first"], first: true, next: false }, { events: ["start", "first", "next"], first: true, next: true }, { events: ["start", "first", "next", "restart", "next"], first: false, next: true },
].map((test, index) => scenario(`${id}-${index}`, { start: { x: 0, y: 0 }, width: 10, height: 9, events: test.events.map((name) => ({ name, value: 0 })) }, eq("actorCount", 2, "Both independently programmed scenes are present"), ...checks(test.first ? danceSteps(spec.first) : [], 1, 1, `actors.${spec.firstName}`, test.first ? spec.first.count * spec.first.unit.length : undefined), ...checks(test.next ? danceSteps(spec.next) : [], 4, 1, `actors.${spec.nextName}`, test.next ? spec.next.count * spec.next.unit.length * test.events.filter((event) => event === "next").length : undefined))); }
const differentChapters: Chapters[] = [{ first: reverse, next: { unit: ["up", "right"], count: 2, opening: "Robot climbs", closing: "Robot arrives" }, firstName: "flower", nextName: "robot" }, { first: wide, next: { unit: ["right", "up"], count: 1, opening: "A short climb", closing: "At the lookout" }, firstName: "robot", nextName: "flower" }];
const project = authorLesson({ id: "Y2.12", concepts: ["event", "repeat", "scene", "restart"], workflow: { saveAndReplay: true, restoreVersion: true },
  explanation: "Create a two-scene interactive journey. The first button starts fox's scene: say Dance begins, repeat right, up, left, down twice, then say Home again. The next button starts owl's scene: say Next scene begins, repeat right, up twice, then say At the hill. Keep both start events empty. Test each input, restart the story, then save, retrieve and replay both separately programmed scenes.",
  reasoning: ["First selects fox's repeated square dance; next selects owl's repeated climb. Connecting both to first makes the second scene start too early.", "Restart clears earlier speech and movement. A next press after restarting should show the second chapter without replaying the first chapter's old speech."],
  starter: book(chapters, true), reference: book(chapters), faulty: book(chapters, false, true), cases: bookCases("two-scene-story", chapters),
  transfer: differentChapters.map((fresh, index) => ({ task: `Create a fresh two-scene journey. first selects ${fresh.firstName}: ${danceWords(fresh.first)} next selects ${fresh.nextName}: ${danceWords(fresh.next)} Keep both start events empty. Verify input order and restart, then save, retrieve and replay both scenes.`, starter: book(fresh, true), reference: book(fresh), cases: bookCases(`new-two-scene-story-${index + 1}`, fresh) })),
  prediction: { prompt: "Both scenes are connected to first. Which requirement is broken?", choices: ["The scenes have too many names", "The next input no longer selects its own scene", "Saving cannot store two programs"], correct: 1 } });

export const animatedStoryActivities = [event, sequencing, dance, comparing, debugging, project];
