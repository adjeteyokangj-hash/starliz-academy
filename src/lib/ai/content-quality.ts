import { KEY_STAGES, phonicsStageFromSkillFocus, type PhonicsStage } from "@/lib/curriculum";
import { assessSpellingItemForDifficulty } from "@/lib/admin-ai-generator-spelling";

type QualityInput = {
  type: "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" | "languages";
  subject?: string;
  topic?: string;
  keyStage?: string;
  yearGroup?: string;
  skillFocus?: string;
  difficulty?: number;
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
  yearLevelMatch: boolean;
  subjectMatch: boolean;
  skillTopicMatch: boolean;
  difficultyMatch: boolean;
};

type QualityResult = {
  ok: boolean;
  error?: string;
  cleanedItems?: unknown;
  meta?: QualityMeta;
};

type ValidationAccumulator = {
  cleaned: Record<string, unknown>[];
  errors: string[];
  fixesApplied: string[];
  removedWords: string[];
  yearMismatches: number;
  subjectMismatches: number;
  skillTopicMismatches: number;
  difficultyMismatches: number;
};

function createAccumulator(): ValidationAccumulator {
  return {
    cleaned: [],
    errors: [],
    fixesApplied: [],
    removedWords: [],
    yearMismatches: 0,
    subjectMismatches: 0,
    skillTopicMismatches: 0,
    difficultyMismatches: 0,
  };
}

function asArray(items: unknown) {
  return Array.isArray(items) ? items : items && typeof items === "object" ? [items] : [];
}

function itemText(item: unknown) {
  return JSON.stringify(item ?? "").toLowerCase();
}

function hasMathContent(value: string) {
  return /(\d+\s*[+\-x÷*/]\s*\d+|\bfractions?\b|\bnumber bonds?\b|\btimes tables?\b|\baddition\b|\bsubtraction\b|\bmultiplication\b|\bdivision\b|\bratio\b|\bdecimal\b|\bpercent(?:age)?\b)/i.test(value);
}

function isReadingComprehensionSkill(skillFocus: string | null | undefined) {
  const normalized = String(skillFocus ?? "").trim().toLowerCase();
  return normalized === "reading comprehension" || normalized.includes("reading comprehension");
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

function parseYearNumber(value: string | null | undefined): number {
  const match = String(value ?? "").match(/(\d+)/);
  if (!match) return 1;
  return Math.max(1, Math.min(11, Number(match[1])));
}

function tokenize(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 3);
}

function hasTokenOverlap(targetText: string, expected: string[]): boolean {
  if (!expected.length) return true;
  const textTokens = new Set(tokenize(targetText));
  return expected.some((token) => textTokens.has(token));
}

function createSpellingErrorMessage(code: string) {
  const [type, word] = code.split(":");
  if (type === "duplicate") return `Duplicate spelling word rejected: ${word}`;
  if (type === "invalid_silent_e") return `Invalid silent-e word rejected: ${word}`;
  if (type.startsWith("phonics_stage_")) return `Word exceeds selected phonics stage: ${word}`;
  if (type === "too_easy") return "Some generated words were too simple for this selected year and difficulty.";
  if (type === "too_short") return "Regenerate with stronger spelling patterns for the selected level.";
  if (type === "skill_mismatch_prefix") return "Generated words did not match the selected prefix focus.";
  if (type === "skill_mismatch_suffix") return "Generated words did not match the selected suffix focus.";
  if (type === "homophone_pair_missing") return "This homophone item is missing its matching word pair.";
  if (type === "homophone_meaning_missing") return "This homophone item is missing a meaning difference explanation.";
  if (type === "compound_split_missing") return "This compound word item does not show two joined words.";
  if (type === "weak_sentence_context") return "Regenerate with stronger sentence context for each spelling word.";
  if (type === "incomplete") return `Incomplete spelling item rejected: ${word || "unknown"}`;
  return "Invalid spelling content.";
}

