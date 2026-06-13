import {
  keyStageForYearGroup,
  normalizeKeyStage,
  normalizeSubject,
  normalizeYearGroup,
  type Subject,
} from "@/lib/curriculum";

export type BlackBoxContentDecision = "APPROVE" | "RECLASSIFY" | "REJECT" | "NEEDS_ADMIN_REVIEW";

export type BlackBoxScoreDimension =
  | "subject"
  | "strand"
  | "keyStage"
  | "yearGroup"
  | "level"
  | "topicSkillFocus"
  | "questionType"
  | "difficulty"
  | "answerComplexity"
  | "vocabularyReadability";

export type BlackBoxDimensionScore = {
  dimension: BlackBoxScoreDimension;
  score: number;
  maxScore: number;
  passed: boolean;
  reasons: string[];
};

export type BlackBoxGeneratedItem = Record<string, unknown>;

export type BlackBoxContentTestInput = {
  subject: string;
  strand?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  level?: number | null;
  difficulty?: number | null;
  topic?: string | null;
  skillFocus?: string | null;
  questionType?: string | null;
  items: unknown;
};

export type BlackBoxItemResult = {
  index: number;
  score: number;
  maxScore: number;
  decision: BlackBoxContentDecision;
  declaredLevel: number;
  estimatedLevel: number;
  recommendedLevel: number;
  levelDelta: number;
  levelRecommendation: {
    action: "keep" | "promote" | "demote";
    amount: number;
    reason: string;
  };
  inferredSubject: string | null;
  inferredStrand: string | null;
  recommendedSubject?: string | null;
  recommendedStrand?: string | null;
  dimensions: BlackBoxDimensionScore[];
  reasons: string[];
};

export type BlackBoxContentTestResult = {
  decision: BlackBoxContentDecision;
  score: number;
  maxScore: number;
  passRate: number;
  reasons: string[];
  recommendation?: {
    subject?: string;
    strand?: string;
  };
  itemResults: BlackBoxItemResult[];
};

const DIMENSION_MAX: Record<BlackBoxScoreDimension, number> = {
  subject: 16,
  strand: 10,
  keyStage: 10,
  yearGroup: 10,
  level: 6,
  topicSkillFocus: 10,
  questionType: 8,
  difficulty: 12,
  answerComplexity: 10,
  vocabularyReadability: 8,
};

const SUBJECT_SIGNAL_PATTERNS: Array<{ subject: Subject; patterns: RegExp[] }> = [
  { subject: "maths", patterns: [/\b(calculate|solve|equation|fraction|decimal|ratio|percentage|algebra|multiply|divide|subtract|add|number)\b/i, /\d+\s*[+\-x÷*/]\s*\d+/i] },
  { subject: "science", patterns: [/\b(science|force|energy|circuit|voltage|current|cell|photosynthesis|atom|reaction|acid|alkali|ecosystem|gravity)\b/i] },
  { subject: "reading", patterns: [/\b(passage|author|infer|inference|evidence from the text|character|theme|comprehension|writer)\b/i] },
  { subject: "spelling", patterns: [/\b(spell|spelling|phonics|grapheme|suffix|prefix|homophone|word family)\b/i] },
  { subject: "grammar", patterns: [/\b(grammar|noun|verb|adjective|adverb|clause|sentence type|tense)\b/i] },
  { subject: "punctuation", patterns: [/\b(punctuation|comma|apostrophe|full stop|semicolon|colon|question mark|exclamation mark)\b/i] },
  { subject: "writing", patterns: [/\b(write|writing|paragraph|narrative|persuasive|description|draft|edit)\b/i] },
];

const ENGLISH_STRANDS = new Set(["reading", "spelling", "grammar", "punctuation", "writing", "vocabulary"]);

