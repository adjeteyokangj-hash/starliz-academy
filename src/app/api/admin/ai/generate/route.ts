import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { getOpenAiApiKeyWithSource } from "@/lib/api-key-config";
import {
  buildGenerationMetadata,
  isFallbackAllowed,
  parseAiGenerationMode,
  type AiGenerationMode,
} from "@/lib/admin-ai-generation-meta";
import {
  detectSpellingSkillFocusKind,
  buildDeterministicSpellingFallback,
  getSpellingDifficultyProfile,
  normalizeAdminAiGeneratorFailure,
  shouldUseDeterministicSpellingFallback,
} from "@/lib/admin-ai-generator-spelling";
import { validateAiContentQuality } from "@/lib/ai/content-quality";
import { resolveExamBoardRecommendation, resolveExamBoardSelection } from "@/lib/ai/exam-board-resolver";
import { buildPlannedVisualAssets, executeVisualGeneration, type PlannedVisualAsset } from "@/lib/ai/visual-generation";
import { buildAcademicSourceForStudent } from "@/lib/academic-intelligence/data";
import { buildAcademicIntelligence } from "@/lib/academic-intelligence/academicIntelligence";
import {
  buildGraphAwarePromptContext,
  buildGraphContentQualityChecks,
  buildGraphStorageMediaReferences,
} from "@/lib/academic-intelligence/graph-context";
import type { CurriculumGraphMediaReference, CurriculumIntelligenceGraph } from "@/lib/academic-intelligence/types";
import { SKILL_MAP, serializeSkills } from "@/lib/skills";
import { parseJsonWithRepair } from "@/lib/safe-json";
import {
  curriculumPathwayForYearGroup,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  keyStageForYearGroup,
  normalizeExamBoard,
  normalizeSubject,
  normalizeYearGroup as normalizeCurriculumYearGroup,
  shouldApplyExamBoardTag,
  yearGroupsForKeyStage,
  ageGroupForYearGroup,
  isValidCurriculumPath,
  topicSuggestionsForSelection,
  aiGeneratorSubjectsForYearGroup,
  type GenerationType,
  type Subject,
  skillsForSubjectAndYear,
} from "@/lib/curriculum";

const BATCH_SIZE = 12;
const OPENAI_MODEL = "gpt-4o-mini";
const generationCache = new Map<string, { content: unknown; meta: Record<string, unknown> }>();
const generationRateLimit = new Map<string, { count: number; resetAt: number }>();

const GCSE_LANGUAGE_SUBJECTS: Subject[] = ["gcse-french", "gcse-german", "gcse-spanish"];

const DIFFICULTY_PROFILE: Record<number, {
  difficultyLabel: string;
  cognitiveDemand: string;
  scaffoldingLevel: string;
  guidance: string;
}> = {
  1: {
    difficultyLabel: "Foundation / easy recall",
    cognitiveDemand: "basic recall and recognition",
    scaffoldingLevel: "high scaffolding",
    guidance: "Use simple wording, one-step answers, strong hints, and concrete examples.",
  },
  2: {
    difficultyLabel: "Developing understanding",
    cognitiveDemand: "light reasoning",
    scaffoldingLevel: "supported practice",
    guidance: "Mostly one-step tasks with light reasoning and moderate subject vocabulary.",
  },
  3: {
    difficultyLabel: "Standard expected level",
    cognitiveDemand: "mixed recall and application",
    scaffoldingLevel: "balanced support",
    guidance: "Expected year-level challenge with mixed retrieval and application.",
  },
  4: {
    difficultyLabel: "Higher challenge",
    cognitiveDemand: "multi-step reasoning",
    scaffoldingLevel: "reduced scaffolding",
    guidance: "Use exam-style wording, multi-step logic, and less scaffolding.",
  },
  5: {
    difficultyLabel: "Exam stretch / advanced",
    cognitiveDemand: "complex higher-order reasoning",
    scaffoldingLevel: "minimal hints",
    guidance: "Use complex multi-part prompts with exam technique and minimal hints.",
  },
};

type PromptType = "spelling" | "maths" | "reading" | "punctuation" | "grammar" | "writing" | "science" | "languages";
type EnglishStrand = "phonics" | "spelling" | "reading" | "grammar" | "punctuation" | "writing" | "vocabulary" | "comprehension";
type VisualGenerationMode = "none" | "planned_only" | "generate_now";
type ScienceDiscipline = "chemistry" | "physics" | "biology";

type VisualGenerationPlan = {
  enabled: boolean;
  mode: VisualGenerationMode;
  maxPerContent: number;
  allowedSubjects: Subject[];
  requireAdminApproval: boolean;
};

function truncateForDiagnostics(value: string, maxLength = 1200) {
  const safe = String(value ?? "");
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, maxLength)}... [truncated ${safe.length - maxLength} chars]`;
}

function resolveScienceDiscipline(subject: Subject, skillFocus: string): ScienceDiscipline | null {
  const normalizedSubject = String(subject).toLowerCase();
  const normalizedSkill = String(skillFocus ?? "").toLowerCase();

  if (normalizedSubject.includes("chemistry")) return "chemistry";
  if (normalizedSubject.includes("physics")) return "physics";
  if (normalizedSubject.includes("biology")) return "biology";

  if (normalizedSubject === "gcse-science" || normalizedSubject === "gcse-combined-science") {
    if (/(chemistry|chemical|acid|alkali|electrolysis|periodic|atom|ion|\bph\b)/i.test(normalizedSkill)) return "chemistry";
    if (/(physics|force|motion|energy|electric|resistance|current|wave|momentum|acceleration|velocity)/i.test(normalizedSkill)) return "physics";
    if (/(biology|cell|organ|photosynthesis|respiration|ecosystem|dna|enzyme|osmosis|diffusion)/i.test(normalizedSkill)) return "biology";
  }

  return null;
}

function isEnglishParentSubject(subject: Subject): boolean {
  return subject === "english-language" || subject === "gcse-english" || subject === "gcse-english-language";
}

function normalizeEnglishStrand(value: unknown): EnglishStrand | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "phonics") return "phonics";
  if (normalized === "spelling") return "spelling";
  if (normalized === "reading") return "reading";
  if (normalized === "comprehension") return "comprehension";
  if (normalized === "grammar") return "grammar";
  if (normalized === "punctuation") return "punctuation";
  if (normalized === "writing") return "writing";
  if (normalized === "vocabulary") return "vocabulary";
  return null;
}

function englishStrandToGenerationType(strand: EnglishStrand): GenerationType {
  if (strand === "phonics") return "phonics";
  if (strand === "spelling") return "spelling";
  if (strand === "reading" || strand === "comprehension") return "reading";
  if (strand === "grammar") return "grammar";
  if (strand === "punctuation") return "punctuation";
  if (strand === "writing") return "writing";
  return "vocabulary";
}

function englishStrandToSubject(strand: EnglishStrand): Subject {
  if (strand === "phonics") return "phonics";
  if (strand === "spelling") return "spelling";
  if (strand === "reading" || strand === "comprehension") return "reading";
  if (strand === "grammar") return "grammar";
  if (strand === "punctuation") return "punctuation";
  if (strand === "writing") return "writing";
  return "vocabulary";
}

function mapSubjectToGenerationType(subject: Subject): GenerationType {
  return GENERATION_CONTENT_TYPE_BY_SUBJECT[subject];
}

function mapGenerationTypeToPromptType(type: GenerationType): PromptType {
  if (type === "science") return "science";
  if (type === "languages") return "languages";
  if (type === "maths" || type === "exam-practice") return "maths";
  if (type === "reading" || type === "vocabulary" || type === "english-literature") return "reading";
  if (type === "punctuation") return "punctuation";
  if (type === "grammar") return "grammar";
  if (type === "writing" || type === "english-language") return "writing";
  return "spelling";
}

function shouldAutoGenerateVisuals(type: GenerationType): boolean {
  return type === "maths"
    || type === "science"
    || type === "languages"
    || type === "reading"
    || type === "english-language"
    || type === "english-literature"
    || type === "exam-practice";
}

function mapEnglishStrandToPromptType(strand: EnglishStrand): PromptType {
  if (strand === "phonics" || strand === "spelling") return "spelling";
  if (strand === "reading" || strand === "comprehension" || strand === "vocabulary") return "reading";
  if (strand === "grammar") return "grammar";
  if (strand === "punctuation") return "punctuation";
  return "writing";
}

function isReadingComprehensionSkill(skillFocus: string | null | undefined): boolean {
  const normalized = String(skillFocus ?? "").trim().toLowerCase();
  return normalized === "reading comprehension" || normalized.includes("reading comprehension");
}

function mapGenerationTypeToValidatorType(
  type: GenerationType,
  skillFocus?: string,
): "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" | "languages" | "science" {
  if (type === "phonics") return "phonics";
  if (type === "spelling") return "spelling";
  if (type === "punctuation") return "punctuation";
  if (type === "grammar") return "grammar";
  if (type === "science") return "science";
  if (type === "english-language" && isReadingComprehensionSkill(skillFocus)) return "reading";
  if (type === "writing" || type === "english-language") return "writing";
  if (type === "languages") return "languages";
  if (type === "reading" || type === "vocabulary" || type === "english-literature") return "reading";
  return "maths";
}

function mapEnglishStrandToValidatorType(strand: EnglishStrand): "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" {
  if (strand === "phonics") return "phonics";
  if (strand === "spelling") return "spelling";
  if (strand === "reading" || strand === "comprehension" || strand === "vocabulary") return "reading";
  if (strand === "grammar") return "grammar";
  if (strand === "punctuation") return "punctuation";
  return "writing";
}

type GeneratedPreview = {
  title: string;
  subject: Subject;
  keyStage: string;
  yearGroup: string;
  curriculumPathway?: string;
  curriculumFramework?: string;
  countryRegion?: string;
  examBoard?: string | null;
  examBoardSource?: "auto" | "manual" | "school_default";
  examBoardConfidence?: number;
  examBoardReason?: string;
  skillFocus: string;
  difficulty: number;
  topic: string;
  status: "draft";
  safetyStatus: "passed";
  qualityScore: number;
  voiceScript: string;
  imagePrompt: string;
  items: unknown[];
  visualAssets: PlannedVisualAsset[];
  metadata: {
    generationType: GenerationType;
    promptType: PromptType;
    parser: "reading-object" | "array-items";
  };
  curriculumContext: {
    pathway: string;
    examBoard: string | null;
    keyStage: string;
    yearGroup: string;
    subject: Subject;
    skillFocus: string;
    topic: string;
    examBoardSource: "auto" | "manual" | "school_default";
    examBoardConfidence: number;
    examBoardReason: string;
    curriculumFramework: string;
    countryRegion: string;
  };
  graphContext?: {
    studentId: string;
    promptContext: string;
    connectedSystems: string[];
    aiGenerationContext: CurriculumIntelligenceGraph["aiGenerationContext"];
    contentGovernance: CurriculumIntelligenceGraph["contentGovernance"];
    mediaReferences: CurriculumGraphMediaReference[];
  };
};

const SYSTEM_PROMPT: Record<PromptType, string> = {
  spelling: `You are a UK phonics-and-spelling curriculum engine for England (Reception-Year 11 support where relevant).
Generate curriculum-grade spelling content using UK primary expectations.
Support phonics patterns, common exception words, suffixes, prefixes, silent letters, homophones and age-appropriate vocabulary.
For phonics phases, enforce progression strictly:
- Phase 2: simple VC/CVC words only (sat, pin, tap, cat, dog, mop, run)
- Phase 3: basic digraph/trigraph words (ship, chat, teeth, rain)
- Phase 4: adjacent consonants/blends (stop, clap, swim)
- Phase 5: split digraphs and alternative vowel sounds (make, bike, rope, tune)
Never include higher-phase words in lower phases.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "word": string, "hint": string, "sentenceContext": string, "categoryHint": string, "syllables": string, "emoji": string, "yearGroup": string, "skillFocus": string, "phonicsStage": string | null, "difficulty": number }
Content type lock: spelling must not generate maths questions, number problems, reading passages, or comprehension questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  maths: `You are a UK curriculum content creator for England.
Generate curriculum-grade KS1/KS2 maths questions.
Difficulty must increase by year group and level.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": number, "explanation": string, "choices": number[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Content type lock: maths must not generate spelling word lists or reading passages.
Return ONLY valid JSON — no explanation, no markdown.`,

  science: `You are a UK science curriculum content creator for England.
Generate curriculum-grade science questions for KS3/KS4 and GCSE pathway where requested.
For GCSE pathway (Years 10-11), support Biology, Chemistry, Physics and Combined Science framing.
Include exam-board-aware wording only when exam board is provided (AQA, OCR, Edexcel), and do not claim official approval.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "explanation": string, "choices": string[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Content type lock: science must not generate spelling lists or unrelated reading passages.
Return ONLY valid JSON — no explanation, no markdown.`,

  languages: `You are a UK GCSE modern languages content creator for England.
Generate curriculum-grade GCSE language tasks for French, German, or Spanish.
Question styles must include language-specific modes where relevant: vocabulary, translation, reading, listening-style, grammar, speaking prompts, writing tasks, role play, photo card, sentence building, verb conjugation, and tense practice.
Return a JSON array. Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "explanation": string, "choices": string[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string, "activityMode": string, "difficultyLevel": number, "difficultyLabel": string, "cognitiveDemand": string, "scaffoldingLevel": string, "visualRequired": boolean, "visualType": "diagram" | "chart" | "image" | "number_line" | "graph" | "table" | "map" | "timeline" | "none", "visualPrompt": string, "visualAltText": string }
Content type lock: language generation must not produce generic maths/science-only content.
Return ONLY valid JSON — no explanation, no markdown.`,

  reading: `You are a UK curriculum content creator for England.
Generate age-appropriate reading content.
Return a JSON object. It must follow this schema exactly:
{ "id": string, "title": string, "passage": string, "vocabularyWords": string[], "questions": [{ "question": string, "answer": string, "options": string[] }], "answers": string[], "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: reading must not generate spelling word lists, maths questions, or unrelated content.
Return ONLY valid JSON — no explanation, no markdown.`,

  punctuation: `You are a UK punctuation practice generator.
Return a JSON array of punctuation question items.
Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: punctuation must not return spelling word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  grammar: `You are a UK grammar practice generator.
Return a JSON array of grammar question items.
Each item must follow this schema exactly:
{ "id": string, "question": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: grammar must not return spelling word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,

  writing: `You are a UK writing practice generator.
Return a JSON array of writing task items.
Each item must follow this schema exactly:
{ "id": string, "prompt": string, "answer": string, "options": string[], "explanation": string, "hint": string, "yearGroup": string, "skillFocus": string, "difficulty": number }
Content type lock: writing must not return spelling-only word lists or maths questions.
Return ONLY valid JSON — no explanation, no markdown.`,
};

