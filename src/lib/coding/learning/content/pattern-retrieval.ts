import { authorModuleActivity, visual, move, repeat, scenario, eq, range } from "../authoring";
import type { Json } from "../types";
type Point = { x: number; y: number };
type Dance = { name: string; origin: Point; unit: Array<[number, number]>; count: number };
const clockwise: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const anticlockwise: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const dancer = (name: string, x: number, count: number, backwards = false): Dance => ({ name, origin: { x, y: 1 }, unit: backwards ? anticlockwise : clockwise, count });
const commands = (dance: Dance) => ({ variables: {}, handlers: { start: [repeat(dance.count, dance.unit.map(([x, y]) => move(x, y)))] } });
const garden = (dances: Dance[], mode: "reference" | "starter" | "faulty") => visual({ actors: Object.fromEntries(dances.map((dance, index) => [dance.name, { origin: dance.origin,
  program: mode === "starter" ? { variables: {}, handlers: { start: [] } } : commands(mode === "faulty" && index === dances.length - 1 ? { ...dance, unit: dance.unit.slice(0, -1) } : dance),
}])) });
function cases(id: string, dances: Dance[]) {
  return [0, 1].map((shift) => scenario(`${id}-${shift}`, { start: { x: shift, y: shift }, width: 10, height: 10, events: shift ? [{ name: "start", value: 0 }, { name: "restart", value: 0 }] : [{ name: "start", value: 0 }] }, eq("actorCount", dances.length, "Every independently programmed flower exists"), ...dances.flatMap((dance) => {
    let x = dance.origin.x + shift, y = dance.origin.y + shift;
    const visits: Json[] = [{ x, y }];
    for (let count = 0; count < dance.count; count++) for (const [dx, dy] of dance.unit) { x += dx; y += dy; visits.push({ x, y }); }
    const prefix = `actors.${dance.name}`;
    return [eq(`${prefix}.visits`, visits, `${dance.name} follows every arrow in its own dance`), eq(`${prefix}.collision`, false, `${dance.name} stays on the board`),
      range(`${prefix}.moves`, visits.length - 1, visits.length - 1, `${dance.name} performs the required movements and resets its trail on restart`), range(`${prefix}.loopMoves`, (visits.length - 1) * (shift ? 2 : 1), (visits.length - 1) * (shift ? 2 : 1), `${dance.name}'s whole unit stays inside the repeated group`)];
  })));
}
const describe = (dances: Dance[]) => dances.map((dance) => `${dance.name} starts at column ${dance.origin.x + 1}, row ${dance.origin.y + 1} and repeats ${dance.unit[0]![0] === 1 ? "right, up, left, down" : "up, right, down, left"} ${dance.count} times`).join("; ");
function activity(spec: { slot?: 1 | 2 | 3; kind?: "project"; title: string; objective: string; teaching: string; reasoning: [string, string]; dances: Dance[]; transfers: [Dance[], Dance[]] }) {
  return authorModuleActivity({ moduleId: "first-instructions/patterns", kind: spec.kind ?? "consolidation", slot: spec.slot, title: spec.title, objective: spec.objective,
    concepts: ["repeat", "group", "restart", "independent"], essentialChecks: ["Each flower has a separate working program", "The whole pattern is repeated in order", "Every trail and repeat count match the brief", "A new garden is created independently"],
    faultDescription: "The final flower is missing the closing arrow inside its repeated group. Compare its full trail with its own planned dance and repair the group.",
    explanation: `${spec.teaching} Build this garden: ${describe(spec.dances)}. Put all four arrows inside each repeated group. Use the character selector to check every flower. Run again to restart each flower from its own origin, then inspect the full trail rather than only the final position.`,
    reasoning: spec.reasoning, starter: garden(spec.dances, "starter"), reference: garden(spec.dances, "reference"), faulty: garden(spec.dances, "faulty"), cases: cases("garden", spec.dances),
    transfer: spec.transfers.map((dances, index) => ({ task: `Build a fresh garden: ${describe(dances)}. Use a separate repeated group for every flower, inspect all trails and restart the garden.`, starter: garden(dances, "starter"), reference: garden(dances, "reference"), cases: cases(`fresh-garden-${index + 1}`, dances) })),
    prediction: { prompt: "A flower repeats four arrows three times. How many movements does it make?", choices: ["Three", "Four", "Twelve"], correct: 2 },
    misconception: "Returning to the start does not show how many dances happened. Check the complete trail and every arrow inside the repeated group.",
    ...(spec.kind ? { workflow: { saveAndReplay: true, restoreVersion: true } } : {}),
  });
}
const recall = activity({ slot: 1, title: "Recall a whole repeated dance", objective: "Retrieve the smallest repeating unit and rebuild it without omitting its closing movement.",
  teaching: "Say the whole repeating unit from memory before building. A square dance has four arrows, including the last arrow that returns to the start. Count complete units rather than individual clicks. Compare the expanded trail with your repeated group, and check that each dance returns to its origin before the next begins.",
  reasoning: ["Three complete groups of four arrows make twelve movements, even though the flower ends where it started.", "Leaving the final down arrow out changes the whole dance. Repair the group rather than adding a movement after all repetitions."], dances: [dancer("fern", 1, 3)], transfers: [[dancer("rose", 2, 2, true)], [dancer("daisy", 3, 1)]] });