function asItems(items: unknown): BlackBoxGeneratedItem[] {
  const value = items && typeof items === "object" && !Array.isArray(items) && Array.isArray((items as Record<string, unknown>).items)
    ? (items as Record<string, unknown>).items
    : items;
  if (Array.isArray(value)) return value.filter((item): item is BlackBoxGeneratedItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (value && typeof value === "object") return [value as BlackBoxGeneratedItem];
  return [];
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeToken(value: unknown): string {
  return clean(value).toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: unknown): string[] {
  return normalizeToken(value).split(/\s+/).filter((part) => part.length >= 3);
}

function itemText(item: BlackBoxGeneratedItem): string {
  return [
    item.subject,
    item.strand,
    item.contentType,
    item.type,
    item.topic,
    item.skillFocus,
    item.question,
    item.prompt,
    item.passage,
    item.word,
    item.answer,
    item.explanation,
    item.hint,
    item.sentenceContext,
  ].map(clean).filter(Boolean).join(" ");
}

function itemEvidenceText(item: BlackBoxGeneratedItem): string {
  return [
    item.topic,
    item.skillFocus,
    item.question,
    item.prompt,
    item.passage,
    item.word,
    item.answer,
    item.explanation,
    item.hint,
    item.sentenceContext,
  ].map(clean).filter(Boolean).join(" ");
}

function expectedSubjectFamily(subject: string): Subject | null {
  const normalized = normalizeSubject(subject);
  if (!normalized) return null;
  if (normalized === "gcse-maths" || normalized === "times-tables") return "maths";
  if (normalized === "gcse-science" || normalized === "gcse-combined-science" || normalized === "gcse-biology" || normalized === "gcse-chemistry" || normalized === "gcse-physics") return "science";
  if (normalized === "english-language" || normalized === "english-literature" || normalized === "gcse-english" || normalized === "gcse-english-language" || normalized === "gcse-english-literature") return "reading";
  return normalized;
}

function inferSubject(item: BlackBoxGeneratedItem): Subject | null {
  const explicit = normalizeSubject(clean(item.subject || item.contentType || item.type));
  if (explicit === "ga-language") return "ga-language";
  if (clean(item.word)) return "spelling";
  if (clean(item.passage)) return "reading";
  const text = itemEvidenceText(item);
  const signal = SUBJECT_SIGNAL_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(text)))?.subject ?? null;
  const explicitFamily = explicit ? (expectedSubjectFamily(explicit) ?? explicit) : null;
  if (signal && explicitFamily && signal !== explicitFamily) return explicitFamily;
  return explicitFamily ?? signal;
}

