export type SafeJsonParseResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: unknown };

export function safeJsonParse<T = unknown>(value: string): SafeJsonParseResult<T> {
  try {
    return { success: true, data: JSON.parse(value) as T };
  } catch (error) {
    return { success: false, error };
  }
}

export function stripMarkdownCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function findMatchingJsonSlice(value: string): string | null {
  const openers = ["{", "["];
  let start = -1;

  for (let i = 0; i < value.length; i += 1) {
    if (openers.includes(value[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      const top = stack[stack.length - 1];
      if (top !== expected) return null;
      stack.pop();
      if (stack.length === 0) {
        return value.slice(start, i + 1);
      }
    }
  }

  return null;
}

export type JsonRepairDiagnostics = {
  repaired: boolean;
  stagesTried: string[];
  failedStage?: string;
};

export function parseJsonWithRepair<T = unknown>(value: string):
  | { success: true; data: T; diagnostics: JsonRepairDiagnostics }
  | { success: false; error: unknown; diagnostics: JsonRepairDiagnostics } {
  const stagesTried: string[] = [];

  const direct = value.trim();
  stagesTried.push("trim");
  const directParse = safeJsonParse<T>(direct);
  if (directParse.success) {
    return { success: true, data: directParse.data, diagnostics: { repaired: false, stagesTried } };
  }

  const noFences = stripMarkdownCodeFences(direct);
  stagesTried.push("strip_markdown_fences");
  const fenceParse = safeJsonParse<T>(noFences);
  if (fenceParse.success) {
    return { success: true, data: fenceParse.data, diagnostics: { repaired: true, stagesTried } };
  }

  const extracted = findMatchingJsonSlice(noFences);
  stagesTried.push("extract_first_json_block");
  if (extracted) {
    const extractedParse = safeJsonParse<T>(extracted);
    if (extractedParse.success) {
      return { success: true, data: extractedParse.data, diagnostics: { repaired: true, stagesTried } };
    }
    return {
      success: false,
      error: extractedParse.error,
      diagnostics: { repaired: true, stagesTried, failedStage: "extract_first_json_block" },
    };
  }

  return {
    success: false,
    error: fenceParse.error,
    diagnostics: { repaired: true, stagesTried, failedStage: "extract_first_json_block" },
  };
}
