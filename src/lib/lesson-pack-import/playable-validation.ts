/**
 * Global playable-activity validation for Bulk Educational Content Import.
 * Applies to every imported pack (all subjects/years/session types), with
 * subject-aware maths expression and visual-dependency checks.
 */
import type { LinkedQaItem } from "@/lib/lesson-pack-import/types";
import { isGarbledText } from "@/lib/lesson-pack-import/content-extraction";
import { isOversizedPrompt } from "@/lib/lesson-pack-import/qa-extraction";

export type VisualType =
  | "part_part_whole"
  | "place_value_chart"
  | "number_line"
  | "column_calculation"
  | "matching_images"
  | "table"
  | "missing_number_boxes"
  | "bar_model"
  | "decimal_representation";

export type VisualReconstructionStatus =
  | "not_required"
  | "reconstructed"
  | "needs_admin_reconstruction"
  | "excluded";

export type PlayableBlockReason =
  | "missing_required_visual"
  | "incomplete_math_expression"
  | "flattened_layout_noise"
  | "missing_operands"
  | "missing_question_values"
  | "low_confidence_visual_reconstruction"
  | "garbled_text"
  | "oversized_prompt"
  | "answer_sheet_content"
  | "missing_answer_or_criteria"
  | "generic_representation_prompt";

export type VisualModel = {
  visualType: VisualType;
  whole?: string;
  partA?: string;
  partB?: string;
  missingPosition?: "whole" | "partA" | "partB";
  topNumber?: string;
  bottomNumber?: string;
  operator?: "+" | "-" | "x" | "÷";
  decimalAlignment?: boolean;
  minimum?: string;
  maximum?: string;
  interval?: string;
  markedPoints?: string[];
  targetPoint?: string;
  leftExpression?: string;
  rightExpression?: string;
  blankPositions?: number[];
  digitConstraints?: string;
  options?: string[];
  pairs?: Array<{ left: string; right: string }>;
};

export type PlayableActivityFields = {
  mathExpression?: string | null;
  requiresVisual?: boolean;
  visualType?: VisualType | string | null;
  visualSourceFile?: string | null;
  visualSourceSlideOrPage?: number | null;
  visualExtractionConfidence?: "high" | "medium" | "low" | null;
  visualReconstructionStatus?: VisualReconstructionStatus | string;
  visualModel?: VisualModel | Record<string, unknown> | null;
  playableStatus?: "playable" | "blocked" | "needs_admin_reconstruction";
  playableBlockReasons?: PlayableBlockReason[] | string[];
};

export type PlayableValidationResult = {
  playable: boolean;
  status: "playable" | "blocked" | "needs_admin_reconstruction";
  reasons: PlayableBlockReason[];
  cleanedPrompt: string;
  mathExpression: string | null;
  requiresVisual: boolean;
  visualType: VisualType | null;
  visualReconstructionStatus: VisualReconstructionStatus;
};

const VISUAL_PATTERNS: Array<{ type: VisualType; pattern: RegExp; selfContainedIf?: RegExp }> = [
  { type: "matching_images", pattern: /\bmatch the pictures?\b|\bmatch each (?:picture|image|diagram)\b|\bfor this picture\b|\bwhat you can see\b/i },
  { type: "part_part_whole", pattern: /\bpart[\s-]?part[\s-]?whole\b|\bcomplete the (?:model|representation)\b/i, selfContainedIf: /\bfor\s+\d+(?:\.\d+)?\b|\bwrite .+equations? to represent this part-part-whole\b/i },
  { type: "number_line", pattern: /\bnumber line\b|\bplace the letters?\b|\blocate (?:decimal )?numbers?\b/i, selfContainedIf: /\bwrite (?:an? )?equations? to represent\b|\bround\s+\d+(?:\.\d+)?\b/i },
  { type: "place_value_chart", pattern: /\bplace[\s-]?value (?:chart|grid|table)\b/i },
  { type: "column_calculation", pattern: /\bcolumn (?:method|addition|subtraction|calculation)\b|\bcomplete the calculations?\b/i },
  { type: "table", pattern: /\bcomplete the table\b|\buse the table\b/i },
  { type: "bar_model", pattern: /\bbar model\b/i },
  { type: "decimal_representation", pattern: /\bdecimal (?:counters?|representation|grid)\b|\blook at the model\b|\buse the diagram\b|\buse the representation\b/i },
  { type: "missing_number_boxes", pattern: /\bfill (?:in )?each box\b|\bmissing numbers?\b|\busing (?:any of )?the digits?\b|\bhow many different ways\b/i },
];