const repair = activity({ slot: 2, title: "Find the missing arrow in an unfamiliar garden", objective: "Locate and repair a repeated-group fault using separate flower trails.",
  teaching: "An unfamiliar garden can contain one correct flower and one faulty flower. Test both. Compare their own planned units, counts and trails rather than copying the first flower's program blindly. Find the earliest difference in the faulty trail, repair the missing arrow inside its group, and rerun the complete garden.",
  reasoning: ["Fern makes two clockwise dances; rose makes three dances beginning upward. Their repeat counts and first arrows differ deliberately.", "A successful fern cannot prove rose is correct. Select rose and repair its own repeated group."], dances: [dancer("fern", 1, 2), dancer("rose", 4, 3, true)], transfers: [[dancer("daisy", 1, 1, true), dancer("poppy", 4, 2)], [dancer("iris", 2, 3), dancer("lily", 5, 1, true)]] });
const improve = activity({ slot: 3, title: "Improve and restart a garden milestone", objective: "Apply changed repeat counts and independent starting positions without breaking another character.",
  teaching: "An improved garden should keep separate programs for separate flowers. Meet the changed brief instead of making both flowers identical. Check each origin and repeat count, inspect the two trails, then restart from the saved programs. Explain how grouping all four arrows avoids a missing closing movement.",
  reasoning: ["The two flowers have different origins, so they can perform their own dances without sharing one position.", "Changing one flower's repeat count must not silently change the other flower. Check both selector choices after editing."], dances: [dancer("iris", 1, 1), dancer("lily", 5, 3)], transfers: [[dancer("rose", 2, 2, true), dancer("fern", 6, 1)], [dancer("poppy", 1, 3), dancer("daisy", 4, 2, true)]] });
const portfolio = activity({ kind: "project", title: "Portfolio: the three-flower festival", objective: "Create, save, retrieve and explain a three-character garden with independently verified repeated patterns.",
  teaching: "Create a small festival with three independently programmed flowers. Give every flower the requested origin, four-arrow unit and repeat count. Inspect each real trail before saving the garden. Retrieve the saved version, run it again and explain why one flower makes more movements than another even when both return to their own starts.",
  reasoning: ["Fern, rose and daisy make one, two and three dances. Their trails contain four, eight and twelve movements respectively.", "Retrieving and replaying the saved garden checks all three programs together. A screenshot of one flower cannot establish the other two outcomes."], dances: [dancer("fern", 1, 1), dancer("rose", 4, 2, true), dancer("daisy", 6, 3)], transfers: [[dancer("poppy", 1, 3, true), dancer("iris", 3, 1), dancer("lily", 6, 2)], [dancer("rose", 2, 2), dancer("daisy", 4, 3), dancer("fern", 6, 1, true)]] });

export const patternRetrievalActivities = [recall, repair, improve, portfolio];
