import { authorModuleActivity, machine, move, scenario, eq, range } from "../authoring";
import type { Json } from "../types";

type Direction = "right" | "up" | "left" | "down";
const offsets = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] } as const;
const program = (route: Direction[]) => machine({ start: route.map((direction) => move(offsets[direction][0], offsets[direction][1])) });
function routeCases(id: string, route: Direction[], blocked: Array<{ x: number; y: number }> = []) {
  return [0, 1].map((shift) => {
    let x = 1 + shift, y = 1 + shift;
    const visits: Json[] = [{ x, y }];
    for (const direction of route) { x += offsets[direction][0]; y += offsets[direction][1]; visits.push({ x, y }); }
    return scenario(`${id}-start-${shift}`, { start: { x: 1 + shift, y: 1 + shift }, width: 9, height: 9, obstacles: blocked.map((point) => ({ x: point.x + shift, y: point.y + shift })) },
      eq("visits", visits, "Every planned square is visited in the stated order"), eq("x", x, "The last column matches the delivery brief"), eq("y", y, "The last row matches the delivery brief"),
      eq("collision", false, "The character avoids blocked squares"), range("moves", route.length, route.length, "The route uses exactly the planned moves"));
  });
}
type Brief = { route: Direction[]; blocks?: Array<{ x: number; y: number }>; words: string };
const task = (brief: Brief) => `${brief.words} Use this order: ${brief.route.join(", ")}. Run from both displayed starts and inspect each visited square.`;
function activity(spec: { slot?: 1 | 2 | 3; title: string; objective: string; teaching: string; reasoning: [string, string]; brief: Brief; transfers: [Brief, Brief]; kind?: "project" }) {
  const { brief } = spec;
  const faulty = [...brief.route];
  faulty[0] = faulty[0] === "right" ? "up" : "right";
  return authorModuleActivity({ moduleId: "first-instructions/sequences", kind: spec.kind ?? "consolidation", slot: spec.slot,
    title: spec.title, objective: spec.objective, concepts: ["sequence", "trace", "order"],
    faultDescription: "The first arrow is changed, so the trail misses the first required stop even when a later square looks plausible.",
    essentialChecks: ["All required stops occur in order", "The deliberately incorrect first move is repaired", "An unfamiliar route works independently", ...(spec.kind ? ["Saved work is retrieved and replayed"] : [])],
    explanation: `${spec.teaching} ${task(brief)} The first visible case begins at column 2, row 2. The assessor also moves the start one column and one row, so use movement instructions rather than fixing the final position directly.`,
    reasoning: spec.reasoning,
    starter: program([]), reference: program(brief.route), faulty: program(faulty), cases: routeCases("delivery", brief.route, brief.blocks),
    transfer: spec.transfers.map((fresh, index) => ({ task: task(fresh), starter: program([]), reference: program(fresh.route), cases: routeCases(`independent-${index + 1}`, fresh.route, fresh.blocks) })),
    prediction: { prompt: "A route finishes at the star but misses the first parcel stop. Has it met the complete delivery brief?", choices: ["Yes, only the final square matters", "No, every required stop must occur in order", "Yes, if its title says complete"], correct: 1 },
    misconception: "A final position alone cannot prove that the route visited the required squares in order.",
    ...(spec.kind ? { workflow: { saveAndReplay: true, restoreVersion: true } } : {}),
  });
}
const recall = activity({ slot: 1, title: "Recall a route without the worked arrows", objective: "Retrieve sequencing knowledge and rebuild a new three-stop route from its brief.",
  teaching: "Put the worked example aside and say the route aloud before choosing arrows. Remember that each arrow moves one square and that the first action runs first. After building, compare every visited square with the spoken plan. If the trace differs, change the first differing action and run again.",
  reasoning: ["Right, up, right makes a corner followed by another step right. Reversing the first two arrows changes the first stop.", "Read the actual trail from the starting square. A correct last square can still hide a missed stop."],
  brief: { route: ["right", "up", "right"], words: "Deliver to the corner stop and then the far stop." },
  transfers: [{ route: ["up", "right", "up"], words: "Deliver along the upward corner route." }, { route: ["right", "right", "up", "left"], words: "Visit the far corner before returning one square left." }] });
const repair = activity({ slot: 2, title: "Find the earliest hidden delivery fault", objective: "Repair an unfamiliar route by locating the first difference between plan and trace.",
  teaching: "A wrong early arrow can be hidden by a later arrow that brings the character back to the correct final square. Check the beginning, middle and end of the route. Start with the first square where plan and trace differ. Repair that cause, then rerun the whole route to make sure the later stops still work.",
  reasoning: ["Right, up, left, up and up, right, left, up can share an endpoint but visit different first stops.", "Fixing only the final arrow cannot repair an incorrect first parcel stop. Read the trail in order."],
  brief: { route: ["right", "up", "left", "up"], words: "Visit a stop to the right before climbing to the final row." },
  transfers: [{ route: ["up", "right", "down", "right"], words: "Visit the upper stop before returning to the delivery row." }, { route: ["right", "up", "right", "down", "right"], words: "Visit both upper stops before reaching the right-hand destination." }] });
const adapt = activity({ slot: 3, title: "Transfer the plan around a blocked square", objective: "Adapt a route to an unfamiliar delivery map while preserving its required stop order.",
  teaching: "A new delivery map can keep the same kinds of arrows while changing which squares are safe. Identify the blocked square before running. Choose the route around it, keep the parcel stops in order, and compare both starting positions. An error is useful evidence: identify which action reached the blocked square and repair the plan.",
  reasoning: ["The blocked square is directly to the right of the start. Move up first, cross above it, then return down.", "Moving the start also moves the obstacle. Relative arrow instructions still describe the same safe detour."],
  brief: { route: ["up", "right", "right", "down"], blocks: [{ x: 2, y: 1 }], words: "Go above the blocked square to reach the far delivery stop." },
  transfers: [{ route: ["right", "up", "up", "left"], blocks: [{ x: 1, y: 2 }], words: "Go to the right of the blocked square to reach the upper stop." }, { route: ["up", "up", "right", "right", "down", "down"], blocks: [{ x: 2, y: 1 }, { x: 2, y: 2 }], words: "Go above the two-square barrier before coming back to the delivery row." }] });
const portfolio = activity({ kind: "project", title: "Portfolio: the museum delivery trail", objective: "Create, save, retrieve and explain a new multi-stop delivery route for a fictional museum.",
  teaching: "The museum needs a reusable delivery trail that visits its picture rooms in order. Build the complete route, inspect all stops and repair the seeded fault. Save your working version and retrieve it from Saved versions before replaying. Explain one decision using an actual stop or movement from your saved trace; a project name alone is not evidence that the delivery worked.",
  reasoning: ["The trail visits the upper room before the right-hand room, then returns to the final delivery row. Keeping every visited square in order preserves that user need.", "After saving and retrieving the work, run it again. Compare the retrieved trail with the same brief before describing the project to a parent."],
  brief: { route: ["up", "right", "up", "right", "down", "right", "down"], words: "Visit the upper picture rooms before the right-hand room and finish on the delivery row." },
  transfers: [{ route: ["right", "up", "right", "up", "left", "up", "left"], words: "Create a new trail to the rooftop picture room, visiting both corner rooms first." }, { route: ["up", "up", "right", "down", "right", "down", "right"], words: "Create a new trail from the high room through two descending corners to the right-hand delivery point." }] });

export const firstRouteRetrievalActivities = [recall, repair, adapt, portfolio];
