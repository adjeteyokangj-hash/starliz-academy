import inventory from "../../../../docs/coding-curriculum/curriculum-proposal.json";
import { ACTIVITY_VERSION, jsonValue, type ActivityContent, type Json, type PracticalArtifact, type PracticalCase, type Predicate } from "./types";
import type { Expression } from "./visual-machine";
import { stateDiagramSchema } from "./state-diagram-contract";

export type AuthoredLesson = {
  id: string; explanation: string; reasoning: string[]; concepts: string[];
  workbench?: ActivityContent["workbench"];
  reference: PracticalArtifact; starter: PracticalArtifact; faulty: PracticalArtifact;
  cases: PracticalCase[]; practice?: PracticalCase[];
  debugCases?: PracticalCase[]; debugReference?: PracticalArtifact;
  transfer: Array<{ task: string; cases: PracticalCase[]; reference?: PracticalArtifact; starter?: PracticalArtifact }>;
  prediction: { prompt: string; choices: [string, string, string]; correct: 0 | 1 | 2; artifact?: PracticalArtifact; input?: Json };
  misconception?: string; reflection?: string[];
  workflow?: ActivityContent["workflow"];
  evidenceSlots?: ActivityContent["evidenceSlots"];
  stateDiagram?: ActivityContent["instruction"]["stateDiagram"];
};
const aliases: Record<string, string> = {
  "Y1.01": "what-is-an-instruction", "Y1.02": "put-steps-in-order", "Y1.03": "predict-before-running",
  "Y1.04": "find-the-wrong-step", "Y1.05": "plan-a-delivery", "Y1.06": "deliver-the-parcel",
  "Y3.02": "understanding-loops", "Y5.01": "what-is-a-variable", "Y7.01": "first-python-program", "Y10.01": "plan-a-test",
};
export function activityId(inventoryId: string): string { return aliases[inventoryId] ?? inventoryId.toLowerCase().replace(".", "-"); }
export function visual(document: unknown): PracticalArtifact { return { type: "visual", document: document as Json }; }
export function python(source: string, entry: "variables" | "solve" | "handle" | "console" = "solve"): PracticalArtifact { return { type: "source", language: "python", source, entry }; }
export function web(html: string, source = "", css = "body{font:18px system-ui;line-height:1.6;margin:1rem}button,input{font:inherit;padding:.6rem}button:focus-visible,input:focus-visible{outline:3px solid #0369a1}"): PracticalArtifact { return { type: "source", language: "javascript", source, html, css, entry: "dom" }; }
export function sql(source: string): PracticalArtifact { return { type: "source", language: "sql", source, entry: "console" }; }
export function eq(path: string, value: Json, description: string): Predicate { return { path, equals: value, description }; }
export function range(path: string, min: number, max: number, description: string): Predicate { return { path, min, max, description }; }
export function includes(path: string, value: Json, description: string): Predicate { return { path, includes: value, description }; }
export function containsText(path: string, value: string, description: string): Predicate { return { path, containsText: value, description }; }
export function scenario(id: string, input: unknown, ...assertions: Predicate[]): PracticalCase { return { id, input: jsonValue.parse(input), assertions }; }

