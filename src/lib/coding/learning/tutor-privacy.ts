import type { Json } from "./types";
export type TutorScope = "learner" | "author" | Readonly<{ kind: "learner"; age: number | null }>;
/** This records an operator's verification of the actual provider project. It
 * does not enable zero data retention at OpenAI, and store:false is not proof. */
export function personalisedTutorAllowed(scope: TutorScope = "learner"): boolean {
  return scope === "author" || process.env.CODING_AI_ZERO_DATA_RETENTION_VERIFIED === "true"
    || scope !== null && typeof scope === "object" && scope.kind === "learner" && Number.isInteger(scope.age) && Number(scope.age) >= 13 && Number(scope.age) <= 120;
}
export function redactTutorText(value: string): string {
  return value.replace(/data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+/gi, "[project image omitted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/(?<!\w)(?:\+44|0)\s?\d[\d\s-]{8,12}\b/g, "[telephone removed]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[key removed]")
    .replace(/((?:password|api[_-]?key|secret|(?:access[_-]?)?token)["']?\s*[=:]\s*)["']?[^\s,}\n]+/gi, "$1[secret removed]");
}
export function redactTutorData(value: unknown): Json {
  let remaining = 2000;
  const sensitive = /^(?:home_?address|postal_?address|address|full_?name|real_?name|surname|phone|mobile|school(?:_?name)?|postcode|date_?of_?birth|birthday|email(?:_?address)?|password|secret|api_?key|(?:access_?)?token|authorization)$/i;
  const visit = (current: unknown, depth: number): Json => {
    if (--remaining < 0 || depth > 8) return "[context limit]";
    if (typeof current === "string") return redactTutorText(current).slice(0, 10000);
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "number") return Number.isFinite(current) ? current : null;
    if (Array.isArray(current)) return current.slice(0, 100).map((item) => visit(item, depth + 1));
    if (current && typeof current === "object") return Object.fromEntries(Object.entries(current).slice(0, 100).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key)).map(([key, child]) => [key, sensitive.test(key) ? "[private field removed]" : visit(child, depth + 1)]));
    return null;
  };
  return visit(value, 0);
}
