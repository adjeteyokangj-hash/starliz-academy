export type CurriculumQualityResult = {
  passed: boolean;
  score: number;
  warnings: string[];
  blockingIssues: string[];
  qualityTags: string[];
};

export type CurriculumQualityInput = {
  item?: unknown;
  items?: unknown;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  skillFocus?: string | null;
  topic?: string | null;
  difficulty?: number | null;
};

type ItemRecord = Record<string, unknown>;

const GCSE_COMMAND_WORDS = [
  "calculate",
  "solve",
  "simplify",
  "estimate",
  "compare",
  "prove",
  "justify",
  "explain",
  "evaluate",
  "analyse",
  "describe",
];

const PLACEHOLDER_PATTERNS = [
  /\bmodel (answer|response|science answer|target-language translation)\b/i,
  /\bcurriculum practice\b/i,
  /\bcore skill\b/i,
  /\boption [abc]\b/i,
  /\bplaceholder\b/i,
  /\bTODO\b/i,
  /\blorem ipsum\b/i,
];

function asRecord(value: unknown): ItemRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ItemRecord : {};
}

function asItems(value: unknown): ItemRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is ItemRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as ItemRecord;
    if (Array.isArray(record.items)) return asItems(record.items);
    if (Array.isArray(record.questions)) return [record];
    return [record];
  }
  return [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function compact(value: unknown): string {
  return lower(value).replace(/[^a-z0-9+\-*/÷=.\s]/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(value: unknown): number {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function questionText(item: ItemRecord): string {
  return text(item.question ?? item.prompt ?? item.word ?? item.title);
}

function answerText(item: ItemRecord): string {
  return text(item.answer ?? item.correctAnswer ?? item.expectedAnswer);
}

function explanationText(item: ItemRecord): string {
  return text(item.explanation ?? item.workedSolution ?? item.hint);
}

function passageText(item: ItemRecord): string {
  return text(item.passage ?? item.text ?? item.extract);
}

function allItemText(item: ItemRecord): string {
  return [
    item.subject,
    item.contentType,
    item.type,
    item.topic,
    item.skillFocus,
    item.question,
    item.prompt,
    item.passage,
    item.word,
    item.answer,
    item.correctAnswer,
    item.explanation,
    item.hint,
    item.sentenceContext,
  ].map(text).filter(Boolean).join(" ");
}

function optionsFor(item: ItemRecord): string[] {
  const raw = item.options ?? item.choices ?? item.answerOptions;
  return Array.isArray(raw) ? raw.map(text) : [];
}

function normalizeOption(value: unknown): string {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function createResult(input: {
  score: number;
  warnings?: string[];
  blockingIssues?: string[];
  qualityTags?: string[];
}): CurriculumQualityResult {
  const blockingIssues = unique(input.blockingIssues ?? []);
  return {
    passed: blockingIssues.length === 0,
    score: Math.max(0, Math.min(100, Math.round(input.score))),
    warnings: unique(input.warnings ?? []),
    blockingIssues,
    qualityTags: unique(input.qualityTags ?? []),
  };
}

function mergeResults(results: CurriculumQualityResult[]): CurriculumQualityResult {
  if (!results.length) {
    return createResult({
      score: 0,
      blockingIssues: ["no_content_items"],
      qualityTags: ["empty_content"],
    });
  }

  const averageScore = results.reduce((sum, result) => sum + result.score, 0) / results.length;
  return createResult({
    score: averageScore,
    warnings: results.flatMap((result) => result.warnings),
    blockingIssues: results.flatMap((result) => result.blockingIssues),
    qualityTags: results.flatMap((result) => result.qualityTags),
  });
}

function isGcse(input: CurriculumQualityInput, item: ItemRecord): boolean {
  const stage = `${input.keyStage ?? ""} ${input.yearGroup ?? ""} ${input.subject ?? ""} ${item.keyStage ?? ""} ${item.yearGroup ?? ""} ${item.subject ?? ""}`.toLowerCase();
  return /\b(gcse|ks4|year 10|year 11)\b/.test(stage);
}

function hasGcseCommandWord(value: string): boolean {
  const normalized = lower(value);
  return GCSE_COMMAND_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(normalized));
}

function hasMathsSignal(value: string): boolean {
  return /(\d+\s*[+\-x÷*/]\s*\d+|\bequation\b|\bfraction\b|\bdecimal\b|\bratio\b|\bpercentage\b|\bprobability\b|\balgebra\b|\bperimeter\b|\barea\b|\bmean\b|\bmedian\b|\bsequence\b|\bscale\b|\bgraph\b|\bangle\b|\btriangle\b|\bmultiplication\b|\bmultiply(?:ing|ied)?\b|\bdivision\b|\bdivide(?:d|s|ing)?\b|\bremainder\b|\bshare(?:d|s|ing)?\b|\bequal\s+groups?\b|\btimes\s+tables?\b|\bhow\s+many\b|\baltogether\b|\btotal\b|\beach\b|\brows?\b|\bgroups?\b)/i.test(value);
}

function isComputeOnlyMaths(prompt: string): boolean {
  const normalized = compact(prompt);
  if (/^(compute|calculate|work out|find)\s+[\d\s+\-x÷*/=.]+$/.test(normalized)) return true;
  if (/^(what is|find)\s+\d+\s*[+\-x÷*/]\s*\d+\??$/.test(normalized)) return true;
  return wordCount(prompt) <= 8 && /\d+\s*[+\-x÷*/]\s*\d+/.test(prompt) && !/\b(explain|justify|show|method|why|compare|reason|context|equation|ratio|fraction|probability)\b/i.test(prompt);
}

function hasReasoningDemand(value: string): boolean {
  return /\b(explain|justify|show your working|method|because|therefore|compare|prove|reason|why|error|mistake|which is larger|check)\b/i.test(value);
}

function hasVagueExplanation(explanation: string): boolean {
  if (!explanation) return true;
  if (wordCount(explanation) < 6) return true;
  return /\b(work it out|use the method|model answer|check carefully|review the question)\b/i.test(explanation) && !/\b(because|therefore|so|first|then|divide|multiply|subtract|add|evidence)\b/i.test(explanation);
}

function containsPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

export function detectWeakDistractors(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const answer = answerText(item);
  const options = optionsFor(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags: string[] = [];

  if (options.length === 0) {
    return createResult({ score: 92, qualityTags: ["no_distractors_required"] });
  }

  const normalizedOptions = options.map(normalizeOption);
  const answerNorm = normalizeOption(answer);
  if (options.length < 3) blockingIssues.push("weak_distractors_too_few_options");
  if (new Set(normalizedOptions).size !== normalizedOptions.length) blockingIssues.push("weak_distractors_duplicate_options");
  if (answer && !normalizedOptions.includes(answerNorm)) blockingIssues.push("weak_distractors_answer_missing");

  const giveawayPatterns = [/all of the above/i, /none of the above/i, /obviously/i, /always correct/i, /not sure/i];
  if (options.some((option) => giveawayPatterns.some((pattern) => pattern.test(option)))) {
    blockingIssues.push("weak_distractors_giveaway_option");
  }

  const lengths = options.map((option) => option.length);
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);
  if (maxLength >= Math.max(18, minLength * 3) && answer.length === maxLength) {
    warnings.push("answer_option_length_giveaway");
    tags.push("giveaway_answer_risk");
  }

  if (options.some((option) => normalizeOption(option) === "")) blockingIssues.push("weak_distractors_blank_option");

  return createResult({
    score: 100 - blockingIssues.length * 25 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: [...tags, blockingIssues.length ? "weak_distractors" : "distractors_ok"],
  });
}

export function detectRepetitiveQuestionStructures(input: CurriculumQualityInput): CurriculumQualityResult {
  const items = asItems(input.items ?? input.item);
  const shapes = items.map((item) => compact(questionText(item))
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/\b[a-z]\b/g, "x"));
  const counts = new Map<string, number>();
  for (const shape of shapes) {
    if (!shape) continue;
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count >= 2);
  const warnings = repeated.map(([shape, count]) => `Repeated question structure (${count}x): ${shape}`);
  return createResult({
    score: 100 - warnings.length * 12,
    warnings,
    qualityTags: warnings.length ? ["repetitive_structures"] : ["structure_variety_ok"],
  });
}

export function validateMathsQuestionQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const prompt = questionText(item);
  const explanation = explanationText(item);
  const full = `${prompt} ${answerText(item)} ${explanation}`;
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags: string[] = ["maths_quality"];

  if (!prompt) blockingIssues.push("maths_missing_prompt");
  if (!answerText(item)) blockingIssues.push("maths_missing_answer");
  if (!hasMathsSignal(full)) blockingIssues.push("maths_subject_fit_missing");
  if (containsPlaceholder(full)) blockingIssues.push("placeholder_style_content");
  if (isComputeOnlyMaths(prompt)) warnings.push("shallow_maths_prompt");
  if (hasVagueExplanation(explanation)) warnings.push("vague_explanation");
  if (Number(input.difficulty ?? item.difficulty ?? 3) >= 4 && !hasReasoningDemand(full)) warnings.push("maths_reasoning_demand_weak");

  const distractors = detectWeakDistractors({ ...input, item });
  blockingIssues.push(...distractors.blockingIssues);
  warnings.push(...distractors.warnings);
  tags.push(...distractors.qualityTags);

  return createResult({
    score: 100 - blockingIssues.length * 28 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: tags,
  });
}

export function validateGcseMathsQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const base = validateMathsQuestionQuality(input);
  const prompt = questionText(item);
  const full = `${prompt} ${answerText(item)} ${explanationText(item)}`;
  const warnings = [...base.warnings];
  const blockingIssues = [...base.blockingIssues];
  const tags = [...base.qualityTags, "gcse_maths_quality"];

  if (isComputeOnlyMaths(prompt)) blockingIssues.push("gcse_maths_compute_only");
  if (!hasGcseCommandWord(prompt)) blockingIssues.push("gcse_maths_weak_command_word_usage");
  if (!/\b(algebra|equation|ratio|proportion|probability|sequence|graph|angle|circle|simultaneous|factorise|expand|gradient|percentage|frequency|trigonometry|triangle)\b/i.test(full)) {
    blockingIssues.push("gcse_maths_topic_depth_missing");
  }
  if (!hasReasoningDemand(full) && !/\bstate\b/i.test(prompt)) warnings.push("gcse_maths_reasoning_or_method_weak");

  return createResult({
    score: Math.min(base.score, 100 - blockingIssues.length * 25 - warnings.length * 6),
    warnings,
    blockingIssues,
    qualityTags: tags,
  });
}

export function validateReadingPassageQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const passage = passageText(item);
  const question = questionText(item);
  const answer = answerText(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags = ["reading_quality"];

  if (!passage) blockingIssues.push("reading_missing_passage");
  if (!question && !Array.isArray(item.questions)) blockingIssues.push("reading_missing_question");
  if (!answer && !Array.isArray(item.answers) && !Array.isArray(item.questions)) blockingIssues.push("reading_missing_answer");
  if (passage && wordCount(passage) < 35) blockingIssues.push("poor_passage_quality_too_short");
  if (containsPlaceholder(`${passage} ${question} ${answer}`)) blockingIssues.push("placeholder_style_content");

  const passageTokens = new Set(compact(passage).split(/\s+/).filter((token) => token.length >= 4));
  const answerTokens = compact(answer).split(/\s+/).filter((token) => token.length >= 4);
  const hasEvidence = answerTokens.length === 0 || answerTokens.some((token) => passageTokens.has(token));
  const questionNeedsEvidence = /\b(according to|evidence|quotation|infer|why|how|what does the text|which detail)\b/i.test(question);
  if (passage && answer && !hasEvidence && questionNeedsEvidence) blockingIssues.push("poor_question_answer_alignment_no_text_evidence");
  if (passage && !/[.!?]/.test(passage)) warnings.push("poor_passage_quality_sentence_structure");

  if (Array.isArray(item.questions)) {
    for (const row of item.questions) {
      const child = asRecord(row);
      const childQuestion = questionText(child);
      const childAnswer = answerText(child);
      if (!childQuestion || !childAnswer) blockingIssues.push("reading_question_answer_incomplete");
      const childTokens = compact(childAnswer).split(/\s+/).filter((token) => token.length >= 4);
      if (childTokens.length && !childTokens.some((token) => passageTokens.has(token)) && /\b(evidence|according|infer|why|how|which detail)\b/i.test(childQuestion)) {
        blockingIssues.push("poor_question_answer_alignment_no_text_evidence");
      }
      const distractors = detectWeakDistractors({ ...input, item: child });
      blockingIssues.push(...distractors.blockingIssues);
      warnings.push(...distractors.warnings);
    }
  }

  return createResult({
    score: 100 - blockingIssues.length * 24 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: tags,
  });
}

export function validateGrammarQuestionQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const prompt = questionText(item);
  const full = allItemText(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags = ["grammar_quality"];

  if (!prompt) blockingIssues.push("grammar_missing_prompt");
  if (!answerText(item)) blockingIssues.push("grammar_missing_answer");
  if (!/\b(noun|verb|adjective|adverb|clause|tense|sentence|agreement|relative|apostrophe|comma|punctuation|rewrite|correct|select)\b/i.test(full)) {
    blockingIssues.push("grammar_subject_fit_missing");
  }
  if (containsPlaceholder(full)) blockingIssues.push("placeholder_style_content");
  if (hasVagueExplanation(explanationText(item))) warnings.push("vague_explanation");

  const distractors = detectWeakDistractors({ ...input, item });
  blockingIssues.push(...distractors.blockingIssues);
  warnings.push(...distractors.warnings);

  return createResult({
    score: 100 - blockingIssues.length * 24 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: [...tags, ...distractors.qualityTags],
  });
}

export function validateScienceQuestionQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const prompt = questionText(item);
  const full = allItemText(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags = ["science_quality"];

  if (!prompt) blockingIssues.push("science_missing_prompt");
  if (!answerText(item)) blockingIssues.push("science_missing_answer");
  if (!/\b(force|energy|circuit|voltage|current|cell|photosynthesis|atom|reaction|acid|alkali|ecosystem|gravity|diffusion|osmosis|enzyme|wave|mass|weight|bond|ion|ph)\b/i.test(full)) {
    blockingIssues.push("science_subject_fit_missing");
  }
  if (containsPlaceholder(full)) blockingIssues.push("placeholder_style_content");
  if (isGcse(input, item) && !hasGcseCommandWord(prompt)) warnings.push("gcse_science_command_word_weak");
  if (hasVagueExplanation(explanationText(item))) warnings.push("vague_explanation");

  const distractors = detectWeakDistractors({ ...input, item });
  blockingIssues.push(...distractors.blockingIssues);
  warnings.push(...distractors.warnings);

  return createResult({
    score: 100 - blockingIssues.length * 26 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: [...tags, ...distractors.qualityTags],
  });
}

function validateSpellingOrPhonicsQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const full = allItemText(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];
  const tags = ["spelling_phonics_quality"];

  if (!text(item.word) && !questionText(item)) blockingIssues.push("spelling_phonics_missing_word_or_prompt");
  if (!text(item.hint) && !text(item.sentenceContext) && !explanationText(item)) warnings.push("spelling_phonics_support_context_weak");
  if (hasMathsSignal(full)) blockingIssues.push("spelling_phonics_subject_drift_maths");
  if (containsPlaceholder(full)) blockingIssues.push("placeholder_style_content");

  return createResult({
    score: 100 - blockingIssues.length * 30 - warnings.length * 8,
    warnings,
    blockingIssues,
    qualityTags: tags,
  });
}

function validateWritingQuestionQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const item = asRecord(input.item ?? input.items);
  const prompt = questionText(item);
  const full = allItemText(item);
  const warnings: string[] = [];
  const blockingIssues: string[] = [];

  if (!prompt) blockingIssues.push("writing_missing_prompt");
  if (!answerText(item)) warnings.push("writing_model_answer_missing_or_thin");
  if (!/\b(write|rewrite|draft|paragraph|sentence|explain|persuade|describe|edit|improve|response|balanced)\b/i.test(full)) {
    blockingIssues.push("writing_subject_fit_missing");
  }
  if (containsPlaceholder(full)) blockingIssues.push("placeholder_style_content");
  if (wordCount(prompt) < 7) warnings.push("writing_prompt_too_thin");

  return createResult({
    score: 100 - blockingIssues.length * 24 - warnings.length * 7,
    warnings,
    blockingIssues,
    qualityTags: ["writing_quality"],
  });
}

export function validateGcseEnglishQuality(input: CurriculumQualityInput): CurriculumQualityResult {
  const reading = validateReadingPassageQuality(input);
  const item = asRecord(input.item ?? input.items);
  const prompt = questionText(item);
  const full = allItemText(item);
  const warnings = [...reading.warnings];
  const blockingIssues = [...reading.blockingIssues];
  const tags = [...reading.qualityTags, "gcse_english_quality"];

  if (!hasGcseCommandWord(prompt) && !/\b(infer|language|structure|evidence|quotation|evaluate|analyse|compare)\b/i.test(full)) {
    blockingIssues.push("gcse_english_weak_command_word_usage");
  }
  if (!/\b(language|structure|writer|quotation|evidence|effect|reader|tone|viewpoint|inference)\b/i.test(full)) {
    blockingIssues.push("gcse_english_literary_or_language_focus_missing");
  }

  return createResult({
    score: Math.min(reading.score, 100 - blockingIssues.length * 22 - warnings.length * 6),
    warnings,
    blockingIssues,
    qualityTags: tags,
  });
}

