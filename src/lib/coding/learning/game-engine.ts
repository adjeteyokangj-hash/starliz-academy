import { z } from "zod";
import { visualProgramSchema, executeVisual } from "./visual-machine";
import { privacyIssues } from "./studio-engines";
import type { Execution, Json } from "./types";

const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
export const learningGameSchema = z.object({
  title: z.string().max(200), learningGoal: z.string().max(1000), instructions: z.string().max(2000),
  audience: z.enum(["private", "classroom", "public"]), fontSize: z.number().int().min(10).max(48),
  program: visualProgramSchema,
  controls: z.array(z.object({ id: identifier, label: z.string().max(200), event: identifier, value: z.union([z.string().max(300), z.number().finite(), z.boolean()]), keyboard: z.boolean() }).strict()).min(1).max(12),
  testNotes: z.string().max(4000),
}).strict();
const fixtureSchema = z.object({ world: z.unknown().default({}), events: z.array(z.object({ type: z.literal("click"), target: identifier }).strict()).max(40).default([]), finding: z.string().max(1000).default("") }).strict();
export function gameControlNames(value: Json): string[] { const parsed = learningGameSchema.safeParse(value); return parsed.success ? parsed.data.controls.map((control) => control.id) : []; }
export function executeLearningGame(value: unknown, input: unknown): Execution {
  const runtime = "starliz-learning-game-1.0.0";
  try {
    const document = learningGameSchema.parse(value), fixture = fixtureSchema.parse(input);
    if (new Set(document.controls.map((control) => control.id)).size !== document.controls.length) throw new Error("Give every game control a unique identifier.");
    if (document.controls.some((control) => !Object.hasOwn(document.program.handlers, control.event))) throw new Error("Connect every game control to a declared program event.");
    const world: Record<string, unknown> = fixture.world && typeof fixture.world === "object" && !Array.isArray(fixture.world) ? fixture.world as Record<string, unknown> : {};
    const events = [{ name: "start", value: 0 as string | number | boolean }, ...fixture.events.map((event) => {
      const control = document.controls.find((control) => control.id === event.target);
      if (!control) throw new Error("Choose a control declared in this learning game.");
      return { name: control.event, value: control.value };
    })];
    const run = executeVisual(document.program, { ...world, events });
    if (!run.ok) return run;
    const result = run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output : {};
    return { ...run, runtime: `${runtime}/${run.runtime}`, output: { ...result, learningGame: true, title: document.title, learningGoal: document.learningGoal, instructions: document.instructions, fontSize: document.fontSize, controls: document.controls,
      controlsAccessible: document.controls.every((control) => control.keyboard && Boolean(control.label.trim())), readable: document.fontSize >= 20 && document.instructions.trim().length >= 20,
      privacySafe: document.audience !== "public" && privacyIssues(document).length === 0, audience: document.audience, target: typeof world.target === "number" ? world.target : 4, finding: fixture.finding, testNotes: document.testNotes } };
  } catch (error) { return { ok: false, output: null, trace: [], stdout: "", stderr: "", runtime, steps: 0, error: error instanceof z.ZodError ? "Check the learning game's program, controls and project settings." : error instanceof Error ? error.message : "The learning game could not run." }; }
}
