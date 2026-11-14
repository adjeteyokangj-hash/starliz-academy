"use client";

import { useId, useState } from "react";
import { visualProgramSchema, type VisualCommand, type Expression } from "@/lib/coding/learning/visual-machine";
import type { Json } from "@/lib/coding/learning/types";
import BlockCommandsEditor from "./BlockCommandsEditor";

const control = "min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50";
const arrows = [{ label: "Right →", x: 1, y: 0 }, { label: "Up ↑", x: 0, y: 1 }, { label: "Left ←", x: -1, y: 0 }, { label: "Down ↓", x: 0, y: -1 }];
type Program = ReturnType<typeof visualProgramSchema.parse>;

function NameInput({ value, label, readOnly, dotted = false, onChange }: { value: string; label: string; readOnly: boolean; dotted?: boolean; onChange: (value: string) => void }) {
  const listId = useId();
  const [draft, setDraft] = useState({ saved: value, text: value, error: "" });
  if (draft.saved !== value) setDraft({ saved: value, text: value, error: "" });
  const commit = () => {
    const next = draft.text.trim();
    if (!(dotted ? /^[a-zA-Z][a-zA-Z0-9_.]{0,60}$/ : /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/).test(next) || ["constructor", "prototype", "__proto__"].includes(next)) {
      setDraft({ ...draft, error: dotted ? "Start with a letter; use letters, numbers, underscores or dots." : "Start with a letter; use letters, numbers or underscores." }); return;
    }
    setDraft({ saved: next, text: next, error: "" }); onChange(next);
  };
  return <span className="min-w-0"><input className={`${control} max-w-full`} aria-label={label} list={dotted ? listId : undefined} value={draft.text} maxLength={dotted ? 61 : 32} disabled={readOnly} onChange={(event) => setDraft({ ...draft, text: event.target.value, error: "" })} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{dotted && <datalist id={listId}>{["x", "y", "heading", "event", "collision", "stopped", "world.width", "world.height", "world.target", "sensor.distance", "sensor.error", "sensor.destination", "sensor.onLine", "sensor.lineAhead", "sensor.lineLeft", "sensor.lineRight"].map((name) => <option key={name} value={name} />)}</datalist>}{draft.error && <span role="alert" className="mt-1 block text-xs text-red-800">{draft.error} Your previous working name is retained until this is corrected.</span>}</span>;
}

function ValueEditor({ value, label, onChange, readOnly }: { value: Expression; label: string; onChange: (value: Expression) => void; readOnly: boolean }) {
  const kind = typeof value === "object" ? "read" in value ? "variable" : "calculation" : typeof value;
  return <fieldset className="flex min-w-0 flex-wrap items-start gap-2 rounded-lg border border-slate-300 p-2">
    <legend className="px-1 text-xs font-semibold">{label}</legend>
    <select className={control} aria-label={`${label} kind`} value={kind} disabled={readOnly} onChange={(event) => {
      const selected = event.currentTarget.value;
      onChange(selected === "number" ? 1 : selected === "boolean" ? true : selected === "string" ? "Hello" : selected === "variable" ? { read: "score" } : { calculate: "add", arguments: [1, 1] });
    }}><option value="number">Number</option><option value="string">Words</option><option value="boolean">True or false</option><option value="variable">Read a value</option><option value="calculation">Calculate</option></select>
    {typeof value === "number" ? <input className={`${control} w-28`} aria-label={label} type="number" min={-1000000} max={1000000} value={value} disabled={readOnly} onChange={(event) => { const number = Number(event.currentTarget.value); if (Number.isFinite(number)) onChange(Math.max(-1e6, Math.min(1e6, number))); }} />
      : typeof value === "boolean" ? <select className={control} aria-label={label} value={String(value)} disabled={readOnly} onChange={(event) => onChange(event.currentTarget.value === "true")}><option value="true">True</option><option value="false">False</option></select>
        : typeof value === "string" ? <input className={`${control} min-w-0 flex-1`} aria-label={label} value={value} maxLength={300} disabled={readOnly} onChange={(event) => onChange(event.currentTarget.value)} />
          : "read" in value ? <NameInput label={`${label} variable name`} value={value.read} dotted readOnly={readOnly} onChange={(read) => onChange({ read })} />
            : <div className="min-w-0 space-y-2"><select className={control} aria-label={`${label} operation`} value={value.calculate} disabled={readOnly} onChange={(event) => { const calculate = event.currentTarget.value; onChange({ calculate, arguments: ["not", "absolute"].includes(calculate) ? [value.arguments[0] ?? 1] : [value.arguments[0] ?? 1, value.arguments[1] ?? 1] }); }}>
              {["add", "subtract", "multiply", "divide", "modulo", "equal", "less", "greater", "and", "or", "not", "absolute"].map((operation) => <option key={operation}>{operation}</option>)}
            </select>{value.arguments.map((argument, index) => <ValueEditor key={index} value={argument} label={`${label} input ${index + 1}`} readOnly={readOnly} onChange={(next) => onChange({ ...value, arguments: value.arguments.map((old, i) => i === index ? next : old) })} />)}</div>}
  </fieldset>;
}

