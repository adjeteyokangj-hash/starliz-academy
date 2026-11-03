"use client";

import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { Decoration, EditorView } from "@codemirror/view";
import { Compartment, EditorState } from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { sql } from "@codemirror/lang-sql";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const darkSyntax = HighlightStyle.define([
  { tag: tags.keyword, color: "#c4b5fd" },
  { tag: [tags.string, tags.special(tags.string)], color: "#86efac" },
  { tag: [tags.number, tags.bool, tags.null], color: "#fdba74" },
  { tag: tags.comment, color: "#a5b4c8", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: "#7dd3fc" },
  { tag: [tags.tagName, tags.attributeName, tags.typeName], color: "#f9a8d4" },
  { tag: tags.invalid, color: "#fca5a5", textDecoration: "underline wavy" },
]);

export default function SourceEditor({ value, onChange, language, label = "Your source code", readOnly = false, executionError }: {
  value: string; onChange?: (value: string) => void; language: "python" | "javascript" | "sql" | "html" | "json" | "css" | "text";
  label?: string; readOnly?: boolean; executionError?: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const permissions = useRef(new Compartment());
  const diagnostics = useRef(new Compartment());
  const locked = readOnly || !onChange;
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!host.current) return;
    const syntax = language === "python" ? python() : language === "sql" ? sql() : language === "html" ? html() : language === "css" ? css() : language === "json" ? json() : language === "text" ? [] : javascript();
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: [
      basicSetup, syntax, syntaxHighlighting(darkSyntax), EditorView.lineWrapping,
      EditorState.languageData.of(() => [{ autocomplete: (language === "python" ? ["print", "len", "range", "sum", "enumerate", "str", "int", "float", "list", "dict"] : language === "javascript" ? ["console", "Math", "JSON", "Array", "Object", "Number", "String"] : []).map(label => ({ label, type: "function", detail: "Language reference · choose to insert" })) }]),
      diagnostics.current.of([]),
      permissions.current.of([EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", role: "textbox", spellcheck: "false" }),
      EditorView.updateListener.of((update) => { if (update.docChanged) callback.current?.(update.state.doc.toString()); }),
      EditorView.theme({
        "&": { color: "#e2e8f0", backgroundColor: "#202237", fontSize: "16px", borderRadius: "10px", overflow: "hidden" },
        ".cm-scroller": { minHeight: "440px", maxHeight: "680px", overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", lineHeight: "1.8" },
        ".cm-content": { padding: "16px 8px", caretColor: "#7dd3fc" },
        ".cm-gutters": { backgroundColor: "#101c2e", color: "#94a3b8", borderRight: "1px solid #334155" },
        ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#172640" },
        ".cm-cursor": { borderLeftColor: "#7dd3fc" },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "#334b70" },
        ".cm-panels, .cm-tooltip": { backgroundColor: "#172640", color: "#f1f5f9", borderColor: "#475569" },
        "&.cm-focused": { outline: "2px solid #38bdf8", outlineOffset: "2px" },
      }, { dark: true }),
    ] }) });
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
    // External edits are synchronised below without recreating undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, label]);
  useEffect(() => {
    editor.current?.dispatch({ effects: permissions.current.reconfigure([
      EditorState.readOnly.of(locked), EditorView.editable.of(!locked),
    ]) });
  }, [locked]);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const view = editor.current; if (!view) return;
    const match = executionError?.match(/\bline\s+(\d+)\b|:(\d+)(?::\d+)?/i);
    const line = Number(match?.[1] ?? match?.[2]);
    const marks = line >= 1 && line <= view.state.doc.lines ? Decoration.set([Decoration.line({ class: "cm-runtime-error" }).range(view.state.doc.line(line).from)]) : Decoration.none;
    view.dispatch({ effects: diagnostics.current.reconfigure(EditorView.decorations.of(marks)) });
  }, [executionError, value]);
  return <div className="min-w-0"><div ref={host} /><p className="mt-2 text-xs text-slate-500">Line numbers, syntax highlighting, completion suggestions, undo and search. Ctrl+Space opens suggestions. Tab moves to the next control; use spaces to indent.</p>{executionError && <p role="alert" className="mt-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{executionError}</p>}</div>;
}
