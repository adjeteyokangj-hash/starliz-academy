import { authorModuleActivity, visual, move, repeat, scenario, eq, range } from "../authoring";
import type { Json, Predicate } from "../types";

type Direction = "right" | "up" | "left" | "down";
type Step = Direction | { say: string };
const vectors = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const say = (value: string) => ({ op: "say", value });
const commands = (steps: Step[]) => steps.map((step) => typeof step === "string" ? move(vectors[step][0], vectors[step][1]) : say(step.say));
const program = (handlers: Record<string, unknown[]>) => ({ variables: {}, handlers });
const moduleId = "stories-in-steps/story-events";
function evidence(steps: Step[], x: number, y: number, prefix = ""): Predicate[] {
  const path = (name: string) => prefix ? `${prefix}.${name}` : name;
  const visits: Json[] = [{ x, y }], timeline: Json[] = [], speech: string[] = [];
  for (const step of steps) {
    if (typeof step === "string") { x += vectors[step][0]; y += vectors[step][1]; visits.push({ x, y }); timeline.push({ type: "move", x, y }); }
    else { speech.push(step.say); timeline.push({ type: "say", text: step.say, x, y }); }
  }
  return [eq(path("visits"), visits, "Every story move happens in its requested order"), eq(path("storyEvents"), timeline, "Each speech bubble occurs at the intended point in the journey"), eq(path("speech"), speech, "The requested words occur exactly once in order"), eq(path("collision"), false, "The character remains on the stage")];
}
function startingCases(id: string, steps: Step[]) { return [0, 1].map((shift) => scenario(`${id}-${shift}`, { start: { x: 2 + shift, y: 2 + shift }, width: 10, height: 10, events: [{ name: shift ? "restart" : "start", value: 0 }] }, ...evidence(steps, 2 + shift, 2 + shift))); }
const trip: Step[] = [{ say: "Post begins" }, "right", "right", "up", { say: "Letter delivered" }];
const newTrips: Array<{ task: string; steps: Step[] }> = [
  { task: "Say Garden opens, move up then right twice, then say Seeds ready.", steps: [{ say: "Garden opens" }, "up", "right", "right", { say: "Seeds ready" }] },
  { task: "Say Boat leaves, move right then down twice, then say At the island.", steps: [{ say: "Boat leaves" }, "right", "down", "down", { say: "At the island" }] },
];
const recall = authorModuleActivity({ moduleId, kind: "consolidation", slot: 1,
  title: "Remember a story's opening and arrival", objective: "Reconstruct a new start-triggered story with speech at its actual opening and arrival positions.",
  concepts: ["start", "sequence", "speech"], essentialChecks: ["Start triggers the intended story", "Opening precedes movement and arrival follows it", "Restart replays without retaining old speech"], faultDescription: "The arrival bubble occurs before the character travels.",
  explanation: "Reconstruct a short delivery story from memory of how events and sequences work. When start fires, say Post begins, move right twice and up once, then say Letter delivered. Run and replay the combined movement-and-speech timeline. The arrival words must appear at the destination, not just somewhere in the same list of words. Restart and check the same story from the shifted stage position without carrying over old bubbles.",
  reasoning: ["The opening belongs before the three movements. Its timeline position is the starting square.", "The arrival phrase belongs after all three moves. Correct words in the wrong position still tell the wrong story."],
  starter: visual(program({ start: [] })), reference: visual(program({ start: commands(trip) })), faulty: visual(program({ start: commands([{ say: "Post begins" }, { say: "Letter delivered" }, "right", "right", "up"]) })), cases: startingCases("post-recall", trip),
  transfer: newTrips.map((brief, index) => ({ task: `${brief.task} Put the actions under start and verify both the first run and restart.`, reference: visual(program({ start: commands(brief.steps) })), cases: startingCases(`fresh-story-${index}`, brief.steps) })),
  prediction: { prompt: "Where should Letter delivered appear in the actual timeline?", choices: ["At the destination after all moves", "At the start before travelling", "Its position never matters"], correct: 0 },
});

