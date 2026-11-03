import { CODING_STAGES, type CodingDirection, type CodingProgram, type GridPoint } from "@/lib/coding/types";
import { lessonPackageSchema, type ExecutableLessonPackage } from "@/lib/coding/curriculum/contracts";
import { evaluateRoute, type RouteCase } from "@/lib/coding/curriculum/route-engine";

const directions: Record<string, CodingDirection> = { R: "right", U: "up", L: "left", D: "down" };
export function routeProgram(moves: string): CodingProgram {
  return { blocks: [...moves].map((move, index) => ({ id: `step-${index}`, kind: "move" as const, direction: directions[move]! })) };
}
function route(moves: string, stops: GridPoint[] = [], start = { x: 0, y: 0 }): RouteCase {
  const end = [...moves].reduce((position, move) => ({
    x: position.x + (move === "R" ? 1 : move === "L" ? -1 : 0),
    y: position.y + (move === "U" ? 1 : move === "D" ? -1 : 0),
  }), start);
  return { start, goal: end, checkpoints: stops, maxSteps: moves.length };
}
const shifted = (specification: RouteCase): RouteCase => ({ ...specification,
  start: { x: specification.start.x + 1, y: specification.start.y + 1 },
  goal: { x: specification.goal.x + 1, y: specification.goal.y + 1 },
  checkpoints: specification.checkpoints.map((point) => ({ x: point.x + 1, y: point.y + 1 })),
});

type Brief = { id: string; title: string; objective: string; explanation: string; predict: string; build: string; practise: string;
  debug: string; broken: string; stops?: GridPoint[]; variants: [string, string]; variantStops?: [GridPoint[], GridPoint[]];
  guide: string; mistake: string; };
const briefs: Brief[] = [
  { id: "what-is-an-instruction", title: "What is an instruction?", objective: "Give one precise instruction and show the action it causes.",
    explanation: "A computer follows a command. A description such as ‘a lovely parcel’ does not tell it what to do. Try a movement command and watch one square change.",
    predict: "R", build: "R", practise: "U", debug: "R", broken: "L", variants: ["L", "D"],
    guide: "Point to the start and star. Ask which single movement changes the start into the destination. Read the command aloud before running it.",
    mistake: "The command points away from the star. Compare its arrow with where the star sits." },
  { id: "put-steps-in-order", title: "Put steps in order", objective: "Arrange commands in order, visiting the parcel stop before the destination.",
    explanation: "The computer starts at the first command and follows the list. Two routes can finish in the same place but visit different places on the way. The parcel stop matters too.",
    predict: "RU", build: "RU", practise: "URU", debug: "RU", broken: "UR", stops: [{ x: 1, y: 0 }], variants: ["RRU", "URR"],
    variantStops: [[{ x: 2, y: 0 }], [{ x: 0, y: 1 }]],
    guide: "Use the trace to locate the parcel stop. Ask which instruction must come before the upward movement. Let the learner reorder the commands.",
    mistake: "These commands finish at the star, but they visit the wrong square first. Check the order." },
  { id: "predict-before-running", title: "Predict before running", objective: "Record a destination prediction before executing a short sequence and compare it with the trace.",
    explanation: "A prediction is what you expect before you run the program. Follow each arrow with your finger, choose the final square, then compare your idea with the trace.",
    predict: "RRU", build: "RUU", practise: "UUR", debug: "RRU", broken: "RUR", stops: [{ x: 2, y: 0 }], variants: ["RURU", "UURR"],
    variantStops: [[{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }], [{ x: 0, y: 2 }]],
    guide: "Ask for the expected final square before playback. If prediction and output differ, trace one arrow at a time rather than announcing the answer.",
    mistake: "One movement happens too early. Compare the trace with the parcel stop." },
  { id: "find-the-wrong-step", title: "Find the wrong step", objective: "Use a movement trace to locate and repair one incorrect direction.",
    explanation: "When a route goes wrong, find the first place where it differs from the plan. Change that command, then run the whole route again to check the repair.",
    predict: "RUR", build: "RUR", practise: "URR", debug: "URR", broken: "ULL", stops: [{ x: 0, y: 1 }], variants: ["RRUU", "UURR"],
    variantStops: [[{ x: 2, y: 0 }], [{ x: 0, y: 2 }]],
    guide: "Have the learner point to the first wrong movement. Keep the correct instructions, repair the wrong direction, and rerun from the start.",
    mistake: "The character turns towards the edge instead of the destination. Find the first incorrect arrow." },
  { id: "plan-a-delivery", title: "Plan a delivery", objective: "Plan a delivery route that visits required stops in order and reaches the destination.",
    explanation: "A route plan includes the places you must visit, not only the final star. Point to each stop in order, build your commands, and check the trace against your plan.",
    predict: "RRU", build: "RRU", practise: "URR", debug: "RRU", broken: "RR", stops: [{ x: 1, y: 0 }, { x: 2, y: 0 }], variants: ["RURRU", "URURU"],
    variantStops: [[{ x: 1, y: 1 }, { x: 3, y: 1 }], [{ x: 1, y: 2 }]],
    guide: "Ask the learner to name the next stop before placing a command. Compare each planned stop with the run trace and check for a missing final action.",
    mistake: "The route finishes before the last delivery. Compare the last command with the star." },
  { id: "deliver-the-parcel", title: "Project: deliver the parcel", objective: "Build, save and explain an independent parcel route with ordered stops and a clean restart.",
    explanation: "Your delivery project brings together precise commands, order, prediction and debugging. Build a route for the requested stops, save it, and explain how its trace proves the parcel arrived.",
    predict: "RRUU", build: "RRUU", practise: "UURR", debug: "RRUU", broken: "RURU", stops: [{ x: 2, y: 0 }], variants: ["RRURU", "UURUR"],
    variantStops: [[{ x: 2, y: 0 }, { x: 3, y: 1 }], [{ x: 0, y: 2 }, { x: 1, y: 3 }]],
    guide: "Use a new delivery map. Ask for the plan, test the route, and have the learner explain where the trace proves a stop was visited. Keep the independent answer private.",
    mistake: "The star is reached, but a parcel stop was missed. Reaching the destination is only part of this brief." },
];