function cleanTopic(topic: string, type: PromptType) {
  if (type === "spelling") {
    return topic.replace(/fractions?|maths?|mathematics|numbers?|addition|subtraction|multiplication|division/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "maths") {
    return topic.replace(/spelling|phonics|silent e|reading passage|comprehension/gi, "").replace(/\s+/g, " ").trim();
  }
  if (type === "reading") {
    return topic.replace(/spelling words?|maths? questions?|fractions?/gi, "").replace(/\s+/g, " ").trim();
  }
  return topic.trim();
}

function normalizeYearGroup(yearGroup: string, keyStage: string) {
  const normalized = normalizeCurriculumYearGroup(yearGroup);
  if (normalized) return normalized;
  const options = yearGroupsForKeyStage(keyStage);
  return options[0] ?? "Year 1";
}

function buildUserPrompt(
  type: PromptType,
  subject: Subject,
  level: number,
  topic: string,
  ageGroup: string,
  count: number,
  keyStage: string,
  yearGroup: string,
  skillFocus: string,
  examBoard?: string | null,
  excludeWords: string[] = [],
  targetSkills: string[] = [],
  weakAreas: string[] = [],
  repairFeedback = "",
  scienceDiscipline: ScienceDiscipline | null = null,
): string {
  const skillInstruction = targetSkills.length
    ? `\nSKILL TARGETING: Focus content on these skills: ${targetSkills.join(", ")}.`
    : "";
  const weakInstruction = weakAreas.length
    ? `\nWEAK AREAS: The student struggles with: ${weakAreas.join(", ")}. Include supportive practice for these.`
    : "";
  const cleanedTopic = cleanTopic(topic, type);
  const followUpInstruction = /focus practice/i.test(topic)
    ? `

FOLLOW-UP PRACTICE:
- The student struggled with: ${topic}
- Generate targeted practice focused on the same pattern.
- Use similar word/question patterns, but do not duplicate the exact weak words unless needed for one review item.
- Keep wording encouraging and parent-friendly.`
    : "";
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const safeLevel = Math.max(1, Math.min(5, level));
  const difficultyProfile = DIFFICULTY_PROFILE[safeLevel] ?? DIFFICULTY_PROFILE[3];
  const genericRepairLine = repairFeedback
    ? `\nREPAIR FEEDBACK FROM VALIDATION:\n${repairFeedback}\nReplace invalid or too-easy items while keeping year, subject, skill, topic, and difficulty aligned.`
    : "";
  const difficultyLines = `
Difficulty profile:
- Difficulty level: ${safeLevel}
- Difficulty label: ${difficultyProfile.difficultyLabel}
- Cognitive demand: ${difficultyProfile.cognitiveDemand}
- Scaffolding level: ${difficultyProfile.scaffoldingLevel}
- Guidance: ${difficultyProfile.guidance}`;
  if (subject === "punctuation") {
    return `Generate ${count} UK Year ${safeYearGroup.replace("Year ", "")} punctuation practice items.
Selection context:
- Key stage: ${keyStage}
- Year group: ${safeYearGroup}
- Subject: punctuation
- Skill focus: ${skillFocus || "Commas in lists"}
- Topic/theme: ${cleanedTopic || skillFocus || "punctuation practice"}
- Difficulty range: 1-5, selected ${level}

Expected content type:
- sentence editing and multiple-choice punctuation questions

Question format:
- short prompt sentence or mini-context
- include one clear punctuation target

Answer format:
- include a correct answer string and a brief explanation

Safety rules:
- age-appropriate school-safe language
- no harmful, violent, or adult themes

Curriculum note:
- keep examples aligned with UK KS2 punctuation expectations for the selected skill

Return JSON array only using this schema:
{
  "id": string,
  "question": string,
  "answer": string,
  "options": string[],
  "explanation": string,
  "hint": string,
  "yearGroup": "${safeYearGroup}",
  "skillFocus": "${skillFocus}",
  "difficulty": ${level}
}${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }

  if (type === "spelling") {
    const profile = getSpellingDifficultyProfile(safeYearGroup, keyStage, skillFocus || "spelling", safeLevel);
    const skillKind = detectSpellingSkillFocusKind(skillFocus || "");
    const strictPatternLine = skillKind === "prefixes"
      ? "- Prefix focus: every word must begin with an accepted prefix (re-, mis-, dis-, pre-, sub-, inter-, super-, anti-, auto-)."
      : skillKind === "suffixes"
        ? "- Suffix focus: every word must end with an accepted suffix (-ly, -ness, -ment, -ation, -ous, -ful, -less, -able, -ible)."
        : skillKind === "homophones"
          ? "- Homophone focus: each item must include a homophone pair or group and a sentence showing correct usage."
          : skillKind === "compound"
            ? "- Compound word focus: each item must be a real compound word and include firstWord + secondWord."
            : "- Match selected spelling progression exactly.";
    const year4HardBan = safeYearGroup === "Year 4" && safeLevel >= 5
      ? "- Reject simple words like line, shine, time, cake, book, dog, cat, sun, run unless the selected skill explicitly requires that pattern."
      : "";
    const repairLine = repairFeedback
      ? `\nREPAIR FEEDBACK FROM VALIDATION:\n${repairFeedback}\nReplace only invalid items and keep valid items out of the response.`
      : "";
    const stageLower = (skillFocus || "").toLowerCase();
    const phonicsInstruction = stageLower.startsWith("phase 2")
      ? "- Phase 2 strict rule: only simple VC/CVC words. No split digraphs, no magic-e, no advanced vowel teams."
      : stageLower.startsWith("phase 3")
        ? "- Phase 3 strict rule: use basic digraph/trigraph words only (e.g. sh/ch/th/ng/ai/ee/oa)."
        : stageLower.startsWith("phase 4")
          ? "- Phase 4 strict rule: include adjacent consonants/blends (e.g. stop, clap, swim)."
          : stageLower.startsWith("phase 5")
            ? "- Phase 5 strict rule: allow split digraphs and alternative vowel sounds."
            : "";
    return `
  You are generating UK ${keyStage} spelling content.

STRICT RULES:
- Key stage: ${keyStage}
- Year group: ${safeYearGroup}
- Skill focus: ${skillFocus || "Silent e"}
- Difficulty: ${level}
- Theme: ${cleanedTopic || skillFocus || "silent e"}
- All words MUST follow the skill exactly
- Year-group calibration: ${profile.expectedLevel} for ${safeYearGroup} (${keyStage})
- Minimum target word length: ${profile.minLength} letters unless homophone or explicit exception
- For "Silent e": every word MUST end with "e" and follow vowel-consonant-e pattern (examples: make, bike, rope)
- ${phonicsInstruction || strictPatternLine}
- DO NOT include words like sneak, climb, bread, or any irregular patterns
- ${strictPatternLine}
- ${year4HardBan}
- NO duplicates
- Avoid these words: ${excludeWords.join(", ") || "none"}
- Do not return maths questions, fractions, number problems, reading passages, or explanations${skillInstruction}${weakInstruction}${repairLine}

OUTPUT:
- ${count} items EXACTLY
- JSON array only

Each item must include:
{
  "id": string,
  "word": string,
  "hint": string,
  "sentenceContext": string,
  "categoryHint": string,
  "syllables": string,
  "emoji": string,
  "spellingPattern": string,
  "whyItMatchesSkill": string,
  "validationLevel": "age-appropriate" | "needs-review" | "too-easy",
  "homophoneGroup": string[] | null,
  "firstWord": string | null,
  "secondWord": string | null,
  "yearGroup": "${safeYearGroup}",
  "skillFocus": "${skillFocus || "Silent e"}",
  "difficulty": ${level}
}${difficultyLines}${followUpInstruction}${genericRepairLine}`.trim();
  }
  if (type === "maths") {
    const isGcse = safeYearGroup === "Year 10" || safeYearGroup === "Year 11" || keyStage === "KS4";
    if (isGcse) {
      return `Generate ${count} GCSE maths questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Exam board context: ${examBoard || "general GCSE maths (no board selected)"}.
Skill focus: ${skillFocus || "Number"}.
Topic: ${cleanedTopic || skillFocus || "GCSE maths practice"}.
Return STRICT JSON array only with this shape for every item:
{ "id": string, "question": string, "answer": string, "explanation": string, "choices": string[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Requirements:
- Use GCSE command words in each question where appropriate: calculate, solve, simplify, estimate, compare, prove, justify.
- Questions must be mathematically explicit and include at least one of: equation, expression, ratio/proportion, percentage, probability, algebraic manipulation, graph interpretation, or multi-step arithmetic.
- Write multi-step prompts with clear working expectations.
- Answers must show concise method or reasoning, not just a bare final number.
- Keep classroom-safe language and avoid unrelated literacy-only tasks.
Do not return spelling word lists, story passages, or non-maths content.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
    }
    return `Generate ${count} KS1/KS2-style maths questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Number bonds"}.
Topic: ${cleanedTopic || skillFocus || "mixed arithmetic"}.
Include answers and multiple choice options.
Difficulty must increase appropriately for the selected year group and level.
Return JSON with: id, question, answer, explanation, choices, yearGroup, skillFocus, difficulty and topic.
Do not return spelling words or reading passages.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "science") {
    const isGcse = safeYearGroup === "Year 10" || safeYearGroup === "Year 11" || keyStage === "KS4";
    const boardLine = isGcse
      ? `Exam board context: ${examBoard || "general GCSE (no board selected)"}.`
      : "Exam board context: not required for this stage.";
    const disciplineLine = scienceDiscipline
      ? `Science discipline lock: ${scienceDiscipline}.`
      : "Science discipline lock: general science (no specific discipline selected).";
    const forbiddenTopicLine = scienceDiscipline === "chemistry"
      ? "Forbidden topics: force, acceleration, velocity, current, resistance, momentum, cell, organ, photosynthesis, respiration."
      : scienceDiscipline === "physics"
        ? "Forbidden topics: acid, alkali, electrolysis, periodic table, pH, cell, organ, photosynthesis, respiration."
        : scienceDiscipline === "biology"
          ? "Forbidden topics: force, acceleration, velocity, current, resistance, momentum, acid, alkali, electrolysis, periodic table."
          : "Forbidden topics: avoid mixed-subject contamination between Chemistry, Physics and Biology unless explicitly requested.";
    return `Generate ${count} UK science questions for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Subject: ${subject}.
Skill focus: ${skillFocus || "Scientific reasoning"}.
Topic: ${cleanedTopic || skillFocus || "science practice"}.
${boardLine}
${disciplineLine}
${forbiddenTopicLine}
${isGcse ? "GCSE mode guidance: include exam technique, structured response clarity, and calculation interpretation when relevant." : "KS3 mode guidance: keep explanations concise and concept-focused."}
Return STRICT JSON array only with this shape for every item:
{ "id": string, "question": string, "answer": string, "explanation": string, "choices": string[], "yearGroup": string, "skillFocus": string, "difficulty": number, "topic": string }
Requirements:
- Use GCSE command words in each question: explain, describe, calculate, evaluate, compare, justify, analyse, state, outline, predict.
- In Chemistry mode, anchor each item to chemistry vocabulary (for example: reaction, acid, alkali, atom, ion, periodic table, bond, compound).
- Answers must be mark-scheme style, concise, and scientifically precise.
- Keep each question substantive (around 12+ words) and clearly tied to the selected discipline.
- Use scientific vocabulary suitable for Year 10/11 where GCSE context applies.
- Keep curriculum-safe classroom language only.
- Never include markdown, prose wrappers, or keys outside the schema.
Do not return spelling word lists, unrelated reading passages, or non-science content.
Prefer helpful visuals for science where appropriate (diagram, graph, table).
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "languages") {
    const languageSubject = GCSE_LANGUAGE_SUBJECTS.includes(subject) ? subject.replace("gcse-", "").toUpperCase() : "language";
    return `Generate ${count} GCSE ${languageSubject} tasks for ${keyStage}, ${safeYearGroup}, difficulty ${safeLevel}.
Subject: ${subject}.
Skill focus: ${skillFocus || "Vocabulary"}.
Topic/theme: ${cleanedTopic || skillFocus || "Identity and culture"}.
Exam board: ${examBoard || "General GCSE"}.
Use language-specific activity modes only: vocabulary, translation, listening-style, reading comprehension, grammar, speaking prompts, writing tasks, role play, photo card, sentence building, verb conjugation, tenses, exam practice.
Every item must include: activityMode, difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.
Do not return generic maths/science-only formats.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "punctuation") {
    return `Generate ${count} UK punctuation practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence punctuation"}.
Topic/theme: ${cleanedTopic || skillFocus || "punctuation practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling word lists, reading passages, or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "grammar") {
    return `Generate ${count} UK grammar practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Grammar accuracy"}.
Topic/theme: ${cleanedTopic || skillFocus || "grammar practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling-only word lists, reading passages, or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "writing") {
    return `Generate ${count} UK writing practice tasks for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence composition"}.
Topic/theme: ${cleanedTopic || skillFocus || "writing practice"}.
Return JSON array with: id, prompt, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return isolated spelling word lists or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "reading") {
    return `Generate a short reading passage for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Retrieval questions"}.
Theme/topic: ${cleanedTopic || "friendly adventure"}.
Include comprehension questions.
Return STRICT JSON object only with this shape:
{
  "id": string,
  "title": string,
  "passage": string,
  "vocabularyWords": string[],
  "questions": [
    {
      "question": string,
      "answer": string,
      "options": string[]
    }
  ],
  "yearGroup": "${safeYearGroup}",
  "skillFocus": "${skillFocus || "Retrieval questions"}",
  "difficulty": ${level}
}
Requirements:
- Create exactly ${count} questions in the questions array.
- Questions must require retrieval, inference, language analysis, or evidence use for the selected skill focus.
- Answers must quote or reference evidence from the passage where appropriate.
- Keep GCSE Year 10/11 reading-comprehension rigor when ${safeYearGroup} is Year 10/11.
Do not return spelling word lists or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}`;
  }
  return "";
}

async function requestOpenAiJson(apiKey: string, systemPrompt: string, userPrompt: string) {
  const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  });

  const rawProviderBody = await openAIResponse.text();
  const providerPayload = parseJsonWithRepair<Record<string, unknown>>(rawProviderBody);
  if (!openAIResponse.ok) {
    console.error("OpenAI error:", rawProviderBody);
    const providerError = providerPayload.success && providerPayload.data.error && typeof providerPayload.data.error === "object"
      ? (providerPayload.data.error as Record<string, unknown>)
      : null;
    const requestError = new Error(`OpenAI request failed with status ${openAIResponse.status}${typeof providerError?.code === "string" ? ` (${providerError.code})` : ""}`) as Error & Record<string, unknown>;
    requestError.providerStatus = openAIResponse.status;
    requestError.providerCode = typeof providerError?.code === "string" ? providerError.code : null;
    throw requestError;
  }
  if (!providerPayload.success) {
    throw new Error("OpenAI returned a non-JSON payload.");
  }

  const choices = providerPayload.data.choices as Array<{ message?: { content?: string } }> | undefined;
  const rawContent = choices?.[0]?.message?.content ?? "";
  if (!String(rawContent).trim()) {
    throw new Error("OpenAI returned an empty content payload.");
  }

  const repaired = parseJsonWithRepair(rawContent);
  if (!repaired.success) {
    throw new Error(`Generation failed due to malformed AI output. Stages: ${repaired.diagnostics.stagesTried.join(" -> ")}`);
  }

  const usage = providerPayload.data.usage && typeof providerPayload.data.usage === "object"
    ? providerPayload.data.usage as Record<string, unknown>
    : null;
  const firstChoice = Array.isArray(providerPayload.data.choices)
    ? providerPayload.data.choices[0] as Record<string, unknown> | undefined
    : undefined;

  return {
    rawContent,
    parsed: repaired.data,
    repairDiagnostics: repaired.diagnostics,
    providerMeta: {
      model: typeof providerPayload.data.model === "string" ? providerPayload.data.model : OPENAI_MODEL,
      finishReason: typeof firstChoice?.finish_reason === "string" ? firstChoice.finish_reason : null,
      usage: usage
        ? {
          promptTokens: Number(usage.prompt_tokens ?? 0),
          completionTokens: Number(usage.completion_tokens ?? 0),
          totalTokens: Number(usage.total_tokens ?? 0),
        }
        : null,
      responseBytes: rawProviderBody.length,
      contentLength: String(rawContent).length,
      contentPreview: truncateForDiagnostics(rawContent, 1000),
    },
  };
}

function estimateCost(count: number) {
  const tokensPerItem = 60;
  const totalTokens = count * tokensPerItem;
  const estimatedCost = (totalTokens / 1000) * 0.002;
  return {
    estimatedTokens: totalTokens,
    estimatedCostPence: Math.max(1, Math.round(estimatedCost * 100)),
  };
}

async function writeAuditLogSafely(input: Parameters<typeof writeAuditLog>[0]) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Failed to write AI generation audit log:", error);
  }
}

