import { z } from "zod";
import { executeVisual, visualProgramSchema, visualWorldSchema, type VisualCommand } from "./visual-machine";
import { sameJson } from "./checks";
import type { Execution, Json } from "./types";

const comparisonSchema = z.object({ comparison: z.object({ left: visualProgramSchema, right: visualProgramSchema }).strict() }).strict();
const actorsSchema = z.object({ actors: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), z.object({
  origin: z.object({ x: z.number().int().min(0).max(10), y: z.number().int().min(0).max(10) }).strict(),
  program: visualProgramSchema,
}).strict()) }).strict();

export function executeVisualWorkspace(document: Json, input: Json): Execution {
  if (!document || typeof document !== "object" || Array.isArray(document)) return executeVisual(document, input);
  try {
    if ("comparison" in document) {
      const pair = comparisonSchema.parse(document).comparison;
      const left = executeVisual(pair.left, input), right = executeVisual(pair.right, input);
      const behavior = (run: Execution) => {
        if (!run.output || typeof run.output !== "object" || Array.isArray(run.output)) return null;
        const { visits, variables, speech, stopped, storyEvents } = run.output;
        return { visits, variables, speech, stopped, storyEvents };
      };
      return { ok: left.ok && right.ok, output: { left: left.output, right: right.output, equivalent: left.ok && right.ok && sameJson(behavior(left), behavior(right)) },
        trace: [{ program: "left", trace: left.trace }, { program: "right", trace: right.trace }],
        stdout: [left.stdout, right.stdout].join("\n"), stderr: [left.stderr, right.stderr].join("\n"), error: left.error ?? right.error,
        runtime: "starliz-visual-comparison-1.0.0", steps: left.steps + right.steps };
    }
    if ("actors" in document) {
      const { actors } = actorsSchema.parse(document), entries = Object.entries(actors);
      if (entries.length < 1 || entries.length > 8) throw new Error("Use between one and eight independently programmed characters.");
      const fixture = input && typeof input === "object" && !Array.isArray(input) ? input : {};
      const start = fixture.start && typeof fixture.start === "object" && !Array.isArray(fixture.start) ? fixture.start : { x: 0, y: 0 };
      const usesBroadcast = (commands: VisualCommand[]): boolean => commands.some((command) => command.op === "broadcast" || usesBroadcast(command.body ?? []) || usesBroadcast(command.otherwise ?? []));
      const broadcasts = entries.some(([, actor]) => Object.values(actor.program.handlers).some(usesBroadcast) || Object.values(actor.program.procedures ?? {}).some((procedure) => usesBroadcast(procedure.body)));
      let runs = entries.map(([id, actor]) => ({ id, run: executeVisual(actor.program, { ...fixture, ...(broadcasts ? { events: [] } : {}), start: { x: Number(start.x) + actor.origin.x, y: Number(start.y) + actor.origin.y } }) }));
      let broadcastCount = 0;
      if (broadcasts) {
        const world = visualWorldSchema.parse(fixture);
        const histories = new Map(entries.map(([id]) => [id, [] as typeof world.events]));
        const seen = new Map(entries.map(([id]) => [id, 0]));
        for (const external of world.events) {
          const queue = [external];
          while (queue.length) {
            const event = queue.shift()!;
            runs = entries.map(([id, actor]) => {
              const history = histories.get(id)!; history.push(event);
              if (history.length > 200) throw new Error("The shared scene exceeded its 200-event play limit.");
              const run = executeVisual(actor.program, { ...world, events: history, start: { x: world.start.x + actor.origin.x, y: world.start.y + actor.origin.y } });
              if (!run.ok) throw new Error(run.error ?? "A character's broadcast response failed.");
              const output = run.output as Record<string, Json>;
              const sent = Array.isArray(output.broadcastEvents) ? output.broadcastEvents : [];
              for (const item of sent.slice(seen.get(id)!)) {
                if (++broadcastCount > 64) throw new Error("A shared scene may deliver at most 64 broadcasts. Repair the message cycle.");
                const message = item as { name: string; value: number | string | boolean };
                queue.push({ name: message.name, value: message.value });
              }
              seen.set(id, sent.length);
              return { id, run };
            });
          }
        }
      }
      return { ok: runs.every(({ run }) => run.ok), output: { actorCount: runs.length, actors: Object.fromEntries(runs.map(({ id, run }) => [id, run.output])), ...(broadcasts ? { broadcastCount } : {}) },
        trace: runs.map(({ id, run }) => ({ actor: id, trace: run.trace })), stdout: runs.map(({ run }) => run.stdout).join("\n"), stderr: "",
        error: runs.find(({ run }) => !run.ok)?.run.error, runtime: "starliz-visual-scene-1.0.0", steps: runs.reduce((sum, { run }) => sum + run.steps, 0) };
    }
    return executeVisual(document, input);
  } catch (error) {
    return { ok: false, output: null, trace: [], stdout: "", stderr: "", runtime: "starliz-visual-workspace-1.0.0", steps: 0,
      error: error instanceof z.ZodError ? "Check each character's program, origin and name." : error instanceof Error ? error.message : "The visual workspace could not run." };
  }
}