/** Authored executable drafts. No publication or educational sign-off is inferred. */
export const firstInstructionsPackages: ExecutableLessonPackage[] = briefs.map((brief, index) => {
  const normalStart = { x: 0, y: 0 };
  const specs: Record<string, RouteCase> = {
    discover: route(brief.predict), predict: route(brief.predict), build: route(brief.build, brief.build === brief.debug ? brief.stops ?? [] : []),
    practise: route(brief.practise), debug: route(brief.debug, brief.stops ?? []), create: route(brief.variants[0], brief.variantStops?.[0] ?? [], index === 0 ? { x: 2, y: 2 } : normalStart),
  };
  const programs: Record<string, CodingProgram> = {
    discover: routeProgram(brief.predict), predict: routeProgram(brief.predict), build: routeProgram(brief.build),
    practise: routeProgram(brief.practise), debug: routeProgram(brief.debug), create: routeProgram(brief.variants[0]),
  };
  const independentVariants = brief.variants.map((moves, variant) => ({
    id: `delivery-${variant + 1}`, task: "On this new delivery map, visit the numbered stops and then reach the star. Plan the commands before running them.",
    starter: { blocks: [] }, heldOutCaseIds: ["initial-map", "translated-map"], referenceArtifact: routeProgram(moves),
  }));
  const independent = Object.fromEntries(independentVariants.map((variant, i) => {
    const first = route(brief.variants[i], brief.variantStops?.[i] ?? [], index === 0 ? { x: 2, y: 2 } : normalStart);
    return [variant.id, { "initial-map": first, "translated-map": shifted(first) }];
  }));
  const faultArtifact = routeProgram(brief.broken);
  const failure = evaluateRoute(faultArtifact, specs.debug!);
  if (failure.passed || !failure.failureCode) throw new Error(`The authored fault for ${brief.id} must fail.`);
  return lessonPackageSchema.parse({
    id: brief.id, version: 1, inventoryId: `Y1.${String(index + 1).padStart(2, "0")}`, pathwayId: "foundations",
    courseId: "first-instructions", moduleId: "first-instructions/sequences", projectId: "P-Y1-1", engine: "route",
    title: brief.title, objective: brief.objective, yearMin: 1, yearMax: 1,
    evaluationSpec: { stages: specs, independent }, prerequisites: index > 0 ? [briefs[index - 1]!.id] : [],
    stages: CODING_STAGES.map((stage) => ({ id: stage,
      instruction: stage === "discover" ? brief.explanation : stage === "debug" ? brief.mistake
        : stage === "predict" ? "Before running these arrows, choose the square where the character will finish."
          : stage === "review" ? "Explain one command you chose and one repair. Use the saved route trace to show how you know the parcel arrived."
            : stage === "create" ? independentVariants[0]!.task
              : "Guide the character to the star. Build your command list, run it, and check the trace. Each arrow moves one square.",
      teacherGuide: brief.guide,
      starter: stage === "debug" ? faultArtifact : ["discover", "predict"].includes(stage) ? programs[stage] : { blocks: [] },
    })),
    referenceArtifacts: Object.entries(programs).map(([stage, artifact]) => ({ id: `${stage}-reference`, stage, artifact })),
    checks: Object.keys(specs).map((stage) => ({ id: `${stage}-route`, stage, description: "Execute without error, meet the movement budget, visit ordered stops and reach the destination.", evaluatorId: stage })),
    fault: { artifact: faultArtifact, checkId: "debug-route", expectedFailureCode: failure.failureCode }, independentVariants,
    explanationRubric: ["Names a command or order decision actually present in the saved program.", "Uses a trace position or visited stop as evidence for the decision or repair."],
    contentProvenance: [{ resourceId: brief.id, origin: "Original StarLiz-authored delivery scenarios and movement tasks", licence: "StarLiz project content; no third-party media embedded" }],
  });
});

export function firstInstructionsPackage(id: string): ExecutableLessonPackage | null {
  return firstInstructionsPackages.find((lesson) => lesson.id === id) ?? null;
}
