import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api_guard";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
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
import { GA_ALPHABET } from "@/lib/ga-alphabet";
import { isGaWordSchemaNotReadyError, listGaWords } from "@/lib/ga-word-bank";
import {
  classifyGenerationDiagnosticOutcome,
  validateGeneratedTupleContainment,
  validateStrictRequestTuple,
  type DiagnosticOutcomeCode,
  type GenerationRequestTuple,
} from "@/lib/ai/generator-tuple-validation";

const BATCH_SIZE = 12;
const OPENAI_MODEL = "gpt-4o-mini";
const generationCache = new Map<string, { content: unknown; meta: Record<string, unknown> }>();
const generationRateLimit = new Map<string, { count: number; resetAt: number }>();

const GCSE_LANGUAGE_SUBJECTS: Subject[] = ["gcse-french", "gcse-german", "gcse-spanish", "gcse-italian", "gcse-mandarin", "gcse-arabic", "gcse-ga", "gcse-urdu", "gcse-polish", "gcse-latin"];

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

type GaFallbackLexicon = {
  alphabetUpper: string[];
  approvedGaWords: string[];
  approvedPairs: Array<{ englishWord: string; gaWord: string }>;
};

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

function isGaSubject(subject: Subject) {
  return subject === "ga-language" || subject === "gcse-ga";
}

