import { z } from "zod";
import { executeVisual } from "./visual-machine";
import { executeSource } from "./source-execution";
import { sameJson } from "./checks";
import { type Execution, type Json } from "./types";
import { dualDocumentSchema } from "./dual-contract";

const variable = z.union([z.number().finite().min(-1e6).max(1e6), z.string().max(300), z.boolean()]);
const fixtureSchema = z.object({ variables: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/).refine((key) => !["constructor", "prototype", "__proto__"].includes(key)), variable).default({}),
  restart: z.boolean().default(false) }).strict();

export async function executeDual(document: Json, input: Json, runSource = executeSource): Promise<Execution> {
  const parsed = dualDocumentSchema.safeParse(document), fixture = fixtureSchema.safeParse(input);
  if (!parsed.success || !fixture.success) return { ok: false, output: null, trace: [], stdout: "", stderr: "", error: "Use a visual program and its Python variable-trace translation with valid starting values.", runtime: "starliz-dual-1.0.0", steps: 0 };
  const { visual, python } = parsed.data.dual;
  const blocks = executeVisual({ ...visual, variables: { ...visual.variables, ...fixture.data.variables } }, { events: fixture.data.restart ? [{ name: "start" }, { name: "restart" }] : [{ name: "start" }] });
  if (!blocks.ok) return blocks;
  const text = await runSource(python, { variables: fixture.data.variables });
  const output = (run: Execution) => run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output : {};
  const left = output(blocks), right = output(text);
  return { ok: text.ok, output: { visual: blocks.output, python: text.output,
    equivalent: text.ok && sameJson(left.variables, right.variables) && blocks.stdout.trimEnd() === text.stdout.trimEnd(), resetChecked: fixture.data.restart },
    trace: [{ representation: "visual", trace: blocks.trace }, { representation: "python", trace: text.trace }], stdout: text.stdout, stderr: text.stderr, error: text.error,
    runtime: `starliz-dual-1.0.0:${text.runtime}`, steps: blocks.steps + text.steps };
}
