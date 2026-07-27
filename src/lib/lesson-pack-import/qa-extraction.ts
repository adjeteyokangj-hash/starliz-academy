import { createHash } from "node:crypto";
import type {
  LessonPackComponentType,
  LinkedQaItem,
} from "@/lib/lesson-pack-import/types";

export type TextRole =
  | "section_heading"
  | "student_instruction"
  | "question_prompt"
  | "answer"
  | "worked_solution"
  | "teacher_guidance"
  | "example"
  | "explanation"
  | "footer"
  | "copyright"
  | "source_metadata"
  | "noise";

export type ExtractedActivity = {
  id: string;
  prompt: string;
  instruction?: string;
  supportingContext?: string;
  questionNumber?: string;
  subQuestionNumber?: string;
  responseType: "short_answer" | "fill_blank" | "multi_part" | "extended_reasoning" | "matching";
  markingMode: "auto" | "guided_review";
  answer?: string;
  acceptedAnswers?: string[];
  workedSolution?: string;
  markingGuidance?: string;
  successCriteria?: string;
  sourceComponent: LessonPackComponentType;
  sourceFileId?: string;
  pairingMethod?: string;
  pairingConfidence?: number;
  extractionConfidence: "high" | "medium" | "low";
  textRole: TextRole;
  mathExpression?: string | null;
  visualModel?: Record<string, unknown> | null;
  requiresVisual?: boolean;
  visualType?: string | null;
  visualSourceFile?: string | null;
  visualSourceSlideOrPage?: number | null;
  visualExtractionConfidence?: "high" | "medium" | "low" | null;
  visualReconstructionStatus?:
    | "not_required"
    | "reconstructed"
    | "needs_admin_reconstruction"
    | "excluded";
};

export type StructuredAnswer = {
  id: string;
  questionNumber?: string;
  subQuestionNumber?: string;
  answerType: "correct" | "worked_solution" | "guidance" | "variation";
  acceptedAnswers: string[];
  workedSolution?: string;
  markingGuidance?: string;
  teacherNotes?: string;
  sourceComponent: LessonPackComponentType;
  sourceFileId?: string;
};

const MAX_FOCUSED_PROMPT_CHARS = 180;

const NOISE_PATTERNS: RegExp[] = [
  /\boak\s+national\s+academy\b/i,
  /\bopen\s+government\s+licence\b/i,
  /\bless-[a-z0-9-]+\b/i,
  /\bpage\s+\d+\b/i,
  /\bmathematics\s+in\s+education\s+and\s+industry\b/i,
  /\bhow\s+to\s+use\s+oak\s+lessons\b/i,
  /\bv\d+(\.\d+)?\b/i,
  /\b©\b/,
  /\bcopyright\b/i,
  /^‹#›$/,
];

function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha1").update(seed).digest("hex").slice(0, 12)}`;
}

function roundTenths(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Ratio of readable letters/digits/spaces — low values indicate binary PDF garbage. */
export function textReadabilityScore(text: string): number {
  if (!text || text.length < 8) return 0;
  const sample = text.slice(0, 8000);
  const readable = sample.match(/[A-Za-z0-9\s.,;:+\-=()]/g) ?? [];
  return readable.length / sample.length;
}

export function isUsableExtractedText(text: string): boolean {
  return textReadabilityScore(text) >= 0.55 && !/\u0000/.test(text.slice(0, 200));
}

export function stripDocumentNoise(text: string): string {
  let cleaned = text
    .replace(/\u0000/g, "")
    .replace(/þÿ/g, "")
    .replace(/‹#›/g, "\n")
    .replace(/\r\n/g, "\n");

  cleaned = cleaned
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (NOISE_PATTERNS.some((p) => p.test(line) && line.length < 120)) return false;
      if (/^LESS-/i.test(line)) return false;
      if (/worksheet answers?/i.test(line) && line.length < 120) return false;
      return true;
    })
    .join("\n");

  return cleaned.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function isOpenEndedPrompt(prompt: string): boolean {
  return /\b(explain|justify|compare|describe|create|write (two|three|equations)|show (your )?reasoning|why)\b/i.test(prompt);
}

function focusedPrompt(prompt: string, instruction?: string): {
  prompt: string;
  instruction?: string;
  oversized: boolean;
} {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_FOCUSED_PROMPT_CHARS) {
    return { prompt: trimmed, instruction, oversized: false };
  }
  return {
    prompt: trimmed.slice(0, MAX_FOCUSED_PROMPT_CHARS).trim(),
    instruction: [instruction, trimmed.slice(0, 120)].filter(Boolean).join(" — "),
    oversized: true,
  };
}