export function authorLesson(authored: AuthoredLesson): ActivityContent {
  const planned = inventory.lessons.find((lesson) => lesson.id === authored.id);
  if (!planned) throw new Error(`No approved lesson matches ${authored.id}.`);
  if (authored.evidenceSlots && (authored.reference.type !== "source" || authored.reference.entry !== "dom" || (authored.workbench ?? planned.runtime) !== "web")) throw new Error("Private evidence selections require the inspected web workspace.");
  if (authored.explanation.length < 100 || authored.reasoning.length < 2 || authored.concepts.length < 2
    || authored.cases.length < 2 || authored.cases.some((test) => !test.assertions.length)
    || authored.transfer.length < 2 || authored.transfer.some((variant) => variant.cases.length < 2)) throw new Error(`The authored lesson ${authored.id} lacks required teaching or executable assessment.`);
  const curriculumModule = inventory.modules.find((item) => item.id === planned.moduleId);
  const courseModules = inventory.modules.filter((item) => item.courseId === planned.courseId);
  const moduleIndex = curriculumModule ? courseModules.indexOf(curriculumModule) : -1;
  const previousProject = curriculumModule?.lessonIds[0] === planned.id
    ? moduleIndex > 0 ? courseModules[moduleIndex - 1]!.projectId : inventory.projects.filter((item) => item.year === planned.year - 1).at(-1)?.id
    : undefined;
  return {
    id: activityId(planned.id), version: ACTIVITY_VERSION, inventoryId: planned.id, kind: "lesson", title: planned.title,
    year: planned.year, pathwayId: planned.pathwayId as ActivityContent["pathwayId"], courseId: planned.courseId, moduleId: planned.moduleId,
    projectId: planned.projectId, engine: planned.runtime as ActivityContent["engine"],
    workbench: authored.workbench ?? planned.runtime as ActivityContent["workbench"],
    prerequisites: [...new Set([...planned.prerequisites, ...(previousProject ? [previousProject] : [])].map(activityId))], objective: planned.objective, concepts: authored.concepts,
    instruction: { explanation: authored.explanation, exampleReasoning: authored.reasoning,
      ...(authored.stateDiagram ? { stateDiagram: stateDiagramSchema.parse(authored.stateDiagram) } : {}),
      misconception: authored.misconception ?? planned.challenge.negativeCase,
      repairPrompt: `Reproduce this fault, inspect the actual result, and repair its cause: ${planned.challenge.negativeCase}`,
      reflection: authored.reflection ?? [`Explain how your artifact demonstrates: ${planned.objective}`, "Point to a value, action or test result in your saved work that supports your explanation."],
    }, starter: authored.starter, example: authored.reference, faulty: authored.faulty, reference: authored.reference,
    cases: authored.cases, practiceCases: authored.practice ?? authored.cases.slice().reverse(),
    debugCases: authored.debugCases ?? authored.cases, debugReference: authored.debugReference ?? authored.reference,
    independent: authored.transfer.map((variant, index) => ({ id: `${planned.id}-transfer-${index + 1}`, task: variant.task,
      visibleInput: variant.cases[0]!.input, cases: variant.cases, reference: variant.reference ?? authored.reference, starter: variant.starter ?? authored.starter })),
    prediction: { prompt: authored.prediction.prompt, choices: authored.prediction.choices.map((text, index) => ({ id: `choice-${index}`, text })), correctId: `choice-${authored.prediction.correct}`,
      artifact: authored.prediction.artifact ?? authored.reference, input: authored.prediction.input ?? authored.cases[0]!.input },
    essentialChecks: planned.challenge.essentialChecks, projectOutcome: planned.projectOutcome, alignment: planned.alignment, ...(authored.workflow ? { workflow: authored.workflow } : {}), ...(authored.evidenceSlots ? { evidenceSlots: authored.evidenceSlots } : {}),
  };
}

/** Consolidation and portfolio work have their own authored practical briefs,
 * versions, independent assessments and progress records. They are not aliases
 * for a core lesson or automatically counted from a scheduling capacity. */
export function authorModuleActivity(authored: Omit<AuthoredLesson, "id"> & {
  moduleId: string; kind: "consolidation" | "project"; slot?: 1 | 2 | 3;
  title: string; objective: string; essentialChecks: string[]; faultDescription: string;
}): ActivityContent {
  const curriculumModule = inventory.modules.find((item) => item.id === authored.moduleId);
  const project = curriculumModule && inventory.projects.find((item) => item.id === curriculumModule.projectId);
  if (!curriculumModule || !project || authored.kind === "consolidation" && !authored.slot || authored.essentialChecks.length < 2) throw new Error("A module activity needs an approved module, a distinct brief and executable mastery criteria.");
  const id = authored.kind === "project" ? project.id : project.id.replace(/^P-/, "C-") + `-${authored.slot}`;
  const content = authorLesson({ ...authored, id: curriculumModule.lessonIds.at(-1)! });
  const prior = authored.kind === "project" ? project.id.replace(/^P-/, "C-") + "-3" : authored.slot! > 1 ? project.id.replace(/^P-/, "C-") + `-${authored.slot! - 1}` : null;
  return { ...content, id: activityId(id), inventoryId: id, kind: authored.kind, title: authored.title, objective: authored.objective,
    instruction: { ...content.instruction, repairPrompt: `Run the seeded fault, compare its actual result with this activity's brief, and repair its cause: ${authored.faultDescription}`,
      reflection: authored.reflection ?? [`Explain how your artifact demonstrates: ${authored.objective}`, "Cite a value, movement, saved-file operation or test result from this actual activity."] },
    prerequisites: [...curriculumModule.lessonIds.map(activityId), ...(prior ? [activityId(prior)] : [])],
    essentialChecks: authored.essentialChecks, projectOutcome: project.artifact,
    alignment: [...new Set(inventory.lessons.filter((item) => curriculumModule.lessonIds.includes(item.id)).flatMap((item) => item.alignment))],
    independent: content.independent.map((variant, index) => ({ ...variant, id: `${id}-transfer-${index + 1}` })),
  };
}

export function machine(handlers: Record<string, unknown[]>, variables: Record<string, Json> = {}, procedures?: unknown): PracticalArtifact {
  return visual({ handlers, variables, ...(procedures ? { procedures } : {}) });
}
export const move = (x: Expression, y: Expression) => ({ op: "move", x, y });
export const repeat = (amount: Expression, body: unknown[]) => ({ op: "repeat", amount, body });
export const set = (name: string, value: unknown) => ({ op: "set", name, value });
export const change = (name: string, value: unknown) => ({ op: "change", name, value });
export const read = (name: string) => ({ read: name });
export const calc = (calculate: string, ...args: Expression[]) => ({ calculate, arguments: args });
export const branch = (test: unknown, body: unknown[], otherwise: unknown[] = []) => ({ op: "if", test, body, otherwise });