const GENERIC_REPRESENTATION = /^(complete the (?:rounding )?representation task\.?|complete the model\.?|use the (?:diagram|representation|model)\.?)$/i;

/** Detached digit / incomplete expression noise commonly produced by flattened PPTX text. */
export function hasFlattenedLayoutNoise(prompt: string): boolean {
  const p = prompt.replace(/\s+/g, " ").trim();
  if (/\+\s*\d+(?:\.\d+)?\s*\+\s*\d+(?:\.\d+)?\s+\d+\s*$/.test(p)) return true;
  if (/(?:^|\s)(?:\+\s*){2,}\d/.test(p)) return true;
  if (/\d\s+\d\s+\d\s*$/.test(p) && /using (?:any of )?the digits/i.test(p)) return true;
  if (/\b\d+\s+[+\-−×x]\s+\d+\s+[+\-−×x]\s+\d+\s*$/.test(p) && p.length > 80) return true;
  return false;
}

/** Incomplete decimal / missing-operand expressions that must not be student-facing. */
export function hasIncompleteMathExpression(prompt: string): boolean {
  const p = prompt.replace(/\s+/g, " ").trim();
  if (/\b\d*\.\s*=/.test(p) || /=\s*\d*\.\s*(?:[+\-−×x]|$)/.test(p)) return true;
  if (/\b\d+\.\s*(?:[+\-−×x=)]|$)/.test(p)) return true;
  if (/[+\-−×x=]\s*\.\s*(?:[+\-−×x=)]|$)/.test(p)) return true;
  if (/\b0\.\s*=/.test(p) || /−\s*\.\s*$/.test(p) || /-\s*\.\s*$/.test(p)) return true;
  if (/\b\d+(?:\.\d+)?\s*[+\-−×x]\s*$/.test(p) && !/___|□/.test(p)) return true;
  if (/^\s*[+\-−×x=]/.test(p)) return true;
  if (/[+\-−×x=]\s*$/.test(p) && !/___|□/.test(p) && /fill|complete|missing|equation/i.test(p)) return true;
  // Lone operators mid-prompt after instruction
  if (/\.\s+[+\-−×x]\s+\d/.test(p) && /as close to|digits?/i.test(p)) return true;
  return false;
}

export function detectVisualDependency(prompt: string): {
  requiresVisual: boolean;
  visualType: VisualType | null;
  selfContained: boolean;
} {
  const p = prompt.replace(/\s+/g, " ").trim();
  for (const rule of VISUAL_PATTERNS) {
    if (!rule.pattern.test(p)) continue;
    const selfContained = rule.selfContainedIf ? rule.selfContainedIf.test(p) : false;
    return { requiresVisual: true, visualType: rule.type, selfContained };
  }
  return { requiresVisual: false, visualType: null, selfContained: true };
}

/**
 * Clean trailing flattened digit dumps while preserving legitimate maths.
 * Returns null when the prompt cannot be cleaned safely.
 */