/** Normalise Oak fill-blank equation fragments into focused prompts with ___ markers. */
export function normaliseEquationBlank(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/−/g, "-");
  // Trailing operator needing a blank: "1.8 = 1 +"
  t = t.replace(/([=+\-])\s*$/g, "$1 ___");
  // Leading operator after equals: "1.8 = + 0.8"
  t = t.replace(/=\s*([+\-])\s+/g, "= ___ $1 ");
  // Missing middle term: "3.6 - = 3"
  t = t.replace(/([+\-])\s*=\s*/g, "$1 ___ = ");
  // Leading equals: "= 4.8 - 0.8"
  if (/^=/.test(t)) t = `___ ${t}`;
  // Ensure a blank exists for incomplete equations
  if (/[=+\-]/.test(t) && !/___/.test(t) && /[+\-]\s*$/.test(t.replace(/\s+/g, " "))) {
    t = `${t} ___`;
  }
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Infer a single missing decimal/tenths value for simple one-blank equations.
 * Returns null when unsafe to invent.
 */
export function inferDecimalBlankAnswer(prompt: string): string | null {
  const p = normaliseEquationBlank(prompt).replace(/−/g, "-");
  const blanks = p.match(/___/g) ?? [];
  if (blanks.length !== 1) return null;

  // A = B + ___
  let m = p.match(/(\d+\.?\d*)\s*=\s*(\d+\.?\d*)\s*\+\s*___/);
  if (m) return roundTenths(Number(m[1]) - Number(m[2]));

  // A = ___ + B
  m = p.match(/(\d+\.?\d*)\s*=\s*___\s*\+\s*(\d+\.?\d*)/);
  if (m) return roundTenths(Number(m[1]) - Number(m[2]));

  // A - ___ = B
  m = p.match(/(\d+\.?\d*)\s*-\s*___\s*=\s*(\d+\.?\d*)/);
  if (m) return roundTenths(Number(m[1]) - Number(m[2]));

  // A - B = ___
  m = p.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*=\s*___/);
  if (m) return roundTenths(Number(m[1]) - Number(m[2]));

  // A = B - ___
  m = p.match(/(\d+\.?\d*)\s*=\s*(\d+\.?\d*)\s*-\s*___/);
  if (m) return roundTenths(Number(m[2]) - Number(m[1]));

  // ___ = B - C
  m = p.match(/___\s*=\s*(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (m) return roundTenths(Number(m[1]) - Number(m[2]));

  // ___ = B + C
  m = p.match(/___\s*=\s*(\d+\.?\d*)\s*\+\s*(\d+\.?\d*)/);
  if (m) return roundTenths(Number(m[1]) + Number(m[2]));

  return null;
}

function pushActivity(
  activities: ExtractedActivity[],
  partial: Omit<ExtractedActivity, "id" | "extractionConfidence" | "textRole"> & {
    extractionConfidence?: ExtractedActivity["extractionConfidence"];
    textRole?: TextRole;
  },
): void {
  const focused = focusedPrompt(partial.prompt, partial.instruction);
  if (isOversizedPrompt(focused.prompt) && focused.prompt.length > 100) {
    // Keep short equation blanks; drop concatenated number dumps even if they mention "equation"
    const numberTokens = (focused.prompt.match(/\d+\.?\d*/g) ?? []).length;
    if (numberTokens >= 6) return;
    if (focused.oversized && focused.prompt.length >= MAX_FOCUSED_PROMPT_CHARS) {
      if (!/[=+\-___]|part-part-whole/i.test(focused.prompt)) return;
    }
  }
  if (focused.prompt.length < 6) return;
  activities.push({
    ...partial,
    prompt: focused.prompt,
    instruction: focused.instruction ?? partial.instruction,
    id: stableId("q", `${partial.sourceComponent}:${partial.questionNumber ?? ""}:${partial.subQuestionNumber ?? ""}:${focused.prompt}`),
    extractionConfidence: partial.extractionConfidence ?? "medium",
    textRole: partial.textRole ?? "question_prompt",
  });
}

/**
 * Layout-aware extraction for Oak-style worksheets (Task A/B/C, numbered + lettered parts).
 */
export function extractWorksheetActivities(
  rawText: string,
  sourceComponent: LessonPackComponentType,
  sourceFileId?: string,
): ExtractedActivity[] {
  if (!isUsableExtractedText(rawText)) return [];
  const text = stripDocumentNoise(rawText);
  const activities: ExtractedActivity[] = [];

  const taskParts = text.split(/(?=Task\s+[A-Z]\s*:)/i);
  for (const part of taskParts) {
    const taskMatch = part.match(/^Task\s+([A-Z])\s*:\s*/i);
    if (!taskMatch) continue;
    const taskLetter = taskMatch[1].toUpperCase();
    const afterLabel = part.slice(taskMatch[0].length).trim();
    // Title is the first short clause; keep the remainder as body (same-line Oak layout)
    const titleMatch = afterLabel.match(/^([^.\n]{3,60}?)(?=\s+(?:Complete|Fill|Write|Represent|\d+\)|[a-h]\))|\.|$)/i);
    const taskTitle = (titleMatch?.[1] ?? "").trim();
    const body = (titleMatch ? afterLabel.slice(titleMatch[0].length) : afterLabel).replace(/^\.\s*/, "").trim();
    const instruction = [
      taskTitle,
      body.match(/^(Complete[^.]+|Fill in[^.]+|Write[^.]+|Represent[^.]+)\.?/i)?.[1],
    ].filter(Boolean).join(" — ");

    // Lettered equation blanks: a) 1.8 = 1 +   (Oak often packs these on one line)
    const equationLetters: Array<{ sub: string; raw: string }> = [];
    const letterChunks = body.split(/(?=\b[a-h]\))/i).filter((c) => /^\s*[a-h]\)/i.test(c));
    for (const chunk of letterChunks) {
      // Avoid /s (dotAll) — not available under the project TS target; use [\s\S] instead.
      const m = chunk.match(/^\s*([a-h])\)\s*([\s\S]*)$/i);
      if (!m) continue;
      const sub = m[1].toLowerCase();
      let raw = m[2]
        .replace(/\b[a-h]\)\s*$/i, "")
        .replace(/\s+/g, " ")
        .replace(/(?:\s+[a-h]\))+$/i, "")
        .trim();
      // Stop at the next lettered marker if split missed it
      const nextLetter = raw.search(/\s[a-h]\)/i);
      if (nextLetter > 0) raw = raw.slice(0, nextLetter).trim();
      if (!/[=+\-−×x]/.test(raw)) continue;
      if (raw.length < 3 || raw.length > 80) continue;
      equationLetters.push({ sub, raw });
    }

    if (equationLetters.length >= 1) {
      for (const item of equationLetters.slice(0, 12)) {
        const prompt = `${item.sub}) ${normaliseEquationBlank(item.raw)}`;
        const inferred = inferDecimalBlankAnswer(prompt);
        const blankCount = (prompt.match(/___/g) ?? []).length;
        const open = isOpenEndedPrompt(prompt) || (blankCount > 1 && !inferred);
        pushActivity(activities, {
          prompt,
          instruction: instruction || "Fill in the blanks to make these equations correct.",
          questionNumber: "1",
          subQuestionNumber: item.sub,
          responseType: open ? "extended_reasoning" : "fill_blank",
          markingMode: open || !inferred ? "guided_review" : "auto",
          answer: inferred ?? undefined,
          acceptedAnswers: inferred ? [inferred] : undefined,
          pairingMethod: inferred ? "inferred_decimal_blank" : open || !inferred ? "guided_review" : undefined,
          pairingConfidence: inferred ? 0.9 : 1,
          successCriteria: open || !inferred
            ? "Complete the equation using place-value knowledge of ones and tenths."
            : undefined,
          sourceComponent,
          sourceFileId,
          extractionConfidence: "high",
        });
      }
    }

    // Open-ended / write equations items: 2) Write ...
    const writeItems = [...body.matchAll(/(?:^|\s)(\d+)\s*\)\s*((?:Write|Match|Complete the table|How many|Solve|Using|Choose)[\s\S]*?)(?=(?:^|\s)\d+\s*\)\s*|Task\s+[A-Z]|$)/gi)];
    for (const m of writeItems.slice(0, 4)) {
      const qNum = m[1];
      let promptBody = m[2].replace(/\s+/g, " ").trim();
      // Keep the stem; move trailing bare numbers / empty letter labels into supporting context
      promptBody = promptBody.replace(/(?:\s+[a-z]\s*\))+$/i, "").trim();
      const numTail = promptBody.match(/((?:\d+\.?\d*\s*){2,10})$/);
      let supporting: string | undefined;
      if (numTail && /write|represent|equation/i.test(promptBody)) {
        supporting = `Use the representation values: ${numTail[1].trim()}`;
        promptBody = promptBody.slice(0, numTail.index).trim();
      }
      promptBody = promptBody.replace(/\s+/g, " ").slice(0, 160);
      if (promptBody.length < 12) continue;
      if (equationLetters.length >= 1 && /^(fill in the blanks|complete the equations)/i.test(promptBody)) continue;
      if (isOversizedPrompt(`${qNum}) ${promptBody}`)) {
        promptBody = promptBody.split(".")[0].slice(0, 140).trim();
      }
      pushActivity(activities, {
        prompt: `${qNum}) ${promptBody}`,
        instruction,
        supportingContext: supporting,
        questionNumber: qNum,
        responseType: /match/i.test(promptBody) ? "matching" : "extended_reasoning",
        markingMode: "guided_review",
        successCriteria: "Complete the task using place value and clear mathematical reasoning.",
        sourceComponent,
        sourceFileId,
        extractionConfidence: /match the pictures|complete the table|representation/i.test(promptBody) ? "low" : "high",
        requiresVisual: /match the pictures|for this picture|what you can see|complete the table|use the diagram|number line|representation/i.test(promptBody) || undefined,
        visualType: /match the pictures|for this picture/i.test(promptBody)
          ? "matching_images"
          : /part[\s-]?part[\s-]?whole/i.test(promptBody)
            ? "part_part_whole"
            : /complete the table/i.test(promptBody)
              ? "table"
              : /number line|what you can see/i.test(promptBody)
                ? "number_line"
                : /representation|diagram|model/i.test(promptBody)
                  ? "decimal_representation"
                  : undefined,
        visualReconstructionStatus: /match the pictures|for this picture|complete the table/i.test(promptBody)
          ? "needs_admin_reconstruction"
          : /part[\s-]?part[\s-]?whole/i.test(promptBody)
            ? "not_required"
            : /write (?:an? )?equations? to represent what you can see/i.test(promptBody)
              ? "not_required"
              : /representation/i.test(promptBody)
                ? "needs_admin_reconstruction"
                : "not_required",
      });
    }

    // Rounding / number-line / locate tasks (Oak Lesson 5 style)
    if (equationLetters.length < 1 && /(?:locate decimal|place the letters|round to the nearest|previous and next multiple)/i.test(body + " " + instruction)) {
      const stems = [
        ...body.matchAll(/(?:^|\s)(\d+)\s*\)\s*((?:Identify|Locate|Place|Round|Mark|Label)[\s\S]{8,140}?)(?=(?:\s+\d+\s*\)\s*)|Task\s+[A-Z]|$)/gi),
      ];
      if (stems.length) {
        for (const m of stems.slice(0, 6)) {
          const promptBody = m[2].replace(/\s+/g, " ").trim().slice(0, 140);
          pushActivity(activities, {
            prompt: `${m[1]}) ${promptBody}`,
            instruction: instruction || taskTitle || "Complete the rounding task.",
            questionNumber: m[1],
            responseType: "extended_reasoning",
            markingMode: "guided_review",
            successCriteria: "Identify previous/next multiples of one and round using the number line.",
            sourceComponent,
            sourceFileId,
            extractionConfidence: "medium",
          });
        }
      } else {
        // Do not emit a generic representation prompt — try recoverable Round N stems first.
        const roundStems = [
          ...body.matchAll(/\bRound\s+(\d+(?:\.\d+)?)\s+to\s+the\s+nearest\s+(whole(?:\s+number)?|tenth|hundredth|one)\b/gi),
        ];
        if (roundStems.length) {
          for (const m of roundStems.slice(0, 4)) {
            const number = m[1];
            const place = m[2].toLowerCase().includes("whole") || m[2].toLowerCase() === "one" ? "whole number" : m[2].toLowerCase();
            pushActivity(activities, {
              prompt: `Round ${number} to the nearest ${place}.`,
              instruction: instruction || taskTitle || "Round using the representation.",
              questionNumber: taskLetter,
              responseType: "short_answer",
              markingMode: "guided_review",
              successCriteria: `Identify the previous and next multiples and round ${number} to the nearest ${place}.`,
              sourceComponent,
              sourceFileId,
              extractionConfidence: "medium",
              visualType: "number_line",
              requiresVisual: false,
              visualReconstructionStatus: "not_required",
            });
          }
        }
        // Otherwise leave for Admin reconstruction — no student-facing generic prompt.
      }
    }

    // Task A / C complete-the-model style without lettered equations
    if (/complete the part-part-whole/i.test(body) && equationLetters.length < 1) {
      const nums = body.match(/\d+\.\d+|\d+/g)?.slice(0, 8) ?? [];
      const wholes = nums.filter((n) => Number(n) >= 1).slice(0, 4);
      const targets = wholes.length ? wholes : nums.slice(0, 3);
      targets.forEach((value, idx) => {
        pushActivity(activities, {
          prompt: `Complete the part-part-whole model for ${value}`,
          instruction: instruction || "Complete the part-part-whole models.",
          questionNumber: taskLetter,
          subQuestionNumber: String.fromCharCode(97 + idx),
          responseType: "multi_part",
          markingMode: "guided_review",
          successCriteria: "Partition into ones and tenths (or show an equivalent additive composition).",
          sourceComponent,
          sourceFileId,
          extractionConfidence: "medium",
        });
      });
    }
  }

  // Prefer Task A/B/C structured extraction (Lesson 1 style). Only harvest broader
  // equation/number stems when that path produced too few playable activities.
  let result = dedupeActivities(activities);
  const hasStructuredBlanks = result.some((a) => /___/.test(a.prompt) || a.subQuestionNumber);
  // If Task parsing already produced lettered/blank items, keep them and skip harvest.
  if (result.length >= 1 && hasStructuredBlanks) return result;
  if (result.length >= 3) return result;

  const numbered = [...text.matchAll(/(?:^|\n|\s)(\d{1,2})\s*[.)]\s+([A-Za-z][\s\S]{6,160}?)(?=(?:\s+\d{1,2}\s*[.)]\s+)|Task\s+[A-Z]|$)/g)];
  for (const m of numbered.slice(0, 20)) {
    const qNum = m[1];
    let promptBody = m[2].replace(/\s+/g, " ").trim();
    if (/^(learning objective|lesson outcome|copyright|page\b|mathematics in education)/i.test(promptBody)) continue;
    promptBody = promptBody.replace(/(?:\s+[a-z]\s*\))+$/i, "").trim().slice(0, 160);
    const open = (isOpenEndedPrompt(promptBody) && !/^what is\b/i.test(promptBody)) || /match|complete the table|how many different|write|solve|using any/i.test(promptBody);
    const blank = normaliseEquationBlank(promptBody);
    const inferred = inferDecimalBlankAnswer(`${qNum}) ${blank}`);
    pushActivity(activities, {
      prompt: `${qNum}) ${/[=+\-−×x]/.test(blank) ? blank : promptBody}`.slice(0, MAX_FOCUSED_PROMPT_CHARS),
      questionNumber: qNum,
      responseType: open ? "extended_reasoning" : /[=+\-−×x___]/.test(blank) ? "fill_blank" : "short_answer",
      markingMode: open || !inferred ? "guided_review" : "auto",
      answer: inferred ?? undefined,
      acceptedAnswers: inferred ? [inferred] : undefined,
      pairingMethod: inferred ? "inferred_decimal_blank" : open || !inferred ? "guided_review" : undefined,
      pairingConfidence: inferred ? 0.85 : 1,
      successCriteria: open || !inferred ? "Show clear mathematical reasoning." : undefined,
      sourceComponent,
      sourceFileId,
      extractionConfidence: "medium",
    });
  }

  harvestEquationBlankActivities(text, sourceComponent, sourceFileId, activities);
  result = dedupeActivities(activities);
  return result;
}

