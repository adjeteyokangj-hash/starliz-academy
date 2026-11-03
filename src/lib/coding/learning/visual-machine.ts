import { z } from "zod";
import type { Execution, Json } from "./types";

const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/).refine((value) => !["constructor", "prototype", "__proto__"].includes(value));
type Value = number | boolean | string;
export type Expression = Value | { read: string } | { calculate: string; arguments: Expression[] };
const expression: z.ZodType<Expression> = z.lazy(() => z.union([
  z.number().finite().min(-1e6).max(1e6), z.boolean(), z.string().max(300),
  z.object({ read: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,60}$/) }).strict(),
  z.object({ calculate: z.enum(["add", "subtract", "multiply", "divide", "modulo", "equal", "less", "greater", "and", "or", "not", "absolute"]), arguments: z.array(expression).min(1).max(2) }).strict()
    .refine((value) => value.arguments.length === (["not", "absolute"].includes(value.calculate) ? 1 : 2), "Use one input for Not or Absolute, and two inputs for other calculations."),
]));
export type VisualCommand = {
  op: string; name?: string; value?: Expression; x?: Expression; y?: Expression; amount?: Expression;
  test?: Expression; body?: VisualCommand[]; otherwise?: VisualCommand[]; arguments?: Expression[];
};
const command: z.ZodType<VisualCommand> = z.lazy(() => z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), x: expression, y: expression }).strict(),
  z.object({ op: z.literal("position"), x: expression, y: expression }).strict(),
  z.object({ op: z.literal("set"), name, value: expression }).strict(),
  z.object({ op: z.literal("change"), name, value: expression }).strict(),
  z.object({ op: z.literal("say"), value: expression }).strict(),
  z.object({ op: z.literal("turn"), amount: expression }).strict(),
  z.object({ op: z.literal("forward"), amount: expression }).strict(),
  z.object({ op: z.literal("motor"), amount: expression }).strict(),
  z.object({ op: z.literal("stop") }).strict(),
  z.object({ op: z.literal("emit"), name }).strict(),
  z.object({ op: z.literal("broadcast"), name, value: expression.default(0) }).strict(),
  z.object({ op: z.literal("call"), name, arguments: z.array(expression).max(6) }).strict(),
  z.object({ op: z.literal("repeat"), amount: expression, body: z.array(command).max(100) }).strict(),
  z.object({ op: z.literal("until"), test: expression, body: z.array(command).max(100) }).strict(),
  z.object({ op: z.literal("if"), test: expression, body: z.array(command).max(100), otherwise: z.array(command).max(100) }).strict(),
]));
export const visualProgramSchema = z.object({
  plan: z.array(z.enum(["right", "down", "left", "up"])).max(40).optional(),
  variables: z.record(name, z.union([z.number().finite().min(-1e6).max(1e6), z.string().max(300), z.boolean()])),
  handlers: z.record(name, z.array(command).max(100)),
  procedures: z.record(name, z.object({ parameters: z.array(name).max(6), body: z.array(command).max(100) }).strict()).optional(),
}).strict();
const point = z.object({ x: z.number().finite().min(-100).max(100), y: z.number().finite().min(-100).max(100) }).strict();
export const visualWorldSchema = z.object({
  start: point.default({ x: 0, y: 0 }), heading: z.number().int().min(0).max(3).default(0),
  width: z.number().int().min(2).max(20).default(6), height: z.number().int().min(2).max(20).default(6),
  obstacles: z.array(point).max(100).default([]),
  events: z.array(z.object({ name, value: z.union([z.number().finite(), z.string().max(300), z.boolean()]).default(0) }).strict()).max(200).default([{ name: "start", value: 0 }]),
  target: z.number().finite().min(-100).max(100).default(4), noise: z.array(z.number().min(-5).max(5)).max(200).default([]),
  track: z.array(point).max(100).default([]), destination: point.optional(),
  dt: z.number().min(0.01).max(1).default(0.1),
}).strict();

