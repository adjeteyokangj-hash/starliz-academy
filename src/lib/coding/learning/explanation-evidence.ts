import type { ActivityContent, Execution, Json } from "./types";
import { jsonLeafEvidence } from "./public-view";

const aliases: Record<string, string[]> = {
  command: ["arrow", "instruction"], action: ["move", "step"], variable: ["score", "value", "name"], update: ["add", "change", "subtract"],
  pattern: ["again", "repeat"], continuation: ["next", "same"], repeat: ["again", "times"], count: ["number", "times"], group: ["inside", "pair"], order: ["first", "then", "before"],
  equivalent: ["same", "match"], trace: ["before", "after", "step"], restart: ["reset", "start"], independent: ["separate", "own"],
  tool: ["picture", "text", "draw"], mark: ["circle", "rectangle", "caption"], layer: ["front", "behind", "cover"], original: ["own", "draw", "colour"],
  caption: ["words", "label"], readable: ["read", "larger", "text"], save: ["saved", "file"], retrieve: ["open", "reopen", "found"],
  feedback: ["change", "improve", "read"], version: ["original", "copy", "saved"], instruction: ["step", "order"], project: ["card", "garden", "program"],
  type: ["text", "number", "string"], expression: ["add", "join", "calculate"], sequence: ["order", "first", "then"], translation: ["python", "block", "same"],
  syntax: ["bracket", "parenthesis", "error"], program: ["code", "statement"], assignment: ["store", "old", "update"], reset: ["start", "again"],
  private: ["nickname", "address", "share"], profile: ["nickname", "colour", "animal"], device: ["keyboard", "camera", "printer", "speaker", "scanner", "sensor"],
  kind: ["helpful", "respectful", "caption"], stop: ["stopped", "reply"], "trusted adult": ["adult", "help"], scene: ["story", "caption", "picture"], replay: ["restart", "moves", "again"],
  attribute: ["colour", "shape", "field"], filter: ["match", "keep", "find"], sort: ["order", "group"], survey: ["response", "choice"],
  question: ["ask", "choose"], pictogram: ["circle", "picture", "symbol"], evidence: ["count", "chart", "response"], uncertainty: ["fictional", "sample", "every", "might"], data: ["table", "response", "count"],
};
const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const common = new Set(["true", "false", "null", "undefined", "text", "picture", "combined", "private", "public", "classroom", "original", "program", "card", "result", "output", "score", "start", "complete"]);
const record = (value: Json | undefined): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function groundedExplanation(activity: Pick<ActivityContent, "year" | "concepts">, run: Execution, explanation: string): boolean {
  const lower = explanation.trim().toLowerCase(), words = new Set(lower.match(/[a-z0-9]+/g) ?? []);
  if (lower.length < (activity.year <= 2 ? 12 : 30) || !/\b(because|so|then|each|after|before|when|makes?|made|moves?|goes?|prints?|keeps?|kept|adds?|added|uses?|used|changes?|changed|stores?|stored)\b/.test(lower)) return false;
  if (!activity.concepts.some((concept) => [concept, ...(aliases[concept.toLowerCase()] ?? [])].some((word) => lower.includes(word.toLowerCase())))) return false;
  const observed = jsonLeafEvidence(run.output);
  const literals = new Set([...lower.matchAll(/(?<![a-z0-9])(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![a-z0-9])/g)].map((match) => Number(match[1])));
  const numeric = (value: number) => literals.has(value) || Boolean(numberWords[value] && words.has(numberWords[value]!))
    || value < 0 && (words.has("negative") || words.has("minus")) && (literals.has(-value) || Boolean(numberWords[-value] && words.has(numberWords[-value]!)));
  for (const leaf of observed) {
    const value = leaf.value.toLowerCase(), key = leaf.path.split(".").at(-1)!.toLowerCase();
    if (common.has(value) || !value.trim()) continue;
    if (key === "nickname" && /^[a-z]{3,32}$/.test(value) && words.has(value)) return true;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) {
      const number = Number(value);
      const names = key === "x" ? ["column", "right", "left", "square"] : key === "y" ? ["row", "up", "down", "square"]
        : key === "moves" || key === "repeatiterations" || key === "loopmoves" ? ["move", "step", "repeat", "times", "count"]
          : key === "stdout" ? ["print", "output", "display"] : key === "fontsize" ? ["size", "pixel", "text"] : [key];
      if (names.some((name) => lower.includes(name)) && (numeric(number) || key === "x" && lower.includes("column") && numeric(number + 1) || key === "y" && lower.includes("row") && numeric(number + 1))) return true;
    } else {
      const specific = value.match(/[a-z]{4,}/g)?.filter((word) => !common.has(word) && !["this", "that", "with", "from", "your", "have", "will", "the", "and"].includes(word)) ?? [];
      if (specific.some((word) => words.has(word))) return true;
    }
  }
  // Early readers can explain an executed direction without typing coordinates.
  const visits = record(run.output).visits;
  if (activity.year <= 2 && Array.isArray(visits)) for (let index = 1; index < visits.length; index++) {
    const before = record(visits[index - 1]), after = record(visits[index]);
    const direction = Number(after.x) > Number(before.x) ? "right" : Number(after.x) < Number(before.x) ? "left" : Number(after.y) > Number(before.y) ? "up" : Number(after.y) < Number(before.y) ? "down" : "";
    if (direction && words.has(direction) && !activity.concepts.includes("count")) return true;
  }
  return false;
}