export function cleanMathsPrompt(prompt: string): { prompt: string; mathExpression: string | null; cleaned: boolean; reconstructed: boolean } | null {
  let p = prompt.replace(/\s+/g, " ").trim();
  if (!p) return null;

  let cleaned = false;
  let reconstructed = false;
  let mathExpression: string | null = null;

  // Strip trailing detached digit dumps after a complete instruction
  const beforeNoise = p.replace(/\s+(?:[+\-−×x]\s*)?\d+(?:\.\d+)?(?:\s+(?:[+\-−×x]\s*)?\d+(?:\.\d+)?){1,8}\s*$/g, "").trim();
  if (beforeNoise.length >= 20 && beforeNoise !== p && /using (?:any of )?the digits|fill in the missing|as close to|make this equation/i.test(beforeNoise)) {
    p = beforeNoise;
    cleaned = true;
  }

  // Reconstruct incomplete decimal boxes into explicit placeholders (do not invent digits)
  const missingSub = p.match(/(?:^|\s)(?:\d+\))\s*.*?(\d*)\.\s*=\s*(\d+(?:\.\d+)?)\s*[−\-]\s*\.?\s*$/i)
    ?? p.match(/(\d*)\.\s*=\s*(\d+(?:\.\d+)?)\s*[−\-]\s*\.?\s*$/);
  if (missingSub && hasIncompleteMathExpression(p)) {
    mathExpression = `□.□ = ${missingSub[2]} − □.□`;
    reconstructed = true;
    const stem = p.replace(/(\d*)\.\s*=\s*(\d+(?:\.\d+)?)\s*[−\-]\s*\.?\s*$/, "").trim();
    p = stem.length >= 12 ? stem.replace(/\.*$/, ".") : `Complete: ${mathExpression}`;
    cleaned = true;
  }

  const closeTo = p.match(/as close to\s+(\d+(?:\.\d+)?)/i);
  if (closeTo && /digits?/i.test(p)) {
    mathExpression = `□.□ + □.□ = ${closeTo[1]}`;
    reconstructed = true;
    // Require whitespace before operator so digit ranges like "0-9" are preserved.
    const stem = p.replace(/\s+[+\-−×x=].*$/, "").trim();
    if (stem.length >= 20) {
      p = stem.replace(/\.*$/, ".");
      cleaned = true;
    }
  }

  // Strip trailing operator+digit noise still attached after "possible."
  if (/as close to|digits?/i.test(p) && /\s[+\-−×x]\s+\d/.test(p)) {
    const stem = p.replace(/\s+[+\-−×x=].*$/, "").trim();
    if (stem.length >= 20) {
      p = stem.replace(/\.*$/, ".");
      cleaned = true;
    }
  }

  if (hasIncompleteMathExpression(p) && !mathExpression) return null;
  if (hasFlattenedLayoutNoise(p)) return null;

  return { prompt: p, mathExpression, cleaned, reconstructed };
}

/** True when blanks are explicit enough that no external diagram is required. */
export function hasExplicitStructuredBlanks(prompt: string, mathExpression?: string | null): boolean {
  const combined = `${prompt} ${mathExpression ?? ""}`;
  return /[□_]{1,3}|\_{2,}/.test(combined) || /□\.□/.test(combined);
}