export function executeVisual(document: unknown, input: unknown): Execution {
  const trace: Json[] = [];
  let steps = 0;
  try {
    if (JSON.stringify(document).length > 65536 || JSON.stringify(input).length > 32768) throw new Error("This visual program exceeds the workspace limits.");
    const program = visualProgramSchema.parse(document), world = visualWorldSchema.parse(input);
    const onTrack = (px: number, py: number) => world.track.some((point) => Math.abs(point.x - px) < 1e-8 && Math.abs(point.y - py) < 1e-8);
    const vector = (facing: number) => [[1, 0], [0, -1], [-1, 0], [0, 1]][facing]!;
    let x = world.start.x, y = world.start.y, heading = world.heading, stopped = false, collision = false, eventValue: Value = 0;
    if (Object.keys(program.variables).length > 32) throw new Error("Use no more than 32 named values in this visual workspace.");
    let variables = { ...program.variables };
    let activeRepeats = 0, loopMoves = 0, repeatIterations = 0, calls = 0, decisions = 0;
    const speech: string[] = [], messages: string[] = [], visits: Json[] = [{ x, y }], powers: number[] = [], errors: number[] = [];
    const headings: number[] = [heading];
    const storyEvents: Json[] = [];
    const sensorReads = new Set<string>();
    const broadcastEvents: Array<{ name: string; value: Value; eventIndex: number }> = [];
    let eventIndex = 0;
    const record = (op: string, locals: Record<string, Value> = {}) => {
      if (++steps > 500) throw new Error("Execution stopped after 500 visual actions. Repair the loop or message cycle.");
      trace.push({ step: steps, op, x, y, heading, stopped, collision, variables: { ...variables }, ...(Object.keys(locals).length ? { parameters: { ...locals } } : {}) });
    };
    const scalar = (value: Expression, locals: Record<string, Value>, depth = 0): Value => {
      if (depth > 12) throw new Error("This expression is nested too deeply.");
      if (typeof value !== "object") return value;
      if ("read" in value) {
        const key = value.read;
        if (key.startsWith("sensor.")) sensorReads.add(key);
        if (key === "x") return x;
        if (key === "y") return y;
        if (key === "heading") return heading;
        if (key === "world.width") return world.width;
        if (key === "world.height") return world.height;
        if (key === "event") return eventValue;
        if (key === "world.target") return world.target;
        if (key === "collision") return collision;
        if (key === "stopped") return stopped;
        if (key === "sensor.destination") return Boolean(world.destination && Math.abs(world.destination.x - x) < 1e-8 && Math.abs(world.destination.y - y) < 1e-8);
        if (key === "sensor.onLine") return onTrack(x, y);
        if (["sensor.lineAhead", "sensor.lineRight", "sensor.lineLeft"].includes(key)) {
          const facing = (heading + (key === "sensor.lineRight" ? 1 : key === "sensor.lineLeft" ? 3 : 0)) % 4;
          const [dx, dy] = vector(facing); return onTrack(x + dx!, y + dy!);
        }
        if (key === "sensor.error") return world.target - x + (world.noise[powers.length] ?? 0);
        if (key === "sensor.distance") {
          const [dx, dy] = vector(heading);
          let distance = dx! > 0 ? world.width - x : dx! < 0 ? x + 1 : dy! > 0 ? world.height - y : y + 1;
          for (const obstacle of world.obstacles) {
            const along = (obstacle.x - x) * dx! + (obstacle.y - y) * dy!, across = Math.abs((obstacle.x - x) * dy! - (obstacle.y - y) * dx!);
            if (along > 0 && across < 1e-8) distance = Math.min(distance, along);
          }
          return distance;
        }
        if (Object.hasOwn(locals, key)) return locals[key]!;
        if (Object.hasOwn(variables, key)) return variables[key]!;
        throw new Error(`The value ${key} has not been set.`);
      }
      const values = value.arguments.map((argument) => scalar(argument, locals, depth + 1));
      const a = values[0]!, b = values[1]!;
      if (value.calculate === "equal") return a === b;
      if (value.calculate === "and") return Boolean(a) && Boolean(b);
      if (value.calculate === "or") return Boolean(a) || Boolean(b);
      if (value.calculate === "not") return !a;
      if (value.calculate === "add" && (typeof a === "string" || typeof b === "string")) return `${a}${b}`.slice(0, 300);
      if (typeof a !== "number" || (value.calculate !== "absolute" && typeof b !== "number")) throw new Error("Use numeric values in this calculation.");
      const n = Number(b);
      const finiteResult = (result: number) => { if (!Number.isFinite(result) || Math.abs(result) > 1e6) throw new Error("Keep visual calculations between -1,000,000 and 1,000,000."); return result; };
      switch (value.calculate) {
        case "add": return finiteResult(a + n);
        case "subtract": return finiteResult(a - n);
        case "multiply": return finiteResult(a * n);
        case "divide": if (n === 0) throw new Error("A number cannot be divided by zero."); return finiteResult(a / n);
        case "modulo": if (n === 0) throw new Error("The remainder divisor cannot be zero."); return finiteResult(a % n);
        case "less": return a < n;
        case "greater": return a > n;
        case "absolute": return finiteResult(Math.abs(a));
        default: throw new Error("Unknown calculation.");
      }
    };
    const numeric = (value: Expression, locals: Record<string, Value>) => {
      const result = scalar(value, locals);
      if (typeof result !== "number" || !Number.isFinite(result) || Math.abs(result) > 1e6) throw new Error("Use a finite number between -1,000,000 and 1,000,000.");
      return result;
    };
    const position = (nx: number, ny: number, traverse = false) => {
      const dx = nx - x, dy = ny - y, squared = dx * dx + dy * dy;
      collision = world.obstacles.some((p) => {
        if (Math.abs(p.x - nx) < 1e-8 && Math.abs(p.y - ny) < 1e-8) return true;
        if (!traverse || squared === 0) return false;
        const fraction = ((p.x - x) * dx + (p.y - y) * dy) / squared;
        return fraction > 0 && fraction <= 1 && Math.hypot(p.x - (x + fraction * dx), p.y - (y + fraction * dy)) < 1e-8;
      });
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) throw new Error("The character left the map. Check the direction and repeat count.");
      if (!collision) { x = nx; y = ny; visits.push({ x, y }); headings.push(heading); storyEvents.push({ type: "move", x, y }); }
    };
    const execute = (commands: VisualCommand[], locals: Record<string, Value> = {}, depth = 0): void => {
      if (depth > 12) throw new Error("Too many nested calls. Check for a message or procedure cycle.");
      for (const block of commands) {
        record(block.op, locals);
        switch (block.op) {
          case "set": if (!Object.hasOwn(variables, block.name!) && Object.keys(variables).length >= 32) throw new Error("Use no more than 32 named values in this visual workspace."); variables[block.name!] = scalar(block.value!, locals); break;
          case "change": variables[block.name!] = numeric({ calculate: "add", arguments: [{ read: block.name! }, block.value!] }, locals); break;
          case "say": { const text = String(scalar(block.value!, locals)); speech.push(text); storyEvents.push({ type: "say", text, x, y }); break; }
          case "move": if (stopped) throw new Error("Restart before moving a stopped character."); position(x + numeric(block.x!, locals), y + numeric(block.y!, locals), true); if (activeRepeats) loopMoves++; break;
          case "position": position(numeric(block.x!, locals), numeric(block.y!, locals)); break;
          case "turn": { const turns = numeric(block.amount!, locals); if (!Number.isInteger(turns)) throw new Error("Use a whole number of quarter turns."); heading = ((heading + turns) % 4 + 4) % 4; headings[headings.length - 1] = heading; break; }
          case "forward": {
            const amount = numeric(block.amount!, locals);
            if (!Number.isInteger(amount) || amount < 0 || amount > 20) throw new Error("Move forward between zero and twenty squares.");
            const [dx, dy] = [[1, 0], [0, -1], [-1, 0], [0, 1]][heading]!;
            for (let i = 0; i < amount; i++) { if (stopped) break; position(x + dx, y + dy); if (activeRepeats) loopMoves++; record("forward-step", locals); if (collision) break; }
            break;
          }
          case "motor": {
            const power = numeric(block.amount!, locals);
            if (Math.abs(power) > 10) throw new Error("Motor power must stay between -10 and 10.");
            if (!stopped) { const [dx, dy] = vector(heading); position(x + dx! * power * world.dt, y + dy! * power * world.dt, true); powers.push(collision ? 0 : power); errors.push(Math.abs(world.target - x)); }
            break;
          }
          case "stop": stopped = true; powers.push(0); break;
          case "emit": messages.push(block.name!); execute(program.handlers[block.name!] ?? [], locals, depth + 1); break;
          case "broadcast": {
            if (broadcastEvents.length >= 64) throw new Error("A scene may send at most 64 broadcast messages in one play.");
            const value = scalar(block.value ?? 0, locals);
            messages.push(block.name!); broadcastEvents.push({ name: block.name!, value, eventIndex }); break;
          }
          case "call": {
            calls++;
            const procedure = program.procedures?.[block.name!];
            if (!procedure || procedure.parameters.length !== block.arguments!.length) throw new Error("The procedure name or number of inputs does not match its definition.");
            const args = block.arguments!.map((arg) => scalar(arg, locals));
            execute(procedure.body, Object.fromEntries(procedure.parameters.map((parameter, i) => [parameter, args[i]!])), depth + 1);
            break;
          }
          case "if": decisions++; execute(scalar(block.test!, locals) ? block.body! : block.otherwise!, locals, depth + 1); break;
          case "repeat": {
            const count = numeric(block.amount!, locals);
            if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error("Repeat between zero and one hundred times.");
            activeRepeats++;
            try { for (let i = 0; i < count; i++) { repeatIterations++; execute(block.body!, locals, depth + 1); } } finally { activeRepeats--; }
            break;
          }
          case "until": activeRepeats++; try { for (;;) { record("condition", locals); if (scalar(block.test!, locals)) break; repeatIterations++; execute(block.body!, locals, depth + 1); } } finally { activeRepeats--; } break;
          default: throw new Error("Unknown visual command.");
        }
      }
    };
    for (const [index, event] of world.events.entries()) {
      eventIndex = index;
      if (event.name === "restart") { x = world.start.x; y = world.start.y; heading = world.heading; variables = { ...program.variables }; stopped = false; collision = false; speech.length = 0; messages.length = 0; visits.length = 0; visits.push({ x, y }); headings.length = 0; headings.push(heading); storyEvents.length = 0; }
      eventValue = event.value;
      execute(program.handlers[event.name === "restart" ? "start" : event.name] ?? []);
      if (event.name === "restart" && Object.hasOwn(program.handlers, "restart")) execute(program.handlers.restart ?? []);
    }
    record("complete");
    let planX = world.start.x, planY = world.start.y;
    const plannedVisits: Json[] = [{ x: planX, y: planY }];
    for (const direction of program.plan ?? []) { planX += direction === "right" ? 1 : direction === "left" ? -1 : 0; planY += direction === "up" ? 1 : direction === "down" ? -1 : 0; plannedVisits.push({ x: planX, y: planY }); }
    const written = (commands: VisualCommand[]): number => commands.reduce((count, command) => count + 1 + written(command.body ?? []) + written(command.otherwise ?? []), 0);
    const writtenCommands = Object.values(program.handlers).reduce((total, commands) => total + written(commands), 0) + Object.values(program.procedures ?? {}).reduce((total, procedure) => total + written(procedure.body), 0);
    const sensors = Object.fromEntries([...sensorReads].map((key) => [key.slice(7), scalar({ read: key }, {})]));
    return { ok: true, output: { x, y, heading, headings, variables, stopped, collision, speech, messages, visits, storyEvents, moves: visits.length - 1, powers, errors, actions: steps - 1, loopMoves, repeatIterations, calls, decisions,
      writtenCommands, ...(broadcastEvents.length ? { broadcastEvents } : {}), ...(sensorReads.size ? { sensors } : {}), ...(program.plan ? { plan: program.plan, plannedVisits, planMatches: JSON.stringify(visits) === JSON.stringify(plannedVisits) } : {}) }, trace,
      stdout: speech.join("\n"), stderr: "", runtime: "starliz-visual-1.0.0", steps };
  } catch (error) {
    return { ok: false, output: null, trace, stdout: "", stderr: "", error: error instanceof z.ZodError ? "The visual program or world contains an invalid command or value." : error instanceof Error ? error.message : "The visual program could not run.", runtime: "starliz-visual-1.0.0", steps };
  }
}
