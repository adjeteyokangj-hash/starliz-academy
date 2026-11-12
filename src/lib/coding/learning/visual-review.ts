import { createHash } from "node:crypto";
import type { ActivityContent, Execution, PracticalArtifact } from "./types";

export type VisualReview = { binding: string; questions: Array<{ id: string; prompt: string; choices: Array<{ id: string; text: string }> }> };
const introductoryRubrics = new Set(["Y1.01", "Y1.02", "Y1.03", "Y1.04", "Y1.05", "Y1.06"]);
// Each introductory route objective has its own rubric below. Other engines
// and objectives do not inherit these movement questions.
export function hasVisualReview(activity: ActivityContent): boolean {
  return introductoryRubrics.has(activity.inventoryId) && activity.year === 1 && activity.workbench === "route" && activity.kind === "lesson";
}
export function visualReview(activity: ActivityContent, artifact: PracticalArtifact, run: Execution): { public: VisualReview; correct: Record<string, string> } | null {
  if (!hasVisualReview(activity) || !run.ok || !run.output || typeof run.output !== "object" || Array.isArray(run.output)) return null;
  const visits = run.output.visits;
  if (!Array.isArray(visits) || visits.length < 2 || visits.length > 1000) return null;
  const points = visits.map(point => point && typeof point === "object" && !Array.isArray(point) && typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null);
  if (points.some(point => !point)) return null;
  const start = points[0]!, next = points.find(point => point!.x !== start.x || point!.y !== start.y);
  if (!next) return null;
  const dx = next.x - start.x, dy = next.y - start.y;
  if (dx !== 0 && dy !== 0) return null;
  const directions = ["Right →", "Left ←", "Up ↑", "Down ↓"];
  const first = dx > 0 ? 0 : dx < 0 ? 1 : dy > 0 ? 2 : 3;
  const opposite = [1, 0, 3, 2][first]!;
  const binding = createHash("sha256").update(JSON.stringify({ rubric: `${activity.inventoryId}-visual-review-v1`, activity: activity.id, version: activity.version, artifact, points })).digest("hex");
  const movement: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!, point = points[index]!;
    const x = point.x - previous.x, y = point.y - previous.y;
    if (x && y) return null;
    if (x || y) movement.push(x > 0 ? 0 : x < 0 ? 1 : y > 0 ? 2 : 3);
  }
  const arrows = ["→", "←", "↑", "↓"];
  const trail = (moves: number[]) => moves.map(move => arrows[move]).join("  ");
  const changedFirst = [...movement]; changedFirst[0] = opposite;
  const changedLast = [...movement]; changedLast[changedLast.length - 1] = [1, 0, 3, 2][changedLast.at(-1)!]!;
  const trails = [...new Set([trail(movement), trail(changedFirst), trail(changedLast)])];
  if (trails.length < 3) trails.push(trail([...movement, opposite]));
  const firstQuestion = { id: "first-move", prompt: "Replay My Program. Which arrow comes first in your route?", options: directions, answer: first };
  const routeQuestion = { id: "route-order", prompt: "Read from left to right. Which row of arrows follows your saved program in the right order?", options: trails, answer: 0 };
  const lastQuestion = { id: "last-move", prompt: "Which way does your character move on the last step?", options: directions, answer: movement.at(-1)! };
  const specifications = activity.inventoryId === "Y1.01" ? [
    { id: "command", prompt: "Which one tells a computer what to do?", options: [`Move ${directions[first]!.toLowerCase()}`, "A lovely parcel", "A colourful character"], answer: 0 },
    { id: "first-move", prompt: "Replay My Program. Which way did your character move first?", options: directions, answer: first },
    { id: "change", prompt: "Imagine pointing that first arrow the other way. Which way would the character move?", options: directions, answer: opposite },
  ] : activity.inventoryId === "Y1.02" ? [firstQuestion, routeQuestion, lastQuestion]
    : activity.inventoryId === "Y1.03" ? [{ ...routeQuestion, prompt: "Follow your program one arrow at a time. Which trail will it make?" }, firstQuestion, lastQuestion]
      : activity.inventoryId === "Y1.04" ? [{ ...firstQuestion, prompt: "Which way does your repaired program move first?" }, routeQuestion, { id: "repair", prompt: "An arrow points the wrong way. What should you do?", options: ["Change that arrow, then run and check the route", "Run the same wrong arrow again", "Delete all your saved work"], answer: 0 }]
        : activity.inventoryId === "Y1.05" ? [routeQuestion, firstQuestion, { id: "plan", prompt: "What helps you plan a route before running it?", options: ["Follow the arrows from the start, checking the stops and star", "Press Run without looking at the route", "Move the star instead of planning commands"], answer: 0 }]
          : [routeQuestion, lastQuestion, { id: "project-check", prompt: "How can you check your finished route works?", options: ["Replay every move and check the stops and star", "Only look at the colour of the blocks", "Give the project a name without running it"], answer: 0 }];
  const correct: Record<string, string> = {};
  const questions = specifications.map((question, index) => {
    const offset = parseInt(binding.slice(index * 2, index * 2 + 2), 16) % question.options.length;
    const options = question.options.map((_, position) => (position + offset) % question.options.length);
    correct[question.id] = String(options.indexOf(question.answer));
    return { id: question.id, prompt: question.prompt, choices: options.map((option, position) => ({ id: String(position), text: question.options[option]! })) };
  });
  return { public: { binding, questions }, correct };
}
export function checkVisualReview(activity: ActivityContent, artifact: PracticalArtifact, run: Execution, submission: string) {
  const challenge = visualReview(activity, artifact, run);
  const fail = (message: string) => ({ passed: false, message, source: "evidence" as const, confidence: 0 });
  if (!challenge) return fail("Replay your saved program, then try the picture review again. Your work is safe.");
  try {
    const value = JSON.parse(submission);
    if (value?.type !== "visual-review-v1" || value.binding !== challenge.public.binding || !value.answers || typeof value.answers !== "object" || Array.isArray(value.answers) || Object.keys(value.answers).length !== challenge.public.questions.length) return fail("This review does not match your saved program. Choose your answers for the current program and try again.");
    if (!challenge.public.questions.every(question => typeof value.answers[question.id] === "string" && value.answers[question.id] === challenge.correct[question.id])) return fail("Not quite yet. Replay My Program and check the first arrow. Then try your choices again.");
    return { passed: true, message: activity.inventoryId === "Y1.01" ? "You showed what a command does and how changing its arrow changes the move. Your saved program and review passed!" : "You matched your answers to your saved route. Your practical program and review passed!", source: "evidence" as const, confidence: 1 };
  } catch { return fail("Choose an answer for each picture question. You do not need to type an explanation."); }
}