export function validatePlayableActivity(
  item: LinkedQaItem | (Pick<LinkedQaItem, "prompt" | "answer" | "explanation" | "markingMode" | "responseType" | "supportingContext"> & PlayableActivityFields),
): PlayableValidationResult {
  const reasons: PlayableBlockReason[] = [];
  const raw = (item.prompt ?? "").trim();

  if (!raw || isGarbledText(raw)) {
    return {
      playable: false,
      status: "blocked",
      reasons: ["garbled_text"],
      cleanedPrompt: raw,
      mathExpression: item.mathExpression ?? null,
      requiresVisual: false,
      visualType: null,
      visualReconstructionStatus: "excluded",
    };
  }

  if (GENERIC_REPRESENTATION.test(raw)) {
    reasons.push("generic_representation_prompt", "missing_question_values");
  }
  if (/^(answer|mark scheme|worksheet answers?)\b/i.test(raw)) {
    reasons.push("answer_sheet_content");
  }
  if (isOversizedPrompt(raw)) {
    reasons.push("oversized_prompt");
  }

  const cleaned = cleanMathsPrompt(raw);
  if (!cleaned) {
    if (hasFlattenedLayoutNoise(raw)) reasons.push("flattened_layout_noise");
    if (hasIncompleteMathExpression(raw)) reasons.push("incomplete_math_expression", "missing_operands");
    if (!reasons.length) reasons.push("incomplete_math_expression");
  }

  const prompt = cleaned?.prompt ?? raw;
  const mathExpression = item.mathExpression ?? cleaned?.mathExpression ?? null;

  if (!cleaned && (hasFlattenedLayoutNoise(raw) || hasIncompleteMathExpression(raw))) {
    // already recorded
  } else if (hasIncompleteMathExpression(prompt) && !mathExpression) {
    reasons.push("incomplete_math_expression");
  }

  const visual = detectVisualDependency(prompt);
  // Union detected + explicit flags. Explicit `false` must not suppress a detected dependency.
  let requiresVisual = Boolean(item.requiresVisual) || visual.requiresVisual || Boolean(item.visualModel);
  let visualType = (item.visualType as VisualType | null | undefined) ?? visual.visualType;

  const numberLineSelfContained = /\bwrite (?:an? )?equations? to represent\b|\bround\s+\d+(?:\.\d+)?\b/i.test(prompt);
  const partWholeSelfContained = /\bfor\s+\d+(?:\.\d+)?\b|\bwrite .+equations? to represent this part-part-whole\b/i.test(prompt);
  let selfContained = visual.selfContained
    || Boolean(item.visualModel)
    || hasExplicitStructuredBlanks(prompt, mathExpression)
    || (visualType === "missing_number_boxes" && hasExplicitStructuredBlanks(prompt, mathExpression))
    || (visualType === "column_calculation" && (
      /\d+(?:\.\d+)?\s*[+\-−×x]\s*\d+(?:\.\d+)?/.test(prompt)
      || hasExplicitStructuredBlanks(prompt, mathExpression)
    ))
    || (visualType === "number_line" && numberLineSelfContained)
    || (visualType === "part_part_whole" && partWholeSelfContained);

  // Matching pictures / diagrams always need a reconstructed visual unless provided.
  if (visualType === "matching_images" || visualType === "decimal_representation" || visualType === "table") {
    selfContained = Boolean(item.visualModel);
  }
  // Prefer part-part-whole self-containment when the prompt names that model (extraction may mis-tag as decimal_representation).
  if (/\bpart[\s-]?part[\s-]?whole\b/i.test(prompt) && partWholeSelfContained) {
    visualType = "part_part_whole";
    selfContained = true;
  }
  if (
    (visualType === "matching_images" || visualType === "number_line")
    && /\bwrite (?:an? )?equations? to represent what you can see\b/i.test(prompt)
  ) {
    selfContained = Boolean(item.explanation?.trim() || item.supportingContext?.trim());
    visualType = "number_line";
  }

  let visualStatus: VisualReconstructionStatus =
    (item.visualReconstructionStatus as VisualReconstructionStatus | undefined)
    ?? (requiresVisual
      ? (item.visualModel ? "reconstructed" : (selfContained ? "not_required" : "needs_admin_reconstruction"))
      : "not_required");

  if (requiresVisual && selfContained && !item.visualModel) {
    requiresVisual = false;
    visualStatus = mathExpression && cleaned?.reconstructed ? "reconstructed" : "not_required";
  }

  if (requiresVisual && !item.visualModel && visualStatus !== "reconstructed") {
    reasons.push("missing_required_visual");
    visualStatus = "needs_admin_reconstruction";
  }

  if (item.visualExtractionConfidence === "low") {
    reasons.push("low_confidence_visual_reconstruction");
  }

  const marking = item.markingMode ?? "auto";
  if (marking === "auto" && !item.answer?.trim()) {
    reasons.push("missing_answer_or_criteria");
  }
  if (marking === "guided_review" && !item.explanation?.trim() && !item.supportingContext?.trim()) {
    reasons.push("missing_answer_or_criteria");
  }

  // Unique reasons
  const unique = [...new Set(reasons)];
  const needsReconstruction = unique.some((r) =>
    r === "missing_required_visual"
    || r === "generic_representation_prompt"
    || r === "missing_question_values"
    || r === "low_confidence_visual_reconstruction",
  );
  const hardBlock = unique.some((r) =>
    r === "garbled_text"
    || r === "answer_sheet_content"
    || r === "incomplete_math_expression"
    || r === "flattened_layout_noise"
    || r === "missing_operands"
    || r === "oversized_prompt"
    || r === "missing_answer_or_criteria",
  );

  let status: PlayableValidationResult["status"] = "playable";
  if (unique.length === 0) status = "playable";
  else if (needsReconstruction && !hardBlock) status = "needs_admin_reconstruction";
  else if (hardBlock || unique.length) status = needsReconstruction ? "needs_admin_reconstruction" : "blocked";

  // Missing visual alone → reconstruction; incomplete maths → blocked/reconstruction
  if (unique.includes("missing_required_visual") || unique.includes("generic_representation_prompt")) {
    status = "needs_admin_reconstruction";
  }
  if (unique.includes("incomplete_math_expression") || unique.includes("flattened_layout_noise")) {
    status = unique.includes("missing_required_visual") ? "needs_admin_reconstruction" : "blocked";
  }

  return {
    playable: status === "playable",
    status,
    reasons: unique,
    cleanedPrompt: prompt,
    mathExpression,
    requiresVisual,
    visualType,
    visualReconstructionStatus: status === "needs_admin_reconstruction" ? "needs_admin_reconstruction" : visualStatus,
  };
}