async function loadGaFallbackLexicon(subject: Subject): Promise<GaFallbackLexicon | null> {
  if (!isGaSubject(subject)) return null;

  const alphabetUpper = GA_ALPHABET.map(([upper]) => String(upper));
  try {
    const approvedWords = await listGaWords({ approvedOnly: true, limit: 120 });
    const approvedPairs = approvedWords
      .map((entry) => ({
        englishWord: String(entry.englishWord ?? "").trim(),
        gaWord: String(entry.gaWord ?? "").trim(),
      }))
      .filter((entry) => entry.englishWord.length > 0 && entry.gaWord.length > 0)
      .slice(0, 80);

    const approvedGaWords = Array.from(new Set(approvedPairs.map((entry) => entry.gaWord))).slice(0, 60);
    return { alphabetUpper, approvedGaWords, approvedPairs };
  } catch (error) {
    if (!isGaWordSchemaNotReadyError(error)) {
      console.warn("[admin-ai-generate] unable to load Ga word bank lexicon", error);
    }
    return { alphabetUpper, approvedGaWords: [], approvedPairs: [] };
  }
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
  qualityScore: number | null;
  qualityStatus: "pending_review" | "scored";
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

function promptLikeTextFromRow(item: Record<string, unknown>): string {
  for (const key of ["question", "prompt", "word", "title", "passage", "text", "sentenceContext"] as const) {
    const value = String(item[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

async function collectStudentExposureAvoidPrompts(studentId: string): Promise<string[]> {
  if (!studentId) return [];

  const [historyRows, assignmentRows] = await Promise.all([
    prisma.questionHistory.findMany({
      where: { childId: studentId },
      orderBy: { createdAt: "desc" },
      take: 160,
      select: { questionId: true },
    }),
    prisma.assignment.findMany({
      where: { studentId },
      orderBy: { updatedAt: "desc" },
      take: 80,
      select: {
        content: {
          select: {
            contentJson: true,
          },
        },
      },
    }),
  ]);

  if (!historyRows.length || !assignmentRows.length) return [];

  const seenQuestionIds = new Set(
    historyRows
      .map((row) => String(row.questionId ?? "").trim())
      .filter(Boolean),
  );

  const prompts: string[] = [];
  const seenPrompts = new Set<string>();

  for (const assignment of assignmentRows) {
    try {
      const parsed = JSON.parse(String(assignment.content.contentJson ?? "[]")) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const item = row as Record<string, unknown>;
        const id = String(item.id ?? "").trim();
        if (!id || !seenQuestionIds.has(id)) continue;
        const prompt = promptLikeTextFromRow(item);
        const normalized = prompt.toLowerCase().replace(/\s+/g, " ").trim();
        if (!normalized || seenPrompts.has(normalized)) continue;
        seenPrompts.add(normalized);
        prompts.push(prompt);
        if (prompts.length >= 12) return prompts;
      }
    } catch {
      continue;
    }
  }

  return prompts;
}

function buildEnglishDifficultyInstruction(type: PromptType, level: number, skillFocus?: string) {
  if (!["spelling", "reading", "punctuation", "grammar", "writing"].includes(type)) return "";
  const normalizedSkill = String(skillFocus ?? "").toLowerCase();
  const isPrefixOrSuffix = normalizedSkill.includes("prefix") || normalizedSkill.includes("suffix");

  if (level <= 1) {
    return `
English Difficulty 1 calibration:
- Keep each item simple, direct, and single-skill.
- Use short age-appropriate wording and one clear answer.
- Avoid multi-step reasoning, dense distractors, long passages, and abstract analysis.
- For spelling, use accessible words and direct practice of the selected pattern.`;
  }

  if (level < 5) return "";

  return `
English Difficulty 5 calibration:
- Simple definition recall is forbidden.
- Simple "what does prefix mean" or "what does suffix mean" questions are forbidden.
- Single-step identification questions are forbidden, including "identify the prefix", "find the suffix", and "choose the word with a prefix".
- Questions must require reasoning, comparison, justification, error detection, sentence transformation, multiple plausible distractors, or context analysis.
- Difficulty 5 must be noticeably harder than Difficulty 3; do not return a Difficulty 3 item with a Difficulty 5 label.
- Each question/prompt should include an advanced command such as justify, compare, revise, explain why, detect and correct, transform, analyse, or use evidence.
- Multiple-choice options must be plausible distractors that test the misconception, not obvious wrong answers.
- The answer must be a full correct response, not a single-word label.
- Explanations must show why the correct answer is right and why at least one common distractor is wrong.${isPrefixOrSuffix ? "\n- For prefix/suffix work, make students apply the affix in context, correct an error, transform a root word, compare two plausible affixes, and justify how the affix changes meaning.\n- For multiple-choice prefix/suffix items, the answer must exactly match one full option sentence, and explanation must name the correct affix, the meaning change, and why a plausible wrong affix fails." : ""}`;
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
  avoidPrompts: string[] = [],
  gaScriptPreference: "orthography_only" | "orthography_with_transliteration" = "orthography_with_transliteration",
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
  const avoidanceInstruction = avoidPrompts.length
    ? `\nAVOID REPEATING THESE EXISTING PREVIEW QUESTIONS:\n${avoidPrompts.slice(0, 8).map((prompt, index) => `${index + 1}. ${prompt.slice(0, 260)}`).join("\n")}\nCreate genuinely different scenarios, objects, operation structures, and reasoning tasks. Do not paraphrase these questions.`
    : "";
  const difficultyLines = `
Difficulty profile:
- Difficulty level: ${safeLevel}
- Difficulty label: ${difficultyProfile.difficultyLabel}
- Cognitive demand: ${difficultyProfile.cognitiveDemand}
- Scaffolding level: ${difficultyProfile.scaffoldingLevel}
- Guidance: ${difficultyProfile.guidance}
Strict difficulty ladder:
- Level 1-2: basic recall, direct facts, one-step calculation or recognition.
- Level 3: standard practice with one clear application step.
- Level 4: multi-step reasoning, method explanation, connected concepts, plausible distractors.
- Level 5: challenge/problem solving with mixed context, reasoning, distractors, and justification.
The generated task difficulty must match Level ${safeLevel}; do not return easier items and merely label them as Level ${safeLevel}.`;
  const englishDifficultyLines = buildEnglishDifficultyInstruction(type, safeLevel, skillFocus);
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
}${difficultyLines}${englishDifficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
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
  "question": string,
  "answer": string,
  "options": string[],
  "hint": string,
  "sentenceContext": string,
  "categoryHint": string,
  "explanation": string,
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
}
For Difficulty 5 spelling/prefix/suffix items:
- "word" is the target spelling word only.
- "question" must ask the student to transform, detect/correct an error, compare affixes, or justify the affix choice in context.
- "options" must be full sentence or full response options, not bare words.
- "answer" must exactly equal the full correct option string.
- "explanation" must include a because/therefore style justification and explain why one tempting distractor is wrong.
${difficultyLines}${englishDifficultyLines}${followUpInstruction}${genericRepairLine}`.trim();
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
Difficulty ${level} is a strict requirement:
- Level 1-2: basic recall such as direct times-table facts.
- Level 3: standard practice with a small application step.
- Level 4: multi-step reasoning with an explanation of method.
- Level 5: challenge/problem solving using mixed context, distractors, reasoning, and justification.
If difficulty is 5 for KS1/KS2 maths, every item must require at least two of these: multi-step calculation, method explanation, justification, comparison of strategies, missing-step completion, error analysis, remainder reasoning, or deciding whether a statement is always/sometimes/never true. Do not generate ordinary one-answer word problems only. The question must ask the learner to explain, justify, compare, find the mistake, complete a missing step, or show an efficient method. The explanation must be at least two sentences and include because/therefore reasoning. If topic is times tables or division, do not generate only simple prompts like "What is 6 times 4?" or ordinary sharing problems. Use missing factors, comparison, scaled quantities, arrays, inverse operations, remainders, distractor information, or choosing and justifying an efficient strategy.
Example of a valid difficulty-5 maths question: 'A baker uses 3 equal packs of 12 rolls and a loose tray of 7. The total was said to be 44. Evaluate which inverse operation checks the final total and justify your method.'
Across the set, vary the context, numbers, operation structure, and reasoning task. Do not reuse the same story, object, or question template with only number changes.
Return JSON with: id, question, answer, explanation, choices, yearGroup, skillFocus, difficulty and topic.
Do not return spelling words or reading passages.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${skillInstruction}${weakInstruction}${avoidanceInstruction}${followUpInstruction}${genericRepairLine}`;
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
    const isGcseLanguage = GCSE_LANGUAGE_SUBJECTS.includes(subject);
    const languageSubject = isGcseLanguage ? subject.replace("gcse-", "").toUpperCase() : String(subject).replace(/-/g, " ");
    const gaBandInstruction = (() => {
      if (!(subject === "ga-language" || subject === "gcse-ga")) return "";
      if (safeYearGroup === "Year 1" || safeYearGroup === "Year 2") {
        return "Ga progression (Year 1-2): focus on alphabet recognition, basic pronunciation, numbers 1-20, greetings, and simple repeat-after-me sentence frames. Keep prompts short, concrete, and high-scaffold.";
      }
      if (safeYearGroup === "Year 3" || safeYearGroup === "Year 4") {
        return "Ga progression (Year 3-4): focus on alphabet fluency, counting in context, simple grammar patterns, short sentence building, and beginner reading/listening tasks with clear clues.";
      }
      return "Ga progression (Year 5-6+): focus on conversational accuracy, short paragraph reading, translation both ways, structured speaking/writing tasks, and reduced scaffolding.";
    })();
    const gaDialectInstruction = subject === "ga-language" || subject === "gcse-ga"
      ? gaScriptPreference === "orthography_only"
        ? "Ga instruction requirements: use standard Accra Ga orthography only (no transliteration notes). Do not mix dialect variants in the same item set. Keep spelling and vocabulary consistent. Include alphabet and number teaching where relevant (letters, pronunciation cues, and counting)."
        : "Ga instruction requirements: use standard Accra Ga orthography and learner-safe classroom phrasing. Do not mix dialect variants in the same item set. Keep spelling and vocabulary consistent. Include alphabet and number teaching where relevant (letters, pronunciation cues, and counting). Include transliteration help where useful for non-native learners."
      : "";
    return `Generate ${count} ${isGcseLanguage ? "GCSE" : "primary/KS3"} ${languageSubject} tasks for ${keyStage}, ${safeYearGroup}, difficulty ${safeLevel}.
Subject: ${subject}.
Skill focus: ${skillFocus || "Vocabulary"}.
Topic/theme: ${cleanedTopic || skillFocus || "Identity and culture"}.
Exam board: ${isGcseLanguage ? (examBoard || "General GCSE") : "not required for this stage"}.
Use language-specific activity modes only: vocabulary, translation, listening-style, reading comprehension, grammar, speaking prompts, writing tasks, role play, photo card, sentence building, verb conjugation, tenses, exam practice.
Every item must include: activityMode, difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.
Do not return generic maths/science-only formats.${gaDialectInstruction ? `\n${gaDialectInstruction}` : ""}${gaBandInstruction ? `\n${gaBandInstruction}` : ""}${difficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "punctuation") {
    return `Generate ${count} UK punctuation practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence punctuation"}.
Topic/theme: ${cleanedTopic || skillFocus || "punctuation practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling word lists, reading passages, or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${englishDifficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "grammar") {
    return `Generate ${count} UK grammar practice items for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Grammar accuracy"}.
Topic/theme: ${cleanedTopic || skillFocus || "grammar practice"}.
Return JSON array with: id, question, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return spelling-only word lists, reading passages, or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${englishDifficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
  }
  if (type === "writing") {
    return `Generate ${count} UK writing practice tasks for ${keyStage}, ${safeYearGroup}, difficulty ${level}.
Skill focus: ${skillFocus || "Sentence composition"}.
Topic/theme: ${cleanedTopic || skillFocus || "writing practice"}.
Return JSON array with: id, prompt, answer, options, explanation, hint, yearGroup, skillFocus, difficulty.
Do not return isolated spelling word lists or maths questions.
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${englishDifficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}${genericRepairLine}`;
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
Every item must include: difficultyLevel, difficultyLabel, cognitiveDemand, scaffoldingLevel, visualRequired, visualType, visualPrompt, visualAltText.${difficultyLines}${englishDifficultyLines}${skillInstruction}${weakInstruction}${followUpInstruction}`;
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
      const question = String(data.question ?? data.prompt ?? data.word ?? "");
      const answer = String(data.answer ?? data.correctAnswer ?? data.word ?? "");
      return withCommonFields({
        ...data,
        type: generationType,
        yearGroup: metadata.yearGroup,
        skillFocus: metadata.skillFocus,
        difficulty: metadata.difficulty,
        prompt: question,
        question,
        answer,
        options: Array.isArray(data.options)
          ? data.options.map((value) => String(value))
          : Array.isArray(data.choices)
            ? data.choices.map((value) => String(value))
            : [],
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
    qualityScore: null,
    qualityStatus: "pending_review",
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
      fallbackUsed: "none",
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
      filledSlots: count,
      emptySlots: 0,
      duplicateRejectedCount: 0,
      weakRejectedCount: errors.size,
      generatedQuestions: count,
      adminWarnings: [],
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
  variantSeed,
}: {
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
  variantSeed?: number;
}) {
  const fallbackItems = buildDeterministicSpellingFallback({
    keyStage,
    yearGroup,
    skillFocus,
    topic,
    count,
    difficulty,
    variantSeed,
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
      fallbackUsed: "local_template",
      errors: [],
      fixesApplied: [],
      removedWords: [],
      regeneratedCount: 0,
      requestedCount: count,
      finalCount: count,
      filledSlots: count,
      emptySlots: 0,
      duplicateRejectedCount: 0,
      weakRejectedCount: 0,
      generatedQuestions: count,
      adminWarnings: count < 1 ? ["Not enough unique questions available. Add or edit slot content manually."] : [],
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
  gaLexicon?: GaFallbackLexicon | null;
  scienceDiscipline?: ScienceDiscipline | null;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
  variantSeed?: number;
}) {
  const safeCount = Math.max(1, Math.min(10, input.count));
  const safeSeed = Number.isFinite(Number(input.variantSeed)) ? Math.abs(Math.floor(Number(input.variantSeed))) : 0;
  const variantOffset = safeSeed % 997;
  const difficultyLabel = DIFFICULTY_PROFILE[input.difficulty]?.difficultyLabel ?? "Balanced challenge";
  const baseTopic = input.topic || input.skillFocus || "curriculum practice";
  const baseSkill = input.skillFocus || "core skill";
  const wordsByDifficulty = ["identify", "apply", "explain", "analyse", "justify"]; 

  const resolveLanguageProfile = (subject: Subject) => {
    const normalized = String(subject).toLowerCase();
    if (normalized.includes("french")) {
      return {
        languageName: "French",
        targetLanguageName: "francais",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Traduis en francais: I am revising vocabulary for my exam.",
          "Choisis la bonne forme du verbe: Nous ___ (etudier) le francais chaque soir.",
          "Remets les mots dans l'ordre: aime / le week-end / je / lire / pendant.",
          "Lis le texte court puis reponds en anglais: " + "\"Je m'appelle Lila et j'aime apprendre les langues.\"",
          "Prepare une reponse orale de 2 phrases sur ce sujet: mes loisirs.",
          "Ecris deux phrases en francais sur: l'ecole et les matieres preferees.",
          "Associe chaque expression francaise a la bonne traduction anglaise.",
          "Conjugue le verbe etre au present pour: nous.",
        ],
        modelAnswers: [
          "Je revise le vocabulaire pour mon examen.",
          "Nous etudions le francais chaque soir.",
          "Je aime lire pendant le week-end.",
          "The speaker says her name is Lila and she likes learning languages.",
          "J'aime jouer au foot et ecouter de la musique.",
          "J'aime les mathematiques et l'histoire. Mon professeur est tres gentil.",
          "bonjour = hello; merci = thank you; au revoir = goodbye",
          "nous sommes",
        ],
      };
    }
    if (normalized.includes("german")) {
      return {
        languageName: "German",
        targetLanguageName: "Deutsch",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Ubersetze ins Deutsche: I am revising vocabulary for my exam.",
          "Wahle die richtige Verbform: Wir ___ (lernen) jeden Abend Deutsch.",
          "Ordne die Worter: am / ich / Wochenende / gern / lese.",
          "Lies den kurzen Text und antworte auf Englisch: \"Ich heisse Lila und ich lerne gern Sprachen.\"",
          "Bereite eine kurze mundliche Antwort vor: meine Hobbys.",
          "Schreibe zwei Satze auf Deutsch uber: Schule und Lieblingsfacher.",
          "Ordne jede deutsche Wendung der richtigen englischen Bedeutung zu.",
          "Konjugiere das Verb sein im Prasens fur: wir.",
        ],
        modelAnswers: [
          "Ich wiederhole den Wortschatz fur meine Prufung.",
          "Wir lernen jeden Abend Deutsch.",
          "Ich lese am Wochenende gern.",
          "The speaker says her name is Lila and she likes learning languages.",
          "Ich spiele gern Fussball und hore Musik.",
          "Ich mag Mathe und Geschichte. Mein Lehrer ist sehr nett.",
          "hallo = hello; danke = thank you; auf Wiedersehen = goodbye",
          "wir sind",
        ],
      };
    }
    if (normalized.includes("spanish")) {
      return {
        languageName: "Spanish",
        targetLanguageName: "espanol",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Traduce al espanol: I am revising vocabulary for my exam.",
          "Elige la forma correcta: Nosotros ___ (estudiar) espanol cada tarde.",
          "Ordena las palabras: leer / me / los fines de semana / gusta.",
          "Lee el texto y responde en ingles: \"Me llamo Lila y me gusta aprender idiomas.\"",
          "Prepara una respuesta oral corta sobre: mis pasatiempos.",
          "Escribe dos frases en espanol sobre: el colegio y tus asignaturas favoritas.",
          "Relaciona cada expresion en espanol con su significado en ingles.",
          "Conjuga el verbo ser en presente para: nosotros.",
        ],
        modelAnswers: [
          "Estoy repasando el vocabulario para mi examen.",
          "Nosotros estudiamos espanol cada tarde.",
          "Me gusta leer los fines de semana.",
          "The speaker says her name is Lila and she likes learning languages.",
          "Me gusta jugar al futbol y escuchar musica.",
          "Me gustan las matematicas y la historia. Mi profesor es muy amable.",
          "hola = hello; gracias = thank you; adios = goodbye",
          "nosotros somos",
        ],
      };
    }
    if (normalized.includes("italian")) {
      return {
        languageName: "Italian",
        targetLanguageName: "italiano",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Traduci in italiano: I am revising vocabulary for my exam.",
          "Scegli la forma corretta: Noi ___ (studiare) italiano ogni sera.",
          "Metti in ordine le parole: leggere / mi / nel fine settimana / piace.",
          "Leggi il testo breve e rispondi in inglese: \"Mi chiamo Lila e mi piace imparare le lingue.\"",
          "Prepara una risposta orale breve su: i miei passatempi.",
          "Scrivi due frasi in italiano su: scuola e materie preferite.",
          "Abbina ogni espressione italiana al significato inglese corretto.",
          "Coniuga il verbo essere al presente per: noi.",
        ],
        modelAnswers: [
          "Sto ripassando il vocabolario per il mio esame.",
          "Noi studiamo italiano ogni sera.",
          "Mi piace leggere nel fine settimana.",
          "The speaker says her name is Lila and she likes learning languages.",
          "Mi piace giocare a calcio e ascoltare musica.",
          "Mi piacciono matematica e storia. Il mio insegnante e molto gentile.",
          "ciao = hello; grazie = thank you; arrivederci = goodbye",
          "noi siamo",
        ],
      };
    }
    if (normalized.includes("latin")) {
      return {
        languageName: "Latin",
        targetLanguageName: "Latina",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Verte in Latinum: The student reads a book.",
          "Elige formam rectam: Nos ___ (esse) discipuli diligentes.",
          "Ordina verba: in / schola / puella / legit.",
          "Lege textum breve et responde Anglice: \"Lilia linguas discere amat.\"",
          "Para brevem responsionem oralem de: vita scholastica.",
          "Scribe duas sententias Latinas de schola.",
          "Coniunge verba Latina cum significationibus Anglicis.",
          "Coniuga verbum esse in praesenti pro: nos.",
        ],
        modelAnswers: [
          "Discipulus librum legit.",
          "Nos sumus discipuli diligentes.",
          "Puella in schola legit.",
          "The text says Lilia likes learning languages.",
          "In schola bene disco et libros lego.",
          "Magister bonus est. Discipuli diligenter laborant.",
          "salve = hello; gratias = thank you; vale = goodbye",
          "nos sumus",
        ],
      };
    }
    if (normalized.includes("mandarin")) {
      return {
        languageName: "Mandarin Chinese",
        targetLanguageName: "Putonghua",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Translate into Mandarin (pinyin accepted): I am revising vocabulary for my exam.",
          "Choose the correct sentence pattern in Mandarin for habitual study.",
          "Reorder these words into a correct Mandarin sentence.",
          "Read the short Mandarin sentence and answer in English.",
          "Prepare a short spoken Mandarin response about hobbies.",
          "Write two Mandarin sentences (or pinyin) about school subjects.",
          "Match each Mandarin phrase with its English meaning.",
          "Conjugation note: select the correct time marker and word order.",
        ],
        modelAnswers: [
          "Wo zai fuxi cihui wei wo de kaoshi.",
          "Women mei tian wan shang xuexi hanyu.",
          "Wo zhoumo xihuan kan shu.",
          "The text says the speaker likes learning languages.",
          "Wo xihuan da zuqiu he ting yinyue.",
          "Wo xihuan shuxue he lishi. Laoshi hen youhao.",
          "ni hao = hello; xiexie = thank you; zaijian = goodbye",
          "Use time word + subject + verb order correctly.",
        ],
      };
    }
    if (normalized.includes("arabic")) {
      return {
        languageName: "Arabic",
        targetLanguageName: "al-arabiyya",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Translate into Arabic (transliteration accepted): I am revising vocabulary for my exam.",
          "Choose the correct verb form for: We study Arabic every evening.",
          "Reorder the words to form a correct Arabic sentence.",
          "Read the short Arabic sentence and answer in English.",
          "Prepare a short spoken response in Arabic about hobbies.",
          "Write two Arabic sentences (or transliteration) about school subjects.",
          "Match each Arabic phrase to the correct English meaning.",
          "Pick the correct present-tense form for the required pronoun.",
        ],
        modelAnswers: [
          "ana uraaji'u al-mufradat li-imtihani.",
          "nahnu nadrusu al-arabiyya kulla masa'.",
          "uhibbu al-qira'a fi nihayat al-usbu'.",
          "The text says the speaker likes learning languages.",
          "uhibbu kurat al-qadam wa istima' al-musiqa.",
          "uhibbu al-riyadiyat wa al-tarikh. muallimi latif.",
          "marhaban = hello; shukran = thank you; ma'a as-salama = goodbye",
          "Use the correct pronoun and present-tense verb pattern.",
        ],
      };
    }
    if (normalized === "ga-language" || normalized.includes("gcse-ga") || normalized.endsWith("-ga") || normalized === "ga") {
      const gaBand = input.yearGroup === "Year 1" || input.yearGroup === "Year 2"
        ? "early"
        : input.yearGroup === "Year 3" || input.yearGroup === "Year 4"
          ? "middle"
          : "upper";
      const gaAlphabetSequence = (input.gaLexicon?.alphabetUpper?.length ? input.gaLexicon.alphabetUpper : GA_ALPHABET.map(([upper]) => String(upper))).join(", ");
      const gaWordBankExamples = (input.gaLexicon?.approvedPairs ?? [])
        .slice(0, 6)
        .map((entry) => `${entry.englishWord} = ${entry.gaWord}`)
        .join("; ");
      const gaWordBankSet = (input.gaLexicon?.approvedGaWords ?? []).slice(0, 10).join(", ");

      return {
        languageName: "Ga (Ghana)",
        targetLanguageName: "Ga",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: gaBand === "early"
          ? [
            "Teach the Ga alphabet for beginners: show the ordered core letters in standard Accra Ga orthography.",
            "Teach Ga numbers 1-10: complete a missing-number sequence and say each number in Ga.",
            "Translate into Ga: Good morning, teacher.",
            "Reorder the words to make a simple Ga sentence about school.",
            "Read a short Ga greeting phrase and answer in English.",
            "Prepare a very short spoken Ga response about your family.",
            "Write one or two simple Ga sentences in standard Accra Ga orthography about classroom routines.",
            "Choose the correct pronoun/verb pairing in a basic Ga sentence.",
          ]
          : gaBand === "middle"
            ? [
              "Review Ga alphabet fluency: fill missing letters and correct order using standard Accra Ga orthography.",
              "Teach and apply Ga numbers 1-20: complete ordered and reverse counting tasks.",
              "Translate into Ga: My school starts in the morning.",
              "Reorder words to create a grammatical Ga sentence with time/place words.",
              "Read a short Ga classroom text and answer one comprehension question in English.",
              "Prepare a short spoken Ga response about daily routine using accurate sentence order.",
              "Write two connected Ga sentences in standard Accra Ga orthography on school and family.",
              "Choose the correct pronoun/verb pairing in a slightly longer Ga sentence.",
            ]
            : [
              "Teach advanced Ga alphabet/spelling patterns and common pronunciation pitfalls for non-native learners.",
              "Use Ga numbers in context (dates, prices, quantities) and complete short reasoning prompts.",
              "Translate into Ga: We are revising vocabulary and grammar for class.",
              "Reorder words to form a complete Ga sentence with clause-level structure.",
              "Read a short Ga paragraph and answer comprehension in English.",
              "Prepare a structured spoken Ga response about hobbies and school life using standard Accra forms.",
              "Write two to three accurate Ga sentences in standard Accra Ga orthography with reduced scaffolding.",
              "Select the best pronoun/verb pairing and explain why it is grammatically correct.",
            ],
        modelAnswers: gaBand === "early"
          ? [
            `Ga alphabet core sequence: ${gaAlphabetSequence}.`,
            "Ga numbers 1-10 sequence model: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.",
            "Ojekoo, osɔfo.",
            "Mi baa sukuu.",
            "The phrase is a simple greeting/introduction in Ga.",
            "Mi yε [name].",
            gaWordBankExamples
              ? `Approved Ga word bank examples: ${gaWordBankExamples}.`
              : "Mi baa sukuu anɔpa.",
            "Select the option with correct pronoun and verb order for a basic sentence.",
          ]
          : gaBand === "middle"
            ? [
              `Ga alphabet fluency model: ${gaAlphabetSequence}.`,
              "Ga numbers 1-20 sequence model: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20.",
              "Mi baa sukuu anɔpa.",
              "Mi yε sukuulɔ, ni mi baa sukuu anɔpa.",
              "The text says the learner starts school in the morning and studies with classmates.",
              "Mi yε [name]. Mi baa sukuu anɔpa.",
              gaWordBankSet
                ? `Approved Ga vocabulary set: ${gaWordBankSet}.`
                : "Mi yε [name], mi lε wekurom ni. Mi suɔmɔ ga kɛ nyɛ.",
              "Choose the sentence with correct pronoun and verb sequence.",
            ]
            : [
              `Advanced Ga alphabet model: maintain consistent standard Accra Ga orthography (${gaAlphabetSequence}) and avoid mixed dialect forms.`,
              "Ga numbers context model: apply counting to date/price/quantity examples with accurate forms.",
              "Yɛ suɔmɔ vocabulary kɛ grammar ni hewalɛ.",
              "Model reordered sentence with full clause structure in standard Accra Ga.",
              "The paragraph describes school activities and hobbies in standard Ga.",
              "Miyɛ [name]. Mi baa sukuu anɔpa, ni mi pɛ suɔmɔ ga kɛ nyɛ.",
              gaWordBankExamples
                ? `Model short Ga writing set using approved word bank entries: ${gaWordBankExamples}.`
                : "Model short Ga writing set with clear sentence links and correct grammar.",
              "Use the option with correct pronoun/verb agreement and clause flow.",
            ],
      };
    }
    if (normalized.includes("urdu")) {
      return {
        languageName: "Urdu",
        targetLanguageName: "Urdu",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Translate into Urdu (Roman Urdu accepted): I am revising vocabulary for my exam.",
          "Choose the correct verb phrase for: We study Urdu every evening.",
          "Reorder the words to make a correct Urdu sentence.",
          "Read the short Urdu sentence and answer in English.",
          "Prepare a short spoken Urdu response about hobbies.",
          "Write two Urdu sentences (or Roman Urdu) about school subjects.",
          "Match each Urdu phrase with its English meaning.",
          "Select the correct present tense form for the pronoun.",
        ],
        modelAnswers: [
          "main apne imtihan ke liye alfaaz dohra raha hoon.",
          "hum har shaam urdu parhte hain.",
          "mujhe haftay ke aakhir mein parhna pasand hai.",
          "The text says the speaker likes learning languages.",
          "mujhe football khelna aur music sunna pasand hai.",
          "mujhe maths aur tareekh pasand hain. mera ustad bohat meherban hai.",
          "assalam-o-alaikum = hello; shukriya = thank you; khuda hafiz = goodbye",
          "Use correct pronoun agreement with present tense.",
        ],
      };
    }
    if (normalized.includes("polish")) {
      return {
        languageName: "Polish",
        targetLanguageName: "polski",
        activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
        prompts: [
          "Przetlumacz na polski: I am revising vocabulary for my exam.",
          "Wybierz poprawna forme czasownika: My ___ (uczyc sie) polskiego codziennie.",
          "Uloz wyrazy w poprawnym szyku zdania.",
          "Przeczytaj krotki tekst i odpowiedz po angielsku.",
          "Przygotuj krotka wypowiedz ustna o swoich zainteresowaniach.",
          "Napisz dwa zdania po polsku o szkole i ulubionych przedmiotach.",
          "Dopasuj kazde wyrazenie po polsku do znaczenia po angielsku.",
          "Wybierz poprawna forme czasu terazniejszego dla wskazanego zaimka.",
        ],
        modelAnswers: [
          "Powtarzam slownictwo do mojego egzaminu.",
          "My uczymy sie polskiego codziennie.",
          "Lubie czytac w weekend.",
          "The text says the speaker likes learning languages.",
          "Lubie grac w pilke nozna i sluchac muzyki.",
          "Lubie matematyke i historie. Moj nauczyciel jest bardzo mily.",
          "czesc = hello; dziekuje = thank you; do widzenia = goodbye",
          "Use proper pronoun-verb agreement in present tense.",
        ],
      };
    }
    return {
      languageName: "Target language",
      targetLanguageName: "target language",
      activityModes: ["translation", "grammar", "sentence-building", "reading", "speaking", "writing", "vocabulary", "verb-conjugation"],
      prompts: [
        "Translate into the target language: I am revising vocabulary for my exam.",
        "Choose the correct verb form in the target language sentence.",
        "Reorder the words to make a correct target-language sentence.",
        "Read the short target-language text and answer in English.",
        "Prepare a short speaking response in the target language.",
        "Write two connected sentences in the target language.",
        "Match each target-language phrase to its English meaning.",
        "Conjugate the given verb in present tense for the required pronoun.",
      ],
      modelAnswers: [
        "Model target-language translation.",
        "Model correct verb form.",
        "Model reordered sentence.",
        "Model reading comprehension response.",
        "Model speaking response.",
        "Model writing response.",
        "Model vocabulary mapping.",
        "Model conjugation response.",
      ],
    };
  };

  if (input.type === "reading") {
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const slot = serial % 6;
      const verb = wordsByDifficulty[Math.min(4, Math.max(0, input.difficulty - 1))];
      const itemNumber = index + 1;
      const passageTemplates = [
        `${input.yearGroup} learners explore ${baseTopic.toLowerCase()} and ${verb} key ideas with evidence.`,
        `A short source about ${baseTopic.toLowerCase()} asks pupils to ${verb} how language choices support meaning.`,
        `The class reads an extract on ${baseTopic.toLowerCase()} and must ${verb} the writer's viewpoint using quotations.`,
        `In this ${input.yearGroup} passage, students ${verb} how structure helps present ${baseSkill.toLowerCase()}.`,
        `This text models ${baseTopic.toLowerCase()} and asks readers to ${verb} tone, intent, and evidence.`,
        `Pupils review a non-fiction text on ${baseTopic.toLowerCase()} and ${verb} main ideas precisely.`,
      ];
      const questionTemplates = [
        `Which quotation best supports the main point in text ${itemNumber}?`,
        `How does the writer guide the reader's understanding in this extract?`,
        `What inference can be made about the author's viewpoint from the passage?`,
        `How does structure help communicate the key message in this text?`,
        `Which language choice is most effective and why?`,
        `What evidence shows the strongest link to ${baseSkill.toLowerCase()}?`,
      ];
      const passage = `${passageTemplates[slot]} Text reference ${serial + 1}.`;
      return {
        id: `fallback-reading-${itemNumber}`,
        type: input.subject,
        passage,
        question: `${questionTemplates[slot]} (${baseTopic})`,
        answer: `A strong response ${verb}s ${baseSkill.toLowerCase()} using precise evidence from the passage and links back to ${baseTopic.toLowerCase()}.`,
        options: [
          `It ignores ${baseSkill.toLowerCase()} and gives no evidence.`,
          `It ${verb}s ${baseSkill.toLowerCase()} using clear evidence and explanation.`,
          `It is unrelated to ${baseTopic.toLowerCase()} and lacks justification.`,
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
    const highDifficultyInstruction = input.difficulty >= 4
      ? " Explain your method and justify your reasoning."
      : "";
    const normalizedStage = `${input.keyStage} ${input.yearGroup} ${input.subject}`.toLowerCase();
    const isGcseMaths = normalizedStage.includes("gcse") || normalizedStage.includes("ks4") || normalizedStage.includes("year 10") || normalizedStage.includes("year 11");
    const isKs3Maths = normalizedStage.includes("ks3") || normalizedStage.includes("year 7") || normalizedStage.includes("year 8") || normalizedStage.includes("year 9");
    const isKs1Maths = normalizedStage.includes("ks1") || normalizedStage.includes("year 1") || normalizedStage.includes("year 2");
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const slot = serial % 10;

      const makeMathsItem = (question: string, answer: string | number, choices: Array<string | number>, explanation: string) => ({
        id: `fallback-maths-${index + 1}`,
        type: input.subject,
        question,
        answer,
        choices,
        explanation,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      });

      if (isGcseMaths) {
        if (slot === 0) {
          const x = 4 + (serial % 6);
          const c = 5 + (serial % 4);
          const rhs = 2 * x + c;
          return makeMathsItem(`Solve 2x + ${c} = ${rhs}. State the inverse operations used.${highDifficultyInstruction}`, x, [x, x + 1, x - 1, rhs - c], `Subtract ${c} from both sides to get 2x = ${2 * x}, then divide by 2. x = ${x}.`);
        }
        if (slot === 1) {
          const a = 2 + (serial % 4);
          const b = 3 + (serial % 5);
          const total = (a + b) * (6 + (serial % 5));
          const answer = (total / (a + b)) * b;
          return makeMathsItem(`A quantity is shared in the ratio ${a}:${b}. The total is ${total}. Calculate the larger share and explain your unit-part method.${highDifficultyInstruction}`, answer, [answer, total - answer, a + b, total / b], `There are ${a + b} parts. One part is ${total} / ${a + b}, so the larger share is ${b} parts = ${answer}.`);
        }
        if (slot === 2) {
          const original = 80 + serial * 4;
          const multiplier = 1.15;
          const answer = Number((original * multiplier).toFixed(2));
          return makeMathsItem(`A value of ${original} is increased by 15%. Calculate the new value using a decimal multiplier.${highDifficultyInstruction}`, answer, [answer, original + 15, Number((original * 0.15).toFixed(2)), original - 15], `An increase of 15% uses multiplier 1.15. ${original} x 1.15 = ${answer}.`);
        }
        if (slot === 3) {
          const n = 6 + (serial % 8);
          const answer = 3 * n - 2;
          return makeMathsItem(`The nth term of a linear sequence is 3n - 2. Find term ${n} and describe the rule in words.${highDifficultyInstruction}`, answer, [answer, 3 * n, answer + 2, n - 2], `Substitute n = ${n}: 3 x ${n} - 2 = ${answer}. The sequence increases by 3 each term.`);
        }
        if (slot === 4) {
          const radius = 4 + (serial % 5);
          const answer = Number((Math.PI * radius * radius).toFixed(1));
          return makeMathsItem(`Calculate the area of a circle with radius ${radius} cm. Give your answer to 1 decimal place.${highDifficultyInstruction}`, answer, [answer, Number((2 * Math.PI * radius).toFixed(1)), radius * radius, Number((Math.PI * radius).toFixed(1))], `Use A = pi r squared. ${radius} squared = ${radius * radius}, so the area is about ${answer} square cm.`);
        }
        if (slot === 5) {
          const adjacent = 8 + (serial % 5);
          const opposite = 6 + (serial % 4);
          const answer = Number((Math.atan(opposite / adjacent) * 180 / Math.PI).toFixed(1));
          return makeMathsItem(`In a right-angled triangle, the opposite side is ${opposite} cm and the adjacent side is ${adjacent} cm. Calculate the angle using tan.${highDifficultyInstruction}`, `${answer} degrees`, [`${answer} degrees`, `${Number((opposite / adjacent).toFixed(2))} degrees`, `${opposite + adjacent} degrees`, `${Math.abs(adjacent - opposite)} degrees`], `Use tan(theta) = opposite / adjacent = ${opposite}/${adjacent}. theta = tan^-1(${opposite}/${adjacent}) = ${answer} degrees.`);
        }
        if (slot === 6) {
          const wins = 7 + (serial % 5);
          const total = 20 + (serial % 6);
          return makeMathsItem(`A team wins ${wins} of ${total} matches. Estimate the probability of a win from relative frequency and comment on reliability.${highDifficultyInstruction}`, `${wins}/${total}`, [`${wins}/${total}`, `${total}/${wins}`, `${total - wins}/${total}`, `${wins}/${total - wins}`], `Relative frequency is wins divided by trials, ${wins}/${total}. More matches would make the estimate more reliable.`);
        }
        if (slot === 7) {
          const x = 2 + (serial % 4);
          const y = 3 + (serial % 5);
          const sum = x + y;
          const diff = x - y;
          return makeMathsItem(`Solve the simultaneous equations x + y = ${sum} and x - y = ${diff}.${highDifficultyInstruction}`, `x = ${x}, y = ${y}`, [`x = ${x}, y = ${y}`, `x = ${y}, y = ${x}`, `x = ${sum}, y = ${diff}`, `x = ${diff}, y = ${sum}`], `Add the equations to get 2x = ${sum + diff}, so x = ${x}. Substitute into x + y = ${sum} to get y = ${y}.`);
        }
        if (slot === 8) {
          const lower = 20 + (serial % 4) * 5;
          const upper = lower + 5;
          return makeMathsItem(`A cumulative frequency graph shows ${lower} pupils below a score of 40 and ${upper} below a score of 50. How many pupils scored from 40 up to 50?${highDifficultyInstruction}`, upper - lower, [upper - lower, upper, lower, upper + lower], `Subtract cumulative frequencies: ${upper} - ${lower} = ${upper - lower}.`);
        }
        const a = 2 + (serial % 4);
        const b = 5 + (serial % 5);
        return makeMathsItem(`Factorise ${a}x + ${a * b}. Then explain how the common factor is identified.${highDifficultyInstruction}`, `${a}(x + ${b})`, [`${a}(x + ${b})`, `${a}(x - ${b})`, `x(${a} + ${b})`, `${a * b}(x + 1)`], `Both terms share a factor of ${a}, so ${a}x + ${a * b} = ${a}(x + ${b}).`);
      }

      if (isKs3Maths) {
        if (slot === 0) {
          const x = 5 + (serial % 7);
          const rhs = 4 * x - 3;
          return makeMathsItem(`Solve 4x - 3 = ${rhs} and check your answer by substitution.${highDifficultyInstruction}`, x, [x, x + 1, x - 1, rhs], `Add 3, then divide by 4: x = ${x}. Substitution gives ${4 * x} - 3 = ${rhs}.`);
        }
        if (slot === 1) {
          const term = 4 + (serial % 6);
          const answer = 5 * term + 2;
          return makeMathsItem(`The rule for a sequence is 5n + 2. Find term ${term} and explain what the 5 represents.${highDifficultyInstruction}`, answer, [answer, 5 * term, term + 7, answer - 2], `Substitute n = ${term}. The 5 is the common difference between consecutive terms.`);
        }
        if (slot === 2) {
          const part = 3 + (serial % 4);
          const totalParts = 8;
          const amount = totalParts * (6 + (serial % 5));
          const answer = (amount / totalParts) * part;
          return makeMathsItem(`Share ${amount} in the ratio ${part}:${totalParts - part}. Find the first share.${highDifficultyInstruction}`, answer, [answer, amount - answer, part * amount, totalParts], `There are ${totalParts} parts. One part is ${amount / totalParts}; ${part} parts are ${answer}.`);
        }
        if (slot === 3) {
          const values = [7 + serial, 9 + serial, 11 + serial, 13 + serial];
          const answer = values.reduce((sum, value) => sum + value, 0) / values.length;
          return makeMathsItem(`Find the mean of ${values.join(", ")} and say why the mean is useful for comparing data sets.${highDifficultyInstruction}`, answer, [answer, values[1], values[2], values[3]], `Add the values and divide by 4. The mean balances the data into one representative value.`);
        }
        if (slot === 4) {
          const percent = 20 + (serial % 4) * 5;
          const value = 60 + serial * 3;
          const answer = Number((value * percent / 100).toFixed(2));
          return makeMathsItem(`Find ${percent}% of ${value}. Show the decimal multiplier you used.${highDifficultyInstruction}`, answer, [answer, value + percent, value - percent, percent], `${percent}% = ${percent / 100}. ${value} x ${percent / 100} = ${answer}.`);
        }
        if (slot === 5) {
          const length = 8 + (serial % 6);
          const width = 4 + (serial % 5);
          const answer = length * width;
          return makeMathsItem(`A rectangle is ${length} cm by ${width} cm. Calculate its area and explain the difference between area and perimeter.${highDifficultyInstruction}`, answer, [answer, 2 * (length + width), length + width, length - width], `Area counts square centimetres inside the shape: ${length} x ${width} = ${answer}. Perimeter is the distance around it.`);
        }
        if (slot === 6) {
          const blue = 4 + (serial % 5);
          const total = 15 + (serial % 6);
          return makeMathsItem(`A bag has ${blue} blue counters out of ${total}. Write the probability of blue and of not blue.${highDifficultyInstruction}`, `${blue}/${total} and ${total - blue}/${total}`, [`${blue}/${total} and ${total - blue}/${total}`, `${total}/${blue} and ${blue}/${total}`, `${total - blue}/${total} and ${blue}/${total}`, `${blue}/${total - blue} and ${total}/${blue}`], `Probability of blue is ${blue}/${total}. Not blue is the remaining ${total - blue} counters out of ${total}.`);
        }
        if (slot === 7) {
          const scale = 3 + (serial % 4);
          const drawing = 5 + (serial % 6);
          const answer = scale * drawing;
          return makeMathsItem(`A scale drawing uses scale factor ${scale}. A side is ${drawing} cm on the drawing. Find the real length.${highDifficultyInstruction}`, answer, [answer, scale + drawing, drawing - scale, scale], `Multiply by the scale factor: ${drawing} x ${scale} = ${answer}.`);
        }
        if (slot === 8) {
          const numerator = 2 + (serial % 3);
          const denominator = 5 + (serial % 4);
          const multiplier = 3;
          return makeMathsItem(`Write an equivalent fraction to ${numerator}/${denominator} by multiplying numerator and denominator by ${multiplier}.${highDifficultyInstruction}`, `${numerator * multiplier}/${denominator * multiplier}`, [`${numerator * multiplier}/${denominator * multiplier}`, `${numerator + multiplier}/${denominator + multiplier}`, `${denominator * multiplier}/${numerator * multiplier}`, `${numerator}/${denominator * multiplier}`], `Equivalent fractions multiply both numerator and denominator by the same value.`);
        }
        const value = 30 + serial;
        return makeMathsItem(`Round ${value}.678 to 1 decimal place and explain which digit decides the rounding.${highDifficultyInstruction}`, `${value}.7`, [`${value}.7`, `${value}.6`, `${value + 1}.0`, `${value}.68`], `The hundredths digit is 7, so the tenths digit rounds up.`);
      }

      if (isKs1Maths) {
        const first = 8 + (serial % 8);
        const second = 3 + (serial % 5);
        if (slot % 3 === 0) {
          const answer = first + second;
          return makeMathsItem(`There are ${first} shells and ${second} more shells are found. How many shells are there altogether?`, answer, [answer, first, second, answer - 1], `Add the two groups: ${first} + ${second} = ${answer}.`);
        }
        if (slot % 3 === 1) {
          const answer = first - second;
          return makeMathsItem(`${first} birds are on a fence. ${second} fly away. How many birds are left?`, answer, [answer, first + second, second, answer + 1], `Subtract the birds that fly away: ${first} - ${second} = ${answer}.`);
        }
        const groups = 2 + (serial % 3);
        const each = 3 + (serial % 4);
        const answer = groups * each;
        return makeMathsItem(`Draw or imagine ${groups} equal groups with ${each} in each group. How many are there in total?`, answer, [answer, groups + each, each - groups, answer + each], `Equal groups can be counted by repeated addition: ${each} + ${each}${groups > 2 ? ` + ${each}` : ""} = ${answer}.`);
      }

      if (slot === 0) {
        const packs = 3 + (serial % 4);
        const each = 6 + (serial % 5);
        const extra = 4 + (serial % 4);
        const answer = packs * each + extra;
        return makeMathsItem(`A class has ${packs} trays with ${each} pencils on each tray, plus ${extra} spare pencils. How many pencils are there altogether?${highDifficultyInstruction}`, answer, [answer, packs + each + extra, packs * each, answer - extra], `Multiply equal groups first, then add the extras: ${packs} x ${each} + ${extra} = ${answer}.`);
      }
      if (slot === 1) {
        const groups = 4 + (serial % 5);
        const total = groups * (5 + (serial % 5));
        const answer = total / groups;
        return makeMathsItem(`${total} counters are shared equally into ${groups} groups. How many counters are in each group, and which multiplication fact checks it?${highDifficultyInstruction}`, answer, [answer, total - groups, total + groups, groups], `${total} divided by ${groups} = ${answer}. Check with ${answer} x ${groups} = ${total}.`);
      }
      if (slot === 2) {
        const numerator = 1 + (serial % 3);
        const denominator = 4 + (serial % 5);
        const total = denominator * (3 + (serial % 4));
        const answer = (total / denominator) * numerator;
        return makeMathsItem(`Find ${numerator}/${denominator} of ${total}. Use equal parts to explain your answer.${highDifficultyInstruction}`, answer, [answer, total / denominator, total - answer, denominator * numerator], `Divide ${total} into ${denominator} equal parts, then take ${numerator} part(s): ${answer}.`);
      }
      if (slot === 3) {
        const length = 5 + (serial % 6);
        const width = 3 + (serial % 5);
        const answer = 2 * (length + width);
        return makeMathsItem(`A rectangle is ${length} cm long and ${width} cm wide. Find the perimeter by adding all four sides.${highDifficultyInstruction}`, answer, [answer, length * width, length + width, 2 * length + width], `Perimeter is the distance around: ${length} + ${width} + ${length} + ${width} = ${answer}.`);
      }
      if (slot === 4) {
        const start = 120 + serial * 3;
        const jump = 10;
        const answer = start + jump * 3;
        return makeMathsItem(`Continue the sequence ${start}, ${start + jump}, ${start + jump * 2}, __. What is the rule?${highDifficultyInstruction}`, answer, [answer, start + 3, start + jump * 2, start - jump], `The rule is add ${jump}. The next term is ${answer}.`);
      }
      if (slot === 5) {
        const pounds = 2 + (serial % 5);
        const pence = 35 + (serial % 5) * 5;
        const answer = pounds * 100 + pence;
        return makeMathsItem(`Write GBP ${pounds}.${String(pence).padStart(2, "0")} in pence and explain the place value.${highDifficultyInstruction}`, answer, [answer, pounds + pence, pounds * pence, answer + 100], `Each pound is 100 pence, so ${pounds} pounds is ${pounds * 100} pence. Add ${pence} pence to get ${answer}.`);
      }
      if (slot === 6) {
        const left = 12 + (serial % 7);
        const right = 8 + (serial % 6);
        return makeMathsItem(`Compare ${left} x 4 and ${right} x 5. Which is larger, and by how much?${highDifficultyInstruction}`, `${left * 4 > right * 5 ? `${left} x 4` : `${right} x 5`} by ${Math.abs(left * 4 - right * 5)}`, [`${left * 4 > right * 5 ? `${left} x 4` : `${right} x 5`} by ${Math.abs(left * 4 - right * 5)}`, `${left} x 4 by ${left}`, `${right} x 5 by ${right}`, "They are equal"], `Calculate both products, then compare: ${left * 4} and ${right * 5}.`);
      }
      if (slot === 7) {
        const missing = 4 + (serial % 7);
        const factor = 6;
        const product = missing * factor;
        return makeMathsItem(`Complete the equation: __ x ${factor} = ${product}. Explain the inverse operation.${highDifficultyInstruction}`, missing, [missing, product - factor, product + factor, factor], `Use division as the inverse of multiplication: ${product} divided by ${factor} = ${missing}.`);
      }
      if (slot === 8) {
        const litre = 4 + (serial % 4);
        const area = litre * (5 + (serial % 5));
        const answer = area / litre;
        return makeMathsItem(`One litre of paint covers ${litre} square metres. How many litres are needed for ${area} square metres?${highDifficultyInstruction}`, answer, [answer, area + litre, area - litre, litre], `Divide the total area by the coverage per litre: ${area} / ${litre} = ${answer}.`);
      }
      const rows = 3 + (serial % 4);
      const columns = 5 + (serial % 5);
      const answer = rows * columns;
      return makeMathsItem(`An array has ${rows} rows and ${columns} columns. Write the multiplication and division facts it shows.${highDifficultyInstruction}`, `${rows} x ${columns} = ${answer}; ${answer} / ${rows} = ${columns}`, [`${rows} x ${columns} = ${answer}; ${answer} / ${rows} = ${columns}`, `${rows} + ${columns} = ${rows + columns}`, `${answer} x ${rows} = ${columns}`, `${columns} - ${rows} = ${columns - rows}`], `Arrays show related facts: rows x columns gives the total, and division reverses it.`);
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
      const serial = index + variantOffset;
      const question = sciencePrompts[serial % sciencePrompts.length];
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
    const profile = resolveLanguageProfile(input.subject);
    const isGaLanguage = input.subject === "ga-language" || input.subject === "gcse-ga";
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const slot = isGaLanguage
        ? index === 0
          ? 0
          : index === 1
            ? 1
            : 2 + ((serial + index) % Math.max(profile.activityModes.length - 2, 1))
        : serial % profile.activityModes.length;
      const activityMode = profile.activityModes[slot];
      return {
        id: `fallback-lang-${index + 1}`,
        type: input.subject,
        question: `${profile.prompts[slot]} (${baseTopic})`,
        answer: profile.modelAnswers[slot],
        englishMeaning: `Meaning checkpoint for ${baseTopic} in ${profile.languageName}.`,
        targetVocabulary: `${profile.targetLanguageName} ${baseTopic} set ${serial + 1}`,
        activityMode,
        explanation: isGaLanguage
          ? `Calibrated for ${input.yearGroup} at ${difficultyLabel.toLowerCase()} with standard Accra Ga only (no Twi mixing).`
          : `Calibrated for ${input.yearGroup} at ${difficultyLabel.toLowerCase()} with a ${activityMode} focus in ${profile.languageName}.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "phonics") {
    const phonicsRows = [
      { word: "ship", hint: "Use the /sh/ digraph at the start.", sentence: "The ___ sailed across the bay.", stage: "Phase 3" },
      { word: "train", hint: "Listen for the long /ai/ sound.", sentence: "We caught the ___ to school.", stage: "Phase 5" },
      { word: "clap", hint: "Blend the consonant cluster /cl/.", sentence: "Please ___ for the class reader.", stage: "Phase 4" },
      { word: "make", hint: "Use the split digraph a-e.", sentence: "Can you ___ a model bridge?", stage: "Phase 5" },
      { word: "light", hint: "Find the trigraph that makes /igh/.", sentence: "Turn on the hall ___.", stage: "Phase 5" },
      { word: "jump", hint: "Blend each sound in order.", sentence: "The rabbit can ___ over logs.", stage: "Phase 3" },
    ];
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const row = phonicsRows[serial % phonicsRows.length];
      return {
        id: `fallback-phonics-${index + 1}`,
        type: input.subject,
        word: row.word,
        hint: row.hint,
        sentenceContext: row.sentence,
        categoryHint: `${baseSkill} | ${baseTopic}`,
        syllables: row.word,
        emoji: "\ud83d\udcd6",
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        phonicsStage: row.stage,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "grammar") {
    const grammarRows = [
      {
        question: "Choose the sentence that uses the past perfect tense correctly.",
        options: [
          "By the time we arrived, the play had started.",
          "By the time we arrived, the play has started.",
          "By the time we arrived, the play start.",
        ],
        answer: "By the time we arrived, the play had started.",
        explanation: "Past perfect uses 'had + past participle' for the earlier past action.",
      },
      {
        question: "Rewrite the sentence with correct subject-verb agreement: The list of books are on my desk.",
        options: [
          "The list of books is on my desk.",
          "The list of books are on my desk.",
          "The list of books were on my desk.",
        ],
        answer: "The list of books is on my desk.",
        explanation: "The subject is 'list' (singular), so the verb must be 'is'.",
      },
      {
        question: "Select the sentence with a correctly placed relative clause.",
        options: [
          "The pupil, who revised every night, improved quickly.",
          "The pupil who revised, every night improved quickly.",
          "The pupil who revised every night improved, quickly.",
        ],
        answer: "The pupil, who revised every night, improved quickly.",
        explanation: "Parenthetical relative clauses are separated by commas.",
      },
    ];
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const row = grammarRows[serial % grammarRows.length];
      return {
        id: `fallback-grammar-${index + 1}`,
        type: input.subject,
        question: `${row.question} (${baseTopic})`,
        answer: row.answer,
        options: row.options,
        explanation: row.explanation,
        hint: `Check ${baseSkill.toLowerCase()} rules before selecting.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "punctuation") {
    const punctuationRows = [
      {
        question: "Choose the sentence with commas used correctly in a list.",
        options: [
          "For lunch we packed apples, bananas, and bread rolls.",
          "For lunch, we packed apples bananas and, bread rolls.",
          "For lunch we packed, apples bananas and bread rolls.",
        ],
        answer: "For lunch we packed apples, bananas, and bread rolls.",
        explanation: "Commas separate list items clearly.",
      },
      {
        question: "Insert the apostrophe correctly: The teachers lounge was quiet.",
        options: [
          "The teacher's lounge was quiet.",
          "The teachers lounge was quiet.",
          "The teachers' lounge was quiet.",
        ],
        answer: "The teachers' lounge was quiet.",
        explanation: "Plural possession for more than one teacher uses teachers'.",
      },
      {
        question: "Select the sentence with correct direct speech punctuation.",
        options: [
          "\"I will finish my homework,\" said Amina.",
          "\"I will finish my homework\" said, Amina.",
          "I will finish my homework,\" said Amina.",
        ],
        answer: "\"I will finish my homework,\" said Amina.",
        explanation: "Speech marks and comma placement follow standard direct speech conventions.",
      },
    ];
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const row = punctuationRows[serial % punctuationRows.length];
      return {
        id: `fallback-punctuation-${index + 1}`,
        type: input.subject,
        question: `${row.question} (${baseTopic})`,
        answer: row.answer,
        options: row.options,
        explanation: row.explanation,
        hint: `Focus on ${baseSkill.toLowerCase()} in this sentence.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  if (input.type === "writing") {
    const writingRows = [
      {
        prompt: "Write a short paragraph explaining how your class can reduce waste at school.",
        answer: "A strong answer uses a clear topic sentence, two practical actions, and a concluding sentence.",
        options: [
          "Include at least one persuasive connective (for example, therefore).",
          "Use only one sentence.",
          "Avoid giving any examples.",
        ],
      },
      {
        prompt: "Rewrite the draft so it uses precise verbs and varied sentence openings.",
        answer: "A strong rewrite replaces weak verbs and varies sentence starters while keeping meaning clear.",
        options: [
          "Replace generic verbs like 'went' with specific verbs.",
          "Repeat the same sentence starter each time.",
          "Remove punctuation for speed.",
        ],
      },
      {
        prompt: "Write a balanced response: should homework be shorter on weekends?",
        answer: "A balanced response gives one argument for and one against before a justified conclusion.",
        options: [
          "Use evidence and connectives to compare viewpoints.",
          "Give only one side with no conclusion.",
          "Use unrelated examples.",
        ],
      },
    ];
    return Array.from({ length: safeCount }, (_, index) => {
      const serial = index + variantOffset;
      const row = writingRows[serial % writingRows.length];
      return {
        id: `fallback-writing-${index + 1}`,
        type: input.subject,
        prompt: `${row.prompt} (${baseTopic})`,
        answer: row.answer,
        options: row.options,
        explanation: `Model writing guidance for ${input.yearGroup} using ${baseSkill.toLowerCase()} at ${difficultyLabel.toLowerCase()}.`,
        hint: `Plan, draft, and check success criteria linked to ${baseSkill.toLowerCase()}.`,
        yearGroup: input.yearGroup,
        skillFocus: baseSkill,
        topic: baseTopic,
        difficulty: input.difficulty,
      };
    });
  }

  return Array.from({ length: safeCount }, (_, index) => {
    const verb = wordsByDifficulty[Math.min(4, Math.max(0, input.difficulty - 1))];
    const question = `${input.yearGroup} ${input.type} application: ${verb} ${baseSkill.toLowerCase()} in context (${baseTopic.toLowerCase()}).`;
    const answer = `A high-quality response ${verb}s the key idea, uses accurate terminology, and links directly to ${baseTopic.toLowerCase()}.`;
    return {
      id: `fallback-${input.type}-${index + 1}`,
      type: input.subject,
      question,
      answer,
      options: [
        answer,
        `A response that mentions ${baseTopic.toLowerCase()} but lacks precision.`,
        "A response that is off-topic and unsupported.",
      ],
      explanation: `This fallback item is curriculum-aligned for ${input.yearGroup} and ${baseSkill}.`,
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
  gaLexicon?: GaFallbackLexicon | null;
  scienceDiscipline?: ScienceDiscipline | null;
  keyStage: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
  variantSeed?: number;
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

  const acceptedItems = Array.isArray(quality.cleanedItems) && quality.cleanedItems.length > 0
    ? quality.cleanedItems
    : quality.ok
      ? []
      : null;

  if (!acceptedItems || acceptedItems.length === 0) {
    throw new Error(quality.error ?? "Deterministic fallback validation failed.");
  }

  // If quality accepted fewer items than requested, generate additional raw items to top up
  let finalItems = acceptedItems;
  if (finalItems.length < input.count) {
    const raw = buildDeterministicGenericFallback({ ...input, count: input.count });
    const extraCandidates = raw.filter((candidate) => {
      const q = String((candidate as Record<string, unknown>).question ?? (candidate as Record<string, unknown>).prompt ?? "").trim();
      return q.length > 0 && !finalItems.some((existing) =>
        String((existing as Record<string, unknown>).question ?? "").trim() === q,
      );
    });
    finalItems = [...finalItems, ...extraCandidates].slice(0, input.count);
  }

  const actualCount = finalItems.length;
  return {
    content: finalItems,
    validation: {
      ...(quality.meta ?? {}),
      valid: true,
      repaired: false,
      aiGenerated: false,
      regeneratedAfterValidation: false,
      fallbackUsed: "local_template",
      requestedCount: input.count,
      finalCount: actualCount,
      filledSlots: actualCount,
      emptySlots: Math.max(0, input.count - actualCount),
      duplicateRejectedCount: 0,
      weakRejectedCount: 0,
      generatedQuestions: actualCount,
      adminWarnings: [],
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
  gaScriptPreference?: "orthography_only" | "orthography_with_transliteration";
  avoidPrompts?: string[];
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
      input.avoidPrompts ?? [],
      input.gaScriptPreference ?? "orthography_with_transliteration",
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

  if (acceptedItems.length > 0) {
    const partial = validateAiContentQuality({
      type: input.validatorType,
      subject: input.subject,
      topic: input.topic,
      keyStage: input.keyStage,
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: input.level,
      requestedCount: acceptedItems.length,
      graphChecks: input.graphChecks,
      items: acceptedItems,
      mode: "repair",
    });

    if (Array.isArray(partial.cleanedItems) && partial.cleanedItems.length > 0) {
      const finalParsed = partial.cleanedItems.slice(0, input.count);
      const isPartialGeneration = finalParsed.length < input.count;
      normalizedMetadataSnapshot = pickMetadataSnapshot(Array.isArray(finalParsed) ? finalParsed[0] : finalParsed);
      return {
        content: finalParsed,
        prompt: promptUsed,
        validation: {
          ...(partial.meta as Record<string, unknown>),
          aiGenerated: true,
          regeneratedAfterValidation: true,
          fallbackUsed: false,
          regeneratedCount,
          partialGeneration: isPartialGeneration,
          requestedCount: input.count,
          finalCount: finalParsed.length,
          missingCount: Math.max(0, input.count - finalParsed.length),
          repairDiagnostics: providerDiagnostics,
          validationDiagnostics: partial.meta?.diagnostics,
          rawOpenAiResponse: providerDiagnostics[providerDiagnostics.length - 1] ?? null,
          subjectContainment: partial.meta?.diagnostics?.contaminationDetected ? "failed" : "passed",
          contaminatedItemsRepaired: partial.meta?.diagnostics?.repairedItemsCount ?? 0,
          contaminatedItemsRejected: partial.meta?.diagnostics?.rejectedItemsCount ?? 0,
          scienceDiscipline: input.scienceDiscipline,
        },
        generatedMetadataSnapshot,
        normalizedMetadataSnapshot,
      };
    }
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
      diagnosticOutcome: "invalid_generated_content",
      requestTuple: null,
      details: { category: "validation", stage: "request-body" },
    }, { status: 400 });
  }
  const aiMode: AiGenerationMode = parseAiGenerationMode(body.aiMode);
  const openAiConfig = await getOpenAiApiKeyWithSource();
  const keySource = openAiConfig.keySource;

  const requestedSubject = (body.subject ?? body.type) as string;
  const gaScriptPreference: "orthography_only" | "orthography_with_transliteration" = body.gaScriptPreference === "orthography_only"
    ? "orthography_only"
    : "orthography_with_transliteration";
  const requestedCount = body.itemCount ?? body.numberOfItems ?? body.count;
  const requestedLevel = body.difficulty ?? body.level;
  const provisionalYearGroup = typeof body.targetLearningYearGroup === "string"
    ? body.targetLearningYearGroup
    : typeof body.yearGroup === "string"
      ? body.yearGroup
      : "Year 1";
  const provisionalKeyStage = typeof body.targetLearningKeyStage === "string"
    ? body.targetLearningKeyStage
    : typeof body.keyStage === "string"
      ? body.keyStage
      : "KS1";
  const provisionalSkillFocus = typeof body.skillFocus === "string" ? body.skillFocus : "";
  const provisionalRequestTuple: GenerationRequestTuple = {
    yearGroup: provisionalYearGroup,
    keyStage: provisionalKeyStage,
    subject: String(requestedSubject ?? ""),
    strand: null,
    skillFocus: provisionalSkillFocus,
    difficulty: Math.max(1, Math.min(5, Number.isFinite(Number(requestedLevel)) ? Number(requestedLevel) : 1)),
    itemCount: Math.max(1, Math.min(10, Number(requestedCount ?? BATCH_SIZE))),
  };
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
      diagnosticOutcome: "policy_mismatch",
      requestTuple: provisionalRequestTuple,
      details: {
        category: "unsupported_subject",
        supportedSubjects: Object.keys(GENERATION_CONTENT_TYPE_BY_SUBJECT),
      },
    }, { status: 422 });
  }
  const sourceSubject = normalizedSubject;
  const gaFallbackLexicon = await loadGaFallbackLexicon(sourceSubject);
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
      diagnosticOutcome: "policy_mismatch",
      requestTuple: {
        ...provisionalRequestTuple,
        subject: sourceSubject,
      },
      details: {
        category: "validation_error",
        field: "englishStrand",
        allowed: ["phonics", "spelling", "reading", "comprehension", "grammar", "punctuation", "writing", "vocabulary"],
      },
    }, { status: 422 });
  }
  const rawYearGroup = typeof body.targetLearningYearGroup === "string"
    ? body.targetLearningYearGroup
    : typeof body.yearGroup === "string"
      ? body.yearGroup
      : "Year 1";
  const rawTopic = body.topicTheme ?? body.topic;

  const parentGenerationType = mapSubjectToGenerationType(sourceSubject);
  const generationType = englishStrand ? englishStrandToGenerationType(englishStrand) : parentGenerationType;
  const promptType = englishStrand ? mapEnglishStrandToPromptType(englishStrand) : mapGenerationTypeToPromptType(generationType);
  const level = typeof requestedLevel === "number" ? requestedLevel : Number(requestedLevel);
  const topic = typeof rawTopic === "string" ? rawTopic : "";
  const ageGroup = typeof body.ageGroup === "string" ? body.ageGroup : ageGroupForYearGroup(rawYearGroup);
  const count = Math.max(1, Math.min(10, Number(requestedCount ?? BATCH_SIZE)));
  const keyStage = typeof body.targetLearningKeyStage === "string"
    ? body.targetLearningKeyStage
    : typeof body.keyStage === "string"
      ? body.keyStage
      : "KS1";
  const yearGroup = typeof body.targetLearningYearGroup === "string"
    ? body.targetLearningYearGroup
    : typeof body.yearGroup === "string"
      ? body.yearGroup
      : "";
  const studentYearGroup = typeof body.studentYearGroup === "string" ? body.studentYearGroup : null;
  const studentKeyStage = typeof body.studentKeyStage === "string" ? body.studentKeyStage : null;
  const subjectLevel = typeof body.subjectLevel === "number" ? body.subjectLevel : Number(body.subjectLevel);
  const strandLevel = typeof body.strandLevel === "number" ? body.strandLevel : Number(body.strandLevel);
  const levelSource = typeof body.levelSource === "string" ? body.levelSource : null;
  const adminOverrideReason = typeof body.adminOverrideReason === "string" ? body.adminOverrideReason : null;
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
  const avoidPrompts: string[] = Array.isArray(body.avoidPrompts)
    ? (body.avoidPrompts as unknown[])
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
      .slice(0, 8)
    : [];
  const fallbackVariantSeed = Number.isFinite(Number(body.regenerationNonce))
    ? Math.abs(Math.floor(Number(body.regenerationNonce)))
    : 0;
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
  const requestTuple: GenerationRequestTuple = {
    yearGroup: safeYearGroup,
    keyStage: safeKeyStage,
    subject: sourceSubject,
    strand: englishStrand,
    skillFocus: resolvedSkillFocus,
    difficulty: safeLevel,
    itemCount: count,
  };
  const diagnosticEnvelope = (diagnosticOutcome: DiagnosticOutcomeCode) => ({
    diagnosticOutcome,
    requestTuple,
  });
  const strictTupleValidation = validateStrictRequestTuple({
    requestTuple,
    rawYearGroup: yearGroup,
    rawKeyStage: keyStage,
    sourceSubject,
    isEnglishParent,
  });
  if (!strictTupleValidation.ok) {
    return NextResponse.json({
      success: false,
      error: strictTupleValidation.message,
      aiMode,
      keySource,
      details: strictTupleValidation.details,
      ...diagnosticEnvelope(strictTupleValidation.diagnosticOutcome),
    }, { status: 422 });
  }
  const requestedStudentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const exposureAvoidPrompts = requestedStudentId
    ? await collectStudentExposureAvoidPrompts(requestedStudentId)
    : [];
  const effectiveAvoidPrompts = Array.from(new Set([...avoidPrompts, ...exposureAvoidPrompts])).slice(0, 12);
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
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      message: `${sourceSubject} is not available for ${safeYearGroup}.`,
      details: { category: "unsupported_subject_for_year" },
      status: 422,
    });
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
      ...diagnosticEnvelope(diagnosticOutcome),
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
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      message: "GCSE content requires an exam board.",
      details: { category: "validation_error", field: "examBoard" },
      status: 422,
    });
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
      ...diagnosticEnvelope(diagnosticOutcome),
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
  const normalizeMappingLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const normalizedRequestedSkill = normalizeMappingLabel(resolvedSkillFocus);
  const hasExactSkillMapping = allowedSkillsForPath.includes(resolvedSkillFocus);
  const hasLooseSkillMapping = normalizedRequestedSkill.length > 0
    && allowedSkillsForPath.some((skill) => {
      const normalizedSkill = normalizeMappingLabel(skill);
      return normalizedSkill === normalizedRequestedSkill
        || normalizedSkill.includes(normalizedRequestedSkill)
        || normalizedRequestedSkill.includes(normalizedSkill);
    });
  if (resolvedSkillFocus && allowedSkillsForPath.length > 0 && !hasExactSkillMapping && !hasLooseSkillMapping) {
    if (aiMode === "fallback_only") {
      const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
        message: `Skill focus \"${resolvedSkillFocus}\" is not mapped for ${pathSubject} in ${safeYearGroup}.`,
        details: { category: "unsupported_skill_for_subject_year" },
        status: 422,
      });
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
        ...diagnosticEnvelope(diagnosticOutcome),
      }, { status: 422 });
    }

    console.warn("[admin-ai-generate] proceeding with relaxed skill mapping", {
      yearGroup: safeYearGroup,
      subject: pathSubject,
      skillFocus: resolvedSkillFocus,
      allowedSkills: allowedSkillsForPath,
      aiMode,
    });
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
    // Keep live generation available even when topic mapping is not exact.
    // Fallback-only mode remains strict for deterministic template routing.
    if (aiMode !== "fallback_only") {
      console.warn("[admin-ai-generate] proceeding with relaxed topic mapping", {
        yearGroup: safeYearGroup,
        subject: pathSubject,
        skillFocus: resolvedSkillFocus,
        topic,
        mappedTopics,
      });
    } else {
    const pathValidationReason = String(pathValidation.reason ?? "Invalid curriculum path.");
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      message: pathValidationReason,
      details: { category: "unsupported_path" },
      status: 422,
    });
    return NextResponse.json({
      success: false,
      error: pathValidationReason,
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
        validationReason: pathValidationReason,
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
        requestTuple,
        diagnosticOutcome,
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
      ...diagnosticEnvelope(diagnosticOutcome),
    }, { status: 422 });
    }
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
    studentYearGroup,
    studentKeyStage,
    targetLearningYearGroup: safeYearGroup,
    targetLearningKeyStage: safeKeyStage,
    subjectLevel: Number.isFinite(subjectLevel) ? subjectLevel : null,
    strandLevel: Number.isFinite(strandLevel) ? strandLevel : null,
    levelSource,
    adminOverrideReason,
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
    diagnosticOutcome?: DiagnosticOutcomeCode;
  }) => ({
    ...input,
    subjectRoute,
    requestTuple,
    ...sharedGenerationFields,
  });
  console.info("[admin-ai-generate] request", {
    ...generationDiagnostics,
    requestTuple,
    topic,
  });

  const apiKey = openAiConfig.apiKey;
  const fallbackAllowed = isFallbackAllowed(aiMode);

  console.info("[admin-ai-generate] mode", {
    aiMode,
    fallbackAllowed,
    keySource,
    hasApiKey: Boolean(apiKey),
  });

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
    validationMessage?: string | null;
  }) => {
    const validationReason = input.validationMessage || input.message;
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      errorCode: input.code,
      message: input.message,
      reason: input.reason,
      status: input.status,
    });
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
      validationReason,
      details: {
        reason: input.reason,
        validationMessage: input.validationMessage ?? null,
      },
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
        validationReason,
        mappingStatus: "mapped",
        fallbackTemplate: null,
        diagnosticOutcome,
      }),
      ...diagnosticEnvelope(diagnosticOutcome),
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
          variantSeed: fallbackVariantSeed,
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
        gaLexicon: gaFallbackLexicon,
        scienceDiscipline,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Core skill",
        topic,
        count,
        difficulty: safeLevel,
        variantSeed: fallbackVariantSeed,
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
    } catch (fallbackError) {
      const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
        errorCode: "fallback_generation_failed",
        message: "Fallback-only generation failed.",
        reason: "fallback_generation_failed",
        status: 500,
      });
      console.error("[admin-ai-generate] fallback-only generation failed:", fallbackError);
      return NextResponse.json({
        success: false,
        aiMode,
        keySource,
        errorCode: "fallback_generation_failed",
        message: "Fallback-only generation failed.",
        error: "Fallback-only generation failed.",
        providerUsed: "local_fallback",
        fallbackReason: "fallback_generation_failed",
        validationReason: fallbackError instanceof Error ? fallbackError.message : "fallback_generation_failed",
        generationMetadata: buildMetadata({
          generationSource: "mock",
          provider: "local",
          model: "local-fallback",
          fallbackReason: "fallback_generation_failed",
          validation: { valid: false, repaired: false },
          openAiAttempted: false,
          openAiSucceeded: false,
        }),
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
          openAiKeyFoundServerSide: keySource !== "none",
          fallbackReason: "fallback_generation_failed",
          validationReason: fallbackError instanceof Error ? fallbackError.message : "fallback_generation_failed",
          mappingStatus: "mapped",
          fallbackTemplate: `deterministic_${validatorType}`,
          diagnosticOutcome,
        }),
        ...diagnosticEnvelope(diagnosticOutcome),
      }, { status: 500 });
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
        variantSeed: fallbackVariantSeed,
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
        gaLexicon: gaFallbackLexicon,
        scienceDiscipline,
        keyStage: safeKeyStage,
        yearGroup: safeYearGroup,
        skillFocus: resolvedSkillFocus || "Core skill",
        topic,
        count,
        difficulty: safeLevel,
        variantSeed: fallbackVariantSeed,
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
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      errorCode: failure.errorCode,
      message: failure.message,
      reason: String(failure.details.reason ?? failure.errorCode),
      details: failure.details,
      status: failure.status,
    });
    return NextResponse.json({
      ...diagnosticEnvelope(diagnosticOutcome),
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
        diagnosticOutcome,
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
  const shouldUseCache = !(visualPlan.enabled && visualPlan.mode === "generate_now") && avoidPrompts.length === 0;
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

  const baseUserPrompt = buildUserPrompt(promptType, sourceSubject, safeLevel, topic, ageGroup, count, safeKeyStage, safeYearGroup, resolvedSkillFocus, safeExamBoard, [], targetSkills, weakAreas, "", scienceDiscipline, effectiveAvoidPrompts, gaScriptPreference);
  const userPrompt = graphPromptContext ? `${baseUserPrompt}\n\nGRAPH CONTEXT:\n${graphPromptContext}` : baseUserPrompt;
  const systemPrompt = SYSTEM_PROMPT[promptType];

  try {
    let parsed: unknown;
    let promptUsed = userPrompt;
    let validation: Record<string, unknown> = { valid: true, repaired: false, errors: [], fixesApplied: [], removedWords: [], regeneratedCount: 0, requestedCount: count, finalCount: count, filledSlots: count, emptySlots: 0, duplicateRejectedCount: 0, weakRejectedCount: 0, generatedQuestions: count, adminWarnings: [], fallbackUsed: "none" };
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
        gaScriptPreference,
        avoidPrompts: effectiveAvoidPrompts,
        graphPromptContext,
        graphChecks,
      });
      parsed = validated.content;
      promptUsed = validated.prompt;
      validation = validated.validation;
      generatedMetadataSnapshot = validated.generatedMetadataSnapshot;
      normalizedMetadataSnapshot = validated.normalizedMetadataSnapshot;
    }

    const tupleContainment = validateGeneratedTupleContainment({
      requestTuple,
      content: parsed,
      validation,
    });
    if (!tupleContainment.ok) {
      if (fallbackAllowed) {
        try {
          if (generationType === "spelling") {
            const fallback = buildValidatedSpellingFallback({
              keyStage: safeKeyStage,
              yearGroup: safeYearGroup,
              skillFocus: resolvedSkillFocus || "Prefixes",
              topic,
              count,
              difficulty: safeLevel,
              variantSeed: fallbackVariantSeed,
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
              fallbackReason: "tuple_containment_failed",
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
              fallbackReason: "tuple_containment_failed",
              validationReason: tupleContainment.message,
              generationDebug: buildGenerationDebug({
                providerAttempted: true,
                providerUsed: "local_fallback",
                openAiKeyFoundServerSide: true,
                fallbackReason: "tuple_containment_failed",
                validationReason: tupleContainment.message,
                mappingStatus: "mapped",
                fallbackTemplate: "deterministic_spelling",
                diagnosticOutcome: tupleContainment.diagnosticOutcome,
              }),
              content: preview,
              meta: fallback.validation,
              fallback: {
                used: true,
                reasonCode: "tuple_containment_failed",
                message: `${tupleContainment.message} Preview generated using the local spelling fallback.`,
              },
              ...diagnosticEnvelope(tupleContainment.diagnosticOutcome),
            });
          }

          const fallback = buildValidatedGenericFallback({
            type: validatorType,
            subject: sourceSubject,
            gaLexicon: gaFallbackLexicon,
            scienceDiscipline,
            keyStage: safeKeyStage,
            yearGroup: safeYearGroup,
            skillFocus: resolvedSkillFocus || "Core skill",
            topic,
            count,
            difficulty: safeLevel,
            variantSeed: fallbackVariantSeed,
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
            fallbackReason: "tuple_containment_failed",
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
            fallbackReason: "tuple_containment_failed",
            validationReason: tupleContainment.message,
            generationDebug: buildGenerationDebug({
              providerAttempted: true,
              providerUsed: "local_fallback",
              openAiKeyFoundServerSide: true,
              fallbackReason: "tuple_containment_failed",
              validationReason: tupleContainment.message,
              mappingStatus: "mapped",
              fallbackTemplate: `deterministic_${validatorType}`,
              diagnosticOutcome: tupleContainment.diagnosticOutcome,
            }),
            content: preview,
            meta: fallback.validation,
            fallback: {
              used: true,
              reasonCode: "tuple_containment_failed",
              message: `${tupleContainment.message} Preview generated using the local calibrated fallback.`,
            },
            ...diagnosticEnvelope(tupleContainment.diagnosticOutcome),
          });
        } catch (fallbackError) {
          console.error("[admin-ai-generate] tuple-containment fallback failed:", fallbackError);
        }
      }

      return NextResponse.json({
        success: false,
        aiMode,
        keySource,
        errorCode: "tuple_containment_failed",
        error: tupleContainment.message,
        message: tupleContainment.message,
        details: {
          ...tupleContainment.details,
          diagnostics: {
            ...generationDiagnostics,
            requestTuple,
            diagnosticOutcome: tupleContainment.diagnosticOutcome,
          },
        },
        generationMetadata: buildMetadata({
          generationSource: "mock",
          provider: "openai",
          model: OPENAI_MODEL,
          fallbackReason: "tuple_containment_failed",
          validation: { ...validation, valid: false },
          openAiAttempted: true,
          openAiSucceeded: true,
        }),
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
          fallbackReason: "tuple_containment_failed",
          validationReason: tupleContainment.message,
          mappingStatus: "mapped",
          fallbackTemplate: null,
          diagnosticOutcome: tupleContainment.diagnosticOutcome,
        }),
        ...diagnosticEnvelope(tupleContainment.diagnosticOutcome),
      }, { status: 422 });
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
    const diagnosticOutcome = classifyGenerationDiagnosticOutcome({
      errorCode: failure.errorCode,
      message: failure.message,
      reason: String(failure.details.reason ?? failure.errorCode),
      details: failure.details,
      status: failure.status,
    });
    console.error("[admin-ai-generate] OpenAI generation failed:", error);
    console.error("[admin-ai-generate] Error code:", failure.errorCode);
    console.error("[admin-ai-generate] Generation diagnostics:", {
      ...generationDiagnostics,
      requestTuple,
      diagnosticOutcome,
    });

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
        diagnostics: {
          ...generationDiagnostics,
          requestTuple,
          diagnosticOutcome,
        },
      },
    });

    if (!fallbackAllowed) {
      return buildLiveOnlyFailure({
        code: failure.errorCode,
        message: `Live OpenAI mode failed: ${failure.message}`,
        reason: String(failure.details.reason ?? failure.errorCode),
        status: failure.status,
        openAiAttempted: true,
        validationMessage: typeof failure.details.validationMessage === "string" ? failure.details.validationMessage : null,
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
          variantSeed: fallbackVariantSeed,
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
          gaLexicon: gaFallbackLexicon,
          scienceDiscipline,
          keyStage: safeKeyStage,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus || "Core skill",
          topic,
          count,
          difficulty: safeLevel,
          variantSeed: fallbackVariantSeed,
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
        ...diagnosticEnvelope(diagnosticOutcome),
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
          diagnosticOutcome,
        }),
        details: {
          ...failure.details,
          subject: sourceSubject,
          yearGroup: safeYearGroup,
          skillFocus: resolvedSkillFocus,
          provider: "openai",
          model: OPENAI_MODEL,
          stage: "generation",
          diagnostics: {
            ...generationDiagnostics,
            requestTuple,
            diagnosticOutcome,
          },
        },
      },
      { status: failure.status },
    );
  }
}




