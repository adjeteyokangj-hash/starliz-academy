import { z } from "zod";
import { runSimulation, simulationBriefs, initialSimulation, stepSimulation, simulationActions, simulationStateSchema, type SimulationState } from "./simulation";
import { boundedJson } from "../learning/types";
import { executeVisual, visualProgramSchema, type VisualCommand } from "../learning/visual-machine";

export class WorldInputError extends Error {}
export const WORLD_KEY = "curriculum:game-world:v1";
export const locations = [
  { id: "pizza", title: "Pizza Restaurant", icon: "🍕", character: "Chef Pip", story: "Help Chef Pip feed the Inventors Academy.", cycle: ["prepare", "top", "bake", "serve"], result: "Pizzas served", x: 22, y: 25 },
  { id: "robot", title: "Robot Factory", icon: "🤖", character: "Ada", story: "Build helpful robots for the whole world.", cycle: ["assemble", "connect", "test", "activate"], result: "Robots ready", x: 50, y: 15 },
  { id: "farm", title: "Happy Farm", icon: "🌱", character: "Farmer Fern", story: "Grow food with thoughtful automation.", cycle: ["plant", "water", "grow", "harvest"], result: "Crops harvested", x: 78, y: 25 },
  { id: "traffic", title: "Traffic City", icon: "🚦", character: "Officer Dot", story: "Make safe journeys through the city.", cycle: ["stop", "cross", "clear", "go"], result: "Safe crossings", x: 22, y: 70 },
  { id: "space", title: "Space Centre", icon: "🚀", character: "Captain Nova", story: "Prepare a scientific exploration mission.", cycle: ["fuel", "check", "launch", "collect"], result: "Samples collected", x: 50, y: 82 },
  { id: "pets", title: "Pet Care Centre", icon: "🐾", character: "Dr Luna", story: "Create caring routines for virtual animals.", cycle: ["check", "feed", "clean", "rest"], result: "Pets cared for", x: 78, y: 70 },
] as const;
export type LocationId = typeof locations[number]["id"];
export const locationIds = locations.map(l => l.id) as [LocationId, ...LocationId[]];
export type Mission = { id: string; location: LocationId; chapter: number; title: string; objective: string; count: number; conditional: boolean; prerequisite?: string; prerequisites?: string[]; actions?: string[]; simulation?: LocationId };
const beginnerGoals: Record<LocationId, string> = {
  pizza: "Help Chef Pip serve one pizza. Choose the kitchen actions and decide their order.",
  robot: "Help Ada finish one robot. Choose the workshop actions and decide their order.",
  farm: "Help Farmer Fern harvest one crop. Choose the growing actions and decide their order.",
  traffic: "Help Officer Dot complete one safe crossing. Choose the street actions and decide their order.",
  space: "Help Captain Nova bring one sample home. Choose the launch actions and decide their order.",
  pets: "Help Dr Luna finish one care visit. Choose the care actions and decide their order.",
};
export const missions: Mission[] = locations.flatMap(location => [
  { id: `${location.id}-sequence`, location: location.id, chapter: 1, title: "A helpful beginning", objective: beginnerGoals[location.id], count: 1, conditional: false },
  { id: `${location.id}-loop`, location: location.id, chapter: 2, title: "Invent a routine", objective: "Repeat your whole first routine three times. Use a repeat block so the pattern is clear.", count: 3, conditional: false, prerequisite: `${location.id}-sequence` },
  { id: `${location.id}-decision`, location: location.id, chapter: 3, title: "A thoughtful invention", objective: "Sometimes this character needs help before the routine, and sometimes they are ready to begin. Read needsHelp, choose a different opening action for each situation, then repeat the routine twice. Your invention is tested with both values.", count: 2, conditional: true, prerequisite: `${location.id}-loop` },
]);
missions.push(
  { id: "robot-farm-invention", location: "robot", chapter: 4, title: "A robot for Happy Farm", objective: "Finish the robot routine, then the farm routine. Repeat that whole invention twice.", count: 2, conditional: false, prerequisites: ["robot-loop", "farm-loop"], actions: [...locations[1].cycle, ...locations[2].cycle] },
  { id: "traffic-pizza-invention", location: "traffic", chapter: 4, title: "Pizza delivery invention", objective: "Finish the pizza routine, then the safe-crossing routine. Repeat that whole delivery twice.", count: 2, conditional: false, prerequisites: ["pizza-loop", "traffic-loop"], actions: [...locations[0].cycle, ...locations[3].cycle] },
  { id: "space-pets-invention", location: "space", chapter: 4, title: "Care for space travellers", objective: "Finish the pet-care routine, then the space routine. Repeat that whole expedition twice.", count: 2, conditional: false, prerequisites: ["pets-loop", "space-loop"], actions: [...locations[5].cycle, ...locations[4].cycle] },
);
for (const location of locations) missions.push({ id: `${location.id}-living`, location: location.id, chapter: 5, title: simulationBriefs[location.id].title, objective: simulationBriefs[location.id].objective, count: 1, conditional: true, prerequisite: `${location.id}-decision`, simulation: location.id });
export function unlockedCosmetics(completed: number) { return { avatars: completed >= 6 ? ["🧑‍🚀", "🧑‍🔬", "🧑‍🌾", "🧑‍🍳"] : completed >= 3 ? ["🧑‍🚀", "🧑‍🔬", "🧑‍🌾"] : ["🧑‍🚀", "🧑‍🔬"], decorations: completed >= 6 ? ["🌻", "🌈", "🪴"] : completed >= 3 ? ["🌻", "🪴"] : ["🌻"] }; }
// Validate size/depth before the existing recursive command parser.
export function parseCommands(value: unknown): VisualCommand[] {
  if (!boundedJson(value)) throw new WorldInputError("Keep the program within the workspace limits.");
  return visualProgramSchema.parse({ variables: {}, handlers: { start: value } }).handlers.start!;
}
export type WorldRun = { ok: boolean; feedback: string; frames: Array<{ action: string; completed: number; simulation?: SimulationState }>; completed: number; trace: string[] };
export function runMission(missionId: string, raw: unknown, options: { fixtures?: boolean[]; requirePatterns?: boolean; definition?: Mission } = {}): WorldRun {
  const mission = options.definition ?? missions.find(m => m.id === missionId);
  if (!mission) throw new WorldInputError("Choose an available mission.");
  const commands = parseCommands(raw), location = locations.find(l => l.id === mission.location)!;
  const cycle = mission.actions ?? [...location.cycle];
  const frames: WorldRun["frames"] = [], trace: string[] = [];
  let completed = 0;
  for (const needsHelp of options.fixtures ?? (mission.conditional ? [true, false] : [false])) {
    const execution = executeVisual({ variables: { needsHelp }, handlers: { start: commands } }, {});
    trace.push(...execution.trace.map(frame => typeof frame === "object" && frame && !Array.isArray(frame) ? String(frame.op ?? "step") : "step"));
    if (!execution.ok) return { ok: false, feedback: execution.error ?? "Check your program.", frames, completed, trace };
    const output = execution.output as Record<string, unknown>;
    const messages = output.messages as string[];
    if (mission.simulation) {
      const result = runSimulation(mission.simulation, messages, needsHelp); frames.push(...result.frames);
      if (!result.ok) return { ok: false, feedback: `${result.feedback} Situation: needsHelp=${needsHelp}.`, frames, completed, trace };
      completed = 1; continue;
    }
    const expected = [...(mission.conditional ? [needsHelp ? "assist" : "ready"] : []), ...Array.from({ length: mission.count }, () => [...cycle]).flat()];
    let matched = 0;
    for (let i = 0; i < messages.length; i++) {
      const action = messages[i]!;
      if (action !== expected[i]) return { ok: false, feedback: `At action ${i + 1}, expected ${expected[i] ?? "the routine to finish"}, but received ${action}. Check the order${mission.conditional ? ` when needsHelp is ${needsHelp}` : ""}.`, frames, completed, trace };
      matched++;
      const offset = mission.conditional ? 1 : 0;
      const count = Math.max(0, Math.floor((matched - offset) / cycle.length));
      frames.push({ action, completed: count });
    }
    if (matched !== expected.length) return { ok: false, feedback: `Your routine stopped early. Next, the simulation needs ${expected[matched]}.`, frames, completed, trace };
    if (options.requirePatterns !== false && mission.chapter > 1 && Number(output.repeatIterations) < mission.count) return { ok: false, feedback: "The routine works. Now use a repeat block to express the repeated pattern.", frames, completed, trace };
    if (options.requirePatterns !== false && mission.conditional && Number(output.decisions) === 0) return { ok: false, feedback: "Use an if block to respond to needsHelp.", frames, completed, trace };
    completed = mission.count;
  }
  return { ok: true, feedback: mission.conditional ? "Both situations passed. Your invention responds to changing needs!" : "Your invention works! Try stepping through to explain each action.", frames, completed, trace };
}
const commandsField = z.unknown().transform((value, ctx) => { try { return parseCommands(value); } catch { ctx.addIssue({ code: "custom", message: "Check the program." }); return z.NEVER; } });
export const appearanceSchema = z.object({ skin: z.enum(["light", "warm", "brown", "deep"]), hair: z.enum(["short", "curly", "long", "none"]), outfit: z.enum(["green", "blue", "purple", "orange"]), accessory: z.enum(["none", "cap", "star"]) }).strict();
export const decorationSchema = z.object({ id: z.string().uuid(), item: z.enum(["sunflower", "plant", "rainbow", "desk", "books", "robot"]), x: z.number().int().min(0).max(7), y: z.number().int().min(0).max(4), rotation: z.enum(["0", "90", "180", "270"]) }).strict();
export const projectSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(60), missionId: z.string().max(60), language: z.enum(["blocks", "python", "javascript"]), commands: commandsField, source: z.string().max(8192).optional() }).strict().refine(project => project.language === "blocks" || project.source !== undefined, "Written projects need source code.");
export const worldStateSchema = z.object({
  schema: z.literal(1), revision: z.number().int().nonnegative(), location: z.enum(locationIds),
  position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict().default({ x: 50, y: 48 }),
  avatar: z.enum(["🧑‍🚀", "🧑‍🔬", "🧑‍🌾", "🧑‍🍳"]), companion: z.enum(["Nova", "Pip", "Pixel"]),
  decoration: z.enum(["🌻", "🌈", "🪴"]), reducedMotion: z.boolean(), highContrast: z.boolean(),
  appearance: appearanceSchema.default({ skin: "warm", hair: "curly", outfit: "green", accessory: "none" }),
  room: z.object({ floor: z.enum(["wood", "meadow", "stars"]), decorations: z.array(decorationSchema).max(24) }).strict().default({ floor: "wood", decorations: [] }),
  projects: z.array(projectSchema).max(24).default([]),
  simulations: z.record(z.string().refine(id => locationIds.includes(id as LocationId)), simulationStateSchema).default({}),
  completed: z.array(z.string().max(60)).max(128), hints: z.record(z.string().max(60), z.number().int().min(0).max(3)),
  programs: z.record(z.string().max(60), commandsField),
  sources: z.record(z.string().max(60), z.object({ language: z.enum(["python", "javascript"]), source: z.string().max(8192) }).strict()).default({}),
}).strict();
export type WorldState = z.infer<typeof worldStateSchema>;
export function initialWorld(): WorldState { return { schema: 1, revision: 0, location: "pizza", position: { x: 50, y: 48 }, avatar: "🧑‍🚀", companion: "Nova", decoration: "🌻", reducedMotion: false, highContrast: false, completed: [], hints: {}, programs: {}, sources: {}, appearance: { skin: "warm", hair: "curly", outfit: "green", accessory: "none" }, room: { floor: "wood", decorations: [] }, projects: [], simulations: {} }; }
export function missionUnlocked(state: WorldState, mission: Mission) { return (!mission.prerequisite || state.completed.includes(mission.prerequisite)) && (mission.prerequisites ?? []).every(id => state.completed.includes(id)); }
export const worldActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sandbox"), location: z.enum(locationIds), command: z.string().min(1).max(32) }).strict(),
  z.object({ type: z.literal("sandbox-reset"), location: z.enum(locationIds), scenario: z.boolean() }).strict(),
  z.object({ type: z.literal("position"), position: worldStateSchema.shape.position.removeDefault() }).strict(),
  z.object({ type: z.literal("appearance"), appearance: appearanceSchema }).strict(),
  z.object({ type: z.literal("room"), room: worldStateSchema.shape.room.removeDefault() }).strict(),
  z.object({ type: z.literal("project-save"), project: projectSchema }).strict(),
  z.object({ type: z.literal("preferences"), location: z.enum(locationIds), avatar: worldStateSchema.shape.avatar, companion: worldStateSchema.shape.companion, decoration: worldStateSchema.shape.decoration, reducedMotion: z.boolean(), highContrast: z.boolean() }).strict(),
  z.object({ type: z.enum(["source-save", "source-run", "source-snapshot"]), missionId: z.string().max(60), language: z.enum(["python", "javascript"]), source: z.string().max(8192), projectId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("support"), missionId: z.string().max(60), commands: commandsField, bookingId: z.string().min(1).max(100).optional(), daytimePeriodId: z.string().min(1).max(100).optional(), language: z.enum(["python", "javascript"]).optional(), source: z.string().max(8192).optional() }).strict().refine(action => (action.source === undefined) === (action.language === undefined), "Include both source and language."),
  z.object({ type: z.enum(["save", "run", "hint", "snapshot"]), missionId: z.string().max(60), commands: commandsField, projectId: z.string().uuid().optional() }).strict(),
]);
export type WorldAction = z.infer<typeof worldActionSchema>;
export function transitionWorld(current: WorldState, action: WorldAction, availableMissions: readonly Mission[] = missions): { state: WorldState; run?: WorldRun; hint?: string } {
  const state = structuredClone(current); state.revision++;
  if (action.type === "sandbox-reset") { state.simulations[action.location] = initialSimulation(action.location, action.scenario); return { state }; }
  if (action.type === "sandbox") { if (!simulationActions[action.location].includes(action.command)) throw new WorldInputError("Choose a supported simulation action."); state.simulations[action.location] = stepSimulation(state.simulations[action.location] ?? initialSimulation(action.location), action.command); return { state }; }
  if (action.type === "position") { state.position = action.position; return { state }; }
  if (action.type === "preferences") { if (action.location !== state.location) { const place = locations.find(place => place.id === action.location)!; state.position = { x: place.x, y: place.y }; } const cosmetics = unlockedCosmetics(state.completed.length); if (!cosmetics.avatars.includes(action.avatar) || !cosmetics.decorations.includes(action.decoration)) throw new WorldInputError("Complete more inventions to unlock this item."); Object.assign(state, { location: action.location, avatar: action.avatar, companion: action.companion, decoration: action.decoration, highContrast: action.highContrast, reducedMotion: action.reducedMotion }); return { state }; }
  if (action.type === "appearance") { if ((action.appearance.accessory === "cap" && state.completed.length < 3) || (action.appearance.accessory === "star" && state.completed.length < 6)) throw new WorldInputError("Complete more inventions to unlock this accessory."); state.appearance = action.appearance; return { state }; }
  if (action.type === "room") {
    const allowed = new Set(["sunflower", "desk", "books", ...(state.completed.length >= 3 ? ["plant", "robot"] : []), ...(state.completed.length >= 6 ? ["rainbow"] : [])]);
    const cells = new Set(action.room.decorations.map(item => item.x + ":" + item.y)), ids = new Set(action.room.decorations.map(item => item.id));
    if (action.room.decorations.some(item => !allowed.has(item.item)) || cells.size !== action.room.decorations.length || ids.size !== action.room.decorations.length) throw new WorldInputError("Choose unlocked decorations and place one item in each room square.");
    state.room = action.room; return { state };
  }
  if (action.type === "project-save") {
    const mission = availableMissions.find(m => m.id === action.project.missionId); if (!mission || !missionUnlocked(state, mission)) throw new WorldInputError("Open an available mission for this project.");
    const index = state.projects.findIndex(project => project.id === action.project.id);
    if (index < 0 && state.projects.length >= 24) throw new WorldInputError("Your clubhouse has space for 24 named projects. Existing work has been retained.");
    if (index < 0) state.projects.push(structuredClone(action.project)); else state.projects[index] = structuredClone(action.project);
    if (action.project.language === "blocks") state.programs[action.project.missionId] = action.project.commands;
    else state.sources[action.project.missionId] = { language: action.project.language, source: action.project.source! };
    return { state };
  }
  const mission = availableMissions.find(m => m.id === action.missionId);
  if (!mission || !missionUnlocked(state, mission)) throw new WorldInputError("Finish the earlier mission in this location first.");
  if ("projectId" in action && action.projectId) {
    const project = state.projects.find(project => project.id === action.projectId);
    if (!project || project.missionId !== mission.id) throw new WorldInputError("Choose a project belonging to this mission.");
    if ("source" in action && action.source !== undefined && "language" in action && action.language) { project.source = action.source; project.language = action.language; }
    else if ("commands" in action) { project.commands = action.commands; project.language = "blocks"; }
  }
  if (action.type === "source-save" || action.type === "source-run" || action.type === "source-snapshot") { state.sources[mission.id] = { language: action.language, source: action.source }; return { state }; }
  if (!("commands" in action)) throw new WorldInputError("Choose a supported world action.");
  if (action.type === "support" && action.source !== undefined && action.language) state.sources[mission.id] = { language: action.language, source: action.source };
  state.programs[mission.id] = action.commands;
  if (action.type === "run") {
    const run = runMission(mission.id, action.commands, { definition: mission });
    const simulation = run.frames.at(-1)?.simulation; if (simulation) state.simulations[simulation.location] = simulation;
    if (run.ok && !state.completed.includes(mission.id)) state.completed.push(mission.id);
    return { state, run };
  }
  if (action.type === "hint") {
    const count = Math.min(3, (state.hints[mission.id] ?? 0) + 1); state.hints[mission.id] = count;
    const location = locations.find(l => l.id === mission.location)!;
    const laterHint = mission.conditional
      ? "Use an if block that reads needsHelp so the two situations start differently. Place the repeated routine after that decision."
      : mission.chapter > 1
        ? "Put one complete routine inside a repeat block for the number of times this mission asks."
        : "Build one complete routine with emit blocks. Each block sends one action. Run it, then use the feedback to adjust the order.";
    return { state, hint: ["Read the mission board and name what must happen first.", `Use emit blocks to send instructions to ${location.character}. Check their names and order.`, laterHint][count - 1] };
  }
  return { state };
}
export function missionCompletionCount(state: Pick<WorldState,"completed">, location: LocationId, available: readonly Mission[] = missions) {
  const ids = new Set(available.filter(mission => mission.location === location).map(mission => mission.id));
  return state.completed.filter(id => ids.has(id)).length;
}
