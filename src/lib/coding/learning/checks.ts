import type { Execution, Json, Predicate } from "./types";

export function atPath(value: Json, path: string): Json | undefined {
  if (!path || path === "$") return value;
  let current: Json | undefined = value;
  // JSON Pointer addresses literal keys such as toolkit.txt without confusing
  // a filename with nested object members. Existing dotted paths stay valid.
  if (path.startsWith("/") && /~(?![01])/.test(path)) return undefined;
  const keys = path.startsWith("/") ? path.slice(1).split("/").map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~")) : path.split(".");
  for (const key of keys) {
    if (["__proto__", "prototype", "constructor"].includes(key) || !current || typeof current !== "object") return undefined;
    current = Array.isArray(current) ? current[Number(key)] : Object.hasOwn(current, key) ? current[key] : undefined;
  }
  return current;
}
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).sort(), right = Object.keys(b).sort();
  return left.length === right.length && left.every((key, i) => key === right[i]
    && sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
export function checkExecution(run: Execution, predicates: Predicate[]) {
  return predicates.map((predicate) => {
    const value = atPath(run.output, predicate.path);
    const passed = run.ok && ("equals" in predicate ? sameJson(value, predicate.equals)
      : "includes" in predicate ? Array.isArray(value) && value.some((item) => sameJson(item, predicate.includes))
        : "ordered" in predicate ? orderedSubsequence(value, predicate.ordered)
          : "containsText" in predicate ? typeof value === "string" && Boolean(predicate.containsText.trim()) && value.toLowerCase().replace(/\s+/g, " ").includes(predicate.containsText.toLowerCase().replace(/\s+/g, " ").trim())
        : typeof value === "number" && (predicate.min === undefined || value >= predicate.min) && (predicate.max === undefined || value <= predicate.max));
    return { description: predicate.description, passed };
  });
}

// Each required stop consumes a distinct visit. Reaching the right destination
// or visiting every stop in the wrong order does not satisfy a delivery route.
export function orderedSubsequence(value: Json | undefined, required: Json[]): boolean {
  if (!Array.isArray(value)) return false;
  let next = 0;
  for (const item of value) if (next < required.length && sameJson(item, required[next])) next++;
  return next === required.length;
}