function difficultyThresholdByType(type: QualityInput["type"], difficulty: number, yearNumber: number) {
  const safeDifficulty = Math.max(1, Math.min(5, difficulty));
  const yearBoost = yearNumber >= 5 ? 8 : yearNumber >= 3 ? 4 : 0;
  if (type === "reading") {
    return 20 + (safeDifficulty - 1) * 15 + yearBoost;
  }
  if (type === "maths") {
    return safeDifficulty >= 4 ? 2 : 1;
  }
  return 35 + (safeDifficulty - 1) * 8 + yearBoost;
}

function validateSkillTopicMatch(item: Record<string, unknown>, skillFocus?: string, topic?: string) {
  const expectedTokens = [...tokenize(skillFocus), ...tokenize(topic)];
  if (!expectedTokens.length) return true;
  if (expectedTokens.length <= 2) return true;
  return hasTokenOverlap(itemText(item), expectedTokens);
}

function classifySubjectMatch(subject: string | undefined, text: string, type: QualityInput["type"]) {
  const normalized = String(subject ?? "").toLowerCase();
  const lower = text.toLowerCase();
  if (type === "maths") return hasMathContent(lower);
  if (type === "languages" || ((normalized.includes("french") || normalized.includes("german") || normalized.includes("spanish") || normalized.includes("latin") || normalized.includes("mandarin") || normalized.includes("arabic")) && !normalized.includes("english-language"))) {
    return /(translation|vocabulary|verb|tense|conjugat|speaking|listening|bonjour|hola|guten|fran|espan|deutsch)/i.test(lower);
  }
  if (normalized.includes("science") || type === "reading" && /(science|biology|chemistry|physics)/i.test(normalized)) {
    return /(science|experiment|evidence|hypothesis|cell|force|energy|matter|atom|ecosystem|temperature)/i.test(lower);
  }
  if (normalized.includes("history")) {
    return /(history|timeline|source|evidence|past|century|era|civilisation|war|monarch|parliament)/i.test(lower);
  }
  if (normalized.includes("geography")) {
    return /(geography|map|climate|river|coast|mountain|region|continent|settlement|population)/i.test(lower);
  }
  if (type === "spelling" || type === "phonics") return !hasMathContent(lower);
  if (type === "reading" || type === "writing" || type === "grammar" || type === "punctuation") return !hasMathContent(lower);
  return true;
}

function pushMismatch(acc: ValidationAccumulator, type: "year" | "subject" | "skill" | "difficulty") {
  if (type === "year") acc.yearMismatches += 1;
  if (type === "subject") acc.subjectMismatches += 1;
  if (type === "skill") acc.skillTopicMismatches += 1;
  if (type === "difficulty") acc.difficultyMismatches += 1;
}

function shouldRepair(mode: QualityInput["mode"]) {
  return mode === "repair";
}

function addOrReject(
  acc: ValidationAccumulator,
  mode: QualityInput["mode"],
  item: Record<string, unknown>,
  keyLabel: string,
  errors: string[],
) {
  if (!errors.length) {
    acc.cleaned.push(item);
    return;
  }
  if (shouldRepair(mode)) {
    acc.errors.push(...errors);
    acc.fixesApplied.push(`Removed invalid item: ${keyLabel}`);
    acc.removedWords.push(keyLabel);
    return;
  }
  acc.errors.push(...errors);
}

function buildMeta(input: {
  acc: ValidationAccumulator;
  requestedCount?: number;
  finalCount: number;
}): QualityMeta {
  const requested = input.requestedCount ?? input.finalCount;
  return {
    valid: input.finalCount > 0,
    repaired: input.acc.fixesApplied.length > 0 || input.acc.errors.length > 0,
    errors: input.acc.errors,
    fixesApplied: input.acc.fixesApplied,
    removedWords: input.acc.removedWords,
    regeneratedCount: 0,
    requestedCount: requested,
    finalCount: input.finalCount,
    yearLevelMatch: input.acc.yearMismatches === 0,
    subjectMatch: input.acc.subjectMismatches === 0,
    skillTopicMatch: input.acc.skillTopicMismatches === 0,
    difficultyMatch: input.acc.difficultyMismatches === 0,
  };
}

