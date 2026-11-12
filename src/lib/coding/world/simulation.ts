import { z } from "zod";
import type { LocationId } from "./model";
export type SimulationState = { location: LocationId; scenario: boolean; tick: number; selected: number; values: Record<string, number>; flags: Record<string, boolean>; items: Array<Record<string, number>>; error: string | null; lastAction: string };
export const simulationStateSchema: z.ZodType<SimulationState> = z.object({
  location: z.enum(["pizza", "robot", "farm", "traffic", "space", "pets"]), scenario: z.boolean(), tick: z.number().int().min(0).max(101), selected: z.number().int().min(0).max(2),
  values: z.record(z.string().max(40), z.number().finite().min(0).max(100)), flags: z.record(z.string().max(40), z.boolean()), items: z.array(z.record(z.string().max(40), z.number().finite().min(0).max(100))).max(3), error: z.string().max(1000).nullable(), lastAction: z.string().max(40),
}).strict();
export const simulationActions: Record<LocationId, string[]> = {
  pizza: ["prepare", "top", "plantTop", "bake", "wait", "serve", "restock"],
  robot: ["east", "west", "north", "south", "pickup", "drop", "scan"],
  farm: ["bed1", "bed2", "bed3", "plant", "water", "wait", "harvest", "refill"],
  traffic: ["allRed", "northGreen", "eastGreen", "cross", "tick"],
  space: ["fuel", "shield", "launch", "travel", "scan", "collect", "returnHome", "dock"],
  pets: ["pet1", "pet2", "feed", "gentleFood", "wash", "play", "rest", "check"],
};
export const simulationBriefs: Record<LocationId, { title: string; objective: string; scenario: string; alternate: string }> = {
  pizza: { title: "Run the Inventors Restaurant", objective: "Serve two orders. Prepare each pizza, add the topping that the customer can eat, bake it, and wait until the oven has finished before serving. A dairy-free order needs a different topping from a cheese order.", scenario: "Dairy-free customers", alternate: "Cheese pizza customers" },
  robot: { title: "Build a delivery robot", objective: "Collect a component at (3,1) and deliver it to (5,2). Stay inside the 6×4 factory and avoid the obstacle. needsHelp moves the obstacle from (2,0) to (1,1).", scenario: "Obstacle at (1,1)", alternate: "Obstacle at (2,0)" },
  farm: { title: "Grow a smart harvest", objective: "Harvest two different beds. Plant a seed, keep the bed wet, and wait for two growth ticks. Refill the reservoir when needed. When needsHelp is true, the weather is dry; otherwise rain waters planted beds on each wait.", scenario: "Dry weather", alternate: "Gentle rain" },
  traffic: { title: "Keep Inventors City moving", objective: "Clear both vehicle queues and let two pedestrians cross safely. Make every light red before you change which queue may move. When needsHelp is true, clear the priority north queue before eastbound traffic.", scenario: "Priority vehicle from the north", alternate: "Ordinary traffic" },
  space: { title: "Bring the samples home", objective: "Leave with enough fuel, reach the sample site, collect two samples, come back, and dock. Each movement uses fuel. When needsHelp is true, protect the craft before travelling through debris.", scenario: "Debris warning", alternate: "Clear flight path" },
  pets: { title: "Run a thoughtful care centre", objective: "Care for both pets. Each pet needs enough meals, a wash, play and rest. When needsHelp is true, pet 1 needs the gentle meal rather than the ordinary meal. Meet hunger, hygiene, happiness and energy for both pets.", scenario: "Pet 1 has a sensitive diet", alternate: "Ordinary feeding routines" },
};
export function initialSimulation(location: LocationId, scenario = false): SimulationState {
  const initial: Record<LocationId, SimulationState["values"]> = {
    pizza: { flour: 2, orders: 2, served: 0, oven: 0, topping: 0, prepared: 0, baked: 0 },
    robot: { x: 0, y: 0, carried: 0, delivered: 0, obstacleX: scenario ? 1 : 2, obstacleY: scenario ? 1 : 0 },
    farm: { water: 4, seeds: 3, harvested: 0 },
    traffic: { north: scenario ? 3 : 2, east: 2, pedestrians: 2, light: 0, cleared: 0 },
    space: { fuel: 0, position: 0, samples: 0, launched: 0, docked: 0, shield: 0, scanned: 0 },
    pets: { cared: 0 },
  };
  const items = location === "farm" ? Array.from({ length: 3 }, () => ({ planted: 0, moisture: 0, growth: 0, harvested: 0 })) : location === "pets" ? Array.from({ length: 2 }, () => ({ hunger: 4, hygiene: 1, happiness: 1, energy: 3 })) : [];
  return { location, scenario, tick: 0, selected: 0, values: initial[location], flags: {}, items, error: null, lastAction: "ready" };
}
export function simulationComplete(state: SimulationState): boolean {
  if (state.error) return false;
  switch (state.location) {
    case "pizza": return state.values.served === 2;
    case "robot": return state.values.delivered === 1;
    case "farm": return state.values.harvested >= 2;
    case "traffic": return state.values.north === 0 && state.values.east === 0 && state.values.pedestrians === 0;
    case "space": return state.values.docked === 1 && state.values.samples === 2;
    case "pets": return state.items.every(pet => pet.hunger! <= 0 && pet.hygiene! >= 3 && pet.happiness! >= 2 && pet.energy! >= 3);
  }
}
export function stepSimulation(previous: SimulationState, action: string): SimulationState {
  const state = structuredClone(previous); if (state.error) return state;
  state.tick++; state.lastAction = action;
  const fail = (message: string) => { state.error = message; };
  if (state.tick > 100) { fail("The simulation stopped after 100 actions. Simplify the routine."); return state; }
  if (!simulationActions[state.location].includes(action)) { fail(`The ${state.location} simulation does not recognise ${action}.`); return state; }
  const v = state.values;
  switch (state.location) {
    case "pizza":
      if (action === "restock") v.flour = Math.min(6, v.flour! + 2);
      if (action === "prepare") { if (v.prepared || !v.flour) fail("Finish the current pizza and check the flour supply before preparing another."); else { v.flour!--; v.prepared = 1; v.topping = 0; v.baked = 0; } }
      if (action === "top" || action === "plantTop") { if (!v.prepared || v.baked || v.oven) fail("Prepare an uncooked pizza before adding its topping."); else v.topping = action === "plantTop" ? 2 : 1; }
      if (action === "bake") { if (!v.prepared || !v.topping || v.baked || v.oven) fail("Prepare and top a pizza before using the oven."); else v.oven = 3; }
      if (action === "wait" && v.oven! > 0) { v.oven!--; if (v.oven === 0) v.baked = 1; }
      if (action === "serve") { if (!v.baked || v.oven) fail("This pizza needs to finish baking before it can be served."); else if (v.topping !== (state.scenario ? 2 : 1)) fail("Check this customer's dietary request before serving."); else if (v.orders! <= 0) fail("All current orders have been served."); else { v.served!++; v.orders!--; v.prepared = 0; v.topping = 0; v.baked = 0; } }
      break;
    case "robot": {
      const dx = action === "east" ? 1 : action === "west" ? -1 : 0, dy = action === "north" ? 1 : action === "south" ? -1 : 0;
      if (dx || dy) { const x = v.x! + dx, y = v.y! + dy; if (x < 0 || x > 5 || y < 0 || y > 3) fail("The robot reached the factory boundary."); else if (x === v.obstacleX && y === v.obstacleY) fail("The robot found an obstacle. Plan a safe route around it."); else { v.x = x; v.y = y; } }
      if (action === "pickup") { if (v.x !== 3 || v.y !== 1 || v.carried || v.delivered) fail("Pick up the component at (3,1)."); else v.carried = 1; }
      if (action === "drop") { if (v.x !== 5 || v.y !== 2 || !v.carried) fail("Carry the component to (5,2) before dropping it."); else { v.carried = 0; v.delivered = 1; } }
      if (action === "scan") state.flags.scanned = true;
      break;
    }
    case "farm": {
      if (/^bed[123]$/.test(action)) state.selected = Number(action.slice(3)) - 1;
      const bed = state.items[state.selected]!;
      if (action === "plant") { if (bed.planted || bed.harvested || !v.seeds) fail("Choose an empty, unharvested bed and check the seed supply."); else { bed.planted = 1; v.seeds!--; } }
      if (action === "water") { if (!bed.planted || !v.water) fail("Plant the bed and refill the reservoir before watering."); else { bed.moisture = 2; v.water!--; } }
      if (action === "refill") v.water = 4;
      if (action === "wait") for (const plot of state.items) { if (!plot.planted) continue; if (!state.scenario) plot.moisture = 2; if (plot.moisture! > 0) { plot.growth = Math.min(2, plot.growth! + 1); plot.moisture!--; } }
      if (action === "harvest") { if (!bed.planted || bed.growth! < 2) fail("Let this planted bed grow through two wet growth ticks before harvesting."); else { bed.planted = 0; bed.harvested = 1; v.harvested!++; } }
      break;
    }
    case "traffic":
      if (action === "allRed") v.light = 0;
      if (action === "northGreen" || action === "eastGreen") { const light = action === "northGreen" ? 1 : 2; if (v.light && v.light !== light) fail("Use allRed before changing the active traffic direction."); else v.light = light; }
      if (action === "cross") { if (v.light) fail("Pedestrians can cross only while all lights are red."); else if (v.pedestrians! > 0) v.pedestrians!--; }
      if (action === "tick") { if (v.light === 2 && state.scenario && v.north! > 0) fail("Clear the priority north queue before releasing eastbound vehicles."); else { const lane = v.light === 1 ? "north" : v.light === 2 ? "east" : null; if (lane && v[lane]! > 0) { v[lane]!--; v.cleared!++; } } }
      break;
    case "space":
      if (action === "fuel") { if (v.launched) fail("Fuel at the launchpad before launching."); else v.fuel = Math.min(8, v.fuel! + 1); }
      if (action === "shield") v.shield = 1;
      if (action === "launch") { if (v.launched || v.fuel! < 4) fail("Prepare at least four fuel units before launch."); else v.launched = 1; }
      if (action === "travel") { if (!v.launched || v.docked || v.fuel! <= 0 || v.position! >= 2) fail("Check launch, position and fuel before travelling."); else if (state.scenario && !v.shield) fail("Activate the shield before travelling through debris."); else { v.position!++; v.fuel!--; } }
      if (action === "scan") { if (v.position !== 2) fail("Travel to the sample site before scanning."); else v.scanned = 1; }
      if (action === "collect") { if (!v.scanned || v.position !== 2 || v.samples! >= 2) fail("Scan the sample site and collect its two samples."); else v.samples!++; }
      if (action === "returnHome") { if (!v.launched || v.fuel! < v.position!) fail("Keep enough fuel for the return journey."); else { v.fuel! -= v.position!; v.position = 0; } }
      if (action === "dock") { if (!v.launched || v.position !== 0 || v.samples !== 2) fail("Return with two samples before docking."); else v.docked = 1; }
      break;
    case "pets": {
      if (action === "pet1" || action === "pet2") state.selected = action === "pet1" ? 0 : 1;
      const pet = state.items[state.selected]!;
      if (action === "feed" && state.scenario && state.selected === 0) fail("Pet 1 needs gentleFood in this situation.");
      else if (action === "feed" || action === "gentleFood") pet.hunger = Math.max(0, pet.hunger! - 2);
      if (action === "wash") pet.hygiene = 3;
      if (action === "play") { if (pet.energy! <= 0) fail("Let this pet rest before playing again."); else { pet.happiness = Math.min(3, pet.happiness! + 1); pet.energy!--; } }
      if (action === "rest") pet.energy = Math.min(5, pet.energy! + 2);
      break;
    }
  }
  return state;
}
export function runSimulation(location: LocationId, actions: string[], scenario = false) {
  let state = initialSimulation(location, scenario);
  const frames: Array<{ action: string; completed: number; simulation: SimulationState }> = [];
  for (const action of actions) { state = stepSimulation(state, action); frames.push({ action, completed: simulationComplete(state) ? 1 : 0, simulation: state }); if (state.error) break; }
  return { ok: simulationComplete(state), frames, state, feedback: state.error ?? (simulationComplete(state) ? "Every live-system goal was met safely." : "The system is still running. Inspect the remaining orders, resources or care needs and improve your routine.") };
}
