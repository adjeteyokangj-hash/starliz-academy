import type { Json } from "./types";
export function visualEventValue(value?: string): string | number | boolean {
  if (value === undefined || value.trim() === "") return 0;
  if (value.length > 300) throw new Error("Use at most 300 characters for a visual event input.");
  if (value === "true" || value === "false") return value === "true";
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) > 1e6) throw new Error("Use a finite event number between -1,000,000 and 1,000,000.");
    return number;
  }
  return value;
}
/** Only declared, bounded DSL handlers become play controls. No source is evaluated. */
export function visualEventNames(document: Json): string[] {
  if (!document || typeof document !== "object" || Array.isArray(document)) return [];
  const handlers = document.handlers;
  if (handlers && typeof handlers === "object" && !Array.isArray(handlers)) return Object.keys(handlers).filter((name) => /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(name) && !["constructor", "prototype", "__proto__"].includes(name)).slice(0, 32);
  const actors = document.actors;
  if (actors && typeof actors === "object" && !Array.isArray(actors)) return [...new Set(Object.values(actors).slice(0, 8).flatMap((actor) => actor && typeof actor === "object" && !Array.isArray(actor) && actor.program ? visualEventNames(actor.program) : []))].slice(0, 32);
  const comparison = document.comparison;
  if (comparison && typeof comparison === "object" && !Array.isArray(comparison)) return [...new Set([comparison.left, comparison.right].flatMap((program) => program ? visualEventNames(program) : []))].slice(0, 32);
  return [];
}