function validateSpellingItems(
  records: unknown[],
  input: QualityInput,
): { cleaned: Record<string, unknown>[]; meta: QualityMeta } {
  const seen = new Set<string>();
  const acc = createAccumulator();
  const phonicsStage = phonicsStageFromSkillFocus(input.skillFocus);
  const safeDifficulty = Math.max(1, Math.min(5, typeof input.difficulty === "number" ? input.difficulty : 3));
  const safeYearGroup = String(input.yearGroup ?? "Year 1");

  for (const item of records) {
    if (!item || typeof item !== "object") {
      acc.errors.push("invalid_structure");
      continue;
    }

    const data = item as Record<string, unknown>;
    const word = normalizeWord(data.word);
    if (!word) {
      acc.errors.push("incomplete:unknown");
      continue;
    }

    if (seen.has(word)) {
      addOrReject(acc, input.mode, data, word, [`duplicate:${word}`]);
      continue;
    }

    if (input.skillFocus === "Silent e" && !isSilentEWord(word)) {
      addOrReject(acc, input.mode, data, word, [`invalid_silent_e:${word}`]);
      continue;
    }

    if (phonicsStage && !matchesPhonicsStage(word, phonicsStage)) {
      addOrReject(acc, input.mode, data, word, [`phonics_stage_${phonicsStage}:${word}`]);
      continue;
    }

    const hint = String(data.hint ?? "").trim();
    const sentenceContext = String(data.sentenceContext ?? "").trim();
    if (!hint || !sentenceContext) {
      addOrReject(acc, input.mode, data, word, [`incomplete:${word}`]);
      continue;
    }

    if (hasMathContent(itemText(item))) {
      addOrReject(acc, input.mode, data, word, [`invalid_content:${word}`]);
      continue;
    }

    const assessment = assessSpellingItemForDifficulty({
      word,
      sentenceContext,
      skillFocus: String(input.skillFocus ?? ""),
      yearGroup: safeYearGroup,
      keyStage: input.keyStage ?? null,
      difficulty: safeDifficulty,
      item: data,
    });

    const errors: string[] = [];
    if (!assessment.valid) {
      errors.push(...assessment.issues);
      if (assessment.issues.some((entry) => entry.startsWith("too_"))) pushMismatch(acc, "difficulty");
      if (assessment.issues.some((entry) => entry.startsWith("skill_mismatch") || entry.includes("homophone") || entry.includes("compound"))) pushMismatch(acc, "skill");
    }

    if (!classifySubjectMatch(input.subject, itemText(data), input.type)) {
      errors.push(`subject_mismatch:${word}`);
      pushMismatch(acc, "subject");
    }

    if (errors.length) {
      addOrReject(acc, input.mode, data, word, errors);
      continue;
    }

    seen.add(word);
    acc.cleaned.push({
      ...data,
      word,
      phonicsStage: phonicsStage ?? null,
      spellingPattern: String(data.spellingPattern ?? assessment.spellingPattern),
      whyItMatchesSkill: String(data.whyItMatchesSkill ?? assessment.whyItMatchesSkill),
      validationLevel: String(data.validationLevel ?? assessment.validationLevel),
      ageSuitability: assessment.validationLevel,
      skillFocusMatch: assessment.spellingPattern !== "none",
    });
  }

  const meta = buildMeta({
    acc,
    requestedCount: input.requestedCount,
    finalCount: acc.cleaned.length,
  });

  return { cleaned: acc.cleaned, meta };
}

