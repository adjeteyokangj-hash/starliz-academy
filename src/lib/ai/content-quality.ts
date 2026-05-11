type QualityInput = {
  type: "spelling" | "math" | "reading";
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

function createSpellingErrorMessage(code: string) {
  const [type, word] = code.split(":");
  if (type === "duplicate") return `Duplicate spelling word rejected: ${word}`;
  if (type === "invalid_silent_e") return `Invalid silent-e word rejected: ${word}`;
  if (type === "incomplete") return `Incomplete spelling item rejected: ${word || "unknown"}`;
  return "Invalid spelling content.";
}

function repairSpellingItems(records: unknown[], skillFocus?: string, requestedCount?: number) {
  const seen = new Set<string>();
  const errors: string[] = [];
  const fixesApplied: string[] = [];
  const removedWords: string[] = [];
  const cleaned: Record<string, unknown>[] = [];

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
    cleaned.push({ ...data, word });
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

export function validateAiContentQuality({ type, keyStage, yearGroup, skillFocus, requestedCount, mode = "strict", items }: QualityInput): QualityResult {
  const records = asArray(items);
  if (!records.length) return { ok: false, error: "No generated content to save." };

  const selectedYear = yearGroup?.trim();
  const selectedStage = keyStage?.trim();

  if (type === "spelling") {
    const repaired = repairSpellingItems(records, skillFocus, requestedCount);
    if (mode === "repair") {
      if (!repaired.cleaned.length) {
        return { ok: false, error: "No valid spelling content remained after validation.", cleanedItems: repaired.cleaned, meta: repaired.meta };
      }
      return { ok: true, cleanedItems: repaired.cleaned, meta: repaired.meta };
    }

    if (repaired.errors.length > 0) {
      const firstError = repaired.errors.find((value) => value.includes(":"));
      return { ok: false, error: createSpellingErrorMessage(firstError ?? repaired.errors[0] ?? "invalid"), cleanedItems: repaired.cleaned, meta: repaired.meta };
    }

    for (const item of repaired.cleaned) {
      const data = item as Record<string, unknown>;
      if (selectedYear && String(data.yearGroup ?? "") && String(data.yearGroup) !== selectedYear) {
        return { ok: false, error: "Content year group does not match selection." };
      }
    }

    return { ok: true, cleanedItems: repaired.cleaned, meta: repaired.meta };
  }

  if (type === "math") {
    const questions = new Set<string>();
    for (const item of records) {
      if (!item || typeof item !== "object") return { ok: false, error: "Maths content must be structured objects." };
      const data = item as Record<string, unknown>;
      const question = String(data.question ?? "").trim().toLowerCase();
      if (!question) return { ok: false, error: "Maths content must include a question." };
      if (data.answer === undefined || data.answer === null || data.answer === "") return { ok: false, error: "Maths output contains a question with no answer." };
      if (questions.has(question)) return { ok: false, error: `Duplicate maths question rejected: ${question}` };
      if (selectedYear && String(data.yearGroup ?? "") && String(data.yearGroup) !== selectedYear) return { ok: false, error: "Content year group does not match selection." };
      questions.add(question);
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
      if (selectedYear && String(data.yearGroup ?? "") && String(data.yearGroup) !== selectedYear) return { ok: false, error: "Content year group does not match selection." };
    }
  }

  if (selectedStage && !["KS1", "KS2"].includes(selectedStage)) {
    return { ok: false, error: "Invalid key stage." };
  }

  return { ok: true, cleanedItems: records };
}