const buttonCases = (id: string, event: string, steps: Step[]) => [
  scenario(`${id}-wait`, { start: { x: 2, y: 2 }, width: 10, height: 10, events: [{ name: "start", value: 0 }] }, ...evidence([], 2, 2)),
  scenario(`${id}-pressed`, { start: { x: 3, y: 3 }, width: 10, height: 10, events: [{ name: "start", value: 0 }, { name: event, value: 0 }] }, ...evidence(steps, 3, 3)),
  scenario(`${id}-reset`, { start: { x: 2, y: 2 }, width: 10, height: 10, events: ["start", event, "restart"].map((name) => ({ name, value: 0 })) }, ...evidence([], 2, 2)),
];
const eventStory = (event: string, steps: Step[], fault = false) => visual(program({ start: fault ? commands(steps) : [], [event]: fault ? [] : commands(steps) }));
const repair = authorModuleActivity({ moduleId, kind: "consolidation", slot: 2,
  title: "Repair the premature performance", objective: "Diagnose a new story that runs before its input and prove that restart returns it to waiting.",
  concepts: ["event", "debug", "restart"], essentialChecks: ["No story action occurs before input", "The requested button selects the complete story", "Restart clears the story and waits"], faultDescription: "The performance is under start instead of its perform input.",
  explanation: "A performance has the correct words and movements but begins before the audience presses perform. Inspect which event holds its actions. Leave start empty and move the complete performance into perform: say Curtain opens, move up twice, then say At the lookout. Test the waiting state, the selected input and restart. Do not make the story appear fixed by removing its opening or leaving an extra copy under start.",
  reasoning: ["A correct pressed-button result cannot prove that the scene waited. Run start on its own and inspect whether anything happened.", "Restart should clear prior words and movement, then fire the empty start event. It must not start the performance again."],
  starter: eventStory("perform", [{ say: "Curtain opens" }, "up", "up", { say: "At the lookout" }], true),
  reference: eventStory("perform", [{ say: "Curtain opens" }, "up", "up", { say: "At the lookout" }]), faulty: eventStory("perform", [{ say: "Curtain opens" }, "up", "up", { say: "At the lookout" }], true), cases: buttonCases("performance-repair", "perform", [{ say: "Curtain opens" }, "up", "up", { say: "At the lookout" }]),
  transfer: newTrips.map((brief, index) => ({ task: `${brief.task} Repair the trigger so the story waits for ${index ? "sail" : "plant"}; verify waiting, the selected input and restart.`, starter: eventStory(index ? "sail" : "plant", brief.steps, true), reference: eventStory(index ? "sail" : "plant", brief.steps), cases: buttonCases(`fresh-trigger-${index}`, index ? "sail" : "plant", brief.steps) })),
  prediction: { prompt: "Which extra test detects a story accidentally placed under start?", choices: ["Count the project names", "Run start before pressing its button", "Only check the last speech bubble"], correct: 1 },
});

type Dance = { unit: Direction[]; count: number; opening: string; closing: string };
const danceSteps = (dance: Dance): Step[] => [{ say: dance.opening }, ...Array.from({ length: dance.count }, () => dance.unit).flat(), { say: dance.closing }];
const danceProgram = (dance: Dance, grouped: boolean, fault = false) => program({ start: [say(dance.opening), ...(grouped ? [repeat(dance.count, commands(fault ? dance.unit.slice(0, -1) : dance.unit))] : commands(Array.from({ length: dance.count }, () => dance.unit).flat())), say(dance.closing)] });
const comparison = (dance: Dance, grouped = true, fault = false) => visual({ comparison: { left: danceProgram(dance, false), right: danceProgram(dance, grouped, fault) } });
function comparisonCases(id: string, dance: Dance) {
  return [0, 1].map((shift) => scenario(`${id}-${shift}`, { start: { x: 2 + shift, y: 2 + shift }, width: 10, height: 10 }, eq("equivalent", true, "The shorter program preserves actual movement and speech timing"), ...evidence(danceSteps(dance), 2 + shift, 2 + shift, "left"), ...evidence(danceSteps(dance), 2 + shift, 2 + shift, "right"), range("right.writtenCommands", dance.unit.length + 3, dance.unit.length + 3, "One complete group replaces the expanded repeated commands"), range("right.loopMoves", dance.unit.length * dance.count, dance.unit.length * dance.count, "All dance movements occur inside the repeat")));
}
const dances: Dance[] = [{ unit: ["right", "up", "left", "down"], count: 3, opening: "Festival begins", closing: "Back at the gate" }, { unit: ["up", "right", "down", "left"], count: 2, opening: "Parade begins", closing: "Parade returns" }, { unit: ["right", "up"], count: 3, opening: "Climb begins", closing: "At the top" }];
const improve = authorModuleActivity({ moduleId, kind: "consolidation", slot: 3,
  title: "Improve a festival story without changing it", objective: "Shorten an expanded story using one repeated unit and demonstrate equivalent movement and speech timing.",
  concepts: ["repeat", "equivalent", "improve"], essentialChecks: ["Both actual programs preserve the requested full timeline", "The improved version uses fewer written commands", "The whole repeated unit remains inside the group"], faultDescription: "The shortened program omits the final movement of the repeated square.",
  explanation: "Improve Program B while leaving Program A as the expanded comparison. Both must say Festival begins, perform right, up, left, down three times, then say Back at the gate. Replace the twelve expanded movement instructions in B with one complete four-move repeat. Compare both actual timelines, including the positions of their speech bubbles. A shorter program is not equivalent if it loses the last arrow in each unit or moves the closing words into the repeat.",
  reasoning: ["The repeated unit contains all four directions. Dropping Down changes every later position even if some earlier moves match.", "Keep the opening and closing outside the repeat so each is said once. Compare the written-command count separately from the executed move count."],
  starter: comparison(dances[0]!, false), reference: comparison(dances[0]!), faulty: comparison(dances[0]!, true, true), cases: comparisonCases("festival-comparison", dances[0]!),
  transfer: dances.slice(1).map((dance, index) => ({ task: `Improve Program B: say ${dance.opening}, repeat ${dance.unit.join(", ")} ${dance.count} times, then say ${dance.closing}. Preserve Program A and compare both complete timelines.`, starter: comparison(dance, false), reference: comparison(dance), cases: comparisonCases(`new-comparison-${index}`, dance) })),
  prediction: { prompt: "Which evidence proves that a shorter story still behaves the same?", choices: ["It has a repeat block somewhere", "It uses fewer words in its title", "Both actual speech-and-movement timelines match"], correct: 2 },
});