function validateStructuredItems(records: unknown[], input: QualityInput): { cleaned: Record<string, unknown>[]; meta: QualityMeta } {
  const acc = createAccumulator();
  const seen = new Set<string>();
  const yearNumber = parseYearNumber(input.yearGroup);
  const safeDifficulty = Math.max(1, Math.min(5, Number.isFinite(input.difficulty) ? Number(input.difficulty) : 3));

  for (const item of records) {
    if (!item || typeof item !== "object") {
      acc.errors.push("invalid_structure");
      continue;
    }

    const data = item as Record<string, unknown>;
    const prompt = String(data.question ?? data.prompt ?? data.sentence ?? data.targetVocabulary ?? "").trim();
    const answer = data.answer;
    const key = prompt.toLowerCase();
    const issues: string[] = [];

    if (!prompt && input.type !== "reading") {
      issues.push("missing_prompt");
    }
    if ((answer === undefined || answer === null || answer === "") && input.type !== "reading") {
      issues.push("missing_answer");
    }
    if (key && seen.has(key)) {
      issues.push(`duplicate:${prompt}`);
    }

    if (input.type === "reading") {
      const passage = String(data.passage ?? "").trim();
      const hasQuestion = Boolean(data.question || data.prompt);
      const hasQuestionArray = Array.isArray(data.questions) && data.questions.length > 0;
      if (!passage) issues.push("reading_missing_passage");
      if (!hasQuestion && !hasQuestionArray) issues.push("reading_missing_questions");
      if (hasQuestion && !data.answer) issues.push("reading_missing_answer");

      const minPassageWords = safeDifficulty >= 5 ? 24 : safeDifficulty >= 4 ? 12 : 4;
      if (passage.split(/\s+/).filter(Boolean).length < minPassageWords) {
        issues.push("difficulty_too_easy");
        pushMismatch(acc, "difficulty");
      }
    }

    if (input.type === "maths") {
      if (!hasMathContent(`${prompt} ${String(answer ?? "")}`)) {
        issues.push("maths_subject_mismatch");
        pushMismatch(acc, "subject");
      }
      const operators = (prompt.match(/[+\-x÷*/]/g) ?? []).length;
      const hasReasoningWords = /(difference|total|fraction|decimal|ratio|multi-step|two-step|explain|show your working)/i.test(prompt);
      const minComplexity = difficultyThresholdByType("maths", safeDifficulty, yearNumber);
      if (safeDifficulty >= 4 && operators + (hasReasoningWords ? 1 : 0) < minComplexity) {
        issues.push("difficulty_too_easy");
        pushMismatch(acc, "difficulty");
      }
    }

    if (input.type === "languages") {
      const hasLanguageSignal = /(translation|vocabulary|verb|tense|conjugat|listening|speaking|bonjour|hola|guten)/i.test(itemText(data))
        || typeof data.englishMeaning === "string"
        || typeof data.targetVocabulary === "string"
        || typeof data.activityMode === "string";
      if (!hasLanguageSignal) {
        issues.push("language_subject_mismatch");
        pushMismatch(acc, "subject");
      }
      if (isReadingComprehensionSkill(input.skillFocus) && !data.passage) {
        issues.push("reading_missing_passage");
      }
    }

    if (input.type === "writing" || input.type === "grammar" || input.type === "punctuation") {
      const minPrompt = difficultyThresholdByType(input.type, safeDifficulty, yearNumber);
      if (prompt.length < minPrompt) {
        issues.push("difficulty_too_easy");
        pushMismatch(acc, "difficulty");
      }
    }

    if (!classifySubjectMatch(input.subject, itemText(data), input.type)) {
      issues.push("subject_mismatch");
      pushMismatch(acc, "subject");
    }

    const strictSkillTopic = input.type === "languages" || input.type === "reading" || input.type === "writing";
    if (strictSkillTopic && !validateSkillTopicMatch(data, input.skillFocus, input.topic)) {
      issues.push("skill_topic_mismatch");
      pushMismatch(acc, "skill");
    }

    const itemYearNumber = parseYearNumber(String(data.yearGroup ?? input.yearGroup ?? "Year 1"));
    if (Math.abs(itemYearNumber - yearNumber) > 1) {
      issues.push("year_mismatch");
      pushMismatch(acc, "year");
    }

    if (issues.length) {
      addOrReject(acc, input.mode, data, prompt || String(data.id ?? "item"), issues);
      continue;
    }

    seen.add(key);
    acc.cleaned.push(data);
  }

  const meta = buildMeta({
    acc,
    requestedCount: input.requestedCount,
    finalCount: acc.cleaned.length,
  });

  return { cleaned: acc.cleaned, meta };
}