function dedupeActivities(activities: ExtractedActivity[]): ExtractedActivity[] {
  const seen = new Set<string>();
  return activities.filter((a) => {
    const key = a.prompt.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Pull focused fill-blank / guided equation prompts from flattened worksheet text. */
function harvestEquationBlankActivities(
  text: string,
  sourceComponent: LessonPackComponentType,
  sourceFileId: string | undefined,
  activities: ExtractedActivity[],
): void {
  const blanks = [
    ...text.matchAll(/(\d+(?:\.\d+)?\s*[+\-−×x]\s*\d+(?:\.\d+)?\s*=)\s*(?!\d)/g),
    ...text.matchAll(/(\d+(?:\.\d+)?\s*[+\-−×x]\s*=\s*\d+(?:\.\d+)?)/g),
    ...text.matchAll(/(=\s*\d+(?:\.\d+)?\s*[+\-−×x]\s*\d+(?:\.\d+)?)/g),
    ...text.matchAll(/(\d+(?:\.\d+)?\s*=\s*\d+(?:\.\d+)?\s*[+\-−×x])\s*(?!\d)/g),
    ...text.matchAll(/(\d+(?:\.\d+)?\s*=\s*[+\-−×x]\s*\d+(?:\.\d+)?)/g),
  ];
  let n = 0;
  for (const m of blanks) {
    if (n >= 16) break;
    const raw = m[1].replace(/×/g, "x").replace(/−/g, "-").replace(/\s+/g, " ").trim();
    if (raw.length < 5 || raw.length > 40) continue;
    const prompt = normaliseEquationBlank(raw);
    if (!/___/.test(prompt) && !/=\s*$/.test(prompt)) continue;
    const focused = /___/.test(prompt) ? prompt : `${prompt} ___`;
    const inferred = inferDecimalBlankAnswer(focused.includes(")") ? focused : `a) ${focused}`);
    const hasMul = /[x×]/.test(raw);
    pushActivity(activities, {
      prompt: focused,
      instruction: "Fill in the missing number.",
      questionNumber: String((activities.length % 9) + 1),
      subQuestionNumber: String.fromCharCode(97 + (n % 8)),
      responseType: hasMul || !inferred ? "fill_blank" : "fill_blank",
      markingMode: hasMul || !inferred ? "guided_review" : "auto",
      answer: !hasMul ? inferred ?? undefined : undefined,
      acceptedAnswers: !hasMul && inferred ? [inferred] : undefined,
      pairingMethod: inferred && !hasMul ? "inferred_decimal_blank" : "guided_review",
      pairingConfidence: inferred && !hasMul ? 0.85 : 1,
      successCriteria: hasMul || !inferred ? "Use place-value knowledge of ones and tenths." : undefined,
      sourceComponent,
      sourceFileId,
      extractionConfidence: inferred && !hasMul ? "high" : "medium",
    });
    n++;
  }

  // Worded "tenths" fact stems
  const tenths = [...text.matchAll(/(\d+\s*tenths\s*[+\-−]\s*\d+\s*tenths\s*=\s*tenths?)/gi)];
  for (const m of tenths.slice(0, 8)) {
    const prompt = m[1].replace(/\s+/g, " ").trim().replace(/=\s*tenths?$/i, "= ___ tenths");
    pushActivity(activities, {
      prompt,
      instruction: "Choose the relevant number fact to fill in the missing number.",
      responseType: "fill_blank",
      markingMode: "guided_review",
      successCriteria: "Convert tenths facts to decimal equations correctly.",
      sourceComponent,
      sourceFileId,
      extractionConfidence: "medium",
    });
  }
}

/**
 * Parse answer sheets into structured answers keyed by question/sub-question identity.
 * Does not treat every numeric token as an independent answer.
 */
export function parseAnswerSheet(
  rawText: string,
  sourceComponent: LessonPackComponentType,
  sourceFileId?: string,
): { answers: StructuredAnswer[]; guidanceGroups: number; excludedFragments: number } {
  if (!isUsableExtractedText(rawText)) {
    return { answers: [], guidanceGroups: 0, excludedFragments: 1 };
  }
  const text = stripDocumentNoise(rawText);
  const answers: StructuredAnswer[] = [];
  let guidanceGroups = 0;
  let excludedFragments = 0;

  for (const line of text.split(/\n/).map((l) => l.trim()).filter(Boolean)) {
    if (NOISE_PATTERNS.some((p) => p.test(line) && line.length < 120)) {
      excludedFragments++;
      continue;
    }
    if (/\b(accept|pupils may|mark for|allow equivalent|common misconception)\b/i.test(line)) {
      guidanceGroups++;
    }
  }

  // Completed equations only — reject blank stems (ending +/−) and trailing-dot fragments.
  const equations = [...text.matchAll(/(\d+(?:\.\d+)?)\s*=\s*([0-9.+\-−\s]+?)(?=(?:\d+(?:\.\d+)?\s*=)|$|[a-z]\))/gi)];
  for (const m of equations.slice(0, 40)) {
    const lhs = m[1];
    const rhs = m[2].replace(/−/g, "-").replace(/\s+/g, " ").trim();
    if (rhs.length < 1 || rhs.length > 40) continue;
    // Incomplete blank prompts on an answer sheet are not answers.
    if (/[+\-]\s*$/.test(rhs) || /^\s*[+\-]/.test(rhs) && !/\d/.test(rhs.slice(1))) {
      excludedFragments++;
      continue;
    }
    // Bare A = B numeric pairs from number dumps become false orphan "correct" answers.
    // Only keep fully reconstructed binary worked solutions here; lettered blanks are handled below.
    const completeBinary = /^\d+(?:\.\d+)?\s*[+\-]\s*\d+(?:\.\d+)?$/.test(rhs);
    if (!completeBinary) {
      excludedFragments++;
      continue;
    }
    answers.push({
      id: stableId("a", `${sourceComponent}:eq:${lhs}:${rhs}`),
      answerType: "worked_solution",
      acceptedAnswers: [`${lhs} = ${rhs}`],
      workedSolution: `${lhs} = ${rhs}`,
      sourceComponent,
      sourceFileId,
    });
  }

  // Infer lettered blank answers from the same equation prompts on the answer sheet
  const letterChunks = text.split(/(?=\b[a-h]\))/i).filter((c) => /^\s*[a-h]\)/i.test(c));
  for (const chunk of letterChunks) {
    // Avoid /s (dotAll) — not available under the project TS target; use [\s\S] instead.
    const m = chunk.match(/^\s*([a-h])\)\s*([\s\S]*)$/i);
    if (!m) continue;
    const sub = m[1].toLowerCase();
    let raw = m[2].replace(/\s+/g, " ").trim();
    const nextLetter = raw.search(/\s[a-h]\)/i);
    if (nextLetter > 0) raw = raw.slice(0, nextLetter).trim();
    if (!/[=+\-−]/.test(raw) || raw.length > 80) continue;
    const prompt = `${sub}) ${normaliseEquationBlank(raw)}`;
    const inferred = inferDecimalBlankAnswer(prompt);
    if (!inferred) continue;
    answers.push({
      id: stableId("a", `${sourceComponent}:1:${sub}:${inferred}`),
      questionNumber: "1",
      subQuestionNumber: sub,
      answerType: "correct",
      acceptedAnswers: [inferred],
      sourceComponent,
      sourceFileId,
    });
  }

  // Classic numbered answer lines: 1. 12   or  2) 10
  const numberedAnswers = [...text.matchAll(/(?:^|\n)\s*(\d{1,2})[.)]\s+([^\n]{1,80})/g)];
  for (const m of numberedAnswers.slice(0, 40)) {
    const qNum = m[1];
    const value = m[2].replace(/\s+/g, " ").trim();
    if (!value || /^(accept|pupils may|mark for|allow)/i.test(value)) continue;
    if (/[=+\-]/.test(value) && value.length > 20) continue;
    answers.push({
      id: stableId("a", `${sourceComponent}:num:${qNum}:${value}`),
      questionNumber: qNum,
      answerType: "correct",
      acceptedAnswers: [value],
      sourceComponent,
      sourceFileId,
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  const deduped = answers.filter((a) => {
    const key = `${a.answerType}:${a.questionNumber ?? ""}:${a.subQuestionNumber ?? ""}:${a.acceptedAnswers.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { answers: deduped, guidanceGroups, excludedFragments };
}

/** Pair by question number + sub-question, then prompt similarity — never global index alone. */
export function pairActivitiesWithAnswers(
  activities: ExtractedActivity[],
  answers: StructuredAnswer[],
): {
  paired: ExtractedActivity[];
  orphanCorrectAnswers: StructuredAnswer[];
  questionsMissingAnswers: ExtractedActivity[];
} {
  const usedAnswerIds = new Set<string>();
  const paired: ExtractedActivity[] = [];
  const questionsMissingAnswers: ExtractedActivity[] = [];

  for (const activity of activities) {
    // Already has an inferred answer from extraction
    if (activity.answer && activity.markingMode === "auto") {
      paired.push({
        ...activity,
        pairingMethod: activity.pairingMethod ?? "pre_inferred",
        pairingConfidence: activity.pairingConfidence ?? 0.9,
      });
      // Mark matching structured answer as used when present
      const match = answers.find((a) =>
        a.answerType === "correct"
        && a.subQuestionNumber === activity.subQuestionNumber
        && (!a.questionNumber || a.questionNumber === activity.questionNumber)
        && a.acceptedAnswers.some((v) => activity.acceptedAnswers?.includes(v) || v === activity.answer),
      );
      if (match) usedAnswerIds.add(match.id);
      continue;
    }

    if (activity.markingMode === "guided_review") {
      const numberedCorrect = activity.questionNumber
        ? answers.find((a) =>
          !usedAnswerIds.has(a.id)
          && a.answerType === "correct"
          && a.questionNumber === activity.questionNumber
          && !a.subQuestionNumber)
        : undefined;
      if (numberedCorrect) {
        usedAnswerIds.add(numberedCorrect.id);
        paired.push({
          ...activity,
          markingMode: "auto",
          responseType: activity.responseType === "extended_reasoning" ? "short_answer" : activity.responseType,
          answer: numberedCorrect.acceptedAnswers.join("; "),
          acceptedAnswers: numberedCorrect.acceptedAnswers,
          pairingMethod: "question_number",
          pairingConfidence: 0.9,
          successCriteria: undefined,
        });
        continue;
      }
      const worked = answers.find((a) =>
        a.answerType === "worked_solution"
        && !usedAnswerIds.has(a.id)
        && activity.supportingContext
        && a.acceptedAnswers.some((ans) => activity.supportingContext!.includes(ans.split("=")[0].trim())),
      );
      if (worked) {
        usedAnswerIds.add(worked.id);
        paired.push({
          ...activity,
          workedSolution: worked.workedSolution ?? worked.acceptedAnswers.join("; "),
          markingGuidance: worked.markingGuidance,
          pairingMethod: "worked_solution_context",
          pairingConfidence: 0.7,
        });
      } else {
        paired.push({
          ...activity,
          pairingMethod: "guided_review",
          pairingConfidence: 1,
        });
      }
      continue;
    }

    let match: StructuredAnswer | undefined;
    let method = "";
    let confidence = 0;

    if (activity.questionNumber && activity.subQuestionNumber) {
      match = answers.find((a) =>
        !usedAnswerIds.has(a.id)
        && a.answerType === "correct"
        && a.subQuestionNumber === activity.subQuestionNumber
        && (!a.questionNumber || a.questionNumber === activity.questionNumber),
      );
      if (match) {
        method = "question_number_subquestion";
        confidence = 0.95;
      }
    }

    if (!match && activity.subQuestionNumber) {
      match = answers.find((a) =>
        !usedAnswerIds.has(a.id)
        && a.answerType === "correct"
        && a.subQuestionNumber === activity.subQuestionNumber,
      );
      if (match) {
        method = "subquestion";
        confidence = 0.8;
      }
    }

    if (!match && activity.questionNumber) {
      match = answers.find((a) =>
        !usedAnswerIds.has(a.id)
        && a.answerType === "correct"
        && a.questionNumber === activity.questionNumber
        && !a.subQuestionNumber,
      );
      if (match) {
        method = "question_number";
        confidence = 0.85;
      }
    }

    if (match && confidence >= 0.55) {
      usedAnswerIds.add(match.id);
      paired.push({
        ...activity,
        answer: match.acceptedAnswers.join("; "),
        acceptedAnswers: match.acceptedAnswers,
        workedSolution: match.workedSolution,
        markingGuidance: match.markingGuidance,
        pairingMethod: method,
        pairingConfidence: confidence,
      });
    } else {
      questionsMissingAnswers.push(activity);
      paired.push(activity);
    }
  }

  // Only unexplained *correct* answers count as orphans (worked solutions / guidance do not).
  // Values already attached to activities via inference are not orphans.
  const orphanCorrectAnswers = answers.filter((a) => {
    if (a.answerType !== "correct" || usedAnswerIds.has(a.id)) return false;
    const coveredByActivity = activities.some((act) => {
      if (a.subQuestionNumber && act.subQuestionNumber === a.subQuestionNumber) {
        if (!a.questionNumber || act.questionNumber === a.questionNumber) {
          return Boolean(act.answer) || act.markingMode === "guided_review";
        }
      }
      return Boolean(act.answer) && a.acceptedAnswers.includes(act.answer!);
    });
    return !coveredByActivity;
  });

  return { paired, orphanCorrectAnswers, questionsMissingAnswers };
}

export function activitiesToLinkedQa(activities: ExtractedActivity[]): LinkedQaItem[] {
  return activities.map((a) => ({
    id: a.id,
    prompt: a.prompt,
    answer: a.answer,
    explanation: a.workedSolution || a.markingGuidance || a.successCriteria,
    hint: a.instruction,
    instructions: a.instruction ?? null,
    sourceComponent: a.sourceComponent,
    sourceFileId: a.sourceFileId,
    responseType: a.responseType,
    markingMode: a.markingMode,
    questionNumber: a.questionNumber,
    subQuestionNumber: a.subQuestionNumber,
    pairingMethod: a.pairingMethod,
    pairingConfidence: a.pairingConfidence,
    supportingContext: a.supportingContext,
    mathExpression: a.mathExpression ?? null,
    visualModel: a.visualModel ?? null,
    requiresVisual: a.requiresVisual,
    visualType: a.visualType ?? null,
    visualSourceFile: a.visualSourceFile ?? null,
    visualSourceSlideOrPage: a.visualSourceSlideOrPage ?? null,
    visualExtractionConfidence: a.visualExtractionConfidence ?? null,
    visualReconstructionStatus: a.visualReconstructionStatus,
    acceptedAnswers: a.acceptedAnswers,
    successCriteria: a.successCriteria ?? null,
  }));
}

/** Extract short practice prompts from teaching slides (My turn / Your turn). */
export function extractSlidePracticeActivities(
  rawText: string,
  sourceFileId?: string,
): ExtractedActivity[] {
  if (!isUsableExtractedText(rawText)) return [];
  const text = stripDocumentNoise(rawText);
  const activities: ExtractedActivity[] = [];

  const yourTurns = [
    ...text.matchAll(/(?:Your turn|Independent practice|Have a go|Try this|Over to you)\s*[:\-–]?\s*([\s\S]{8,200}?)(?=Your turn|My turn|Independent practice|Have a go|Try this|Over to you|Partitioning|Representing|Explain that|I can |$)/gi),
  ];
  let idx = 1;
  for (const m of yourTurns.slice(0, 8)) {
    let chunk = m[1].replace(/\s+/g, " ").trim();
    // Prefer an equation-like fragment inside the chunk
    const equation = chunk.match(/(?:[a-z]\)\s*)?\d+\.?\d*\s*[=+\-−][^.]{0,40}/i);
    if (equation) {
      chunk = normaliseEquationBlank(equation[0]);
    } else {
      // Reject bare number dumps / concatenated model values
      const letters = (chunk.match(/[A-Za-z]/g) ?? []).length;
      const digits = (chunk.match(/\d/g) ?? []).length;
      if (letters < 6 || digits > 20) continue;
      if (!/[?=]|complete|calculate|write|explain|partition|represent/i.test(chunk)) continue;
    }
    const letters = (chunk.match(/[A-Za-z]/g) ?? []).length;
    const digits = (chunk.match(/\d/g) ?? []).length;
    if (digits > 24 && letters < 10) continue;
    if (isOversizedPrompt(chunk) && !equation) continue;

    const focused = focusedPrompt(chunk, "Your turn");
    if (focused.oversized || focused.prompt.length < 8) continue;
    if (isOversizedPrompt(focused.prompt)) continue;
    const inferred = inferDecimalBlankAnswer(focused.prompt);
    const open = isOpenEndedPrompt(focused.prompt);
    activities.push({
      id: stableId("q", `slide:yourturn:${idx}:${focused.prompt}`),
      prompt: focused.prompt,
      instruction: focused.instruction,
      questionNumber: String(idx),
      responseType: open ? "extended_reasoning" : /___|[=+\-]/.test(focused.prompt) ? "fill_blank" : "short_answer",
      markingMode: open || !inferred ? "guided_review" : "auto",
      answer: inferred ?? undefined,
      acceptedAnswers: inferred ? [inferred] : undefined,
      pairingMethod: inferred ? "inferred_decimal_blank" : open || !inferred ? "guided_review" : undefined,
      pairingConfidence: inferred ? 0.85 : 1,
      successCriteria: open || !inferred ? "Explain using place value and clear mathematical reasoning." : undefined,
      sourceComponent: "teaching_slides",
      sourceFileId,
      extractionConfidence: equation ? "medium" : "low",
      textRole: "question_prompt",
    });
    idx++;
  }
  return activities;
}

export function isOversizedPrompt(prompt: string): boolean {
  if (!prompt) return true;
  if (prompt.length > MAX_FOCUSED_PROMPT_CHARS) return true;
  const digits = (prompt.match(/\d/g) ?? []).length;
  const letters = (prompt.match(/[A-Za-z]/g) ?? []).length;
  const numberTokens = (prompt.match(/\d+\.?\d*/g) ?? []).length;
  if (digits > 24 && letters < 12) return true;
  // Concatenated model-value dumps (many numeric tokens before a short instruction)
  if (numberTokens >= 8 && numberTokens > 3) return true;
  if (digits >= 18 && digits >= letters) return true;
  return false;
}