function Commands({ commands, onChange, readOnly, simple, depth = 0, year = 11 }: {
  commands: VisualCommand[]; onChange: (commands: VisualCommand[]) => void; readOnly: boolean; simple: boolean; depth?: number; year?: number;
}) {
  const update = (index: number, value: VisualCommand) => onChange(commands.map((command, i) => i === index ? value : command));
  const shift = (index: number, direction: number) => { const next = [...commands]; [next[index], next[index + direction]] = [next[index + direction]!, next[index]!]; onChange(next); };
  return <div className="min-w-0 space-y-3">
    <ol className="space-y-3" aria-label={depth ? "Actions inside this group" : "Your program in order"}>{commands.map((command, index) => {
      const arrow = command.op === "move" ? arrows.find((item) => item.x === command.x && item.y === command.y) : null;
      return <li key={index} className={`min-w-0 rounded-xl border p-3 ${command.op === "repeat" ? "border-amber-400 bg-amber-50" : "border-sky-300 bg-sky-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-slate-950">{index + 1}. {arrow?.label ?? command.op}</strong>
          <div className="flex flex-wrap gap-1"><button type="button" className={control} aria-label={`Move action ${index + 1} earlier`} disabled={readOnly || index === 0} onClick={() => shift(index, -1)}>↑</button><button type="button" className={control} aria-label={`Move action ${index + 1} later`} disabled={readOnly || index === commands.length - 1} onClick={() => shift(index, 1)}>↓</button><button type="button" className={control} aria-label={`Remove action ${index + 1}`} disabled={readOnly} onClick={() => onChange(commands.filter((_, i) => i !== index))}>Remove</button></div>
        </div>
        <div className="mt-2 space-y-2">
          {command.name !== undefined && <label className="block text-sm text-slate-800">Name <NameInput label="Action name" value={command.name} readOnly={readOnly} onChange={(name) => update(index, { ...command, name })} /></label>}
          {command.amount !== undefined && (simple && typeof command.amount === "number" ? <label className="block text-sm text-slate-800">{command.op === "repeat" ? "How many times?" : "Amount"}<input type="number" className={`${control} ml-2 w-24`} value={command.amount} min={command.op === "turn" ? -3 : 0} max={command.op === "turn" ? 3 : 100} disabled={readOnly} onChange={(event) => update(index, { ...command, amount: Math.max(command.op === "turn" ? -3 : 0, Math.min(command.op === "turn" ? 3 : 100, Number(event.currentTarget.value))) })} /></label> : <ValueEditor label="Amount" value={command.amount} readOnly={readOnly} onChange={(value) => update(index, { ...command, amount: value })} />)}
          {command.value !== undefined && <ValueEditor label="Value" value={command.value} readOnly={readOnly} onChange={(value) => update(index, { ...command, value })} />}
          {!arrow && command.x !== undefined && <ValueEditor label={command.op === "position" ? "X coordinate" : "Column movement"} value={command.x} readOnly={readOnly} onChange={(value) => update(index, { ...command, x: value })} />}
          {!arrow && command.y !== undefined && <ValueEditor label={command.op === "position" ? "Y coordinate" : "Row movement"} value={command.y} readOnly={readOnly} onChange={(value) => update(index, { ...command, y: value })} />}
          {command.test !== undefined && <ValueEditor label="Condition" value={command.test} readOnly={readOnly} onChange={(value) => update(index, { ...command, test: value })} />}
          {command.arguments?.map((argument, i) => <ValueEditor key={i} label={`Input ${i + 1}`} value={argument} readOnly={readOnly} onChange={(value) => update(index, { ...command, arguments: command.arguments!.map((old, j) => i === j ? value : old) })} />)}
          {command.arguments && <div className="flex gap-2"><button type="button" className={control} disabled={readOnly || command.arguments.length >= 6} onClick={() => update(index, { ...command, arguments: [...command.arguments!, 1] })}>Add input</button><button type="button" className={control} disabled={readOnly || !command.arguments.length} onClick={() => update(index, { ...command, arguments: command.arguments!.slice(0, -1) })}>Remove last input</button></div>}
          {command.body && <fieldset className="min-w-0 border-l-4 border-amber-400 pl-3"><legend className="text-sm font-semibold text-slate-800">{command.op === "if" ? "When true" : "Inside the group"}</legend><Commands commands={command.body} year={year} simple={simple} readOnly={readOnly || depth >= 8} depth={depth + 1} onChange={(body) => update(index, { ...command, body })} /></fieldset>}
          {command.otherwise && <fieldset className="min-w-0 border-l-4 border-violet-400 pl-3"><legend className="text-sm font-semibold text-slate-800">Otherwise</legend><Commands commands={command.otherwise} year={year} simple={simple} readOnly={readOnly || depth >= 8} depth={depth + 1} onChange={(otherwise) => update(index, { ...command, otherwise })} /></fieldset>}
        </div>
      </li>;
    })}</ol>
    {!commands.length && <p className="rounded-xl border-2 border-dashed border-slate-400 p-4 text-sm text-slate-700">Choose an arrow or group to begin. Actions run from top to bottom.</p>}
    <div className="flex flex-wrap gap-2" aria-label="Add an action">
      {arrows.map((arrow) => <button key={arrow.label} type="button" className={control} disabled={readOnly || commands.length >= 100} onClick={() => onChange([...commands, { op: "move", x: arrow.x, y: arrow.y }])}>{arrow.label}</button>)}
      <button type="button" className={`${control} border-amber-500 bg-amber-100`} disabled={readOnly || depth >= 8 || commands.length >= 100} onClick={() => onChange([...commands, { op: "repeat", amount: 2, body: [] }])}>Repeat group</button>
      {simple && year >= 2 && <><button type="button" className={control} disabled={readOnly || commands.length >= 100} onClick={() => onChange([...commands, { op: "turn", amount: 1 }])}>Turn right</button><button type="button" className={control} disabled={readOnly || commands.length >= 100} onClick={() => onChange([...commands, { op: "turn", amount: -1 }])}>Turn left</button><button type="button" className={control} disabled={readOnly || commands.length >= 100} onClick={() => onChange([...commands, { op: "forward", amount: 1 }])}>Forward one</button><button type="button" className={control} disabled={readOnly || commands.length >= 100} onClick={() => onChange([...commands, { op: "say", value: "Hello" }])}>Say words</button></>}
      {!simple && <select className={control} value="" aria-label="Add another kind of action" disabled={readOnly || commands.length >= 100 || depth >= 8} onChange={(event) => {
        const op = event.currentTarget.value;
        const next: VisualCommand = op === "if" ? { op, test: true, body: [], otherwise: [] } : op === "until" ? { op, test: true, body: [] } : op === "set" || op === "change" ? { op, name: "score", value: 1 } : op === "say" ? { op, value: "Hello" } : op === "emit" ? { op, name: "message" } : op === "broadcast" ? { op, name: "message", value: 0 } : op === "call" ? { op, name: "pattern", arguments: [] } : op === "position" ? { op, x: 0, y: 0 } : op === "stop" ? { op } : { op, amount: 1 };
        if (op) onChange([...commands, next]);
      }}><option value="">More actions…</option>{["set", "change", "say", "if", "until", "turn", "forward", "motor", "stop", "emit", "broadcast", "call", "position"].map((op) => <option key={op}>{op}</option>)}</select>}
    </div>
  </div>;
}

export default function VisualProgramEditor({ value, onChange, year, readOnly = false, onValidityChange, traceOperations, playSignal }: { value: Json; onChange: (value: Json) => void; year: number; readOnly?: boolean; onValidityChange?: (valid: boolean) => void; traceOperations?: string[]; playSignal?: number }) {
  const id = useId(), [selected, setSelected] = useState(""), [event, setEvent] = useState("start");
  const [newEvent, setNewEvent] = useState(""), [newProcedure, setNewProcedure] = useState("");
  const [accessible, setAccessible] = useState(false);
  const [canvasValid, setCanvasValid] = useState(true);
  const validity = (valid: boolean) => { setCanvasValid(valid); onValidityChange?.(valid); };
  const root = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const actors = root.actors && typeof root.actors === "object" && !Array.isArray(root.actors) ? root.actors : null;
  const comparison = root.comparison && typeof root.comparison === "object" && !Array.isArray(root.comparison) ? root.comparison : null;
  const choices = actors ? Object.keys(actors) : comparison ? ["left", "right"] : ["program"];
  const active = choices.includes(selected) ? selected : choices[0]!;
  const actor = actors?.[active];
  const actorRecord = actor && typeof actor === "object" && !Array.isArray(actor) ? actor : null;
  const raw = actorRecord ? actorRecord.program : comparison ? comparison[active] : value;
  const parsed = visualProgramSchema.safeParse(raw);
  if (!parsed.success) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">This saved program needs a supported visual format. Keep its saved version and restore the activity starter before editing.</p>;
  // Validation may insert defaults. Keep the original object until a deliberate edit.
  const program = raw as Program;
  const activeEvent = Object.hasOwn(program.handlers, event) ? event : Object.keys(program.handlers)[0] ?? "start";
  const update = (next: Program) => onChange((actors && actorRecord ? { ...root, actors: { ...actors, [active]: { ...actorRecord, program: next } } } : comparison ? { ...root, comparison: { ...comparison, [active]: next } } : next) as Json);
  const validName = (name: string) => /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(name) && !["constructor", "prototype", "__proto__"].includes(name);
  return <section aria-label="Visual program editor" className="min-w-0 space-y-4">
    {choices.length > 1 && <label htmlFor={`${id}-character`} className="block text-sm font-semibold text-slate-700">{comparison ? "Compare programs" : "Choose a flower or character"}<select id={`${id}-character`} disabled={readOnly || !canvasValid} className={`${control} ml-2`} value={active} onChange={(event) => setSelected(event.currentTarget.value)}>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select></label>}
    {actors && actorRecord && <div className="flex flex-wrap gap-3 rounded-xl bg-slate-100 p-3"><label className="text-sm text-slate-800">Character name<input className={`${control} ml-2 w-32`} value={active} disabled={readOnly} onChange={(event) => {
      const name = event.currentTarget.value;
      if (/^[a-z][a-z0-9_]{0,30}$/.test(name) && (!Object.hasOwn(actors, name) || name === active)) { onChange({ ...root, actors: Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key === active ? name : key, actor])) }); setSelected(name); }
    }} /></label>{actorRecord.origin && typeof actorRecord.origin === "object" && !Array.isArray(actorRecord.origin) && ["x", "y"].map((axis) => {
      const origin = actorRecord.origin as Record<string, Json>;
      return <label key={axis} className="text-sm text-slate-800">Starting {axis === "x" ? "column" : "row"}<input type="number" className={`${control} ml-2 w-24`} min={1} max={11} value={Number(origin[axis]) + 1} disabled={readOnly} onChange={(event) => {
        const number = Number(event.currentTarget.value); if (Number.isInteger(number) && number >= 1 && number <= 11) onChange({ ...root, actors: { ...actors, [active]: { ...actorRecord, origin: { ...origin, [axis]: number - 1 } } } });
      }} /></label>;
    })}</div>}
    {Object.keys(program.handlers).length > 1 && <label className="block text-sm text-slate-700">When this happens<select aria-label="When this happens" disabled={readOnly || !canvasValid} className={`${control} ml-2`} value={activeEvent} onChange={(event) => setEvent(event.currentTarget.value)}>{Object.keys(program.handlers).map((name) => <option key={name}>{name}</option>)}</select></label>}
    {year === 2 && <div className="flex flex-wrap gap-2"><label className="text-sm">New button name<input className={`${control} ml-2`} value={newEvent} maxLength={32} disabled={readOnly} onChange={(event) => setNewEvent(event.target.value)} /></label><button type="button" className={control} disabled={readOnly || !validName(newEvent) || Object.hasOwn(program.handlers, newEvent) || Object.keys(program.handlers).length >= 16} onClick={() => { update({ ...program, handlers: { ...program.handlers, [newEvent]: [] } }); setEvent(newEvent); setNewEvent(""); }}>Add button event</button></div>}
    <button type="button" className={control} aria-pressed={accessible} onClick={() => { setAccessible(!accessible); validity(true); }}>{accessible ? "Open connected blocks" : "Use accessible action controls"}</button>
    {accessible ? <Commands commands={program.handlers[activeEvent] ?? []} year={year} simple={year <= 2} readOnly={readOnly} onChange={(commands) => update({ ...program, handlers: { ...program.handlers, [activeEvent]: commands } })} />
      : <BlockCommandsEditor key={`${active}:${activeEvent}`} commands={program.handlers[activeEvent] ?? []} year={year} readOnly={readOnly} playSignal={playSignal} traceOperations={traceOperations} onValidityChange={validity} onChange={(commands) => update({ ...program, handlers: { ...program.handlers, [activeEvent]: commands as VisualCommand[] } })} />}
    {year > 2 && <div className="space-y-3 rounded-xl border border-slate-300 p-3"><h3 className="font-semibold text-slate-900">Starting values</h3>{Object.entries(program.variables).map(([name, value], index) => <div key={index}><label className="text-sm text-slate-800">Value name<input className={`${control} ml-2`} value={name} disabled={readOnly} onChange={(event) => {
      const next = event.currentTarget.value; if (validName(next) && (!Object.hasOwn(program.variables, next) || next === name)) update({ ...program, variables: Object.fromEntries(Object.entries(program.variables).map(([key, value]) => [key === name ? next : key, value])) });
    }} /></label><ValueEditor value={value} label={name} readOnly={readOnly} onChange={(next) => { if (typeof next !== "object") update({ ...program, variables: { ...program.variables, [name]: next } }); }} /></div>)}
      <button type="button" className={control} disabled={readOnly || Object.keys(program.variables).length >= 32} onClick={() => { let index = 1; while (Object.hasOwn(program.variables, `value${index}`)) index++; update({ ...program, variables: { ...program.variables, [`value${index}`]: 0 } }); }}>Add starting value</button></div>}
    {year > 2 && <div className="space-y-3 rounded-xl border border-slate-300 p-3"><h3 className="font-semibold text-slate-900">Events and reusable groups</h3>
      <div className="flex flex-wrap gap-2"><input className={control} aria-label="New event name" value={newEvent} onChange={(event) => setNewEvent(event.currentTarget.value)} maxLength={32} disabled={readOnly} /><button type="button" className={control} disabled={readOnly || !validName(newEvent) || Object.hasOwn(program.handlers, newEvent)} onClick={() => { update({ ...program, handlers: { ...program.handlers, [newEvent]: [] } }); setEvent(newEvent); setNewEvent(""); }}>Add event</button></div>
      {Object.entries(program.procedures ?? {}).map(([name, procedure]) => <fieldset key={name} className="space-y-3 rounded-xl border border-violet-400 bg-violet-50 p-3"><legend className="font-semibold text-slate-900">Reusable group: {name}</legend>
        <label className="block text-sm text-slate-800">Input names, separated by commas<input className={`${control} ml-2 max-w-full`} value={procedure.parameters.join(",")} disabled={readOnly} onChange={(event) => {
          const names = event.currentTarget.value.split(",").map((value) => value.trim()).filter(Boolean);
          if (names.length <= 6 && names.every(validName) && new Set(names).size === names.length) update({ ...program, procedures: { ...program.procedures, [name]: { ...procedure, parameters: names } } });
        }} /></label><Commands commands={procedure.body} readOnly={readOnly} simple={false} onChange={(body) => update({ ...program, procedures: { ...program.procedures, [name]: { ...procedure, body } } })} /></fieldset>)}
      <div className="flex flex-wrap gap-2"><input className={control} aria-label="New reusable group name" value={newProcedure} onChange={(event) => setNewProcedure(event.currentTarget.value)} maxLength={32} disabled={readOnly} /><button type="button" className={control} disabled={readOnly || !validName(newProcedure) || Object.hasOwn(program.procedures ?? {}, newProcedure)} onClick={() => { update({ ...program, procedures: { ...program.procedures, [newProcedure]: { parameters: [], body: [] } } }); setNewProcedure(""); }}>Add reusable group</button></div>
    </div>}
  </section>;
}
