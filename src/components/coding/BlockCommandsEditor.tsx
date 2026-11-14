"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type * as Blockly from "blockly/core";
import { calculations, commandStates, operands, readBlockCommands } from "@/lib/coding/blockly-adapter";
import type { VisualCommand } from "@/lib/coding/learning/visual-machine";
import type { CodingBlock } from "@/lib/coding/types";

const action = "min-h-11 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-900 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-50";
export function defineBlocks(B: typeof Blockly) {
  if (B.Blocks.sl_start) return;
  const definitions: object[] = [{ type: "sl_start", message0: "⚑ %1", args0: [{ type: "field_label", name: "LABEL", text: "When this event starts" }], nextStatement: "Command", colour: "#6c50c9", tooltip: "Connect your ordered instructions here." },
    { type: "sl_number", message0: "%1", args0: [{ type: "field_number", name: "VALUE", value: 1, min: -1e6, max: 1e6 }], output: "Value", colour: "#387c57" },
    { type: "sl_string", message0: "words %1", args0: [{ type: "field_input", name: "VALUE", text: "Hello" }], output: "Value", colour: "#387c57" },
    { type: "sl_boolean", message0: "%1", args0: [{ type: "field_dropdown", name: "VALUE", options: [["true", "true"], ["false", "false"]] }], output: "Value", colour: "#6c50c9" },
    { type: "sl_read", message0: "read %1", args0: [{ type: "field_input", name: "NAME", text: "score" }], output: "Value", colour: "#387c57" },
    { type: "sl_step", message0: "move %1", args0: [{ type: "field_dropdown", name: "DIRECTION", options: [["right →", "right"], ["left ←", "left"], ["up ↑", "up"], ["down ↓", "down"]] }], previousStatement: "Command", nextStatement: "Command", colour: "#087884" },
    { type: "sl_legacy_move", message0: "move %1", args0: [{ type: "field_dropdown", name: "DIRECTION", options: [["right →", "right"], ["left ←", "left"], ["up ↑", "up"], ["down ↓", "down"]] }], previousStatement: "Command", nextStatement: "Command", colour: "#087884" },
    { type: "sl_legacy_repeat", message0: "repeat %1 times %2", args0: [{ type: "field_number", name: "TIMES", value: 2, min: 1, max: 8, precision: 1 }, { type: "input_statement", name: "BODY", check: "Command" }], previousStatement: "Command", nextStatement: "Command", colour: "#ad650a" }];
  for (const op of calculations) {
    const args = [{ type: "input_value", name: "ARG0", check: "Value" }]; if (!["not", "absolute"].includes(op)) args.push({ type: "input_value", name: "ARG1", check: "Value" });
    definitions.push({ type: `sl_calc_${op}`, message0: `${op} ${args.map((_, i) => `%${i + 1}`).join(" ")}`, args0: args, output: "Value", colour: "#6c50c9", inputsInline: true });
  }
  for (const [op, inputs] of Object.entries(operands)) {
    const args: object[] = [], text: string[] = [op];
    const append = (label: string, field: object) => { args.push(field); text.push(`${label} %${args.length}`); };
    if (["set", "change", "emit", "broadcast", "call"].includes(op)) append("", { type: "field_input", name: "NAME", text: op === "call" ? "pattern" : op === "emit" || op === "broadcast" ? "message" : "score" });
    for (const name of inputs) append(name, { type: "input_value", name: name.toUpperCase(), check: "Value" });
    if (op === "call") for (let i = 0; i < 6; i++) append(`input ${i + 1} (optional)`, { type: "input_value", name: `ARG${i}`, check: "Value" });
    if (["repeat", "until", "if"].includes(op)) append(op === "if" ? "then" : "do", { type: "input_statement", name: "BODY", check: "Command" });
    if (op === "if") append("otherwise", { type: "input_statement", name: "OTHERWISE", check: "Command" });
    definitions.push({ type: `sl_${op}`, message0: text.join(" "), args0: args, previousStatement: "Command", nextStatement: "Command", colour: ["repeat", "until"].includes(op) ? "#ad650a" : op === "if" ? "#6c50c9" : ["set", "change"].includes(op) ? "#387c57" : "#087884", inputsInline: ["move", "position"].includes(op) });
  }
  B.defineBlocksWithJsonArray(definitions);
}