function inferStrand(item: BlackBoxGeneratedItem, inferredSubject: Subject | null): string | null {
  const explicit = normalizeToken(item.strand || item.englishStrand);
  if (explicit) return explicit;
  const skill = normalizeToken(item.skillFocus || item.topic);
  for (const strand of ENGLISH_STRANDS) {
    if (skill.includes(strand)) return strand;
  }
  if (inferredSubject && ENGLISH_STRANDS.has(inferredSubject)) return inferredSubject;
  return null;
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function answerOptions(item: BlackBoxGeneratedItem): string[] {
  const raw = item.answerOptions ?? item.options ?? item.choices;
  if (!Array.isArray(raw)) return [];
  return raw.map(clean).filter(Boolean);
}

function questionText(item: BlackBoxGeneratedItem): string {
  return clean(item.question || item.prompt || item.word);
}

function answerText(item: BlackBoxGeneratedItem): string {
  return clean(item.answer ?? item.correctAnswer ?? item.expectedAnswer);
}

function normalizeOption(value: unknown): string {
  return normalizeToken(value);
}

function hasAdvancedEnglishDemand(value: string): boolean {
  return /\b(justify|compare|revise|explain why|detect|correct|transform|analyse|analyze|evaluate|evidence|infer|inference|context|misconception|distractor|because|therefore|whereas|however|error|improve|rewrite|contrast)\b/i.test(value);
}

function makeScore(dimension: BlackBoxScoreDimension, score: number, reasons: string[] = []): BlackBoxDimensionScore {
  const maxScore = DIMENSION_MAX[dimension];
  const bounded = Math.max(0, Math.min(maxScore, score));
  return {
    dimension,
    score: bounded,
    maxScore,
    passed: bounded >= Math.ceil(maxScore * 0.7),
    reasons,
  };
}

function hasAnyTokenOverlap(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return true;
  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
}

function estimateDifficultyLevel(item: BlackBoxGeneratedItem): number {
  const prompt = questionText(item);
  const answer = answerText(item);
  const passage = clean(item.passage);
  const text = `${prompt} ${answer} ${clean(item.explanation)} ${passage}`;
  const options = answerOptions(item);
  const lowerText = text.toLowerCase();
  const operatorMatches = prompt.match(/[+\-x÷*/=]/g) ?? [];
  const hasMathsReasoning = /\b(because|explain|justify|method|reason|compare|difference|remainder|left over|missing step|mistake|error|correct|show your working|worked out)\b/i.test(lowerText);
  const hasMathsContext = /\b(shared equally|altogether|boxes|groups|packed|remaining|left|each|per|total|class|shop|pencils|children|tables|bags)\b/i.test(lowerText);
  const hasMultiStepMaths = operatorMatches.length >= 2 || /\b(after|then|before|remaining|left|difference|more than|less than)\b/i.test(prompt);

  let score = 1;
  if (wordCount(prompt) >= 12 || wordCount(answer) >= 8) score += 1;
  if (/[+\-x÷*/=]/.test(prompt) || /\b(because|explain|justify|evidence|method|compare|analyse)\b/i.test(text)) score += 1;
  if (hasMathsContext && hasMathsReasoning) score += 1;
  if (hasMultiStepMaths && hasMathsReasoning && wordCount(clean(item.explanation)) >= 8) score += 1;
  if (wordCount(passage) >= 45 || /\b(ratio|algebra|photosynthesis|neutralisation|metaphor|inference|subordinate|quadratic)\b/i.test(text)) score += 1;
  if (wordCount(passage) >= 90 || /\b(evaluate|synthesise|simultaneous|electrolysis|structural effect|language technique)\b/i.test(text)) score += 1;
  if (hasAdvancedEnglishDemand(text) && options.length >= 3 && wordCount(clean(item.explanation)) >= 14) score += 1;
  if (options.length >= 3 && options.map(normalizeOption).includes(normalizeOption(answer)) && wordCount(answer) >= 4) score += 1;
  return Math.max(1, Math.min(5, score));
}

function readabilityBand(item: BlackBoxGeneratedItem): number {
  const text = `${questionText(item)} ${clean(item.passage)} ${answerText(item)}`;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return 1;
  const averageLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const longWordRatio = words.filter((word) => word.length >= 9).length / words.length;
  return Math.max(1, Math.min(5, Math.round(averageLength - 2 + longWordRatio * 6)));
}

function expectedDifficulty(input: BlackBoxContentTestInput): number {
  return Math.max(1, Math.min(5, Math.round(Number(input.difficulty ?? input.level ?? 3))));
}

function compatibleSubjects(expected: Subject | null, inferred: Subject | null): boolean {
  if (!expected || !inferred) return false;
  if (expected === inferred) return true;
  if (expected === "reading" && ENGLISH_STRANDS.has(inferred)) return true;
  return false;
}

function scoreItem(item: BlackBoxGeneratedItem, index: number, input: BlackBoxContentTestInput): BlackBoxItemResult {
  const expectedSubject = expectedSubjectFamily(input.subject);
  const inferredSubject = inferSubject(item);
  const expectedStrand = normalizeToken(input.strand || (ENGLISH_STRANDS.has(expectedSubject ?? "" as Subject) ? expectedSubject : ""));
  const inferredStrand = inferStrand(item, inferredSubject);
  const expectedYear = normalizeYearGroup(input.yearGroup);
  const itemYear = normalizeYearGroup(clean(item.yearGroup)) ?? expectedYear;
  const expectedKeyStage = normalizeKeyStage(input.keyStage) ?? (expectedYear ? keyStageForYearGroup(expectedYear) : null);
  const itemKeyStage = normalizeKeyStage(clean(item.keyStage)) ?? (itemYear ? keyStageForYearGroup(itemYear) : null);
  const expectedLevel = expectedDifficulty(input);
  const itemLevel = Math.max(1, Math.min(5, Math.round(Number(item.difficulty ?? item.level ?? expectedLevel))));
  const estimatedLevel = estimateDifficultyLevel(item);
  const recommendedLevel = estimatedLevel;
  const levelDelta = recommendedLevel - itemLevel;
  const levelRecommendation = {
    action: levelDelta > 0 ? "promote" as const : levelDelta < 0 ? "demote" as const : "keep" as const,
    amount: Math.abs(levelDelta),
    reason: levelDelta > 0
      ? `Increase question difficulty by ${Math.abs(levelDelta)} level${Math.abs(levelDelta) === 1 ? "" : "s"}.`
      : levelDelta < 0
        ? `Reduce question difficulty by ${Math.abs(levelDelta)} level${Math.abs(levelDelta) === 1 ? "" : "s"}.`
        : "Question difficulty matches the Black Box estimate.",
  };
  const dimensions: BlackBoxDimensionScore[] = [];
  const reasons: string[] = [];

  const subjectOk = compatibleSubjects(expectedSubject, inferredSubject);
  dimensions.push(makeScore("subject", subjectOk ? DIMENSION_MAX.subject : 0, subjectOk ? [] : [`Expected ${expectedSubject ?? input.subject}, detected ${inferredSubject ?? "unknown"}.`]));

  const strandOk = !expectedStrand || !inferredStrand || expectedStrand === inferredStrand || (expectedStrand === "reading" && inferredSubject === "reading");
  dimensions.push(makeScore("strand", strandOk ? DIMENSION_MAX.strand : 2, strandOk ? [] : [`Expected strand ${expectedStrand}, detected ${inferredStrand}.`]));

  const keyStageOk = Boolean(expectedKeyStage && itemKeyStage && expectedKeyStage === itemKeyStage);
  dimensions.push(makeScore("keyStage", keyStageOk ? DIMENSION_MAX.keyStage : 0, keyStageOk ? [] : [`Expected ${expectedKeyStage ?? "known key stage"}, item is ${itemKeyStage ?? "unknown key stage"}.`]));

  const yearOk = Boolean(expectedYear && itemYear && Math.abs(Number(expectedYear.match(/\d+/)?.[0] ?? 0) - Number(itemYear.match(/\d+/)?.[0] ?? 0)) <= 1);
  dimensions.push(makeScore("yearGroup", yearOk ? DIMENSION_MAX.yearGroup : 2, yearOk ? [] : [`Expected ${expectedYear ?? "known year group"}, item is ${itemYear ?? "unknown year group"}.`]));

  dimensions.push(makeScore("level", Math.abs(itemLevel - expectedLevel) <= 1 ? DIMENSION_MAX.level : 2, Math.abs(itemLevel - expectedLevel) <= 1 ? [] : [`Declared level ${itemLevel} does not match expected ${expectedLevel}.`]));

  const targetTokens = [...tokenize(input.topic), ...tokenize(input.skillFocus)];
  const contentTokens = tokenize(itemText(item));
  const topicOk = hasAnyTokenOverlap(targetTokens, contentTokens);
  dimensions.push(makeScore("topicSkillFocus", topicOk ? DIMENSION_MAX.topicSkillFocus : 4, topicOk ? [] : [`Item does not visibly match topic/skill focus "${clean(input.topic || input.skillFocus)}".`]));

  const qText = questionText(item);
  const options = answerOptions(item);
  const expectedQuestionType = normalizeToken(input.questionType);
  const inferredQuestionType = options.length ? "multiple choice" : clean(item.passage) ? "reading response" : clean(item.word) ? "spelling word" : "free response";
  const appliedSpellingQuestion = expectedQuestionType.includes("spelling") && clean(item.word) && options.length > 0;
  const questionTypeOk = !expectedQuestionType || appliedSpellingQuestion || inferredQuestionType.includes(expectedQuestionType) || expectedQuestionType.includes(inferredQuestionType);
  dimensions.push(makeScore("questionType", qText ? (questionTypeOk ? DIMENSION_MAX.questionType : 4) : 0, qText ? (questionTypeOk ? [] : [`Expected ${expectedQuestionType}, detected ${inferredQuestionType}.`]) : ["Missing question/prompt text."]));

  const difficultyDelta = estimatedLevel - expectedLevel;
  const difficultyOk = Math.abs(difficultyDelta) <= 1;
  dimensions.push(makeScore("difficulty", difficultyOk ? DIMENSION_MAX.difficulty : 4, difficultyOk ? [] : [difficultyDelta > 1 ? "Item appears too hard for the selected level." : "Item appears too easy for the selected level."]));

  const answer = answerText(item);
  const answerOk = answer.length > 0;
  const answerComplexityOk = answerOk && (expectedLevel <= 2 || answer.length >= 2) && (expectedLevel <= 3 || wordCount(answer) >= 2 || /\d/.test(answer));
  dimensions.push(makeScore("answerComplexity", answerComplexityOk ? DIMENSION_MAX.answerComplexity : 0, answerOk ? (answerComplexityOk ? [] : ["Answer is too thin for the selected level."]) : ["Missing correct answer."]));

  const readability = readabilityBand(item);
  const readabilityOk = Math.abs(readability - expectedLevel) <= 2;
  dimensions.push(makeScore("vocabularyReadability", readabilityOk ? DIMENSION_MAX.vocabularyReadability : 3, readabilityOk ? [] : [readability > expectedLevel ? "Vocabulary/readability appears too advanced." : "Vocabulary/readability appears too simple."]));

  if (options.length > 0) {
    const normalizedOptions = options.map(normalizeOption);
    const uniqueOptions = new Set(normalizedOptions);
    if (options.length < 2) reasons.push("Multiple-choice item has fewer than two options.");
    if (uniqueOptions.size !== options.length) reasons.push("Multiple-choice item contains duplicate options.");
    if (!normalizedOptions.includes(normalizeOption(answer))) reasons.push("Correct answer is not present in answer options.");
  }

  for (const dimension of dimensions) {
    reasons.push(...dimension.reasons);
  }

  const score = dimensions.reduce((sum, entry) => sum + entry.score, 0);
  const maxScore = dimensions.reduce((sum, entry) => sum + entry.maxScore, 0);
  let decision: BlackBoxContentDecision = "APPROVE";
  if (!answerOk || !qText || reasons.some((reason) => /options|Correct answer is not present/.test(reason))) {
    decision = "REJECT";
  } else if (!subjectOk && inferredSubject) {
    decision = "RECLASSIFY";
  } else if (!keyStageOk || (!yearOk && expectedYear && itemYear)) {
    decision = "REJECT";
  } else if (!strandOk && inferredStrand) {
    decision = "RECLASSIFY";
  } else if (score / maxScore < 0.82 || !difficultyOk || !readabilityOk || !topicOk) {
    decision = "NEEDS_ADMIN_REVIEW";
  }

  return {
    index,
    score,
    maxScore,
    decision,
    declaredLevel: itemLevel,
    estimatedLevel,
    recommendedLevel,
    levelDelta,
    levelRecommendation,
    inferredSubject,
    inferredStrand,
    recommendedSubject: decision === "RECLASSIFY" ? inferredSubject : null,
    recommendedStrand: decision === "RECLASSIFY" ? inferredStrand : null,
    dimensions,
    reasons: Array.from(new Set(reasons)),
  };
}

function aggregateDecision(results: BlackBoxItemResult[]): BlackBoxContentDecision {
  if (!results.length) return "REJECT";
  if (results.some((result) => result.decision === "REJECT")) return "REJECT";
  if (results.some((result) => result.decision === "RECLASSIFY")) return "RECLASSIFY";
  if (results.some((result) => result.decision === "NEEDS_ADMIN_REVIEW")) return "NEEDS_ADMIN_REVIEW";
  return "APPROVE";
}

export function runContentBlackBoxTest(input: BlackBoxContentTestInput): BlackBoxContentTestResult {
  const items = asItems(input.items);
  const itemResults = items.map((item, index) => scoreItem(item, index, input));
  const score = itemResults.reduce((sum, result) => sum + result.score, 0);
  const maxScore = itemResults.reduce((sum, result) => sum + result.maxScore, 0) || 1;
  const decision = aggregateDecision(itemResults);
  const reasons = itemResults.flatMap((result) => result.reasons.map((reason) => `Item ${result.index + 1}: ${reason}`));
  if (!items.length) reasons.push("No generated content items were provided.");

  const reclassify = itemResults.find((result) => result.decision === "RECLASSIFY");

  return {
    decision,
    score,
    maxScore,
    passRate: Number((score / maxScore).toFixed(3)),
    reasons: Array.from(new Set(reasons)),
    recommendation: reclassify
      ? {
          ...(reclassify.recommendedSubject ? { subject: reclassify.recommendedSubject } : {}),
          ...(reclassify.recommendedStrand ? { strand: reclassify.recommendedStrand } : {}),
        }
      : undefined,
    itemResults,
  };
}