type Book = { opening: string; arrival: string; ending: string; unit: Direction[]; count: number };
const books: Book[] = [{ opening: "Welcome to the orchard", arrival: "At the apple tree", ending: "Ask the guide for help", unit: ["right", "up"], count: 2 }, { opening: "Welcome to the harbour", arrival: "At the boat", ending: "Ask the harbour guide", unit: ["right", "down"], count: 2 }, { opening: "Welcome to the museum", arrival: "At the robot display", ending: "Ask the museum guide", unit: ["up", "right"], count: 3 }];
function book(brief: Book, starter = false, fault = false) { return visual({ actors: {
  greeter: { origin: { x: 1, y: 1 }, program: program({ start: [], welcome: starter ? [] : [say(brief.opening)] }) },
  traveller: { origin: { x: 3, y: 3 }, program: program({ start: [], travel: starter || fault ? [] : [repeat(brief.count, commands(brief.unit)), say(brief.arrival)], ...(fault ? { welcome: [repeat(brief.count, commands(brief.unit)), say(brief.arrival)] } : {}) }) },
  helper: { origin: { x: 6, y: 1 }, program: program({ start: [], finish: starter ? [] : [say(brief.ending)] }) },
} }); }
function bookCases(id: string, brief: Book) {
  const trip: Step[] = [...Array.from({ length: brief.count }, () => brief.unit).flat(), { say: brief.arrival }];
  return [
    { events: ["start", "welcome"], greeting: true, travelling: false, ending: false },
    { events: ["start", "welcome", "travel", "finish"], greeting: true, travelling: true, ending: true },
    { events: ["start", "welcome", "travel", "finish", "restart", "travel"], greeting: false, travelling: true, ending: false },
  ].map((test, index) => scenario(`${id}-${index}`, { start: { x: 0, y: 0 }, width: 12, height: 12, events: test.events.map((name) => ({ name, value: 0 })) }, eq("actorCount", 3, "All three separately programmed story scenes exist"), ...evidence(test.greeting ? [{ say: brief.opening }] : [], 1, 1, "actors.greeter"), ...evidence(test.travelling ? trip : [], 3, 3, "actors.traveller"), ...evidence(test.ending ? [{ say: brief.ending }] : [], 6, 1, "actors.helper")));
}
const describe = (brief: Book) => `welcome makes greeter say ${brief.opening}; travel makes traveller repeat ${brief.unit.join(", ")} ${brief.count} times, then say ${brief.arrival}; finish makes helper say ${brief.ending}`;
const portfolio = authorModuleActivity({ moduleId, kind: "project",
  title: "Portfolio: an interactive visitor story", objective: "Build a three-part independently controlled visitor story with dialogue, repeated travel and a reliable restart.",
  concepts: ["scene", "event", "repeat", "restart", "version"], essentialChecks: ["Each input selects only its own scene", "Travel and arrival words occur in order", "Restart clears all scenes before a new selection", "The saved story can be restored and replayed"], faultDescription: "The travel scene is connected to welcome, so two scenes run together and the travel input is empty.",
  explanation: `Create a visitor story with three independently programmed characters. ${describe(books[0]!)}. Keep all start events empty. Test welcome on its own, the complete welcome-travel-finish journey, and a travel press after restarting the complete story. The fresh travel run must not retain old greeting or ending speech. Save the whole story, restore its working copy and replay the scene controls before explaining how their event names keep the scenes separate.`,
  reasoning: ["Each actor has its own event. A character selector only changes which program you edit; the event name determines when it runs.", "Restart clears the earlier performance for every character. Inspect all three outputs after a new travel input, not only traveller's endpoint."],
  starter: book(books[0]!, true), reference: book(books[0]!), faulty: book(books[0]!, false, true), cases: bookCases("visitor-story", books[0]!), workflow: { saveAndReplay: true, restoreVersion: true },
  transfer: books.slice(1).map((brief, index) => ({ task: `Build a new visitor story: ${describe(brief)}. Keep start empty, verify every control and restart, then save, restore and replay.`, starter: book(brief, true), reference: book(brief), cases: bookCases(`new-visitor-story-${index}`, brief) })),
  prediction: { prompt: "After restart, you press only travel. Which old speech should remain?", choices: ["No old greeting or ending; only the new travel scene runs", "Every earlier scene's speech", "Only the old ending"], correct: 0 },
});

export const storyRetrievalActivities = [recall, repair, improve, portfolio];