export default function BlockCommandsEditor({ commands, onChange, readOnly = false, year = 4, legacy = false, onValidityChange, traceOperations = [], playSignal = 0 }: {
  commands: VisualCommand[] | CodingBlock[]; onChange: (commands: VisualCommand[] | CodingBlock[]) => void; readOnly?: boolean; year?: number; legacy?: boolean;
  onValidityChange?: (valid: boolean) => void; traceOperations?: string[]; playSignal?: number;
}) {
  const host = useRef<HTMLDivElement>(null), api = useRef<typeof Blockly | null>(null), workspace = useRef<Blockly.WorkspaceSvg | null>(null);
  const latest = useRef({ commands, onChange, onValidityChange, readOnly });
  const signature = useRef(JSON.stringify(commands));
  const incoming = useRef(commands);
  const [issue, setIssue] = useState(""), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false);
  const [emptyRepeat, setEmptyRepeat] = useState<string | null>(null);
  const [autoFit, setAutoFit] = useState(true), autoFitRef = useRef(true);
  const [canvasHeight, setCanvasHeight] = useState(600);
  const fit = useRef<() => void>(() => {});
  const refreshWarnings = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const played = useRef(0);
  const autoReplay = useEffectEvent(() => replay());
  useEffect(() => { if (ready && !readOnly && playSignal > played.current) { played.current = playSignal; autoReplay(); } }, [ready, readOnly, playSignal]);
  useEffect(() => { latest.current = { commands, onChange, onValidityChange, readOnly }; }, [commands, onChange, onValidityChange, readOnly]);
  useEffect(() => {
    let disposed = false; let observer: ResizeObserver | undefined;
    async function open() {
      try {
        const B = await import("blockly/core"), messages = await import("blockly/msg/en");
        if (disposed || !host.current) return;
        B.setLocale(Object.fromEntries(Object.entries(messages).filter((entry): entry is [string, string] => typeof entry[1] === "string"))); defineBlocks(B); api.current = B;
        const values = (year <= 2 ? ["number", "string"] : ["number", "string", "boolean", "read", ...calculations.map(op => `calc_${op}`)]).map(op => ({ kind: "block", type: `sl_${op}` }));
        const example = (op: string): VisualCommand => op === "move" || op === "position" ? { op, x: 1, y: 0 } : op === "repeat" ? { op, amount: 2, body: [] } : op === "until" ? { op, test: true, body: [] } : op === "if" ? { op, test: true, body: [], otherwise: [] } : op === "set" || op === "change" ? { op, name: "score", value: 1 } : op === "say" ? { op, value: "Hello" } : op === "call" ? { op, name: "pattern", arguments: [] } : op === "broadcast" ? { op, name: "message", value: 0 } : op === "emit" ? { op, name: "message" } : op === "stop" ? { op } : { op, amount: 1 };
        const choices = legacy ? [{ kind: "block", type: "sl_legacy_move" }, { kind: "block", type: "sl_legacy_repeat" }] : Object.keys(operands).filter(op => year > 2 || ["move", "repeat", "turn", "forward", "say"].includes(op)).map(op => ({ kind: "block", ...commandStates([example(op)])!, id: undefined, data: undefined }));
        const initialScale = year <= 2 ? 1.05 : 0.92;
        const theme = B.Theme.defineTheme(`starliz-${year}`, { name: `starliz-${year}`, base: B.Themes.Classic, fontStyle: { family: "Segoe UI, Arial, sans-serif", size: year <= 2 ? 16 : 14, weight: "600" }, componentStyles: { workspaceBackgroundColour: "#faf8ff", toolboxBackgroundColour: "#f0edf8", toolboxForegroundColour: "#332852", flyoutBackgroundColour: "#eee8f8", flyoutForegroundColour: "#332852", flyoutOpacity: 1 } });
        const view = B.inject(host.current, { theme, toolbox: { kind: "categoryToolbox", contents: [{ kind: "category", name: "Actions", colour: "#087884", contents: choices }, ...(!legacy ? [{ kind: "category", name: "Values", colour: "#387c57", contents: values }] : [])] }, renderer: "zelos", media: "/coding/blockly/", sounds: false, trashcan: true, move: { scrollbars: true, drag: true, wheel: true }, zoom: { controls: false, wheel: false, startScale: initialScale, minScale: 0.35, maxScale: 1.8 }, grid: { spacing: 22, length: 2, colour: "#d7d0e9", snap: false }, maxBlocks: legacy ? 25 : 500 });
        workspace.current = view;
        fit.current = () => {
          if (disposed) return;
          B.svgResize(view); view.zoomToFit();
          // Fit large programs down, but never inflate a tiny program to fill empty space.
          if (view.scale > initialScale) view.setScale(initialScale);
          // Fitting changes zoom and position, never the learner's chosen canvas height.
          view.scrollCenter();
        };
        const load = () => {
          B.Events.disable();
          try { const block = commandStates(latest.current.commands, legacy); B.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: "sl_start", id: "starliz-start", fields: { LABEL: year <= 2 ? "Run" : "When this event starts" }, x: 24, y: 25, ...(block ? { next: { block } } : {}) }] } }, view); const start = view.getBlockById("starliz-start")!; start.getSvgRoot()?.setAttribute("data-guide-target", "coding-start-block"); start.setDeletable(false); start.setMovable(false); start.setEditable(false); view.clearUndo(); signature.current = JSON.stringify(latest.current.commands); }
          finally { B.Events.enable(); }
        };
        const markEmptyRepeats = () => {
          if (!legacy) return;
          let first: string | null = null;
          for (const block of view.getAllBlocks(false)) {
            if (block.type !== "sl_legacy_repeat") continue;
            const empty = Number(block.getFieldValue("TIMES")) > 0 && !block.getInputTargetBlock("BODY");
            block.setWarningText(empty ? "Put a move inside this repeat block, or remove it if you do not need it." : null);
            if (empty && !first) first = block.id;
          }
          setEmptyRepeat(first);
        };
        refreshWarnings.current = markEmptyRepeats;
        load(); markEmptyRepeats(); latest.current.onValidityChange?.(true);
        view.addChangeListener(event => {
          if (event.isUiEvent || event.type === B.Events.FINISHED_LOADING || latest.current.readOnly) return;
          markEmptyRepeats();
          if (timer.current) { clearInterval(timer.current); timer.current = null; view.highlightBlock(null); setPlaying(false); }
          try {
            const next = readBlockCommands(view, legacy); const serialized = JSON.stringify(next);
            setIssue(""); latest.current.onValidityChange?.(true);
            if (serialized !== signature.current) { signature.current = serialized; latest.current.onChange(next); }
          } catch (error) { setIssue(error instanceof Error ? error.message : "Complete the connected program before saving."); latest.current.onValidityChange?.(false); }
        });
        let previousWidth = 0;
        observer = new ResizeObserver(() => { B.svgResize(view); const width = host.current?.clientWidth ?? 0; if (width && width !== previousWidth && autoFitRef.current) fit.current(); previousWidth = width; }); observer.observe(host.current);
        setReady(true);
      } catch (error) { if (!disposed) { setIssue(error instanceof Error ? error.message : "The block canvas could not load. Use the accessible editor below."); latest.current.onValidityChange?.(false); } }
    }
    void open();
    return () => { disposed = true; observer?.disconnect(); if (timer.current) clearInterval(timer.current); workspace.current?.dispose(); workspace.current = null; };
  }, [legacy, year]);
  useEffect(() => {
    const B = api.current, view = workspace.current; if (!B || !view) return;
    const replaced = commands !== incoming.current; incoming.current = commands;
    if (JSON.stringify(commands) !== signature.current || issue && replaced) {
      B.Events.disable();
      try { const block = commandStates(commands, legacy); B.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: "sl_start", id: "starliz-start", fields: { LABEL: year <= 2 ? "Run" : "When this event starts" }, x: 24, y: 25, ...(block ? { next: { block } } : {}) }] } }, view); signature.current = JSON.stringify(commands); view.getBlockById("starliz-start")?.getSvgRoot()?.setAttribute("data-guide-target", "coding-start-block"); view.getBlockById("starliz-start")?.setDeletable(false); view.getBlockById("starliz-start")?.setMovable(false); view.clearUndo(); setIssue(""); latest.current.onValidityChange?.(true); if (autoFitRef.current) fit.current(); }
      finally { B.Events.enable(); }
      refreshWarnings.current();
    }
    view.options.readOnly = readOnly;
    for (const block of view.getAllBlocks(false)) { block.setEditable(!readOnly && block.type !== "sl_start"); block.setMovable(!readOnly && block.type !== "sl_start"); block.setDeletable(!readOnly && block.type !== "sl_start"); }
  }, [commands, readOnly, legacy, ready, issue, year]);
  function replay() {
    const view = workspace.current; if (!view || !traceOperations.length) return;
    if (timer.current) clearInterval(timer.current);
    // Runtime traces carry operations, not AST IDs: highlight all matching operations,
    // explicitly described in the UI rather than claiming exact source locations.
    let index = 0; setPlaying(true);
    timer.current = setInterval(() => {
      view.highlightBlock(null);
      const op = traceOperations[index++];
      if (!op) { clearInterval(timer.current!); timer.current = null; setPlaying(false); return; }
      for (const block of view.getAllBlocks(false)) if (block.type === `sl_${op}` || block.type === `sl_legacy_${op}` || op === "move" && block.type === "sl_step") view.highlightBlock(block.id, true);
    }, 500);
  }
  function manualView() { if (autoFitRef.current) { autoFitRef.current = false; setAutoFit(false); } }
  return <section aria-label="Connected block canvas" data-guide-target="block-editor" data-guide-anchor className="starliz-panel coding-block-editor overflow-hidden rounded-xl border border-violet-200 bg-[#faf8ff]">
    <div className="flex flex-wrap items-center gap-2 border-b border-violet-200 bg-white p-3"><strong className="w-full text-sm text-violet-950">{year <= 2 ? "Connect your instructions" : "Build with blocks"}</strong><button type="button" className={action} data-guide-target="fit-blocks" data-guide-action="fit-blocks" disabled={!ready} onClick={() => { autoFitRef.current = true; setAutoFit(true); fit.current(); }}>Fit blocks</button><details open={!legacy} className="text-sm"><summary data-guide-target="block-tools" data-guide-action="block-tools" className="min-h-11 cursor-pointer p-2 font-semibold text-violet-900">Block tools</summary><div className="flex flex-wrap items-center gap-2"><button type="button" className={action} aria-label="Undo blocks" disabled={!ready || readOnly} onClick={() => workspace.current?.undo(false)}>Undo</button><button type="button" className={action} aria-label="Redo blocks" disabled={!ready || readOnly} onClick={() => workspace.current?.undo(true)}>Redo</button><label className="flex min-h-11 items-center gap-2 px-2 text-sm text-violet-950"><input type="checkbox" checked={autoFit} onChange={event => { autoFitRef.current = event.target.checked; setAutoFit(event.target.checked); if (event.target.checked) fit.current(); }} />Auto fit</label>{traceOperations.length > 0 && <button type="button" className={action} disabled={playing} onClick={replay}>Replay steps</button>}</div></details></div>
    {legacy && emptyRepeat && <div role="status" className="border-b border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>A repeat block needs a move inside it. Connect a move, or remove the extra repeat.</p><button type="button" className={`${action} mt-2`} onClick={() => { const view = workspace.current; if (!view) return; manualView(); view.centerOnBlock(emptyRepeat); const block = view.getBlockById(emptyRepeat); if (block) api.current?.getFocusManager().focusNode(block); }}>Show empty repeat</button></div>}
    <div className="flex flex-wrap items-center gap-3 border-b border-violet-200 bg-white px-3 py-2"><label className="flex min-h-11 flex-1 items-center gap-3 text-sm font-semibold text-violet-950">Workspace height<input aria-label="Workspace height" type="range" min={400} max={1200} step={100} value={canvasHeight} onChange={event => setCanvasHeight(Number(event.target.value))} className="min-w-0 flex-1 accent-violet-600" /></label><button type="button" className={action} disabled={canvasHeight >= 1200} onClick={() => setCanvasHeight(height => Math.min(1200, height + 200))}>More room</button></div>
    <div ref={host} className="w-full min-w-0" style={{ height: canvasHeight }} onPointerDownCapture={manualView} onWheelCapture={manualView} onKeyDownCapture={event => { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "+", "-"].includes(event.key)) manualView(); }} />
    {!ready && <p role="status" className="p-3 text-sm">Opening the visual workspace…</p>}
    <div className="flex items-start gap-2 border-t border-violet-200 p-3"><details className="min-w-0 flex-1 text-sm text-slate-700"><summary className="min-h-11 cursor-pointer font-semibold">Keyboard help</summary><p className="mt-2 leading-6">Drag to connect and nest. Keyboard: focus the canvas, T for toolbox, arrows to navigate, Enter to edit, M to move, Delete to remove. Tab leaves the canvas. Manual navigation pauses auto fit; choose Fit blocks to centre your program again.{traceOperations.length > 0 && " Replay highlights all blocks with the recorded operation, rather than a unique source block."}</p></details><button type="button" className={action} aria-label="Zoom out" disabled={!ready} onClick={() => { manualView(); workspace.current?.zoomCenter(-1); }}>−</button><button type="button" className={action} aria-label="Zoom in" disabled={!ready} onClick={() => { manualView(); workspace.current?.zoomCenter(1); }}>+</button></div>
    {issue && <p role="alert" className="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{issue} Your last valid program is retained. Complete or remove disconnected blocks before saving or running.</p>}
  </section>;
}
