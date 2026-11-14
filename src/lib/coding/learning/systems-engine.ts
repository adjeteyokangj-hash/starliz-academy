import { z } from "zod";
import type { Execution, Json } from "./types";
import { systemsDocumentSchema, systemsFixtureSchema } from "./systems-contract";
export { systemsDocumentSchema, type SystemsDocument } from "./systems-contract";

const address = z.number().int().min(0).max(15);
export function executeSystems(artifact: unknown, input: unknown = {}): Execution {
  const runtime = "starliz-systems-1.0.0", trace: Json[] = [];
  try {
    const base = systemsDocumentSchema.parse(artifact);
    const fixture = systemsFixtureSchema.parse(input);
    const document = { ...base, ...fixture }, mask = 2 ** document.bits - 1;
    const memory = [...document.memory], output: number[] = [];
    let accumulator = 0, pc = 0, halted = false, overflow = false;
    if (document.mode === "computer") while (!halted) {
      if (trace.length >= 200) throw new Error("The computer model reached its 200-instruction limit. Repair the jump or add HALT.");
      const current = document.program[pc];
      if (!current) throw new Error("The program counter points beyond the stored instructions.");
      const before = accumulator, previousPc = pc;
      pc++;
      const cell = () => { const valid = address.safeParse(current.operand); if (!valid.success) throw new Error("A memory address must be between 0 and 15."); return valid.data; };
      switch (current.op) {
        case "CONST": accumulator = current.operand; break;
        case "LOAD": accumulator = memory[cell()]!; break;
        case "STORE": memory[cell()] = accumulator; break;
        case "ADD": accumulator += memory[cell()]!; break;
        case "SUB": accumulator -= memory[cell()]!; break;
        case "JNZ": if (accumulator !== 0) { if (current.operand < 0 || current.operand >= document.program.length) throw new Error("The jump target is outside the program."); pc = current.operand; } break;
        case "OUT": output.push(accumulator); break;
        case "HALT": halted = true; break;
      }
      if (accumulator < 0 || accumulator > mask) overflow = true;
      accumulator = ((accumulator % (mask + 1)) + mask + 1) % (mask + 1);
      trace.push({ pc: previousPc, instruction: current.op, before, after: accumulator, memory: [...memory], next: pc });
    }
    const binary = (value: number) => (value & mask).toString(2).padStart(document.bits, "0");
    let carry = 0;
    const carries: Json[] = [];
    for (let bit = 0; bit < document.bits; bit++) {
      const a = document.left >> bit & 1, b = document.right >> bit & 1, total = a + b + carry;
      carries.push({ bit, left: a, right: b, carryIn: carry, result: total & 1, carryOut: total > 1 ? 1 : 0 });
      carry = total > 1 ? 1 : 0;
    }
    const gateIds = new Set(document.gates.map((item) => item.id));
    if (gateIds.size !== document.gates.length) throw new Error("Give every gate a different name.");
    const inputNames = document.gates.filter((item) => item.op === "INPUT").map((item) => item.id);
    if (inputNames.length > 4) throw new Error("This circuit workspace supports up to four input switches.");
    const truthTable: Json[] = [];
    let gateEvaluations = 0;
    if (document.mode === "circuit") {
      if (!gateIds.has(document.outputGate)) throw new Error("Connect the output to an existing gate.");
      for (let bits = 0; bits < 2 ** inputNames.length; bits++) {
        const inputs = Object.fromEntries(inputNames.map((id, index) => [id, Boolean(bits >> index & 1)]));
        const evaluated = new Map<string, boolean>();
        const evaluate = (id: string, seen = new Set<string>()): boolean => {
          if (++gateEvaluations > 1024) throw new Error("The circuit exceeds its bounded evaluation budget. Simplify its connections.");
          if (seen.has(id)) throw new Error("A combinational circuit cannot feed itself. Remove the cycle.");
          if (evaluated.has(id)) return evaluated.get(id)!;
          const node = document.gates.find((item) => item.id === id);
          if (!node) throw new Error("A wire refers to a missing gate.");
          if (node.op === "INPUT") return inputs[id]!;
          if (node.inputs.length !== (node.op === "NOT" ? 1 : 2)) throw new Error("Connect the required number of input wires.");
          const visited = new Set([...seen, id]), a = evaluate(node.inputs[0]!, visited);
          if (node.op === "NOT") { evaluated.set(id, !a); return !a; }
          const b = evaluate(node.inputs[1]!, visited);
          const result = node.op === "AND" ? a && b : node.op === "OR" ? a || b : a !== b;
          evaluated.set(id, result);
          return result;
        };
        truthTable.push({ inputs, output: evaluate(document.outputGate) });
      }
    }
    const componentIds = new Set(document.components.map((item) => item.id));
    if (componentIds.size !== document.components.length || document.components.some((item) => item.next.some((id) => !componentIds.has(id)))) throw new Error("A component connection is missing or duplicated.");
    const rolePath: string[] = [], visited = new Set<string>(), queue = document.components.filter((item) => item.role === "input");
    while (queue.length) { const component = queue.shift()!; if (visited.has(component.id)) continue; visited.add(component.id); rolePath.push(component.role); queue.push(...component.next.map((id) => document.components.find((item) => item.id === id)!)); }
    return { ok: true, output: { mode: document.mode, bits: document.bits, accumulator, memory, output, halted, overflow, trace,
      leftBinary: binary(document.left), rightBinary: binary(document.right), binarySum: binary(document.left + document.right),
      decimalSum: (document.left + document.right) & mask, additionOverflow: document.left + document.right > mask, carries,
      truthTable, gateEvaluations, rolePath, explanation: document.explanation },
      trace: document.mode === "binary" ? carries : document.mode === "circuit" ? truthTable : trace,
      stdout: output.join("\n"), stderr: "", runtime, steps: trace.length || truthTable.length || carries.length };
  } catch (error) { return { ok: false, output: null, trace, stdout: "", stderr: "", error: error instanceof z.ZodError ? "Check the computer model's instructions, wires and numeric limits." : error instanceof Error ? error.message : "The model could not run.", runtime, steps: trace.length }; }
}