export function validateAiContentQuality(input: QualityInput): QualityResult {
  const records = asArray(input.items);
  if (!records.length) return { ok: false, error: "No generated content to save." };

  const selectedStage = input.keyStage?.trim();
  if (selectedStage && !KEY_STAGES.includes(selectedStage as (typeof KEY_STAGES)[number])) {
    return { ok: false, error: "Invalid key stage." };
  }

  if (input.type === "spelling" || input.type === "phonics") {
    const validated = validateSpellingItems(records, input);
    if (input.mode === "repair") {
      if (!validated.cleaned.length) {
        const label = input.type === "phonics" ? "phonics" : "spelling";
        return {
          ok: false,
          error: `No valid ${label} content remained after validation.`,
          cleanedItems: validated.cleaned,
          meta: validated.meta,
        };
      }
      return { ok: true, cleanedItems: validated.cleaned, meta: validated.meta };
    }

    if (validated.meta.errors.length > 0) {
      const firstError = validated.meta.errors.find((value) => value.includes(":"));
      return {
        ok: false,
        error: createSpellingErrorMessage(firstError ?? validated.meta.errors[0] ?? "invalid"),
        cleanedItems: validated.cleaned,
        meta: validated.meta,
      };
    }

    return { ok: true, cleanedItems: validated.cleaned, meta: validated.meta };
  }

  const validated = validateStructuredItems(records, input);

  if (input.mode === "repair") {
    if (!validated.cleaned.length) {
      return {
        ok: false,
        error: `No valid ${input.type} content remained after validation.`,
        cleanedItems: validated.cleaned,
        meta: validated.meta,
      };
    }
    return { ok: true, cleanedItems: validated.cleaned, meta: validated.meta };
  }

  if (validated.meta.errors.length > 0) {
    const errors = validated.meta.errors;
    if (errors.includes("reading_missing_passage")) return { ok: false, error: "Reading output must include a passage.", cleanedItems: validated.cleaned, meta: validated.meta };
    if (errors.includes("reading_missing_questions")) return { ok: false, error: "Reading output must include questions.", cleanedItems: validated.cleaned, meta: validated.meta };
    if (errors.some((entry) => entry.includes("subject_mismatch") || entry.includes("maths_subject_mismatch") || entry.includes("language_subject_mismatch"))) {
      return { ok: false, error: "Generated content did not match the selected subject.", cleanedItems: validated.cleaned, meta: validated.meta };
    }
    if (errors.includes("missing_prompt")) return { ok: false, error: "Generated content must include a prompt or question.", cleanedItems: validated.cleaned, meta: validated.meta };
    if (errors.includes("missing_answer")) return { ok: false, error: "Generated content must include an answer.", cleanedItems: validated.cleaned, meta: validated.meta };
    if (errors.includes("difficulty_too_easy")) return { ok: false, error: "Generated content was too easy for the selected year and difficulty.", cleanedItems: validated.cleaned, meta: validated.meta };
    if (errors.some((entry) => entry.includes("skill_topic_mismatch"))) return { ok: false, error: "Generated content did not match the selected skill focus/topic.", cleanedItems: validated.cleaned, meta: validated.meta };
    const first = errors[0] ?? "validation_failed";
    if (first.includes("duplicate:")) return { ok: false, error: `Duplicate item rejected: ${first.replace("duplicate:", "")}`, cleanedItems: validated.cleaned, meta: validated.meta };
    return { ok: false, error: "Generated content failed validation.", cleanedItems: validated.cleaned, meta: validated.meta };
  }

  return { ok: true, cleanedItems: validated.cleaned, meta: validated.meta };
}