export type LessonPlayableReport = {
  playableActivities: number;
  blockedActivities: number;
  needsReconstruction: number;
  incompleteMathExpressions: number;
  missingVisuals: number;
  lowConfidenceActivities: number;
  excludedFromQuestionCount: number;
  activityResults: Array<{
    id: string;
    prompt: string;
    status: PlayableValidationResult["status"];
    reasons: PlayableBlockReason[];
    mathExpression: string | null;
    visualType: VisualType | null;
  }>;
};

export function evaluateLessonActivities(items: LinkedQaItem[]): {
  playableItems: LinkedQaItem[];
  excludedItems: LinkedQaItem[];
  report: LessonPlayableReport;
} {
  const playableItems: LinkedQaItem[] = [];
  const excludedItems: LinkedQaItem[] = [];
  const activityResults: LessonPlayableReport["activityResults"] = [];
  let incompleteMath = 0;
  let missingVisuals = 0;
  let lowConfidence = 0;
  let needsReconstruction = 0;
  let blocked = 0;

  for (const item of items) {
    const result = validatePlayableActivity(item);
    const enriched: LinkedQaItem = {
      ...item,
      prompt: result.cleanedPrompt,
      mathExpression: result.mathExpression,
      requiresVisual: result.requiresVisual,
      visualType: result.visualType,
      visualReconstructionStatus: result.visualReconstructionStatus,
      playableStatus: result.status,
      playableBlockReasons: result.reasons,
      visualModel: item.visualModel
        ?? (result.mathExpression
          ? {
              visualType: result.visualType ?? "missing_number_boxes",
              leftExpression: result.mathExpression,
              digitConstraints: /0-9|digits?/i.test(result.cleanedPrompt) ? "0-9 once each" : undefined,
            }
          : null),
    };

    activityResults.push({
      id: item.id,
      prompt: result.cleanedPrompt,
      status: result.status,
      reasons: result.reasons,
      mathExpression: result.mathExpression,
      visualType: result.visualType,
    });

    if (result.reasons.includes("incomplete_math_expression")) incompleteMath++;
    if (result.reasons.includes("missing_required_visual") || result.reasons.includes("generic_representation_prompt")) missingVisuals++;
    if (result.reasons.includes("low_confidence_visual_reconstruction")) lowConfidence++;

    if (result.playable) {
      playableItems.push(enriched);
    } else {
      excludedItems.push(enriched);
      if (result.status === "needs_admin_reconstruction") needsReconstruction++;
      else blocked++;
    }
  }

  return {
    playableItems,
    excludedItems,
    report: {
      playableActivities: playableItems.length,
      blockedActivities: blocked,
      needsReconstruction,
      incompleteMathExpressions: incompleteMath,
      missingVisuals,
      lowConfidenceActivities: lowConfidence,
      excludedFromQuestionCount: excludedItems.length,
      activityResults,
    },
  };
}