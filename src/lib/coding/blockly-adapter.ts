import type { Block, Workspace } from "blockly/core";
import type { Expression, VisualCommand } from "./learning/visual-machine";
import { visualProgramSchema } from "./learning/visual-machine";
import type { CodingBlock } from "./types";
import { parseCodingProgram } from "./runner";

export type BlockState = { type: string; id?: string; data?: string; fields?: Record<string, string | number>; inputs?: Record<string, { block: BlockState }>; next?: { block: BlockState } };
export const operands: Record<string, string[]> = { move: ["x", "y"], position: ["x", "y"], set: ["value"], change: ["value"], say: ["value"], turn: ["amount"], forward: ["amount"], motor: ["amount"], stop: [], emit: [], broadcast: ["value"], call: [], repeat: ["amount"], until: ["test"], if: ["test"] };
export const calculations = ["add", "subtract", "multiply", "divide", "modulo", "equal", "less", "greater", "and", "or", "not", "absolute"];
export const stepDirections: Record<string, [number, number]> = { right: [1, 0], up: [0, 1], left: [-1, 0], down: [0, -1] };
export function expressionState(value: Expression): BlockState {
  if (typeof value !== "object") return { type: `sl_${typeof value}`, fields: { VALUE: typeof value === "boolean" ? String(value) : value } };
  if ("read" in value) return { type: "sl_read", fields: { NAME: value.read } };
  return { type: `sl_calc_${value.calculate}`, inputs: Object.fromEntries(value.arguments.map((v, i) => [`ARG${i}`, { block: expressionState(v) }])) };
}
export function commandStates(commands: VisualCommand[] | CodingBlock[], legacy = false, path = "command"): BlockState | undefined {
  let next: BlockState | undefined;
  for (let i = commands.length - 1; i >= 0; i--) {
    const original = commands[i]!, fields: Record<string, string | number> = {}, inputs: NonNullable<BlockState["inputs"]> = {};
    const key = `${path}.${i}`;
    if (legacy) {
      const item = original as CodingBlock;
      if (item.kind === "move") fields.DIRECTION = item.direction;
      else { fields.TIMES = item.times; const body = commandStates(item.body, true, `${key}.body`); if (body) inputs.BODY = { block: body }; }
      next = { type: `sl_legacy_${item.kind}`, id: `node:${item.id}`, fields, inputs, data: JSON.stringify(original), ...(next ? { next: { block: next } } : {}) };
    } else {
      const item = original as VisualCommand;
      if (!(item.op in operands)) throw new Error(`Unsupported command: ${item.op}`);
      if (item.name !== undefined) fields.NAME = item.name;
      const step = item.op === "move" ? Object.keys(stepDirections).find(name => stepDirections[name]![0] === item.x && stepDirections[name]![1] === item.y) : undefined;
      if (step) fields.DIRECTION = step;
      if (!step) for (const name of operands[item.op]!) inputs[name.toUpperCase()] = { block: expressionState((item[name as keyof VisualCommand] ?? 0) as Expression) };
      for (const name of ["body", "otherwise"] as const) if (item[name]) { const body = commandStates(item[name]!, false, `${key}.${name}`); if (body) inputs[name.toUpperCase()] = { block: body }; }
      item.arguments?.forEach((v, index) => { inputs[`ARG${index}`] = { block: expressionState(v) }; });
      next = { type: step ? "sl_step" : `sl_${item.op}`, id: key, data: JSON.stringify(original), fields, inputs, ...(next ? { next: { block: next } } : {}) };
    }
  }
  return next;
}
function input(block: Block, name: string): Expression {
  const value = block.getInputTargetBlock(name); if (!value) throw new Error(`Connect the ${name.toLowerCase()} input on ${block.type.replace("sl_", "")}.`);
  if (value.type === "sl_number") return Number(value.getFieldValue("VALUE"));
  if (value.type === "sl_string") return String(value.getFieldValue("VALUE"));
  if (value.type === "sl_boolean") return value.getFieldValue("VALUE") === "true";
  if (value.type === "sl_read") return { read: String(value.getFieldValue("NAME")) };
  const operation = value.type.replace("sl_calc_", "");
  if (!calculations.includes(operation)) throw new Error("Use a value block in an expression input.");
  return { calculate: operation, arguments: ["not", "absolute"].includes(operation) ? [input(value, "ARG0")] : [input(value, "ARG0"), input(value, "ARG1")] };
}
function commandsFrom(block: Block | null, legacy: boolean): Array<VisualCommand | CodingBlock> {
  const result: Array<VisualCommand | CodingBlock> = [];
  while (block) {
    if (!block.isEnabled()) throw new Error("Disabled blocks cannot be saved. Enable or remove them explicitly.");
    const original = block.data ? JSON.parse(block.data) as Record<string, unknown> : {};
    let next: Record<string, unknown>;
    if (legacy) {
      const kind = block.type.replace("sl_legacy_", "");
      if (!["move", "repeat"].includes(kind)) throw new Error("Use the lesson's movement and repeat blocks.");
      next = kind === "move" ? { kind, direction: block.getFieldValue("DIRECTION") } : { kind, times: Number(block.getFieldValue("TIMES")), body: commandsFrom(block.getInputTargetBlock("BODY"), true) };
      next = { ...original, id: block.id === `node:${original.id}` ? original.id : block.id, ...next };
    } else {
      const op = block.type === "sl_step" ? "move" : block.type.replace("sl_", ""); if (!(op in operands)) throw new Error("Use a command block below the start block.");
      next = { op };
      if (block.getField("NAME")) next.name = String(block.getFieldValue("NAME"));
      if (block.type === "sl_step") { const direction = stepDirections[String(block.getFieldValue("DIRECTION"))]; if (!direction) throw new Error("Choose a supported direction."); [next.x, next.y] = direction; }
      else for (const name of operands[op]!) next[name] = input(block, name.toUpperCase());
      for (const name of ["body", "otherwise"]) if (block.getInput(name.toUpperCase())) next[name] = commandsFrom(block.getInputTargetBlock(name.toUpperCase()), false);
      if (op === "call") {
        const args: Expression[] = []; let gap = false;
        for (let i = 0; i < 6; i++) { if (block.getInputTargetBlock(`ARG${i}`)) { if (gap) throw new Error("Connect procedure arguments in order, without gaps."); args.push(input(block, `ARG${i}`)); } else gap = true; }
        next.arguments = args;
      }
      if (op === "broadcast" && original.op === op && !("value" in original) && next.value === 0) delete next.value;
      next = original.op === op ? { ...original, ...next } : next;
    }
    result.push(next as VisualCommand | CodingBlock); block = block.getNextBlock();
  }
  return result;
}
export function readBlockCommands(workspace: Workspace, legacy = false): VisualCommand[] | CodingBlock[] {
  const roots = workspace.getTopBlocks(false);
  if (roots.length !== 1 || roots[0]!.type !== "sl_start") throw new Error("Connect every block to the start stack; detached blocks are not saved.");
  if (workspace.getAllBlocks(false).some(block => !block.isEnabled())) throw new Error("Enable or remove disabled blocks before saving.");
  const result = commandsFrom(roots[0]!.getNextBlock(), legacy);
  if (!legacy) visualProgramSchema.parse({ variables: {}, handlers: { start: result } });
  else { const checked = parseCodingProgram({ blocks: result }); if (!checked.ok) throw new Error(checked.error); }
  return result as VisualCommand[] | CodingBlock[];
}
