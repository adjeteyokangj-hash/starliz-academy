import { KEY_STAGES, phonicsStageFromSkillFocus, type PhonicsStage } from "@/lib/curriculum";

type QualityInput = {
  type: "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths";
  keyStage?: string;
  yearGroup?: string;
  skillFocus?: string;
  requestedCount?: number;
  mode?: "strict" | "repair";
  items: unknown;
};

type QualityMeta = {
  valid: boolean;
  repaired: boolean;
  errors: string[];
  fixesApplied: string[];
  removedWords: string[];
  regeneratedCount: number;
  requestedCount: number;
  finalCount: number;
};

type QualityResult = {
  ok: boolean;
  error?: string;
  cleanedItems?: unknown;
  meta?: QualityMeta;
};

function asArray(items: unknown) {
  return Array.isArray(items) ? items : items && typeof items === "object" ? [items] : [];
}

function hasMathContent(value: string) {
  return /(\d+\s*[+\-x÷*/]\s*\d+|fractions?|number bonds?|times tables?|addition|subtraction|multiplication|division)/i.test(value);
}

function itemText(item: unknown) {
  return JSON.stringify(item ?? "").toLowerCase();
}

function normalizeWord(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isSilentEWord(word: string) {
  return /[aeiou][^aeiou]e$/i.test(word);
}

const PHASE3_DIGRAPHS = ["sh", "ch", "th", "ng", "ai", "ee", "igh", "oa", "oo", "ar", "or", "ur", "ow", "oi", "ear", "air", "ure", "er"];
const PHASE5_ALTERNATIVE_VOWELS = ["ay", "ea", "ou", "ie", "ue", "ew", "au", "oy", "ir", "wh", "ph", "eigh", "a_e", "e_e", "i_e", "o_e", "u_e"];

function hasAnyPattern(word: string, patterns: string[]) {
  return patterns.some((pattern) => {
    if (pattern.includes("_")) {
      const [left, right] = pattern.split("_");
      const rx = new RegExp(`${left}[^aeiou]${right}`, "i");
      return rx.test(word);
    }
    return word.includes(pattern);
  });
}

function isSimpleVcOrCvc(word: string) {
  if (!/^[a-z]+$/i.test(word)) return false;
  if (word.length < 2 || word.length > 3) return false;
  if (hasAnyPattern(word, PHASE3_DIGRAPHS) || hasAnyPattern(word, PHASE5_ALTERNATIVE_VOWELS)) return false;
  const vowels = (word.match(/[aeiou]/gi) ?? []).length;
  if (word.length === 2) return vowels === 1;
  return vowels === 1 && /^[^aeiou][aeiou][^aeiou]$/i.test(word);
}

function isPhase4AdjacentConsonantsWord(word: string) {
  if (!/^[a-z]+$/i.test(word)) return false;
  if (word.length < 4 || word.length > 5) return false;
  if (hasAnyPattern(word, ["a_e", "e_e", "i_e", "o_e", "u_e"])) return false;
  return /[^aeiou]{2}/i.test(word);
}

function matchesPhonicsStage(word: string, stage: PhonicsStage): boolean {
  const clean = word.trim().toLowerCase();
  if (!clean) return false;
  if (stage === "phase2") return isSimpleVcOrCvc(clean);
  if (stage === "phase3") return hasAnyPattern(clean, PHASE3_DIGRAPHS) && !hasAnyPattern(clean, ["a_e", "e_e", "i_e", "o_e", "u_e"]);
  if (stage === "phase4") return isPhase4AdjacentConsonantsWord(clean);
  return hasAnyPattern(clean, PHASE5_ALTERNATIVE_VOWELS) || /[aeiou][^aeiou]e$/i.test(clean);
}

function createSpellingErrorMessage(code: string) {
  const [type, word] = code.split(":");
  if (type === "duplicate") return `Duplicate spelling word rejected: ${word}`;
  if (type === "invalid_silent_e") return `Invalid silent-e word rejected: ${word}`;
  if (type.startsWith("phonics_stage_")) return `Word exceeds selected phonics stage: ${word}`;
  if (type === "incomplete") return `Incomplete spelling item rejected: ${word || "unknown"}`;
  return "Invalid spelling content.";
}

function repairSpellingItems(records: unknown[], skillFocus?: string, requestedCount?: number) {
  const seen = new Set<string>();
  const errors: string[] = [];
  const fixesApplied: string[] = [];
  const removedWords: string[] = [];
  const cleaned: Record<string, unknown>[] = [];
  const phonicsStage = phonicsStageFromSkillFocus(skillFocus);

  for (const item of records) {
    if (!item || typeof item !== "object") {
      errors.push("invalid_structure");
      continue;
    }

    const data = item as Record<string, unknown>;
    const word = normalizeWord(data.word);
    if (!word) {
      errors.push("incomplete:unknown");
      continue;
    }

    if (seen.has(word)) {
      errors.push(`duplicate:${word}`);
      fixesApplied.push(`Removed duplicate: ${word}`);
      removedWords.push(word);
      continue;
    }

    if (skillFocus === "Silent e" && !isSilentEWord(word)) {
      errors.push(`invalid_silent_e:${word}`);
      fixesApplied.push(`Removed invalid word: ${word}`);
      removedWords.push(word);
      continue;
    }

    if (phonicsStage && !matchesPhonicsStage(word, phonicsStage)) {
      errors.push(`phonics_stage_${phonicsStage}:${word}`);
      fixesApplied.push(`Removed out-of-stage word (${phonicsStage}): ${word}`);
      removedWords.push(word);
      continue;
    }

    const hint = String(data.hint ?? "").trim();
    const sentenceContext = String(data.sentenceContext ?? "").trim();
    if (!hint || !sentenceContext) {
      errors.push(`incomplete:${word}`);
      fixesApplied.push(`Removed incomplete item: ${word}`);
      removedWords.push(word);
      continue;
    }

    if (hasMathContent(itemText(item))) {
      errors.push(`invalid_content:${word}`);
      fixesApplied.push(`Removed invalid word: ${word}`);
      removedWords.push(word);
      continue;
    }

    seen.add(word);
    cleaned.push({ ...data, word, phonicsStage: phonicsStage ?? null });
  }

  return {
    cleaned,
    errors,
    fixesApplied,
    removedWords,
    meta: {
      valid: cleaned.length > 0,
      repaired: errors.length > 0,
      errors,
      fixesApplied,
      removedWords,
      regeneratedCount: 0,
      requestedCount: requestedCount ?? cleaned.length,
      finalCount: cleaned.length,
    },
  };
}

export function validateAiContentQuality({ type, keyStage, skillFocus, requestedCount, mode = "strict", items }: QualityInput): QualityResult {
  const records = asArray(items);
  if (!records.length) return { ok: false, error: "No generated content to save." };

  const selectedStage = keyStage?.trim();

  if (type === "spelling" || type === "phonics") {
    const repaired = repairSpellingItems(records, skillFocus, requestedCount);
    if (mode === "repair") {
      if (!repaired.cleaned.length) {
        const label = type === "phonics" ? "phonics" : "spelling";
        return { ok: false, error: `No valid ${label} content remained after validation.`, cleanedItems: repaired.cleaned, meta: repaired.meta };
      }
      return { ok: true, cleanedItems: repaired.cleaned, meta: repaired.meta };
    }

    if (repaired.errors.length > 0) {
      const firstError = repaired.errors.find((value) => value.includes(":"));
      return { ok: false, error: createSpellingErrorMessage(firstError ?? repaired.errors[0] ?? "invalid"), cleanedItems: repaired.cleaned, meta: repaired.meta };
    }

    return { ok: true, cleanedItems: repaired.cleaned, meta: repaired.meta };
  }

  if (type === "maths") {
    const questions = new Set<string>();
    for (const item of records) {
      if (!item || typeof item !== "object") return { ok: false, error: "Maths content must be structured objects." };
      const data = item as Record<string, unknown>;
      const question = String(data.question ?? "").trim().toLowerCase();
      if (!question) return { ok: false, error: "Maths content must include a question." };
      if (data.answer === undefined || data.answer === null || data.answer === "") return { ok: false, error: "Maths output contains a question with no answer." };
      if (questions.has(question)) return { ok: false, error: `Duplicate maths question rejected: ${question}` };
      questions.add(question);
    }
  }

  if (type === "punctuation" || type === "grammar" || type === "writing") {
    const prompts = new Set<string>();
    const label = type === "punctuation" ? "Punctuation" : type === "grammar" ? "Grammar" : "Writing";

    for (const item of records) {
      if (!item || typeof item !== "object") return { ok: false, error: `${label} content must be structured objects.` };
      const data = item as Record<string, unknown>;
      const prompt = String(data.question ?? data.prompt ?? data.sentence ?? "").trim();
      if (!prompt) return { ok: false, error: `${label} content must include a prompt or question.` };

      const normalizedPrompt = prompt.toLowerCase();
      if (prompts.has(normalizedPrompt)) return { ok: false, error: `Duplicate ${type} prompt rejected: ${prompt}` };
      prompts.add(normalizedPrompt);

      const answer = String(data.answer ?? "").trim();
      if (!answer) return { ok: false, error: `${label} content must include an answer.` };

    }
  }

  if (type === "reading") {
    for (const item of records) {
      const data = item as Record<string, unknown>;
      if (!data.passage) return { ok: false, error: "Reading output must include a passage." };
      const hasQuestion = Boolean(data.question || data.prompt);
      const hasQuestionArray = Array.isArray(data.questions) && data.questions.length > 0;
      if (!hasQuestion && !hasQuestionArray) return { ok: false, error: "Reading output must include questions." };
      if (hasQuestion && !data.answer) return { ok: false, error: "Reading question must include an answer." };
    }
  }

  if (selectedStage && !KEY_STAGES.includes(selectedStage as (typeof KEY_STAGES)[number])) {
    return { ok: false, error: "Invalid key stage." };
  }

  return { ok: true, cleanedItems: records };
}