function cacheKey(input: Record<string, unknown>) {
  return JSON.stringify(input);
}

function checkGenerationRateLimit(adminId: string) {
  const now = Date.now();
  const current = generationRateLimit.get(adminId);
  if (!current || current.resetAt < now) {
    generationRateLimit.set(adminId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function readingObjectToItems(value: unknown): unknown[] {
  const data = value as Record<string, unknown>;
  const questions = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.comprehensionQuestions)
      ? data.comprehensionQuestions
      : Array.isArray(data.comprehension_questions)
        ? data.comprehension_questions
        : Array.isArray(data.items)
          ? data.items
          : typeof data.question === "string"
            ? [data.question]
            : [];
  const answers = Array.isArray(data.answers) ? data.answers : [];
  const fallbackQuestions = questions.length === 0 && answers.length > 0
    ? answers.map((_, index) => `Using evidence from the passage, answer comprehension item ${index + 1}.`)
    : questions;
  return fallbackQuestions.map((question, index) => {
    const q = typeof question === "object" && question
      ? question as Record<string, unknown>
      : { question: String(question ?? "") };
    const answerFromArray = answers[index];
    const answer = String(q.answer ?? q.modelAnswer ?? q.sampleAnswer ?? answerFromArray ?? "");
    const options = Array.isArray(q.options)
      ? q.options.map((option) => String(option))
      : Array.isArray(q.choices)
        ? q.choices.map((option) => String(option))
        : Array.isArray(q.distractors)
          ? q.distractors.map((option) => String(option))
      : [];
    return {
      id: String(data.id ?? `reading-${index + 1}`) + `-${index + 1}`,
      type: "reading",
      passage: String(data.passage ?? ""),
      prompt: String(q.question ?? q.prompt ?? q.text ?? ""),
      question: String(q.question ?? q.prompt ?? q.text ?? ""),
      answer,
      options: Array.from(new Set([...options, answer])).filter(Boolean),
      explanation: String(q.explanation ?? "The answer is found in the passage evidence."),
      hint: "Re-read the passage and look for matching words.",
      yearGroup: String(data.yearGroup ?? ""),
      skillFocus: String(data.skillFocus ?? ""),
      difficulty: Number(data.difficulty ?? 1),
    };
  });
}

function synthesizeReadingItemsFromPassage(input: {
  passage: string;
  count: number;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
}) {
  const safeCount = Math.max(1, Math.min(10, input.count));
  const firstSentence = input.passage.split(/(?<=[.!?])\s+/).find((line) => line.trim().length > 0) ?? input.passage;
  const evidence = firstSentence.trim().slice(0, 140);
  const stems = [
    "What is the main idea presented in the passage? Use one piece of evidence.",
    "What can you infer about the writer's viewpoint from the passage?",
    "Analyse one language choice used in the passage and explain its effect.",
    "Select one quotation from the passage and explain how it supports your answer.",
  ];

  return Array.from({ length: safeCount }, (_, index) => {
    const question = stems[index % stems.length];
    return {
      id: `reading-synth-${index + 1}`,
      type: "reading",
      passage: input.passage,
      prompt: question,
      question,
      answer: `A valid response should reference evidence such as "${evidence}" and explain its meaning clearly.`,
      options: [],
      explanation: "Use evidence from the passage and explain your reasoning.",
      hint: "Quote a short phrase from the passage before explaining.",
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: input.difficulty,
    };
  });
}

function normalizePreviewItems(
  generationType: GenerationType,
  promptType: PromptType,
  sourceSubject: Subject,
  content: unknown,
  metadata: { yearGroup: string; skillFocus: string; difficulty: number; topic: string },
): unknown[] {
  if (promptType === "reading" && !Array.isArray(content) && content && typeof content === "object") {
    return readingObjectToItems(content).map((item) => ({
      ...(item as Record<string, unknown>),
      yearGroup: metadata.yearGroup,
      skillFocus: metadata.skillFocus,
      difficulty: metadata.difficulty,
    }));
  }
  const records = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  const safeDifficulty = Math.max(1, Math.min(5, metadata.difficulty));
  const difficultyProfile = DIFFICULTY_PROFILE[safeDifficulty] ?? DIFFICULTY_PROFILE[3];
  const withCommonFields = (row: Record<string, unknown>) => {
    const visualTypeRaw = String(row.visualType ?? "").toLowerCase();
    const visualType = ["diagram", "chart", "image", "number_line", "graph", "table", "map", "timeline", "none"].includes(visualTypeRaw)
      ? visualTypeRaw
      : "none";
    const inferredVisualRequired = Boolean(row.visualRequired)
      || (generationType === "science" && /(electric|force|wave|cell|energy)/i.test(metadata.topic || metadata.skillFocus))
      || (generationType === "maths" && /(graph|geometry|number line|table|chart)/i.test(metadata.topic || metadata.skillFocus))
      || (generationType === "languages" && /(photo|role play|vocab)/i.test(metadata.skillFocus));
    return {
      ...row,
      difficultyLevel: Number(row.difficultyLevel ?? safeDifficulty),
      difficultyLabel: String(row.difficultyLabel ?? difficultyProfile.difficultyLabel),
      cognitiveDemand: String(row.cognitiveDemand ?? difficultyProfile.cognitiveDemand),
      scaffoldingLevel: String(row.scaffoldingLevel ?? difficultyProfile.scaffoldingLevel),
      visualRequired: inferredVisualRequired,
      visualType: inferredVisualRequired ? visualType : "none",
      visualPrompt: String(row.visualPrompt ?? (inferredVisualRequired ? `Create a ${visualType === "none" ? "diagram" : visualType} for ${metadata.topic || metadata.skillFocus}.` : "")),
      visualAltText: String(row.visualAltText ?? (inferredVisualRequired ? `${metadata.skillFocus} visual support` : "")),
    };
  };
  return records.map((item, index) => {
    const data = item as Record<string, unknown>;
    if (generationType === "punctuation" || generationType === "grammar" || generationType === "writing" || generationType === "english-language") {
      return withCommonFields({
        ...data,
        id: String(data.id ?? `lang-${index + 1}`),
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        prompt: String(data.prompt ?? data.question ?? data.sentence ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: String(data.answer ?? ""),
        options: Array.isArray(data.options) ? data.options : [],
        sentence: String(data.sentence ?? data.sentenceContext ?? ""),
        explanation: String(data.explanation ?? "Explain the language choice clearly."),
        hint: String(data.hint ?? "Read the sentence and apply the selected language skill."),
      });
    }

    if (generationType === "spelling" || generationType === "phonics") {
      return withCommonFields({
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        prompt: String(data.word ?? ""),
        answer: String(data.word ?? ""),
        sentence: String(data.sentenceContext ?? data.sentence ?? ""),
        explanation: String(data.explanation ?? `Practise the ${data.skillFocus ?? "spelling"} pattern.`),
        hint: String(data.hint ?? "Listen carefully and think about the sounds."),
      });
    }

    if (generationType === "science") {
      return withCommonFields({
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        topic: metadata.topic || metadata.skillFocus || String(data.topic ?? "science"),
        prompt: String(data.prompt ?? data.question ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: String(data.answer ?? ""),
        options: Array.isArray(data.choices)
          ? data.choices.map((value) => String(value))
          : Array.isArray(data.options)
            ? data.options.map((value) => String(value))
            : [],
        explanation: String(data.explanation ?? "Use scientific evidence and method to justify your answer."),
        hint: String(data.hint ?? "Identify key command words and use precise scientific vocabulary."),
      });
    }

    if (generationType === "languages") {
      return withCommonFields({
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        topic: metadata.topic || metadata.skillFocus || String(data.topic ?? "language"),
        prompt: String(data.prompt ?? data.question ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: String(data.answer ?? ""),
        options: Array.isArray(data.choices)
          ? data.choices.map((value) => String(value))
          : Array.isArray(data.options)
            ? data.options.map((value) => String(value))
            : [],
        explanation: String(data.explanation ?? "Use accurate language structures and meaning in context."),
        hint: String(data.hint ?? "Check tense, agreement, and translation meaning."),
        activityMode: String(data.activityMode ?? metadata.skillFocus),
      });
    }

    if (promptType === "maths") {
      return withCommonFields({
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        topic: metadata.topic || metadata.skillFocus || String(data.topic ?? "maths"),
        prompt: String(data.prompt ?? data.question ?? ""),
        question: String(data.question ?? data.prompt ?? ""),
        answer: data.answer,
        options: Array.isArray(data.choices) ? data.choices : Array.isArray(data.options) ? data.options : [],
        explanation: String(data.explanation ?? "Use the steps to solve the problem."),
        hint: String(data.hint ?? "Break the question into smaller parts."),
      });
    }

    return withCommonFields({
      ...data,
      id: String(data.id ?? `reading-${index + 1}`),
      type: sourceSubject,
      yearGroup: metadata.yearGroup,
      skillFocus: metadata.skillFocus,
      difficulty: metadata.difficulty,
    });
  });
}

function buildGeneratedPreview({
  subject,
  generationType,
  promptType,
  keyStage,
  yearGroup,
  curriculumPathway,
  curriculumFramework,
  countryRegion,
  examBoard,
  examBoardSource,
  examBoardConfidence,
  examBoardReason,
  skillFocus,
  difficulty,
  topic,
  content,
  visualPlan,
  graphContext,
}: {
  subject: Subject;
  generationType: GenerationType;
  promptType: PromptType;
  keyStage: string;
  yearGroup: string;
  curriculumPathway: string;
  curriculumFramework?: string;
  countryRegion?: string;
  examBoard: string | null;
  examBoardSource?: "auto" | "manual" | "school_default";
  examBoardConfidence?: number;
  examBoardReason?: string;
  skillFocus: string;
  difficulty: number;
  topic: string;
  content: unknown;
  visualPlan?: VisualGenerationPlan;
  graphContext?: GeneratedPreview["graphContext"];
}): GeneratedPreview {
  const items = normalizePreviewItems(generationType, promptType, subject, content, { yearGroup, skillFocus, difficulty, topic });
  const safeTopic = topic || skillFocus || generationType;
  const titleSuffix = promptType === "maths" ? "questions" : promptType === "science" ? "science set" : promptType === "reading" ? "reading set" : "practice";
  const effectiveVisualPlan: VisualGenerationPlan = visualPlan ?? {
    enabled: false,
    mode: "planned_only",
    maxPerContent: 0,
    allowedSubjects: [],
    requireAdminApproval: true,
  };
  const visualAssets = effectiveVisualPlan.enabled && effectiveVisualPlan.mode !== "none"
    ? buildPlannedVisualAssets({
      subject,
      yearGroup,
      keyStage,
      skillFocus,
      topic: safeTopic,
      items,
      maxVisuals: effectiveVisualPlan.maxPerContent,
      allowedSubjects: effectiveVisualPlan.allowedSubjects,
    })
    : [];
  const safeExamBoardSource = examBoardSource ?? "auto";
  const safeExamBoardConfidence = typeof examBoardConfidence === "number" ? examBoardConfidence : 0;
  const safeExamBoardReason = examBoardReason ?? "Not specified.";
  const safeCurriculumFramework = curriculumFramework ?? "National Curriculum England";
  const safeCountryRegion = countryRegion ?? "UK";
  return {
    title: `${yearGroup} ${skillFocus || subject} ${titleSuffix}`,
    subject,
    keyStage,
    yearGroup,
    curriculumPathway,
    curriculumFramework: safeCurriculumFramework,
    countryRegion: safeCountryRegion,
    examBoard,
    examBoardSource: safeExamBoardSource,
    examBoardConfidence: safeExamBoardConfidence,
    examBoardReason: safeExamBoardReason,
    skillFocus,
    difficulty,
    topic: safeTopic,
    status: "draft",
    safetyStatus: "passed",
    qualityScore: Math.min(100, Math.max(70, 82 + Math.min(12, items.length))),
    voiceScript: `Today we are practising ${skillFocus || subject}. Listen carefully, try your best, and use hints when you need them.`,
    imagePrompt: `Friendly UK curriculum illustration for ${yearGroup} ${subject} lesson about ${safeTopic}. Bright, safe, learner-friendly style.`,
    items,
    visualAssets,
    metadata: {
      generationType,
      promptType,
      parser: promptType === "reading" ? "reading-object" : "array-items",
    },
    curriculumContext: {
      pathway: curriculumPathway,
      examBoard,
      keyStage,
      yearGroup,
      subject,
      skillFocus,
      topic: safeTopic,
      examBoardSource: safeExamBoardSource,
      examBoardConfidence: safeExamBoardConfidence,
      examBoardReason: safeExamBoardReason,
      curriculumFramework: safeCurriculumFramework,
      countryRegion: safeCountryRegion,
    },
    graphContext,
  };
}

async function withExecutedVisualAssets(input: {
  preview: GeneratedPreview;
  visualPlan: VisualGenerationPlan;
  apiKey: string | null;
}) {
  const imageModel = (process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1").trim() || "gpt-image-1";
  const executed = await executeVisualGeneration({
    assets: input.preview.visualAssets,
    enabled: input.visualPlan.enabled,
    mode: input.visualPlan.mode,
    apiKey: input.apiKey,
    imageModel,
    maxVisuals: input.visualPlan.maxPerContent,
  });

  return {
    preview: {
      ...input.preview,
      visualAssets: executed.assets,
    },
    visualDiagnostics: executed.diagnostics,
  };
}

function attachSelectedMetadataToGeneratedItems(
  content: unknown,
  meta: {
    subject: Subject;
    subjectArea: "science" | "general";
    scienceDiscipline: ScienceDiscipline | null;
    contentType: GenerationType;
    englishStrand: EnglishStrand | null;
    yearGroup: string;
    keyStage: string;
    curriculumPathway: string;
    examBoard: string | null;
    examBoardSource?: "auto" | "manual" | "school_default";
    examBoardConfidence?: number;
    examBoardReason?: string;
    curriculumFramework?: string;
    countryRegion?: string;
    skillFocus: string;
    difficulty: number;
    difficultyLabel: string;
    cognitiveDemand: string;
    scaffoldingLevel: string;
    topic: string;
    activityType: string;
    masteryOutcome: string;
  },
): unknown[] {
  const records = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  return records.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      ...row,
      subject: meta.subject,
      subjectArea: meta.subjectArea,
      scienceDiscipline: meta.scienceDiscipline,
      contentType: meta.contentType,
      strand: meta.englishStrand,
      module: meta.englishStrand,
      yearGroup: meta.yearGroup,
      keyStage: meta.keyStage,
      curriculumPathway: meta.curriculumPathway,
      examBoard: meta.examBoard,
      examBoardSource: meta.examBoardSource ?? "auto",
      examBoardConfidence: typeof meta.examBoardConfidence === "number" ? meta.examBoardConfidence : 0,
      examBoardReason: meta.examBoardReason ?? "Not specified.",
      curriculumFramework: meta.curriculumFramework ?? "National Curriculum England",
      countryRegion: meta.countryRegion ?? "UK",
      skillFocus: meta.skillFocus,
      difficulty: meta.difficulty,
      level: meta.difficulty,
      difficultyLevel: meta.difficulty,
      difficultyLabel: meta.difficultyLabel,
      cognitiveDemand: meta.cognitiveDemand,
      scaffoldingLevel: meta.scaffoldingLevel,
      activityType: meta.activityType,
      masteryOutcome: meta.masteryOutcome,
      masteryTarget: meta.masteryOutcome,
      topic: meta.topic || row.topic,
      topicTheme: meta.topic || row.topic,
    };
  });
}

function pickMetadataSnapshot(item: unknown) {
  const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    yearGroup: row.yearGroup ?? null,
    keyStage: row.keyStage ?? null,
    subject: row.subject ?? null,
    subjectArea: row.subjectArea ?? null,
    scienceDiscipline: row.scienceDiscipline ?? null,
    curriculumPathway: row.curriculumPathway ?? null,
    examBoard: row.examBoard ?? null,
    examBoardSource: row.examBoardSource ?? null,
    examBoardConfidence: row.examBoardConfidence ?? null,
    examBoardReason: row.examBoardReason ?? null,
    curriculumFramework: row.curriculumFramework ?? null,
    countryRegion: row.countryRegion ?? null,
    strand: row.strand ?? row.module ?? null,
    skillFocus: row.skillFocus ?? null,
    topic: row.topic ?? null,
    activityType: row.activityType ?? null,
    masteryOutcome: row.masteryOutcome ?? row.masteryTarget ?? null,
  };
}

function normalizeSpellingItems(items: unknown[], yearGroup: string, skillFocus: string, level: number, topic: string) {
  return items.map((item, index) => {
    const data = item as Record<string, unknown>;
    const word = String(data.word ?? "").trim().toLowerCase();
    const categoryHint = String(data.categoryHint ?? "").trim() || topic || skillFocus || "general";
    return {
      ...data,
      id: String(data.id ?? `spell-${level}-${word || index + 1}`),
      word,
      hint: String(data.hint ?? "").trim(),
      sentenceContext: String(data.sentenceContext ?? "").trim(),
      categoryHint,
      syllables: String(data.syllables ?? "1").trim(),
      emoji: String(data.emoji ?? "🔤").trim(),
      spellingPattern: String(data.spellingPattern ?? ""),
      whyItMatchesSkill: String(data.whyItMatchesSkill ?? ""),
      validationLevel: String(data.validationLevel ?? "needs-review"),
      ageSuitability: String(data.ageSuitability ?? data.validationLevel ?? "needs-review"),
      skillFocusMatch: Boolean(data.skillFocusMatch ?? false),
      homophoneGroup: Array.isArray(data.homophoneGroup) ? data.homophoneGroup : null,
      firstWord: typeof data.firstWord === "string" ? data.firstWord : null,
      secondWord: typeof data.secondWord === "string" ? data.secondWord : null,
      yearGroup,
      skillFocus,
      difficulty: level,
    };
  });
}

function isSilentEFocus(skillFocus: string): boolean {
  return /silent\s*-?\s*e/i.test(skillFocus);
}

function hardCleanSpellingItems(items: unknown[], skillFocus: string): {
  cleaned: unknown[];
  removedWords: string[];
  fixesApplied: string[];
} {
  const seen = new Set<string>();
  const cleaned: unknown[] = [];
  const removedWords: string[] = [];
  const fixesApplied: string[] = [];
  const enforceSilentE = isSilentEFocus(skillFocus);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const key = String(data.word ?? "").trim().toLowerCase();
    if (!key) continue;

    if (seen.has(key)) {
      removedWords.push(key);
      fixesApplied.push(`Removed duplicate: ${key}`);
      continue;
    }

    if (enforceSilentE && !key.endsWith("e")) {
      removedWords.push(key);
      fixesApplied.push(`Removed non silent-e word: ${key}`);
      continue;
    }

    seen.add(key);
    cleaned.push({ ...data, word: key });
  }

  return { cleaned, removedWords, fixesApplied };
}

function repairScienceItemsForValidation(items: unknown[], input: {
  skillFocus: string;
  topic: string;
  yearGroup: string;
  discipline: ScienceDiscipline | null;
}) {
  return items.map((entry, index) => {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    let question = String(row.question ?? row.prompt ?? "").trim();
    if (!question) {
      question = `Explain ${input.topic || input.skillFocus || "the scientific concept"} using precise scientific vocabulary.`;
    }
    if (!/\b(explain|describe|calculate|evaluate|compare|justify|analyse|state|outline|predict)\b/i.test(question)) {
      question = `Explain: ${question}`;
    }

    let answer = String(row.answer ?? "").trim();
    let explanation = String(row.explanation ?? "").trim();
    if (!answer && explanation) {
      answer = explanation;
    }
    if (!answer) {
      answer = `Mark-scheme answer for ${input.discipline ?? "science"}: include correct scientific terms, units where relevant, and a concise conclusion.`;
    }
    if (!explanation) {
      explanation = `Mark-scheme explanation for ${input.yearGroup}: explain the science clearly with evidence and domain vocabulary.`;
    }
    if (answer.length < 24) {
      answer = `${answer}. Use precise scientific vocabulary and include a clear reasoning step.`;
    }
    if (explanation.length < 24) {
      explanation = `${explanation}. Include method, evidence, and an explicit scientific conclusion.`;
    }

    return {
      ...row,
      id: String(row.id ?? `science-repair-${index + 1}`),
      question,
      prompt: question,
      answer,
      explanation,
      choices: Array.isArray(row.choices)
        ? row.choices
        : Array.isArray(row.options)
          ? row.options
          : [answer, "Recheck scientific vocabulary and method.", "Review key command words in the question."],
    };
  });
}

async function generateValidatedSpellingContent({
  apiKey,
  systemPrompt,
  generationType,
  level,
  topic,
  ageGroup,
  count,
  keyStage,
  yearGroup,
  skillFocus,
  graphPromptContext,
  graphChecks,
}: {
  apiKey: string;
  systemPrompt: string;
  generationType: "spelling" | "phonics";
  level: number;
  topic: string;
  ageGroup: string;
  count: number;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  graphPromptContext?: string;
  graphChecks?: Parameters<typeof validateAiContentQuality>[0]["graphChecks"];
}) {
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const collected: unknown[] = [];
  const excludeWords = new Set<string>();
  const errors = new Set<string>();
  const fixesApplied = new Set<string>();
  const removedWords = new Set<string>();
  let regeneratedCount = 0;
  let regeneratedAfterValidation = false;
  let lastPrompt = "";
  let repairFeedback = "";

  for (let attempt = 0; attempt < 4 && collected.length < count; attempt += 1) {
    const needed = count - collected.length;
    const basePrompt = buildUserPrompt(
      "spelling",
      "spelling",
      level,
      topic,
      ageGroup,
      needed,
      keyStage,
      safeYearGroup,
      skillFocus,
      null,
      Array.from(excludeWords),
      [],
      [],
      repairFeedback,
    );
    lastPrompt = graphPromptContext ? `${basePrompt}\n\nGRAPH CONTEXT:\n${graphPromptContext}` : basePrompt;
    const { parsed } = await requestOpenAiJson(apiKey, systemPrompt, lastPrompt);
    const incoming = Array.isArray(parsed) ? parsed : [];
    const combined = [...collected, ...incoming];
    const quality = validateAiContentQuality({
      type: generationType,
      subject: "spelling",
      topic,
      keyStage,
      yearGroup: safeYearGroup,
      skillFocus,
      difficulty: level,
      requestedCount: count,
      graphChecks,
      items: combined,
      mode: "repair",
    });

    if (!quality.ok || !Array.isArray(quality.cleanedItems)) {
      throw new Error(quality.error ?? `No valid ${generationType} content remained after validation.`);
    }

    const normalized = normalizeSpellingItems(quality.cleanedItems, safeYearGroup, skillFocus, level, topic);
    const hardCleaned = hardCleanSpellingItems(normalized, skillFocus);
    for (const fix of hardCleaned.fixesApplied) fixesApplied.add(fix);
    for (const word of hardCleaned.removedWords) removedWords.add(word);
    const cleaned = hardCleaned.cleaned;
    collected.length = 0;
    collected.push(...cleaned.slice(0, count));

    for (const item of cleaned) {
      const word = String((item as Record<string, unknown>).word ?? "").trim().toLowerCase();
      if (word) excludeWords.add(word);
    }

    for (const error of quality.meta?.errors ?? []) errors.add(error);
    if ((quality.meta?.errors ?? []).length > 0) {
      regeneratedAfterValidation = true;
      repairFeedback = `Validation failed for: ${(quality.meta?.errors ?? []).slice(0, 8).join(", ")}. Generate stronger ${safeYearGroup} ${skillFocus} items and replace invalid entries only.`;
    }
    for (const fix of quality.meta?.fixesApplied ?? []) fixesApplied.add(fix);
    for (const word of quality.meta?.removedWords ?? []) removedWords.add(word);
    if (attempt > 0 && cleaned.length > regeneratedCount) {
      regeneratedCount += needed;
    }
  }

  const finalClean = hardCleanSpellingItems(collected, skillFocus);
  if (finalClean.cleaned.length < count) {
    throw new Error(`Unable to generate ${count} valid ${skillFocus || "spelling"} items after auto-repair.`);
  }
  for (const fix of finalClean.fixesApplied) fixesApplied.add(fix);
  for (const word of finalClean.removedWords) removedWords.add(word);

  return {
    content: finalClean.cleaned.slice(0, count),
    prompt: lastPrompt,
    validation: {
      valid: true,
      repaired: errors.size > 0 || fixesApplied.size > 0,
      aiGenerated: true,
      regeneratedAfterValidation,
      fallbackUsed: false,
      errors: Array.from(errors),
      fixesApplied: [
        ...Array.from(fixesApplied),
        ...(regeneratedAfterValidation ? ["AI output was revalidated and regenerated for invalid items."] : []),
        ...(regeneratedCount > 0 ? [`Regenerated ${regeneratedCount} replacement ${regeneratedCount === 1 ? "word" : "words"}`] : []),
      ],
      removedWords: Array.from(removedWords),
      regeneratedCount,
      requestedCount: count,
      finalCount: count,
      yearLevelMatch: true,
      subjectMatch: true,
      skillTopicMatch: true,
      difficultyMatch: true,
    },
  };
}

function buildValidatedSpellingFallback({
  keyStage,
  yearGroup,
  skillFocus,
  topic,
  count,
  difficulty,
}: {
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
}) {
  const fallbackItems = buildDeterministicSpellingFallback({
    keyStage,
    yearGroup,
    skillFocus,
    topic,
    count,
    difficulty,
  });
  const quality = validateAiContentQuality({
    type: "spelling",
    subject: "spelling",
    topic,
    keyStage,
    yearGroup,
    skillFocus,
    difficulty,
    requestedCount: count,
    items: fallbackItems,
    mode: "repair",
  });

  if (!quality.ok || !Array.isArray(quality.cleanedItems)) {
    throw new Error(quality.error ?? "Deterministic spelling fallback validation failed.");
  }

  const normalized = normalizeSpellingItems(quality.cleanedItems, yearGroup, skillFocus, difficulty, topic);
  const finalClean = hardCleanSpellingItems(normalized, skillFocus);
  if (finalClean.cleaned.length < count) {
    throw new Error(`Deterministic fallback could not create ${count} valid ${skillFocus || "spelling"} items.`);
  }

  return {
    content: finalClean.cleaned.slice(0, count),
    validation: {
      valid: true,
      repaired: false,
      aiGenerated: false,
      regeneratedAfterValidation: false,
      fallbackUsed: true,
      errors: [],
      fixesApplied: [],
      removedWords: [],
      regeneratedCount: 0,
      requestedCount: count,
      finalCount: count,
      yearLevelMatch: true,
      subjectMatch: true,
      skillTopicMatch: true,
      difficultyMatch: true,
    },
  };
}

function buildDeterministicGenericFallback(input: {
  type: "spelling" | "phonics" | "maths" | "reading" | "writing" | "grammar" | "punctuation" | "languages" | "science";
  subject: Subject;
  scienceDiscipline?: ScienceDiscipline | null;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
}) {
  const safeCount = Math.max(1, Math.min(10, input.count));
  const difficultyLabel = DIFFICULTY_PROFILE[input.difficulty]?.difficultyLabel ?? "Balanced challenge";
  const baseTopic = input.topic || input.skillFocus || "curriculum practice";
  const baseSkill = input.skillFocus || "core skill";
  const wordsByDifficulty = ["identify", "apply", "explain", "analyse", "justify"]; 

  if (input.type === "reading") {
    return Array.from({ length: safeCount }, (_, index) => {
      const verb = wordsByDifficulty[Math.min(4, Math.max(0, input.difficulty - 1))];
      const itemNumber = index + 1;
      const passage = `${input.yearGroup} ${baseTopic} lesson text ${index + 1}. Pupils ${verb} key ideas, use evidence, and connect the ${baseSkill.toLowerCase()} focus to the wider topic.`;
      return {
        id: `fallback-reading-${itemNumber}`,
        type: input.subject,
        passage,
        question: `In text ${itemNumber}, how does the passage ${verb} ${baseSkill.toLowerCase()} in ${baseTopic.toLowerCase()}?`,
        answer: `In text ${itemNumber}, it ${verb}s ${baseSkill.toLowerCase()} by using clear evidence from ${baseTopic.toLowerCase()}.`,
        options: [
          `It ignores ${baseSkill.toLowerCase()}.`,
          `It ${verb}s ${baseSkill.toLowerCase()} using evidence from text ${itemNumber}.`,
          `It is unrelated to ${baseTopic.toLowerCase()}.`,
        ],
        explanation: `This answer matches the ${input.yearGroup} ${difficultyLabel} reading focus.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "maths") {
    const base = input.difficulty * 5;
    return Array.from({ length: safeCount }, (_, index) => {
      const a = base + index + 6;
      const b = base + index + 3;
      const useMultiply = input.difficulty >= 4;
      const question = useMultiply
        ? `${a} x ${index + 2} then subtract ${b}. Explain your method for ${baseTopic.toLowerCase()}.`
        : `${a} + ${b} = ?`;
      const answer = useMultiply ? (a * (index + 2)) - b : a + b;
      return {
        id: `fallback-maths-${index + 1}`,
        type: input.subject,
        question,
        answer,
        choices: [answer, answer + 2, Math.max(0, answer - 2)],
        explanation: `Worked at ${difficultyLabel.toLowerCase()} for ${input.yearGroup}.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "science") {
    const chemistryPrompts = [
      "Explain the difference between an element, a compound and a mixture using one example of each.",
      "Describe what happens to atoms and bond energy in exothermic and endothermic reactions.",
      "Explain how electrolysis separates an ionic compound and identify the ions at each electrode.",
      "Describe how pH changes when an acid is neutralised by an alkali.",
    ];
    const physicsPrompts = [
      "Explain the difference between mass and weight, giving the correct SI units and a real-world example for each.",
      "A car has a mass of 1200 kg and accelerates at 2 m/s². Calculate the resultant force using F = m × a.",
      "Describe how current changes in a series circuit when resistance increases. State the equation linking voltage, current and resistance.",
      "State Newton's Second Law of Motion and use F = m × a to calculate the resultant force on a 600 g object accelerating at 3 m/s².",
    ];
    const biologyPrompts = [
      "Explain how diffusion and osmosis differ in living cells.",
      "Describe the role of enzymes in digestion and how temperature affects enzyme activity.",
      "Explain photosynthesis using the word equation and identify limiting factors.",
      "Describe how specialised cells are adapted for their functions in plants or animals.",
    ];
    const sciencePrompts = input.scienceDiscipline === "chemistry"
      ? chemistryPrompts
      : input.scienceDiscipline === "biology"
        ? biologyPrompts
        : physicsPrompts;
    return Array.from({ length: safeCount }, (_, index) => {
      const question = sciencePrompts[index % sciencePrompts.length];
      const answer = question.includes("1200 kg")
        ? "2400 N"
        : question.includes("600 g")
          ? "1.8 N"
          : `Model science answer for ${baseSkill.toLowerCase()} in ${baseTopic.toLowerCase()}.`;
      const explanation = question.includes("1200 kg")
        ? "Use F = m × a, so 1200 × 2 = 2400 N. Force is measured in Newtons (N)."
        : question.includes("600 g")
          ? "Convert 600 g to 0.6 kg, then F = 0.6 × 3 = 1.8 N."
          : `Science explanation aligned to ${input.yearGroup} ${difficultyLabel.toLowerCase()} expectations. Use scientific vocabulary and evidence.`;
      return {
        id: `fallback-science-${index + 1}`,
        type: input.subject,
        question,
        answer,
        choices: [
          String(answer),
          "Review the equation and units before choosing.",
          "Re-check the scientific context in the question.",
        ],
        explanation,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "languages") {
    return Array.from({ length: safeCount }, (_, index) => ({
      id: `fallback-lang-${index + 1}`,
      type: input.subject,
      question: `Translation task ${index + 1}: ${baseTopic} (${baseSkill}).`,
      answer: `Provide a ${input.yearGroup} level translation using ${baseSkill.toLowerCase()}.`,
      englishMeaning: `Practice meaning for ${baseTopic}.`,
      targetVocabulary: `${baseTopic} vocabulary ${index + 1}`,
      activityMode: "translation",
      explanation: `Calibrated for ${input.yearGroup} at ${difficultyLabel.toLowerCase()}.`,
      yearGroup: input.yearGroup,
      skillFocus: baseSkill,
      topic: baseTopic,
      difficulty: input.difficulty,
    }));
  }

  const field = input.type === "writing" ? "prompt" : "question";
  return Array.from({ length: safeCount }, (_, index) => {
    const stem = `${input.yearGroup} ${baseTopic} ${input.type} task ${index + 1}: ${wordsByDifficulty[Math.min(4, Math.max(0, input.difficulty - 1))]} ${baseSkill.toLowerCase()} clearly.`;
    return {
      id: `fallback-${input.type}-${index + 1}`,
      type: input.subject,
      [field]: stem,
      answer: `Model response for ${baseSkill} in ${baseTopic}.`,
      options: [
        "Option A",
        "Option B",
        "Option C",
      ],
      explanation: `This item is aligned to ${input.yearGroup}, ${baseSkill}, and difficulty ${input.difficulty}/5.`,
      hint: `Use ${baseSkill.toLowerCase()} accurately in ${baseTopic.toLowerCase()}.`,
      yearGroup: input.yearGroup,
      skillFocus: baseSkill,
      topic: baseTopic,
      difficulty: input.difficulty,
    };
  });
}

function buildValidatedGenericFallback(input: {
  type: "spelling" | "phonics" | "maths" | "reading" | "writing" | "grammar" | "punctuation" | "languages" | "science";
  subject: Subject;
  scienceDiscipline?: ScienceDiscipline | null;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
}) {
  const fallbackItems = buildDeterministicGenericFallback(input);
  const quality = validateAiContentQuality({
    type: input.type,
    subject: input.subject,
    topic: input.topic,
    keyStage: input.keyStage,
    yearGroup: input.yearGroup,
    skillFocus: input.skillFocus,
    difficulty: input.difficulty,
    requestedCount: input.count,
    items: fallbackItems,
    mode: "repair",
  });

  if (!quality.ok || !Array.isArray(quality.cleanedItems) || quality.cleanedItems.length < input.count) {
    throw new Error(quality.error ?? "Deterministic fallback validation failed.");
  }

  return {
    content: quality.cleanedItems.slice(0, input.count),
    validation: {
      ...(quality.meta ?? {}),
      valid: true,
      repaired: false,
      aiGenerated: false,
      regeneratedAfterValidation: false,
      fallbackUsed: true,
      requestedCount: input.count,
      finalCount: input.count,
    },
  };
}

async function generateValidatedStructuredContent(input: {
  apiKey: string;
  systemPrompt: string;
  promptType: PromptType;
  validatorType: "spelling" | "phonics" | "punctuation" | "grammar" | "writing" | "reading" | "maths" | "languages" | "science";
  subject: Subject;
  generationType: GenerationType;
  level: number;
  topic: string;
  ageGroup: string;
  count: number;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  examBoard: string | null;
  targetSkills: string[];
  weakAreas: string[];
  curriculumPathway: string;
  englishStrand: EnglishStrand | null;
  activityType: string;
  masteryOutcome: string;
  scienceDiscipline: ScienceDiscipline | null;
  graphPromptContext?: string;
  graphChecks?: Parameters<typeof validateAiContentQuality>[0]["graphChecks"];
}) {
  const errors = new Set<string>();
  const fixesApplied = new Set<string>();
  let regeneratedCount = 0;
  let repairFeedback = "";
  let promptUsed = "";
  let generatedMetadataSnapshot: Record<string, unknown> | null = null;
  let normalizedMetadataSnapshot: Record<string, unknown> | null = null;
  const acceptedItems: unknown[] = [];
  const providerDiagnostics: Array<Record<string, unknown>> = [];
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remaining = Math.max(1, input.count - acceptedItems.length);
    const basePrompt = buildUserPrompt(
      input.promptType,
      input.subject,
      input.level,
      input.topic,
      input.ageGroup,
      remaining,
      input.keyStage,
      input.yearGroup,
      input.skillFocus,
      input.examBoard,
      [],
      input.targetSkills,
      input.weakAreas,
      repairFeedback,
      input.scienceDiscipline,
    );
    promptUsed = input.graphPromptContext ? `${basePrompt}\n\nGRAPH CONTEXT:\n${input.graphPromptContext}` : basePrompt;

    const response = await requestOpenAiJson(input.apiKey, input.systemPrompt, promptUsed);
    providerDiagnostics.push(response.providerMeta as Record<string, unknown>);
    generatedMetadataSnapshot = pickMetadataSnapshot(Array.isArray(response.parsed) ? response.parsed[0] : response.parsed);
    const difficultyProfile = DIFFICULTY_PROFILE[input.level] ?? DIFFICULTY_PROFILE[3];
    const normalizedBeforeValidation = attachSelectedMetadataToGeneratedItems(response.parsed, {
      subject: input.subject,
      subjectArea: input.generationType === "science" ? "science" : "general",
      scienceDiscipline: input.scienceDiscipline,
      contentType: input.generationType,
      englishStrand: input.englishStrand,
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      curriculumPathway: input.curriculumPathway,
      examBoard: input.examBoard,
      skillFocus: input.skillFocus,
      difficulty: input.level,
      difficultyLabel: difficultyProfile.difficultyLabel,
      cognitiveDemand: difficultyProfile.cognitiveDemand,
      scaffoldingLevel: difficultyProfile.scaffoldingLevel,
      topic: input.topic,
      activityType: input.activityType,
      masteryOutcome: input.masteryOutcome,
    });
    let prevalidatedItems = input.validatorType === "science"
      ? repairScienceItemsForValidation(normalizedBeforeValidation, {
        skillFocus: input.skillFocus,
        topic: input.topic,
        yearGroup: input.yearGroup,
        discipline: input.scienceDiscipline,
      })
      : normalizedBeforeValidation;

    if (
      input.validatorType === "reading"
      && Array.isArray(prevalidatedItems)
      && response.parsed
      && typeof response.parsed === "object"
      && !Array.isArray(response.parsed)
    ) {
      const parsedObject = response.parsed as Record<string, unknown>;
      const passage = String(parsedObject.passage ?? "").trim();
      const currentCount = prevalidatedItems.length;
      if (passage && currentCount < remaining) {
        const synthesizedItems = synthesizeReadingItemsFromPassage({
          passage,
          count: remaining - currentCount,
          yearGroup: input.yearGroup,
          skillFocus: input.skillFocus,
          difficulty: input.level,
        });
        prevalidatedItems = [...prevalidatedItems, ...synthesizedItems];
      }
    }

    const candidateItems = [...acceptedItems, ...prevalidatedItems];

    const quality = validateAiContentQuality({
      type: input.validatorType,
      subject: input.subject,
      topic: input.topic,
      keyStage: input.keyStage,
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: input.level,
      requestedCount: input.count,
      graphChecks: input.graphChecks,
      items: candidateItems,
      mode: "repair",
    });

    if (quality.ok && Array.isArray(quality.cleanedItems) && quality.cleanedItems.length >= input.count) {
      const finalParsed = quality.cleanedItems.slice(0, input.count);
      normalizedMetadataSnapshot = pickMetadataSnapshot(Array.isArray(finalParsed) ? finalParsed[0] : finalParsed);
      return {
        content: finalParsed,
        prompt: promptUsed,
        validation: {
          ...(quality.meta as Record<string, unknown>),
          aiGenerated: true,
          regeneratedAfterValidation: regeneratedCount > 0 || Boolean(quality.meta?.repaired),
          fallbackUsed: false,
          regeneratedCount,
          requestedCount: input.count,
          finalCount: input.count,
          repairDiagnostics: response.repairDiagnostics,
          validationDiagnostics: quality.meta?.diagnostics,
          rawOpenAiResponse: response.providerMeta,
          subjectContainment: quality.meta?.diagnostics?.contaminationDetected ? "failed" : "passed",
          contaminatedItemsRepaired: quality.meta?.diagnostics?.repairedItemsCount ?? 0,
          contaminatedItemsRejected: quality.meta?.diagnostics?.rejectedItemsCount ?? 0,
          scienceDiscipline: input.scienceDiscipline,
        },
        generatedMetadataSnapshot,
        normalizedMetadataSnapshot,
      };
    }

    if (Array.isArray(quality.cleanedItems) && quality.cleanedItems.length > acceptedItems.length) {
      acceptedItems.length = 0;
      acceptedItems.push(...quality.cleanedItems.slice(0, input.count));
    }

    for (const issue of quality.meta?.errors ?? []) errors.add(issue);
    for (const fix of quality.meta?.fixesApplied ?? []) fixesApplied.add(fix);
    regeneratedCount += 1;

    const diagnostics = quality.meta?.diagnostics;
    const missingCount = Math.max(0, input.count - acceptedItems.length);
    repairFeedback = `Validation issues: ${Array.from(errors).slice(0, 8).join(", ")}.
Missing valid items: ${missingCount}.
Reject reasons: ${(diagnostics?.rejectionReasons ?? []).slice(0, 8).join(", ") || "none"}.
Contamination keywords: ${(diagnostics?.rejectedKeywords ?? []).slice(0, 8).join(", ") || "none"}.
Subject drift: ${(diagnostics?.detectedSubjectDrift ?? []).join(", ") || "none"}.
Regenerate ONLY replacement items. Keep the same JSON schema, command words, mark-scheme style answers, and strict discipline containment.`;
  }

  const latestPreview = providerDiagnostics.length > 0
    ? String(providerDiagnostics[providerDiagnostics.length - 1]?.contentPreview ?? "")
    : "";
  const latestPreviewInline = latestPreview ? ` Last OpenAI preview: ${truncateForDiagnostics(latestPreview, 320)}.` : "";
  throw new Error(`No valid ${input.subject} content remained after validation. Rejections: ${Array.from(errors).slice(0, 10).join(", ") || "unknown"}. Raw diagnostics captured: ${providerDiagnostics.length}.${latestPreviewInline}`);
}

export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (!session) return response;

  if (!checkGenerationRateLimit(session.userId)) {
    return NextResponse.json({
      success: false,
      error: "AI generation limit reached. Please wait a minute before trying again.",
      aiMode: "live_openai_only",
      keySource: "none",
      generationMetadata: {
        aiMode: "live_openai_only",
        generationSource: "mock",
        provider: "openai",
        model: OPENAI_MODEL,
        usedFallback: false,
        fallbackReason: "rate_limited",
        validationStatus: "failed",
        keySource: "none",
        openAiAttempted: false,
        openAiSucceeded: false,
      },
    }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({
      success: false,
      error: "Invalid JSON payload for AI generation request.",
      aiMode: "live_openai_only",
      keySource: "none",
      generationMetadata: {
        aiMode: "live_openai_only",
        generationSource: "mock",
        provider: "openai",
        model: OPENAI_MODEL,
        usedFallback: false,
        fallbackReason: "invalid_json_payload",
        validationStatus: "failed",
        keySource: "none",
        openAiAttempted: false,
        openAiSucceeded: false,
      },
      details: { category: "validation", stage: "request-body" },
    }, { status: 400 });
  }
  const aiMode: AiGenerationMode = parseAiGenerationMode(body.aiMode);
  const openAiConfig = await getOpenAiApiKeyWithSource();
  const keySource = openAiConfig.keySource;

  const requestedSubject = (body.subject ?? body.type) as string;
  const normalizedSubject = normalizeSubject(String(requestedSubject ?? ""));
  if (!normalizedSubject) {
    return NextResponse.json({
      success: false,
      error: `Unsupported subject: ${requestedSubject || "(empty)"}.`,
      aiMode,
      keySource,
      generationMetadata: {
        aiMode,
        generationSource: "mock",
        provider: "openai",
        model: OPENAI_MODEL,
        usedFallback: false,
        fallbackReason: "unsupported_subject",
        validationStatus: "failed",
        keySource,
        openAiAttempted: false,
        openAiSucceeded: false,
      },
      details: {
        category: "unsupported_subject",
        supportedSubjects: Object.keys(GENERATION_CONTENT_TYPE_BY_SUBJECT),
      },
    }, { status: 422 });
  }
  const sourceSubject = normalizedSubject;
  const isEnglishParent = isEnglishParentSubject(sourceSubject);
  const englishStrand = isEnglishParent ? normalizeEnglishStrand(body.englishStrand) : null;
  if (isEnglishParent && !englishStrand) {
    return NextResponse.json({
      success: false,
      error: "Please choose an English strand before generating content.",
      aiMode,
      keySource,
      generationMetadata: {
        aiMode,
        generationSource: "mock",
        provider: "openai",
        model: OPENAI_MODEL,
        usedFallback: false,
        fallbackReason: "missing_english_strand",
        validationStatus: "failed",
        keySource,
        openAiAttempted: false,
        openAiSucceeded: false,
      },
      details: {
        category: "validation_error",
        field: "englishStrand",
        allowed: ["phonics", "spelling", "reading", "comprehension", "grammar", "punctuation", "writing", "vocabulary"],
      },
    }, { status: 422 });
  }
  const requestedCount = body.itemCount ?? body.numberOfItems ?? body.count;
  const requestedLevel = body.difficulty ?? body.level;
  const rawYearGroup = typeof body.yearGroup === "string" ? body.yearGroup : "Year 1";
  const rawTopic = body.topicTheme ?? body.topic;

  const parentGenerationType = mapSubjectToGenerationType(sourceSubject);
  const generationType = englishStrand ? englishStrandToGenerationType(englishStrand) : parentGenerationType;
  const promptType = englishStrand ? mapEnglishStrandToPromptType(englishStrand) : mapGenerationTypeToPromptType(generationType);
  const level = typeof requestedLevel === "number" ? requestedLevel : Number(requestedLevel);
  const topic = typeof rawTopic === "string" ? rawTopic : "";
  const ageGroup = typeof body.ageGroup === "string" ? body.ageGroup : ageGroupForYearGroup(rawYearGroup);
  const count = Math.max(1, Math.min(10, Number(requestedCount ?? BATCH_SIZE)));
  const keyStage = typeof body.keyStage === "string" ? body.keyStage : "KS1";
  const yearGroup = typeof body.yearGroup === "string" ? body.yearGroup : "";
  const requestedCurriculumPathway = typeof body.curriculumPathway === "string"
    ? body.curriculumPathway
    : curriculumPathwayForYearGroup(yearGroup);
  const requestedExamBoard = typeof body.examBoard === "string" ? body.examBoard : null;
  const countryRegion = typeof body.countryRegion === "string" ? body.countryRegion : "UK";
  const requestedCurriculumFramework = typeof body.curriculumFramework === "string" ? body.curriculumFramework : null;
  const autoSelectExamBoard = body.autoSelectExamBoard !== false;
  const manualOverrideAllowed = body.manualExamBoardOverrideAllowed !== false;
  const schoolDefaults = body.schoolExamBoardSettings && typeof body.schoolExamBoardSettings === "object"
    ? body.schoolExamBoardSettings as {
      defaultCountryRegion?: string | null;
      defaultCurriculumFramework?: string | null;
      preferredGcseBoardsBySubject?: Record<string, string | null | undefined>;
      preferredSchoolExamBoard?: string | null;
      autoSelectEnabled?: boolean;
      manualOverrideAllowed?: boolean;
    }
    : undefined;
  const skillFocus = typeof body.skillFocus === "string" ? body.skillFocus : "";
  // Skill-first targeting
  const targetSkills: string[] = Array.isArray(body.targetSkills) ? (body.targetSkills as string[]) : [];
  const weakAreas: string[] = Array.isArray(body.weakAreas) ? (body.weakAreas as string[]) : [];
  const activityType = typeof body.activityType === "string" ? body.activityType.trim() : "";
  const masteryOutcome = typeof body.masteryOutcome === "string" ? body.masteryOutcome.trim() : "";
  // If targetSkills provided, derive skillFocus label from the first one
  const resolvedSkillFocus = skillFocus || (targetSkills.length ? (SKILL_MAP[targetSkills[0]]?.label ?? targetSkills[0]) : "");
  const validatorType = englishStrand
    ? mapEnglishStrandToValidatorType(englishStrand)
    : mapGenerationTypeToValidatorType(generationType, resolvedSkillFocus);
  const scienceDiscipline = generationType === "science"
    ? resolveScienceDiscipline(sourceSubject, resolvedSkillFocus)
    : null;

  const maxLevel = 5;
  const safeLevel = Math.max(1, Math.min(maxLevel, Number.isFinite(level) ? level : 1));
  const safeYearGroup = normalizeYearGroup(yearGroup || ageGroup, keyStage);
  const safeKeyStage = keyStageForYearGroup(safeYearGroup);
  const requestedStudentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const studentGraph = requestedStudentId
    ? await buildAcademicSourceForStudent(requestedStudentId)
      .then((source) => source ? buildAcademicIntelligence(source).curriculumIntelligenceGraph : null)
      .catch(() => null)
    : null;
  const graphPromptContext = studentGraph ? buildGraphAwarePromptContext(studentGraph) : "";
  const graphChecks = studentGraph
    ? buildGraphContentQualityChecks({
      graph: studentGraph,
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      keyStage: safeKeyStage,
      topic,
    })
    : undefined;

  const allowedSubjectsForYear = aiGeneratorSubjectsForYearGroup(safeYearGroup);
  if (!allowedSubjectsForYear.includes(sourceSubject)) {
    return NextResponse.json({
      success: false,
      error: `${sourceSubject} is not available for ${safeYearGroup}.`,
      aiMode,
      keySource,
      details: {
        category: "unsupported_subject_for_year",
        yearGroup: safeYearGroup,
        subject: sourceSubject,
        allowedSubjects: allowedSubjectsForYear,
      },
    }, { status: 422 });
  }

  const safeCurriculumPathway = requestedCurriculumPathway || curriculumPathwayForYearGroup(safeYearGroup);
  const examBoardRecommendation = resolveExamBoardRecommendation({
    subject: sourceSubject,
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    skillFocus: resolvedSkillFocus,
    countryRegion,
    curriculumFramework: requestedCurriculumFramework,
    schoolDefaults,
  });
  const effectiveAutoSelectExamBoard = autoSelectExamBoard && schoolDefaults?.autoSelectEnabled !== false;
  const selectedExamBoard = resolveExamBoardSelection({
    manualExamBoard: requestedExamBoard,
    recommendation: examBoardRecommendation,
    manualOverrideAllowed: schoolDefaults?.manualOverrideAllowed ?? manualOverrideAllowed,
  });
  const safeExamBoard = shouldApplyExamBoardTag({
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    curriculumPathway: safeCurriculumPathway,
    subject: sourceSubject,
  }) ? (effectiveAutoSelectExamBoard ? (selectedExamBoard.examBoard ?? normalizeExamBoard(requestedExamBoard)) : normalizeExamBoard(requestedExamBoard)) : null;
  const examBoardSource = effectiveAutoSelectExamBoard
    ? selectedExamBoard.examBoardSource
    : (normalizeExamBoard(requestedExamBoard) ? "manual" : "auto");
  const curriculumFramework = selectedExamBoard.curriculumFramework || examBoardRecommendation.curriculumFramework;
  const examBoardConfidence = selectedExamBoard.examBoardConfidence;
  const examBoardReason = selectedExamBoard.examBoardReason;

  const envVisualEnabled = process.env.AI_VISUAL_GENERATION_ENABLED === "1";
  const envVisualMode = (process.env.AI_VISUAL_GENERATION_DEFAULT_MODE ?? "planned_only").trim().toLowerCase();
  const envVisualMax = Number(process.env.AI_VISUAL_GENERATION_MAX_PER_CONTENT ?? "2");
  const requestVisualEnabled = body.aiVisualGenerationEnabled;
  const visualModeRaw = typeof body.visualGenerationMode === "string" ? body.visualGenerationMode.trim().toLowerCase() : envVisualMode;
  const visualMode: VisualGenerationMode = visualModeRaw === "none" || visualModeRaw === "generate_now" || visualModeRaw === "planned_only"
    ? visualModeRaw
    : "planned_only";
  const maxVisualsRaw = typeof body.maxVisualsPerLesson === "number" ? body.maxVisualsPerLesson : envVisualMax;
  const allowedSubjectsRaw = Array.isArray(body.visualAllowedSubjects) ? body.visualAllowedSubjects : [];
  const visualAllowedSubjects = allowedSubjectsRaw
    .map((entry) => normalizeSubject(typeof entry === "string" ? entry : ""))
    .filter((entry): entry is Subject => Boolean(entry));
  const visualEnabled = typeof requestVisualEnabled === "boolean" ? requestVisualEnabled : envVisualEnabled;
  const effectiveVisualMode: VisualGenerationMode = visualEnabled && visualMode === "planned_only" && shouldAutoGenerateVisuals(generationType)
    ? "generate_now"
    : visualMode;
  const effectiveVisualAllowedSubjects = visualAllowedSubjects.length > 0 && !visualAllowedSubjects.includes(sourceSubject)
    ? [...visualAllowedSubjects, sourceSubject]
    : visualAllowedSubjects;
  const visualPlan: VisualGenerationPlan = {
    enabled: visualEnabled,
    mode: effectiveVisualMode,
    maxPerContent: Math.max(0, Math.min(6, Number.isFinite(Number(maxVisualsRaw)) ? Number(maxVisualsRaw) : 2)),
    allowedSubjects: effectiveVisualAllowedSubjects,
    requireAdminApproval: body.requireVisualApproval !== false,
  };

  const examBoardRequired = shouldApplyExamBoardTag({
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    curriculumPathway: safeCurriculumPathway,
    subject: sourceSubject,
  });
  if (examBoardRequired && !safeExamBoard) {
    return NextResponse.json({
      success: false,
      error: "GCSE content requires an exam board.",
      aiMode,
      keySource,
      generationMetadata: {
        aiMode,
        generationSource: "mock",
        provider: "openai",
        model: OPENAI_MODEL,
        usedFallback: false,
        fallbackReason: "missing_exam_board",
        validationStatus: "failed",
        keySource,
        openAiAttempted: false,
        openAiSucceeded: false,
      },
      details: {
        category: "validation_error",
        field: "examBoard",
        allowed: ["AQA", "Edexcel", "OCR", "WJEC / Eduqas", "CCEA", "General GCSE"],
      },
    }, { status: 422 });
  }

  const pathSubject: Subject = (() => {
    if (!englishStrand) return sourceSubject;
    const isGcseEnglish = sourceSubject === "gcse-english"
      || sourceSubject === "gcse-english-language"
      || sourceSubject === "gcse-english-literature";
    if (isGcseEnglish) {
      return sourceSubject === "gcse-english" ? "gcse-english-language" : sourceSubject;
    }
    return englishStrandToSubject(englishStrand);
  })();
  const allowedSkillsForPath = skillsForSubjectAndYear(pathSubject, safeYearGroup);
  if (resolvedSkillFocus && allowedSkillsForPath.length > 0 && !allowedSkillsForPath.includes(resolvedSkillFocus)) {
    return NextResponse.json({
      success: false,
      error: `Skill focus \"${resolvedSkillFocus}\" is not mapped for ${pathSubject} in ${safeYearGroup}.`,
      aiMode,
      keySource,
      details: {
        category: "unsupported_skill_for_subject_year",
        yearGroup: safeYearGroup,
        subject: pathSubject,
        skillFocus: resolvedSkillFocus,
        allowedSkills: allowedSkillsForPath,
      },
    }, { status: 422 });
  }
  const pathValidation = isValidCurriculumPath({
    yearGroup: safeYearGroup,
    subject: pathSubject,
    skillFocus: resolvedSkillFocus,
    topic: topic,
  });
  if (!pathValidation.ok) {
    const mappedTopics = topicSuggestionsForSelection({
      yearGroup: safeYearGroup,
      subject: pathSubject,
      skillFocus: resolvedSkillFocus,
    });
    return NextResponse.json({
      success: false,
      error: pathValidation.reason,
      aiMode,
      keySource,
      generationMetadata: {
        aiMode,
        generationSource: "mock",
        provider: "local",
        model: "local-fallback",
        usedFallback: false,
        fallbackReason: "subject_mapping_failure",
        validationStatus: "failed",
        keySource,
        openAiAttempted: false,
        openAiSucceeded: false,
      },
      providerUsed: "local_fallback",
      fallbackReason: "subject_mapping_failure",
      validationReason: pathValidation.reason,
      generationType,
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      keyStage: safeKeyStage,
      skillFocus: resolvedSkillFocus,
      topic,
      activityType,
      strand: englishStrand,
      generationDebug: {
        providerAttempted: false,
        providerUsed: "local_fallback",
        openAiKeyFoundServerSide: false,
        fallbackReason: "subject_mapping_failure",
        validationReason: pathValidation.reason,
        mappingStatus: "unmapped",
        subjectRoute: `${pathSubject}->${generationType}`,
        fallbackTemplate: null,
        generationType,
        subject: sourceSubject,
        yearGroup: safeYearGroup,
        keyStage: safeKeyStage,
        skillFocus: resolvedSkillFocus,
        topic,
        activityType,
        strand: englishStrand,
      },
      details: {
        category: "unsupported_path",
        yearGroup: safeYearGroup,
        keyStage: safeKeyStage,
        subject: sourceSubject,
        pathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        mappedTopics,
      },
    }, { status: 422 });
  }

  const generationDiagnostics = {
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    subject: sourceSubject,
    pathway: safeCurriculumPathway,
    examBoard: safeExamBoard,
    examBoardSource,
    examBoardConfidence,
    examBoardReason,
    curriculumFramework,
    countryRegion: examBoardRecommendation.countryRegion,
    skillFocus: resolvedSkillFocus,
    generationType,
    parentGenerationType,
    englishStrand,
    promptBuilder: promptType,
    parserUsed: promptType === "reading" ? "reading-object" : "array-items",
    scienceDiscipline,
    visualGeneration: {
      enabled: visualPlan.enabled,
      mode: visualPlan.mode,
      maxPerContent: visualPlan.maxPerContent,
      allowedSubjects: visualPlan.allowedSubjects,
      requireAdminApproval: visualPlan.requireAdminApproval,
    },
  };
  const subjectRoute = `${pathSubject}->${generationType}`;
  const sharedGenerationFields = {
    aiMode,
    generationType,
    subject: sourceSubject,
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    skillFocus: resolvedSkillFocus,
    topic,
    activityType,
    strand: englishStrand,
    examBoardSource,
    curriculumFramework,
    countryRegion: examBoardRecommendation.countryRegion,
    scienceDiscipline,
  };
  const buildGenerationDebug = (input: {
    providerAttempted: boolean;
    providerUsed: "openai" | "local_fallback";
    openAiKeyFoundServerSide: boolean;
    fallbackReason: string | null;
    validationReason: string | null;
    mappingStatus: "mapped" | "unmapped";
    fallbackTemplate: string | null;
    subjectContainment?: "passed" | "failed";
    contaminatedItemsRepaired?: number;
    contaminatedItemsRejected?: number;
  }) => ({
    ...input,
    subjectRoute,
    ...sharedGenerationFields,
  });
  console.info("[admin-ai-generate] request", {
    ...generationDiagnostics,
    count,
    difficulty: safeLevel,
    topic,
  });

  const apiKey = openAiConfig.apiKey;
  const fallbackAllowed = isFallbackAllowed(aiMode);

  const buildMetadata = (input: {
    generationSource: "openai" | "fallback" | "repair" | "mock";
    provider: "openai" | "local";
    model: string;
    fallbackReason?: string | null;
    validation: unknown;
    openAiAttempted: boolean;
    openAiSucceeded: boolean;
  }) => buildGenerationMetadata({
    aiMode,
    generationSource: input.generationSource,
    provider: input.provider,
    model: input.model,
    fallbackReason: input.fallbackReason ?? null,
    validation: input.validation,
    keySource,
    openAiAttempted: input.openAiAttempted,
    openAiSucceeded: input.openAiSucceeded,
  });

  const buildLiveOnlyFailure = (input: {
    code: string;
    message: string;
    reason: string;
    status: number;
    openAiAttempted: boolean;
  }) => {
    const generationMetadata = buildMetadata({
      generationSource: "mock",
      provider: "openai",
      model: OPENAI_MODEL,
      fallbackReason: input.reason,
      validation: { valid: false, repaired: false },
      openAiAttempted: input.openAiAttempted,
      openAiSucceeded: false,
    });
    return NextResponse.json({
      success: false,
      errorCode: input.code,
      message: input.message,
      error: input.message,
      aiMode,
      keySource,
      generationMetadata,
      providerUsed: "openai",
      fallbackReason: input.reason,
      validationReason: input.message,
      generationType,
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      keyStage: safeKeyStage,
      skillFocus: resolvedSkillFocus,
      topic,
      activityType,
      strand: englishStrand,
      generationDebug: buildGenerationDebug({
        providerAttempted: aiMode !== "fallback_only",
        providerUsed: "openai",
        openAiKeyFoundServerSide: keySource !== "none",
        fallbackReason: input.reason,
        validationReason: input.message,
        mappingStatus: "mapped",
        fallbackTemplate: null,
      }),
    }, { status: input.status });
  };

  if (aiMode === "fallback_only") {
    try {
      if (generationType === "spelling") {
        const fallback = buildValidatedSpellingFallback({
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus || "Prefixes",
          topic,
          count,
          difficulty: safeLevel,
        });
        const preview = buildGeneratedPreview({
          subject: sourceSubject,
          generationType,
          promptType,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          difficulty: safeLevel,
          topic,
          content: fallback.content,
          visualPlan,
        });
        const generationMetadata = buildMetadata({
          generationSource: "fallback",
          provider: "local",
          model: "local-fallback",
          fallbackReason: "fallback_only_mode",
          validation: fallback.validation,
          openAiAttempted: false,
          openAiSucceeded: false,
        });
        return NextResponse.json({
          success: true,
          aiMode,
          keySource,
          generationMetadata,
          type: promptType,
          generationType,
          level: safeLevel,
          topic,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          model: "local-fallback",
          prompt: "Deterministic spelling fallback",
          estimatedCostPence: 0,
          estimatedTokens: 0,
          providerUsed: "local_fallback",
          fallbackReason: "fallback_only_mode",
          validationReason: null,
          generationDebug: buildGenerationDebug({
            providerAttempted: false,
            providerUsed: "local_fallback",
            openAiKeyFoundServerSide: keySource !== "none",
            fallbackReason: "fallback_only_mode",
            validationReason: null,
            mappingStatus: "mapped",
            fallbackTemplate: "deterministic_spelling",
          }),
          content: preview,
          meta: fallback.validation,
          fallback: {
            used: true,
            reasonCode: "fallback_only_mode",
            message: "Generated in fallback-only mode.",
          },
        });
      }

      const fallback = buildValidatedGenericFallback({
        type: validatorType,
        subject: sourceSubject,
        scienceDiscipline,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Core skill",
        topic,
        count,
        difficulty: safeLevel,
      });
      const preview = buildGeneratedPreview({
        subject: sourceSubject,
        generationType,
        promptType,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        difficulty: safeLevel,
        topic,
        content: fallback.content,
        visualPlan,
      });
      const generationMetadata = buildMetadata({
        generationSource: "fallback",
        provider: "local",
        model: "local-fallback",
        fallbackReason: "fallback_only_mode",
        validation: fallback.validation,
        openAiAttempted: false,
        openAiSucceeded: false,
      });
      return NextResponse.json({
        success: true,
        aiMode,
        keySource,
        generationMetadata,
        type: promptType,
        generationType,
        level: safeLevel,
        topic,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        model: "local-fallback",
        prompt: "Deterministic subject fallback",
        estimatedCostPence: 0,
        estimatedTokens: 0,
        providerUsed: "local_fallback",
        fallbackReason: "fallback_only_mode",
        validationReason: null,
        generationDebug: buildGenerationDebug({
          providerAttempted: false,
          providerUsed: "local_fallback",
          openAiKeyFoundServerSide: keySource !== "none",
          fallbackReason: "fallback_only_mode",
          validationReason: null,
          mappingStatus: "mapped",
          fallbackTemplate: `deterministic_${validatorType}`,
        }),
        content: preview,
        meta: fallback.validation,
        fallback: {
          used: true,
          reasonCode: "fallback_only_mode",
          message: "Generated in fallback-only mode.",
        },
      });
    } catch {
      return buildLiveOnlyFailure({
        code: "generation_error",
        message: "Fallback-only generation failed.",
        reason: "fallback_generation_failed",
        status: 500,
        openAiAttempted: false,
      });
    }
  }

  if (!apiKey) {
    const failure = normalizeAdminAiGeneratorFailure(new Error("OpenAI API key not configured."), {
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      skillFocus: resolvedSkillFocus,
      generationType,
    });

    if (!fallbackAllowed) {
      return buildLiveOnlyFailure({
        code: failure.errorCode,
        message: "Live OpenAI mode is enabled, but no OpenAI API key is configured.",
        reason: String(failure.details.reason ?? failure.errorCode),
        status: 503,
        openAiAttempted: false,
      });
    }

    if (generationType === "spelling") {
      const fallback = buildValidatedSpellingFallback({
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Prefixes",
        topic,
        count,
        difficulty: safeLevel,
      });
      const preview = buildGeneratedPreview({
        subject: sourceSubject,
        generationType,
        promptType,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        difficulty: safeLevel,
        topic,
        content: fallback.content,
        visualPlan,
      });
      console.warn("[admin-ai-generate] using spelling fallback", {
        errorCode: failure.errorCode,
        reason: failure.details.reason,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
      });
      const generationMetadata = buildMetadata({
        generationSource: "fallback",
        provider: "local",
        model: "local-fallback",
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validation: fallback.validation,
        openAiAttempted: false,
        openAiSucceeded: false,
      });
      return NextResponse.json({
        success: true,
        aiMode,
        keySource,
        generationMetadata,
        type: promptType,
        generationType,
        level: safeLevel,
        topic,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        model: "local-fallback",
        prompt: "Deterministic spelling fallback",
        estimatedCostPence: 0,
        estimatedTokens: 0,
        providerUsed: "local_fallback",
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validationReason: failure.message,
        generationDebug: buildGenerationDebug({
          providerAttempted: false,
          providerUsed: "local_fallback",
          openAiKeyFoundServerSide: false,
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validationReason: failure.message,
          mappingStatus: "mapped",
          fallbackTemplate: "deterministic_spelling",
        }),
        content: preview,
        meta: fallback.validation,
        fallback: {
          used: true,
          reasonCode: String(failure.details.reason ?? failure.errorCode),
          message: `${failure.message} Preview generated using the local spelling fallback.`,
        },
      });
    }
    try {
      const fallback = buildValidatedGenericFallback({
        type: validatorType,
        subject: sourceSubject,
        scienceDiscipline,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Core skill",
        topic,
        count,
        difficulty: safeLevel,
      });
      const preview = buildGeneratedPreview({
        subject: sourceSubject,
        generationType,
        promptType,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        difficulty: safeLevel,
        topic,
        content: fallback.content,
        visualPlan,
      });
      return NextResponse.json({
        success: true,
        aiMode,
        keySource,
        generationMetadata: buildMetadata({
          generationSource: "fallback",
          provider: "local",
          model: "local-fallback",
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validation: fallback.validation,
          openAiAttempted: false,
          openAiSucceeded: false,
        }),
        type: promptType,
        generationType,
        level: safeLevel,
        topic,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        curriculumPathway: safeCurriculumPathway,
        examBoard: safeExamBoard,
        skillFocus: resolvedSkillFocus,
        model: "local-fallback",
        prompt: "Deterministic subject fallback",
        estimatedCostPence: 0,
        estimatedTokens: 0,
        providerUsed: "local_fallback",
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validationReason: failure.message,
        generationDebug: buildGenerationDebug({
          providerAttempted: false,
          providerUsed: "local_fallback",
          openAiKeyFoundServerSide: false,
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validationReason: failure.message,
          mappingStatus: "mapped",
          fallbackTemplate: `deterministic_${validatorType}`,
        }),
        content: preview,
        meta: fallback.validation,
        fallback: {
          used: true,
          reasonCode: String(failure.details.reason ?? failure.errorCode),
          message: `${failure.message} Preview generated using the local calibrated fallback.`,
        },
      });
    } catch (fallbackError) {
      console.error("[admin-ai-generate] non-spelling fallback failed:", fallbackError);
    }
    return NextResponse.json({
      success: false,
      aiMode,
      keySource,
      generationMetadata: buildMetadata({
        generationSource: "mock",
        provider: "local",
        model: "local-fallback",
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validation: { valid: false, repaired: false },
        openAiAttempted: false,
        openAiSucceeded: false,
      }),
      errorCode: failure.errorCode,
      message: failure.message,
      error: failure.message,
      providerUsed: "local_fallback",
      fallbackReason: String(failure.details.reason ?? failure.errorCode),
      validationReason: failure.message,
      generationType,
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      keyStage: safeKeyStage,
      skillFocus: resolvedSkillFocus,
      topic,
      activityType,
      strand: englishStrand,
      generationDebug: buildGenerationDebug({
        providerAttempted: false,
        providerUsed: "local_fallback",
        openAiKeyFoundServerSide: false,
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validationReason: failure.message,
        mappingStatus: "mapped",
        fallbackTemplate: null,
      }),
      details: failure.details,
    }, { status: failure.status });
  }

  const requestKey = cacheKey({
    generationType,
    parentGenerationType,
    promptType,
    level,
    topic,
    ageGroup,
    count,
    keyStage: safeKeyStage,
    yearGroup: safeYearGroup,
    curriculumPathway: safeCurriculumPathway,
    examBoard: safeExamBoard,
    skillFocus: resolvedSkillFocus,
    englishStrand,
    activityType,
    masteryOutcome,
    scienceDiscipline,
    visualGenerationMode: visualPlan.mode,
    visualGenerationEnabled: visualPlan.enabled,
    maxVisuals: visualPlan.maxPerContent,
  });
  const shouldUseCache = !(visualPlan.enabled && visualPlan.mode === "generate_now");
  const cached = shouldUseCache ? generationCache.get(requestKey) : undefined;
  if (cached) {
    const cachedValidation = (cached.meta.validation ?? {}) as Record<string, unknown>;
    const generationMetadata = buildMetadata({
      generationSource: "openai",
      provider: "openai",
      model: OPENAI_MODEL,
      fallbackReason: null,
      validation: { ...cachedValidation, repaired: cachedValidation.repaired === true },
      openAiAttempted: false,
      openAiSucceeded: true,
    });
    return NextResponse.json({
      success: true,
      aiMode,
      keySource,
      generationMetadata,
      type: promptType,
      generationType,
      parentGenerationType,
      englishStrand,
      level,
      topic,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus: resolvedSkillFocus,
      activityType,
      masteryOutcome,
      model: OPENAI_MODEL,
      prompt: cached.meta.prompt,
      estimatedCostPence: cached.meta.estimatedCostPence,
      estimatedTokens: cached.meta.estimatedTokens,
      providerUsed: "openai",
      fallbackReason: null,
      validationReason: null,
      generationDebug: buildGenerationDebug({
        providerAttempted: false,
        providerUsed: "openai",
        openAiKeyFoundServerSide: true,
        fallbackReason: null,
        validationReason: null,
        mappingStatus: "mapped",
        fallbackTemplate: null,
      }),
      content: cached.content,
      meta: {
        ...cachedValidation,
        cached: true,
        visualDiagnostics: {
          visualsRequested: Array.isArray((cached.content as { visualAssets?: unknown[] })?.visualAssets)
            ? ((cached.content as { visualAssets?: unknown[] }).visualAssets ?? []).length
            : 0,
          visualsGenerated: 0,
          visualsUploaded: 0,
          visualsFailed: 0,
          visualGenerationEnabled: visualPlan.enabled,
          imageModelUsed: (process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1").trim() || "gpt-image-1",
        },
      },
    });
  }

  const baseUserPrompt = buildUserPrompt(promptType, sourceSubject, safeLevel, topic, ageGroup, count, safeKeyStage, safeYearGroup, resolvedSkillFocus, safeExamBoard, [], targetSkills, weakAreas, "", scienceDiscipline);
  const userPrompt = graphPromptContext ? `${baseUserPrompt}\n\nGRAPH CONTEXT:\n${graphPromptContext}` : baseUserPrompt;
  const systemPrompt = SYSTEM_PROMPT[promptType];

  try {
    let parsed: unknown;
    let promptUsed = userPrompt;
    let validation: Record<string, unknown> = { valid: true, repaired: false, errors: [], fixesApplied: [], removedWords: [], regeneratedCount: 0, requestedCount: count, finalCount: count };
    let generatedMetadataSnapshot: Record<string, unknown> | null = null;
    let normalizedMetadataSnapshot: Record<string, unknown> | null = null;

    const strictSpellingValidation = validatorType === "spelling" || validatorType === "phonics";
    if (strictSpellingValidation) {
      const spellingGenerationType = validatorType === "phonics" ? "phonics" : "spelling";
      const validated = await generateValidatedSpellingContent({
        apiKey,
        systemPrompt,
        generationType: spellingGenerationType,
        level: safeLevel,
        topic,
        ageGroup,
        count,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Silent e",
        graphPromptContext,
        graphChecks,
      });
      parsed = validated.content;
      promptUsed = validated.prompt;
      validation = validated.validation;
    } else {
      const validated = await generateValidatedStructuredContent({
        apiKey,
        systemPrompt,
        promptType,
        validatorType,
        subject: sourceSubject,
        generationType,
        level: safeLevel,
        topic,
        ageGroup,
        count,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
        examBoard: safeExamBoard,
        targetSkills,
        weakAreas,
        curriculumPathway: safeCurriculumPathway,
        englishStrand,
        activityType,
        masteryOutcome,
        scienceDiscipline,
        graphPromptContext,
        graphChecks,
      });
      parsed = validated.content;
      promptUsed = validated.prompt;
      validation = validated.validation;
      generatedMetadataSnapshot = validated.generatedMetadataSnapshot;
      normalizedMetadataSnapshot = validated.normalizedMetadataSnapshot;
    }

    const difficultyProfile = DIFFICULTY_PROFILE[safeLevel] ?? DIFFICULTY_PROFILE[3];
    const taggedParsed = attachSelectedMetadataToGeneratedItems(parsed, {
      subject: sourceSubject,
      subjectArea: generationType === "science" ? "science" : "general",
      scienceDiscipline,
      contentType: generationType,
      englishStrand,
      yearGroup: safeYearGroup,
      keyStage: safeKeyStage,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      examBoardSource,
      examBoardConfidence,
      examBoardReason,
      curriculumFramework,
      countryRegion: examBoardRecommendation.countryRegion,
      skillFocus: resolvedSkillFocus,
      difficulty: safeLevel,
      difficultyLabel: difficultyProfile.difficultyLabel,
      cognitiveDemand: difficultyProfile.cognitiveDemand,
      scaffoldingLevel: difficultyProfile.scaffoldingLevel,
      topic,
      activityType,
      masteryOutcome,
    });
    parsed = taggedParsed;
    if (!generatedMetadataSnapshot) {
      generatedMetadataSnapshot = pickMetadataSnapshot(Array.isArray(parsed) ? parsed[0] : parsed);
    }
    normalizedMetadataSnapshot = pickMetadataSnapshot(Array.isArray(parsed) ? parsed[0] : parsed);

    const estimated = estimateCost(count);

    await writeAuditLogSafely({
      actorUserId: session.userId,
      action: "ai_content.generated",
      entityType: "ai_generation",
      metadata: {
        type: promptType,
        generationType,
        parentGenerationType,
        englishStrand,
        activityType,
        masteryOutcome,
        level: safeLevel,
        topic,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
        targetSkills,
        weakAreas,
        model: OPENAI_MODEL,
        estimatedCostPence: estimated.estimatedCostPence,
        validation,
      },
    });

    const preview = buildGeneratedPreview({
      subject: sourceSubject,
      generationType,
      promptType,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus: resolvedSkillFocus,
      difficulty: safeLevel,
      topic,
      content: parsed,
      visualPlan,
      graphContext: studentGraph ? {
        studentId: studentGraph.studentId,
        promptContext: graphPromptContext,
        connectedSystems: studentGraph.heartbeat.systemStates.filter((entry) => entry.connected).map((entry) => entry.system),
        aiGenerationContext: studentGraph.aiGenerationContext,
        contentGovernance: studentGraph.contentGovernance,
        mediaReferences: buildGraphStorageMediaReferences({ graph: studentGraph }),
      } : undefined,
    });
    const executedVisuals = await withExecutedVisualAssets({
      preview,
      visualPlan,
      apiKey,
    });
    const finalPreview = studentGraph
      ? {
        ...executedVisuals.preview,
        graphContext: {
          studentId: studentGraph.studentId,
          promptContext: graphPromptContext,
          connectedSystems: studentGraph.heartbeat.systemStates.filter((entry) => entry.connected).map((entry) => entry.system),
          aiGenerationContext: studentGraph.aiGenerationContext,
          contentGovernance: studentGraph.contentGovernance,
          mediaReferences: buildGraphStorageMediaReferences({
            graph: studentGraph,
            assets: executedVisuals.preview.visualAssets.map((asset) => ({
              id: asset.id,
              title: asset.title,
              r2Key: asset.r2Key,
              imageUrl: asset.imageUrl,
              type: asset.type,
            })),
          }),
        },
      }
      : executedVisuals.preview;

    if (shouldUseCache) {
      generationCache.set(requestKey, {
        content: finalPreview,
        meta: {
          prompt: promptUsed,
          estimatedCostPence: estimated.estimatedCostPence,
          estimatedTokens: estimated.estimatedTokens,
          validation,
        },
      });
    }

    const generationMetadata = buildMetadata({
      generationSource: validation.repaired === true ? "repair" : "openai",
      provider: "openai",
      model: OPENAI_MODEL,
      fallbackReason: null,
      validation,
      openAiAttempted: true,
      openAiSucceeded: true,
    });

    return NextResponse.json({
      success: true,
      aiMode,
      keySource,
      generationMetadata,
      type: promptType,
      generationType,
      parentGenerationType,
      englishStrand,
      level: safeLevel,
      topic,
      keyStage: safeKeyStage,
      yearGroup: safeYearGroup,
      curriculumPathway: safeCurriculumPathway,
      examBoard: safeExamBoard,
      skillFocus: resolvedSkillFocus,
      activityType,
      masteryOutcome,
      skills: serializeSkills(targetSkills.length ? targetSkills : []),
      model: OPENAI_MODEL,
      prompt: promptUsed,
      estimatedCostPence: estimated.estimatedCostPence,
      estimatedTokens: estimated.estimatedTokens,
      providerUsed: "openai",
      fallbackReason: null,
      validationReason: null,
      generationDebug: buildGenerationDebug({
        providerAttempted: true,
        providerUsed: "openai",
        openAiKeyFoundServerSide: true,
        fallbackReason: null,
        validationReason: null,
        mappingStatus: "mapped",
        fallbackTemplate: null,
        subjectContainment: validation.subjectContainment === "failed" ? "failed" : "passed",
        contaminatedItemsRepaired: Number(validation.contaminatedItemsRepaired ?? 0),
        contaminatedItemsRejected: Number(validation.contaminatedItemsRejected ?? 0),
      }),
      content: finalPreview,
      meta: {
        ...validation,
        visualDiagnostics: executedVisuals.visualDiagnostics,
        metadataDebug: {
          requestedMetadata: {
            yearGroup: safeYearGroup,
            keyStage: safeKeyStage,
            subject: sourceSubject,
            strand: englishStrand,
            module: englishStrand,
            curriculumPathway: safeCurriculumPathway,
            examBoard: safeExamBoard,
            skillFocus: resolvedSkillFocus,
            topic,
            level: safeLevel,
            activityType,
            masteryOutcome,
            subjectArea: generationType === "science" ? "science" : "general",
            scienceDiscipline,
          },
          generatedMetadata: generatedMetadataSnapshot,
          normalizedMetadata: normalizedMetadataSnapshot,
        },
      },
    });
  } catch (error) {
    const failure = normalizeAdminAiGeneratorFailure(error, {
      subject: sourceSubject,
      yearGroup: safeYearGroup,
      skillFocus: resolvedSkillFocus,
      generationType,
    });
    console.error("[admin-ai-generate] OpenAI generation failed:", error);
    console.error("[admin-ai-generate] Error code:", failure.errorCode);
    console.error("[admin-ai-generate] Generation diagnostics:", generationDiagnostics);

    await writeAuditLogSafely({
      actorUserId: session.userId,
      action: "ai_content.malformed_generation",
      entityType: "ai_generation",
      metadata: {
        model: OPENAI_MODEL,
        subject: sourceSubject,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus,
        prompt: userPrompt,
        error: failure.message,
        errorCode: failure.errorCode,
        diagnostics: generationDiagnostics,
      },
    });

    if (!fallbackAllowed) {
      return buildLiveOnlyFailure({
        code: failure.errorCode,
        message: `Live OpenAI mode failed: ${failure.message}`,
        reason: String(failure.details.reason ?? failure.errorCode),
        status: failure.status,
        openAiAttempted: true,
      });
    }

    if (generationType === "spelling" && shouldUseDeterministicSpellingFallback(failure.errorCode)) {
      try {
        const fallback = buildValidatedSpellingFallback({
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus || "Prefixes",
          topic,
          count,
          difficulty: safeLevel,
        });
        const preview = buildGeneratedPreview({
          subject: sourceSubject,
          generationType,
          promptType,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          difficulty: safeLevel,
          topic,
          content: fallback.content,
          visualPlan,
        });
        console.warn("[admin-ai-generate] recovered with spelling fallback", {
          errorCode: failure.errorCode,
          reason: failure.details.reason,
          providerStatus: failure.details.providerStatus,
          providerCode: failure.details.providerCode,
        });
        const generationMetadata = buildMetadata({
          generationSource: "fallback",
          provider: "local",
          model: "local-fallback",
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validation: fallback.validation,
          openAiAttempted: true,
          openAiSucceeded: false,
        });
        return NextResponse.json({
          success: true,
          aiMode,
          keySource,
          generationMetadata,
          type: promptType,
          generationType,
          level: safeLevel,
          topic,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          model: "local-fallback",
          prompt: userPrompt,
          estimatedCostPence: 0,
          estimatedTokens: 0,
          providerUsed: "local_fallback",
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validationReason: failure.message,
          generationDebug: buildGenerationDebug({
            providerAttempted: true,
            providerUsed: "local_fallback",
            openAiKeyFoundServerSide: true,
            fallbackReason: String(failure.details.reason ?? failure.errorCode),
            validationReason: failure.message,
            mappingStatus: "mapped",
            fallbackTemplate: "deterministic_spelling",
          }),
          content: preview,
          meta: fallback.validation,
          fallback: {
            used: true,
            reasonCode: String(failure.details.reason ?? failure.errorCode),
            message: `${failure.message} Preview generated using the local spelling fallback.`,
          },
        });
      } catch (fallbackError) {
        console.error("[admin-ai-generate] spelling fallback failed:", fallbackError);
      }
    }

    if (generationType !== "spelling") {
      try {
        const fallback = buildValidatedGenericFallback({
          type: validatorType,
          subject: sourceSubject,
          scienceDiscipline,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus || "Core skill",
          topic,
          count,
          difficulty: safeLevel,
        });
        const preview = buildGeneratedPreview({
          subject: sourceSubject,
          generationType,
          promptType,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          difficulty: safeLevel,
          topic,
          content: fallback.content,
          visualPlan,
        });
        console.warn("[admin-ai-generate] recovered with non-spelling fallback", {
          errorCode: failure.errorCode,
          reason: failure.details.reason,
          providerStatus: failure.details.providerStatus,
          providerCode: failure.details.providerCode,
        });
        const generationMetadata = buildMetadata({
          generationSource: "fallback",
          provider: "local",
          model: "local-fallback",
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validation: fallback.validation,
          openAiAttempted: true,
          openAiSucceeded: false,
        });
        return NextResponse.json({
          success: true,
          aiMode,
          keySource,
          generationMetadata,
          type: promptType,
          generationType,
          level: safeLevel,
          topic,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          curriculumPathway: safeCurriculumPathway,
          examBoard: safeExamBoard,
          skillFocus: resolvedSkillFocus,
          model: "local-fallback",
          prompt: userPrompt,
          estimatedCostPence: 0,
          estimatedTokens: 0,
          providerUsed: "local_fallback",
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validationReason: failure.message,
          generationDebug: buildGenerationDebug({
            providerAttempted: true,
            providerUsed: "local_fallback",
            openAiKeyFoundServerSide: true,
            fallbackReason: String(failure.details.reason ?? failure.errorCode),
            validationReason: failure.message,
            mappingStatus: "mapped",
            fallbackTemplate: `deterministic_${validatorType}`,
          }),
          content: preview,
          meta: fallback.validation,
          fallback: {
            used: true,
            reasonCode: String(failure.details.reason ?? failure.errorCode),
            message: `${failure.message} Preview generated using the local calibrated fallback.`,
          },
        });
      } catch (fallbackError) {
        console.error("[admin-ai-generate] non-spelling fallback failed:", fallbackError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        aiMode,
        keySource,
        generationMetadata: buildMetadata({
          generationSource: "mock",
          provider: "openai",
          model: OPENAI_MODEL,
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validation: { valid: false, repaired: false },
          openAiAttempted: true,
          openAiSucceeded: false,
        }),
        errorCode: failure.errorCode,
        message: failure.message,
        error: failure.message,
        providerUsed: "openai",
        fallbackReason: String(failure.details.reason ?? failure.errorCode),
        validationReason: failure.message,
        generationType,
        subject: sourceSubject,
        yearGroup: safeYearGroup,
        keyStage: safeKeyStage,
        skillFocus: resolvedSkillFocus,
        topic,
        activityType,
        strand: englishStrand,
        generationDebug: buildGenerationDebug({
          providerAttempted: true,
          providerUsed: "openai",
          openAiKeyFoundServerSide: true,
          fallbackReason: String(failure.details.reason ?? failure.errorCode),
          validationReason: failure.message,
          mappingStatus: "mapped",
          fallbackTemplate: null,
        }),
        details: {
          ...failure.details,
          subject: sourceSubject,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus,
          provider: "openai",
          model: OPENAI_MODEL,
          stage: "generation",
          diagnostics: generationDiagnostics,
        },
      },
      { status: failure.status },
    );
  }
}