export function validateCurriculumContentQuality(input: CurriculumQualityInput & {
  type?: "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" | "languages" | "science";
}): CurriculumQualityResult {
  const items = asItems(input.items ?? input.item);
  const type = lower(input.type ?? input.subject ?? "");
  const itemResults = items.map((item) => {
    if ((type.includes("gcse") && type.includes("math")) || (type === "maths" && isGcse(input, item))) {
      return validateGcseMathsQuality({ ...input, item });
    }
    if (type.includes("math")) return validateMathsQuestionQuality({ ...input, item });
    if ((type.includes("gcse") && type.includes("english")) || (type === "reading" && isGcse(input, item))) {
      return validateGcseEnglishQuality({ ...input, item });
    }
    if (type === "writing") return validateWritingQuestionQuality({ ...input, item });
    if (type.includes("reading") || type.includes("english")) return validateReadingPassageQuality({ ...input, item });
    if (type.includes("grammar") || type.includes("punctuation")) return validateGrammarQuestionQuality({ ...input, item });
    if (type.includes("science") || type.includes("biology") || type.includes("chemistry") || type.includes("physics")) return validateScienceQuestionQuality({ ...input, item });
    if (type.includes("phonics") || type.includes("spelling")) return validateSpellingOrPhonicsQuality({ ...input, item });
    return createResult({
      score: containsPlaceholder(allItemText(item)) ? 45 : 82,
      blockingIssues: containsPlaceholder(allItemText(item)) ? ["placeholder_style_content"] : [],
      qualityTags: ["generic_quality"],
    });
  });

  const repetitive = detectRepetitiveQuestionStructures({ ...input, items });
  return mergeResults([...itemResults, repetitive]);
}
