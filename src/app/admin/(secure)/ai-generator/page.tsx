"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import {
  evaluateAiGeneratorSaveState,
  findAiGeneratorPreviewMissingFields,
  formatAiGeneratorSaveBlockedMessage,
  formatAiGeneratorValidationSuccessMessage,
} from "@/lib/admin-ai-generator-validation";
import { safeJsonParse } from "@/lib/safe-json";
import {
  EXAM_BOARDS,
  GCSE_EXAM_BOARD_WARNING,
  KEY_STAGES,
  YEAR_GROUPS,
  AGE_GROUPS,
  curriculumPathwayForYearGroup,
  GENERATION_CONTENT_TYPE_BY_SUBJECT,
  isValidCurriculumPath,
  keyStageForYearGroup,
  normalizeSubject as normalizeCurriculumSubject,
  yearGroupsForKeyStage,
  ageGroupForYearGroup,
  shouldApplyExamBoardTag,
  aiGeneratorSubjectsForYearGroup,
  skillsForSubjectAndYear,
  topicSuggestionsForSelection,
  type Subject,
  type YearGroup,
} from "@/lib/curriculum";
import { generationDisplayLabel, type AiGenerationMode } from "@/lib/admin-ai-generation-meta";
import {
  resolveExamBoardRecommendation,
  resolveExamBoardSelection,
  type ExamBoardRecommendation,
} from "@/lib/ai/exam-board-resolver";
import type { VisualAsset } from "@/lib/ai/visual-generation";
import { isKnownDiagnosticOutcome } from "@/lib/ai/generator-tuple-validation";
import { uploadMediaFile } from "@/lib/upload-client";
import { runContentBlackBoxTest } from "@/lib/ai/content-black-box-test";
import {
  adaptLegacyQueryToContract,
  decodeUniversalPrefillContract,
  legacyPrefillFromQueryMap,
  resolveUniversalPrefill,
} from "@/lib/ai-prefill-contract";

type GeneratedPreviewItem = Record<string, unknown> & {
  id?: string;
  status?: "pending" | "approved" | "rejected";
  type?: string;
  prompt?: string;
  answer?: unknown;
  options?: unknown[];
  sentence?: string;
  explanation?: string;
  hint?: string;
};

type GeneratedPreview = {
  title: string;
  subject: Subject;
  keyStage: string;
  yearGroup: string;
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
  qualityScore?: number | null;
  qualityStatus?: "pending_review" | "scored";
  voiceScript: string;
  imagePrompt: string;
  items: GeneratedPreviewItem[];
  visualAssets?: VisualAsset[];
};

type LibraryGapReport = {
  type: string;
  currentCount: number;
  minimumExpectedCount: number;
  missingCount: number;
};

function getAvailableSubjects(yearGroup: string | null | undefined): readonly Subject[] {
  return aiGeneratorSubjectsForYearGroup(yearGroup);
}

function getAvailableSkills(subject: Subject, yearGroup: string | null | undefined): readonly string[] {
  return skillsForSubjectAndYear(subject, yearGroup);
}

function normalizeYearForKeyStage(
  keyStage: (typeof KEY_STAGES)[number],
  yearGroup: string | null | undefined
): YearGroup {
  const options = yearGroupsForKeyStage(keyStage);
  return (yearGroup && options.includes(yearGroup as YearGroup) ? yearGroup : options[0]) as YearGroup;
}

type WeakArea = {
  id: string;
  studentId: string;
  subject: string;
  keyStage: string | null;
  yearGroup: string | null;
  skillFocus: string;
  weaknessType: string;
  accuracy: number;
  currentDifficulty: number;
  status: string;
  student: { id: string; name: string };
};

type ValidationMeta = {
  valid: boolean;
  repaired: boolean;
  aiGenerated?: boolean;
  regeneratedAfterValidation?: boolean;
  fallbackUsed?: boolean;
  yearLevelMatch?: boolean;
  subjectMatch?: boolean;
  skillTopicMatch?: boolean;
  difficultyMatch?: boolean;
  errors: string[];
  fixesApplied: string[];
  removedWords: string[];
  regeneratedCount: number;
  requestedCount: number;
  finalCount: number;
  cached?: boolean;
  validationDiagnostics?: {
    validationStepFailed?: boolean;
    missingFields?: number;
    malformedStructure?: number;
    weakCommandWords?: number;
    answerMismatch?: number;
    difficultyMismatch?: number;
    schemaMismatch?: number;
    contaminationDetected?: boolean;
    contaminationScore?: number;
    contaminationThreshold?: number;
    rejectedKeywords?: string[];
    detectedSubjectDrift?: string[];
    repairedItemsCount?: number;
    rejectedItemsCount?: number;
    rejectionReasons?: string[];
  };
  rawOpenAiResponse?: {
    model?: string;
    finishReason?: string | null;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
    responseBytes?: number;
    contentLength?: number;
    contentPreview?: string;
  };
  subjectContainment?: "passed" | "failed";
  contaminatedItemsRepaired?: number;
  contaminatedItemsRejected?: number;
  scienceDiscipline?: "chemistry" | "physics" | "biology" | null;
  metadataDebug?: {
    requestedMetadata?: Record<string, unknown>;
    generatedMetadata?: Record<string, unknown> | null;
    normalizedMetadata?: Record<string, unknown> | null;
  };
};

type GeneratorFallbackInfo = {
  used: boolean;
  reasonCode: string;
  message: string;
};

type GenerationApiMetadata = {
  generationSource: "openai" | "fallback" | "repair" | "mock";
  provider: "openai" | "local";
  model: string;
  usedFallback: boolean;
  fallbackReason: string | null;
  validationStatus: "passed" | "failed" | "repaired";
  keySource: "database" | "environment" | "none";
  openAiAttempted: boolean;
  openAiSucceeded: boolean;
  aiMode: AiGenerationMode;
};

type GenerationDebug = {
  providerAttempted: boolean;
  providerUsed: "openai" | "local_fallback";
  openAiKeyFoundServerSide: boolean;
  fallbackReason: string | null;
  validationReason: string | null;
  mappingStatus: "mapped" | "unmapped";
  subjectRoute: string;
  fallbackTemplate: string | null;
  generationType: string;
  subject: string;
  yearGroup: string;
  keyStage: string;
  skillFocus: string;
  topic: string;
  activityType: string;
  strand: string | null;
  scienceDiscipline?: "chemistry" | "physics" | "biology" | null;
  subjectContainment?: "passed" | "failed";
  contaminatedItemsRepaired?: number;
  contaminatedItemsRejected?: number;
};

type SpellingPreviewItem = {
  id: string;
  word: string;
  hint: string;
  sentenceContext: string;
  categoryHint: string;
  syllables: string;
  emoji: string;
  yearGroup: string;
  skillFocus: string;
  difficulty: number;
};

type AutomationStatus = {
  title: string;
  lines: string[];
  ok: boolean;
};

type GenerationContext = {
  subject: Subject;
  keyStage: (typeof KEY_STAGES)[number];
  yearGroup: YearGroup;
  studentYearGroup?: YearGroup | null;
  studentKeyStage?: (typeof KEY_STAGES)[number] | null;
  targetLearningYearGroup?: YearGroup | null;
  targetLearningKeyStage?: (typeof KEY_STAGES)[number] | null;
  subjectLevel?: number | null;
  strandLevel?: number | null;
  levelSource?: string;
  adminOverrideReason?: string;
  curriculumPathway: string;
  curriculumFramework?: string;
  countryRegion?: string;
  examBoard?: string;
  examBoardSource?: "auto" | "manual" | "school_default";
  examBoardConfidence?: number;
  examBoardReason?: string;
  englishStrand?: EnglishStrand;
  skillFocus: string;
  ageGroup: (typeof AGE_GROUPS)[number];
  difficulty: number;
  topic: string;
  activityType?: string;
  masteryOutcome?: string;
  aiMode: AiGenerationMode;
  gaScriptPreference?: "orthography_only" | "orthography_with_transliteration";
  targetStudentId: string | null;
  source: "manual" | "weak-area" | "student-profile";
  weakAreaId: string | null;
};

const CUSTOM_TOPIC_VALUE = "__custom_topic__";
type EnglishStrand = "phonics" | "spelling" | "reading" | "grammar" | "punctuation" | "writing" | "vocabulary" | "comprehension";

const ENGLISH_STRAND_OPTIONS: Array<{ value: EnglishStrand; label: string }> = [
  { value: "phonics", label: "Phonics" },
  { value: "spelling", label: "Spelling" },
  { value: "reading", label: "Reading" },
  { value: "comprehension", label: "Comprehension" },
  { value: "grammar", label: "Grammar" },
  { value: "punctuation", label: "Punctuation" },
  { value: "writing", label: "Writing" },
  { value: "vocabulary", label: "Vocabulary" },
];

function normalizeEnglishStrandValue(value: string | null): EnglishStrand | null {
  const cleaned = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "";
  return ENGLISH_STRAND_OPTIONS.some((option) => option.value === cleaned) ? cleaned as EnglishStrand : null;
}

function mapTriggerToGenerationSource(trigger: "manual" | "student-target", signal: string | null): GenerationContext["source"] {
  if (trigger === "manual") return "manual";
  if (signal === "weak-area") return "weak-area";
  return "student-profile";
}

function generationContextSourceLabel(source: GenerationContext["source"]): string {
  if (source === "weak-area") return "AI Intervention Engine";
  if (source === "student-profile") return "Student profile target";
  return "Manual generator";
}

function isEnglishParentSubject(value: Subject): boolean {
  return value === "english-language" || value === "gcse-english" || value === "gcse-english-language";
}

function isGcseEnglishSubject(value: Subject): boolean {
  return value === "gcse-english" || value === "gcse-english-language" || value === "gcse-english-literature";
}

function resolvePathValidationSubject(subject: Subject, strand: EnglishStrand | "" | null | undefined): Subject {
  if (!isEnglishParentSubject(subject) || !strand) return subject;
  if (isGcseEnglishSubject(subject)) {
    return subject === "gcse-english" ? "gcse-english-language" : subject;
  }
  if (strand === "comprehension") return "reading";
  return strand as Subject;
}

function deriveSkillFocusFromEnglishStrand(strand: EnglishStrand | "", yearGroup: string, subject: Subject): string {
  if (!strand) return "";
  const mappedSubject = resolvePathValidationSubject(subject, strand);
  const mappedSkills = getAvailableSkills(mappedSubject, yearGroup);
  if (!mappedSkills.length) return strand;

  const strandKeywords: Record<EnglishStrand, string[]> = {
    phonics: ["phonics", "grapheme", "blending", "segmenting"],
    spelling: ["spelling"],
    reading: ["reading", "comprehension", "inference", "analysis", "retrieval"],
    comprehension: ["comprehension", "retrieval", "inference", "reading"],
    grammar: ["grammar"],
    punctuation: ["punctuation"],
    writing: ["writing", "creative", "transactional", "response", "extended"],
    vocabulary: ["vocabulary"],
  };
  const keywords = strandKeywords[strand];
  const matchedSkill = mappedSkills.find((skill) => {
    const normalized = skill.toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  });
  return matchedSkill ?? mappedSkills[0];
}

function deriveScienceDiscipline(subject: Subject, skillFocus: string): "chemistry" | "physics" | "biology" | null {
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

const GCSE_SUBJECT_GROUPS: Array<{ label: string; subjects: Subject[] }> = [
  {
    label: "Core",
    subjects: ["gcse-english-language", "gcse-english-literature", "gcse-maths", "gcse-science", "gcse-combined-science", "gcse-biology", "gcse-chemistry", "gcse-physics"],
  },
  {
    label: "Languages",
    subjects: ["gcse-french", "gcse-german", "gcse-spanish", "gcse-italian", "gcse-mandarin", "gcse-arabic", "gcse-ga", "gcse-urdu", "gcse-polish", "gcse-latin"],
  },
  {
    label: "Humanities",
    subjects: ["gcse-history", "gcse-geography", "gcse-religious-studies", "gcse-citizenship-studies"],
  },
  {
    label: "Technology and Business",
    subjects: ["gcse-computer-science", "gcse-business-studies", "gcse-economics"],
  },
  {
    label: "Creative and Practical",
    subjects: ["gcse-art-and-design", "gcse-design-and-technology", "gcse-food-preparation-and-nutrition", "gcse-drama", "gcse-music", "gcse-media-studies", "gcse-physical-education"],
  },
  {
    label: "Social Sciences",
    subjects: ["gcse-psychology", "gcse-sociology"],
  },
];

function resolvePreviewItemStatus(item: GeneratedPreviewItem): "pending" | "approved" | "rejected" {
  return item.status === "approved" || item.status === "rejected" || item.status === "pending" ? item.status : "approved";
}

function applyDefaultItemStatuses(items: GeneratedPreviewItem[]): GeneratedPreviewItem[] {
  return items.map((item) => ({
    ...item,
    status: resolvePreviewItemStatus(item),
  }));
}

function previewItemPromptDuplicateKey(item: GeneratedPreviewItem): string {
  return String(item.question ?? item.prompt ?? item.sentence ?? item.targetVocabulary ?? item.word ?? "")
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function previewItemMathsScenarioFamilyKey(item: GeneratedPreviewItem): string {
  const lower = String(item.question ?? item.prompt ?? item.sentence ?? item.targetVocabulary ?? "").toLowerCase();
  if (/\b(pack|packs|packed|packing|package|packages|packaged|packaging)\b/.test(lower) && /\b(box|boxes|bag|bags|container|containers|hold|holds|full)\b/.test(lower)) {
    return "maths_division_packaging";
  }
  if (/\b(students?|teams?|groups?|sports day|without a team)\b/.test(lower) && /\b(divided|divide|left|remainder|each|equal)\b/.test(lower)) {
    return "maths_division_grouping";
  }
  if (/\b(share|shared|sharing|equally|between|among)\b/.test(lower) && /\b(left|remainder|each|groups?)\b/.test(lower)) {
    return "maths_division_sharing";
  }
  if (/\b(rows?|columns?|arrays?)\b/.test(lower) && /\b(each|left|remainder|divide|divided)\b/.test(lower)) {
    return "maths_division_arrays";
  }
  return "";
}

function previewItemDuplicateKeys(item: GeneratedPreviewItem): string[] {
  return [previewItemPromptDuplicateKey(item), previewItemMathsScenarioFamilyKey(item)].filter(Boolean);
}

function formatSubjectLabel(value: string): string {
  if (value === "english-language") return "English";
  const labels: Partial<Record<Subject | "math", string>> = {
    math: "Maths",
    maths: "Maths",
    "times-tables": "Times Tables",
    "gcse-english-language": "GCSE English Language",
    "gcse-english-literature": "GCSE English Literature",
    "gcse-maths": "GCSE Maths",
    "gcse-science": "GCSE Science",
    "gcse-combined-science": "GCSE Combined Science",
    "gcse-biology": "GCSE Biology",
    "gcse-chemistry": "GCSE Chemistry",
    "gcse-physics": "GCSE Physics",
    "gcse-french": "GCSE French",
    "gcse-german": "GCSE German",
    "gcse-spanish": "GCSE Spanish",
    "gcse-italian": "GCSE Italian",
    "gcse-mandarin": "GCSE Mandarin",
    "gcse-arabic": "GCSE Arabic",
    "ga-language": "Ga (Ghana) - Primary",
    "gcse-ga": "GCSE Ga (Ghana)",
    "gcse-urdu": "GCSE Urdu",
    "gcse-polish": "GCSE Polish",
    "gcse-latin": "GCSE Latin",
    "gcse-history": "GCSE History",
    "gcse-geography": "GCSE Geography",
    "gcse-religious-studies": "GCSE Religious Studies",
    "gcse-citizenship-studies": "GCSE Citizenship Studies",
    "gcse-computer-science": "GCSE Computer Science",
    "gcse-business-studies": "GCSE Business Studies",
    "gcse-economics": "GCSE Economics",
    "gcse-art-and-design": "GCSE Art and Design",
    "gcse-design-and-technology": "GCSE Design and Technology",
    "gcse-food-preparation-and-nutrition": "GCSE Food Preparation and Nutrition",
    "gcse-drama": "GCSE Drama",
    "gcse-music": "GCSE Music",
    "gcse-media-studies": "GCSE Media Studies",
    "gcse-physical-education": "GCSE Physical Education",
    "gcse-psychology": "GCSE Psychology",
    "gcse-sociology": "GCSE Sociology",
    "english-language": "English Language",
    "english-literature": "English Literature",
  };
  const maybe = labels[value as Subject | "math"];
  if (maybe) return maybe;
  return value
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function subjectFamily(value: string): "maths" | "science" | "english" | "other" {
  const canonical = normalizeCurriculumSubject(value);
  if (canonical === "science" || canonical === "gcse-science") return "science";
  if (canonical === "maths" || canonical === "times-tables" || canonical === "gcse-maths" || canonical === "11-plus-practice" || canonical === "sats-practice") return "maths";
  if (
    canonical === "english-language"
    || canonical === "english-literature"
    || canonical === "gcse-english"
    || canonical === "reading"
    || canonical === "writing"
    || canonical === "grammar"
    || canonical === "punctuation"
    || canonical === "spelling"
    || canonical === "phonics"
    || canonical === "vocabulary"
  ) {
    return "english";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes("science")) return "science";
  if (normalized.includes("math")) return "maths";
  if (
    normalized.includes("english")
    || normalized.includes("reading")
    || normalized.includes("writing")
    || normalized.includes("grammar")
    || normalized.includes("punctuation")
    || normalized.includes("spelling")
    || normalized.includes("phonics")
    || normalized.includes("literature")
    || normalized.includes("vocabulary")
  ) {
    return "english";
  }
  return "other";
}

function formatFriendlyTopic(value: string): string {
  const normalized = value.replace(/_/g, " ").replace(/-/g, " ").trim();
  if (!normalized) return "Targeted intervention";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toTitleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timedOut ? `request_timeout_${timeoutMs}` : "request_aborted");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const AI_REQUEST_TIMEOUT_MS = 180000;
const DEFAULT_AI_MODE: AiGenerationMode = "live_openai_only";
const DEFAULT_GA_SCRIPT_PREFERENCE: "orthography_only" | "orthography_with_transliteration" = "orthography_with_transliteration";
const AI_MODE_OPTIONS: Array<{ value: AiGenerationMode; label: string; helper: string }> = [
  {
    value: "live_openai_only",
    label: "Live OpenAI only",
    helper: "OpenAI must succeed. Fallback content will not be shown.",
  },
  {
    value: "openai_with_fallback",
    label: "OpenAI with fallback",
    helper: "If OpenAI fails, fallback content may be shown and clearly labelled.",
  },
  {
    value: "fallback_only",
    label: "Fallback only / testing",
    helper: "Uses local fallback content for testing. It will be labelled as fallback.",
  },
];

let inFlightAdminRefresh: Promise<boolean> | null = null;

async function refreshAdminSession(timeoutMs: number): Promise<boolean> {
  if (!inFlightAdminRefresh) {
    inFlightAdminRefresh = (async () => {
      const refreshResponse = await fetchWithTimeout(
        "/api/auth/refresh",
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        },
        timeoutMs,
      );
      return refreshResponse.ok;
    })().finally(() => {
      inFlightAdminRefresh = null;
    });
  }
  return inFlightAdminRefresh;
}

async function fetchWithAdminSessionRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 25000,
): Promise<Response> {
  const firstResponse = await fetchWithTimeout(
    input,
    {
      ...init,
      credentials: "include",
      cache: "no-store",
    },
    timeoutMs,
  );

  if (firstResponse.status !== 401) return firstResponse;

  const refreshed = await refreshAdminSession(Math.min(timeoutMs, 30000));

  if (!refreshed) return firstResponse;

  return fetchWithTimeout(
    input,
    {
      ...init,
      credentials: "include",
      cache: "no-store",
    },
    timeoutMs,
  );
}

type SafeApiResponse<T = Record<string, unknown>> = {
  ok: boolean;
  payload: T | null;
  message: string | null;
  diagnostics: {
    status: number;
    contentType: string;
    parseStage: "json" | "text-json" | "invalid-content-type" | "invalid-shape" | "empty";
    rawResponse: string;
  };
};

async function parseApiResponse<T = Record<string, unknown>>(response: Response): Promise<SafeApiResponse<T>> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      ok: false,
      payload: null,
      message: "The server returned an empty response.",
      diagnostics: { status: response.status, contentType, parseStage: "empty", rawResponse: text },
    };
  }

  if (contentType.includes("application/json")) {
    const parsed = safeJsonParse<T>(trimmed);
    if (parsed.success) {
      return {
        ok: true,
        payload: parsed.data,
        message: null,
        diagnostics: { status: response.status, contentType, parseStage: "json", rawResponse: text },
      };
    }
    return {
      ok: false,
      payload: null,
      message: "Generation failed due to malformed AI output.",
      diagnostics: { status: response.status, contentType, parseStage: "invalid-shape", rawResponse: text },
    };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = safeJsonParse<T>(trimmed);
    if (parsed.success) {
      return {
        ok: true,
        payload: parsed.data,
        message: null,
        diagnostics: { status: response.status, contentType, parseStage: "text-json", rawResponse: text },
      };
    }
  }

  return {
    ok: false,
    payload: null,
    message: trimmed.toLowerCase().includes("<!doctype") || trimmed.toLowerCase().includes("<html")
      ? `The server returned HTML instead of JSON (status ${response.status}). Check admin session/auth or server errors.`
      : `The server returned a non-JSON response (status ${response.status}).`,
    diagnostics: { status: response.status, contentType, parseStage: "invalid-content-type", rawResponse: text },
  };
}

function formatGeneratorFailureMessage(payload: {
  errorCode?: unknown;
  message?: unknown;
  error?: unknown;
  details?: unknown;
}) {
  const errorCode = typeof payload.errorCode === "string" ? payload.errorCode : "generation_error";
  const details = payload.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : {};
  const rawMessage = typeof payload.message === "string"
    ? payload.message
    : typeof payload.error === "string"
      ? payload.error
      : "AI generation failed. Please try again.";

  if (rawMessage.toLowerCase().includes("live openai mode")) {
    return rawMessage;
  }
  if (details.reason === "invalid_openai_key") {
    return "AI generation failed because the configured OpenAI API key was rejected.";
  }
  if (errorCode === "missing_openai_key") {
    return "AI generation failed because the OpenAI API key is missing.";
  }
  if (errorCode === "invalid_generated_content") {
    return rawMessage || "AI returned content in an invalid format. Please try again.";
  }
  if (errorCode === "model_error") {
    return rawMessage || "AI generation failed because the external AI service rejected the request.";
  }
  return rawMessage;
}

function normalizeDiagnosticOutcome(value: unknown): string | undefined {
  return isKnownDiagnosticOutcome(value) ? value : undefined;
}

function recommendItemCount(input: {
  yearGroup: string;
  keyStage: string;
  difficulty: number;
  subject: Subject;
}): number {
  const yearGroup = String(input.yearGroup ?? "");
  const isGcse = yearGroup === "Year 10" || yearGroup === "Year 11" || input.keyStage === "KS4";
  if (isGcse) {
    return input.difficulty >= 4 ? 5 : 6;
  }
  if (input.keyStage === "KS1") return 4;
  if (input.keyStage === "KS2") return 5;
  if (input.keyStage === "KS3") return 6;
  if (input.subject === "science" || input.subject === "gcse-science" || input.subject === "gcse-combined-science") {
    return 6;
  }
  return 5;
}

export default function AiGeneratorPage() {
  const searchParams = useSearchParams();
  const serializedPrefillContract = searchParams.get("prefillContract");
  const prefillSubject = searchParams.get("subject");
  const prefillSkill = searchParams.get("skill");
  const prefillWords = searchParams.get("words");
  const legacyPrefill = legacyPrefillFromQueryMap({
    studentId: searchParams.get("studentId"),
    subject: prefillSubject,
    skill: prefillSkill,
    englishStrand: searchParams.get("englishStrand"),
    strand: searchParams.get("strand"),
    topic: searchParams.get("topic"),
    activityType: searchParams.get("activityType"),
    masteryOutcome: searchParams.get("masteryOutcome"),
    source: searchParams.get("source"),
    weakAreaId: searchParams.get("weakAreaId"),
    yearGroup: searchParams.get("yearGroup"),
    keyStage: searchParams.get("keyStage"),
    studentYearGroup: searchParams.get("studentYearGroup"),
    studentKeyStage: searchParams.get("studentKeyStage"),
    targetLearningYearGroup: searchParams.get("targetLearningYearGroup"),
    targetLearningKeyStage: searchParams.get("targetLearningKeyStage"),
    subjectLevel: searchParams.get("subjectLevel"),
    strandLevel: searchParams.get("strandLevel"),
    levelSource: searchParams.get("levelSource"),
    adminOverrideReason: searchParams.get("adminOverrideReason"),
    difficulty: searchParams.get("difficulty"),
    itemCount: searchParams.get("itemCount"),
  });
  const decodedPrefillContract = decodeUniversalPrefillContract(serializedPrefillContract);
  const effectiveIncomingPrefillContract = decodedPrefillContract ?? adaptLegacyQueryToContract(legacyPrefill);
  const prefillResolution = resolveUniversalPrefill({
    contract: effectiveIncomingPrefillContract,
    legacy: legacyPrefill,
    availableSubjectsForYear: getAvailableSubjects,
    normalizeSubject: normalizeCurriculumSubject,
    isEnglishParentSubject,
    normalizeEnglishStrand: (value) => normalizeEnglishStrandValue(value),
    deriveSkillFromEnglishStrand: (strand, year, subject) => deriveSkillFocusFromEnglishStrand(strand as EnglishStrand | "", year, subject),
    availableSkillsForSubjectAndYear: getAvailableSkills,
  });
  const resolvedPrefill = prefillResolution.values;
  const prefillSource = mapTriggerToGenerationSource(resolvedPrefill.trigger, resolvedPrefill.signal);
  const prefillBlockingWarnings = prefillResolution.blockingWarnings;
  const prefillAssumptions = prefillResolution.assumptions;
  const prefillFieldSources = prefillResolution.fieldSources;
  const hasTargetPrefill = resolvedPrefill.trigger === "student-target";
  const launchedFromStudentTarget = hasTargetPrefill && Boolean(resolvedPrefill.studentYearGroup);

  // Initialize with sensible defaults; validate against curriculum
  const initialYearGroup: YearGroup = resolvedPrefill.yearGroup && YEAR_GROUPS.includes(resolvedPrefill.yearGroup as YearGroup)
    ? (resolvedPrefill.yearGroup as YearGroup)
    : "Year 1";
  const normalizedPrefillKeyStage = resolvedPrefill.keyStage && KEY_STAGES.includes(resolvedPrefill.keyStage as (typeof KEY_STAGES)[number])
    ? (resolvedPrefill.keyStage as (typeof KEY_STAGES)[number])
    : null;
  const prefillKeyStageMatchesYear = Boolean(
    normalizedPrefillKeyStage && yearGroupsForKeyStage(normalizedPrefillKeyStage).includes(initialYearGroup)
  );
  const initialAgeGroup = ageGroupForYearGroup(initialYearGroup);

  const [yearGroup, setYearGroup] = useState<string>(initialYearGroup);
  const [levelSource, setLevelSource] = useState(resolvedPrefill.levelSource || (hasTargetPrefill ? "fallback" : "manual"));
  const [adminOverrideReason, setAdminOverrideReason] = useState(resolvedPrefill.adminOverrideReason || "");
  const [examBoard, setExamBoard] = useState(resolvedPrefill.examBoard || "");
  const [autoSelectExamBoard, setAutoSelectExamBoard] = useState(true);
  const [countryRegion, setCountryRegion] = useState(resolvedPrefill.countryRegion || "UK");
  const [curriculumFramework, setCurriculumFramework] = useState(resolvedPrefill.curriculumFramework || "National Curriculum England");
  const [allowManualExamBoardOverride, setAllowManualExamBoardOverride] = useState(true);
  const [schoolPreferredGcseBoard, setSchoolPreferredGcseBoard] = useState(resolvedPrefill.schoolPreferredGcseBoard || "");
  const [visualGenerationEnabled, setVisualGenerationEnabled] = useState(resolvedPrefill.visualGenerationEnabled);
  const [visualGenerationMode, setVisualGenerationMode] = useState<"none" | "planned_only" | "generate_now">(resolvedPrefill.visualGenerationMode);
  const [maxVisualsPerLesson, setMaxVisualsPerLesson] = useState(resolvedPrefill.maxVisualsPerLesson);
  const [visualAllowedSubjects, setVisualAllowedSubjects] = useState<string[]>(resolvedPrefill.visualAllowedSubjects);
  const [requireVisualApproval, setRequireVisualApproval] = useState(resolvedPrefill.requireVisualApproval);
  const [ageGroup, setAgeGroup] = useState(initialAgeGroup);
  const availableSubjects = getAvailableSubjects(yearGroup);
  const normalizedPrefillSubject = resolvedPrefill.subject ?? normalizeCurriculumSubject(prefillSubject);
  const shouldAllowEnglishParentPrefill = Boolean(
    normalizedPrefillSubject
    && isEnglishParentSubject(normalizedPrefillSubject)
    && resolvedPrefill.englishStrand
  );
  const [subject, setSubject] = useState<Subject>(
    normalizedPrefillSubject && ((availableSubjects as string[]).includes(normalizedPrefillSubject) || shouldAllowEnglishParentPrefill)
      ? normalizedPrefillSubject
      : availableSubjects[0]
  );
  const initialKeyStage: (typeof KEY_STAGES)[number] = prefillKeyStageMatchesYear && normalizedPrefillKeyStage
    ? normalizedPrefillKeyStage
    : keyStageForYearGroup(yearGroup);
  const [keyStage, setKeyStage] = useState<(typeof KEY_STAGES)[number]>(initialKeyStage);
  const requiresEnglishStrand = isEnglishParentSubject(subject);
  const initialEnglishStrand = requiresEnglishStrand && resolvedPrefill.englishStrand
    ? (normalizeEnglishStrandValue(resolvedPrefill.englishStrand) ?? "reading")
    : requiresEnglishStrand
      ? "reading"
      : "";
  const [englishStrand, setEnglishStrand] = useState<EnglishStrand | "">(
    initialEnglishStrand
  );
  const skillSubject = resolvePathValidationSubject(subject, requiresEnglishStrand ? englishStrand : null);
  const availableSkills = getAvailableSkills(skillSubject, yearGroup);
  const prefillSkillMatched = Boolean(resolvedPrefill.skillFocus && availableSkills.includes(resolvedPrefill.skillFocus));
  const strandSkillFocus = requiresEnglishStrand ? deriveSkillFocusFromEnglishStrand(initialEnglishStrand, yearGroup, subject) : "";
  const initialSkillFocus = prefillSkillMatched && resolvedPrefill.skillFocus ? resolvedPrefill.skillFocus : (strandSkillFocus || availableSkills[0] || "");
  const missingEnglishStrandSkill = Boolean(requiresEnglishStrand && initialEnglishStrand && !initialSkillFocus);
  const [skillFocus, setSkillFocus] = useState(initialSkillFocus);
  const [difficulty, setDifficulty] = useState(resolvedPrefill.difficulty || (prefillWords ? 1 : 2));
  const [aiMode, setAiMode] = useState<AiGenerationMode>(resolvedPrefill.aiMode || DEFAULT_AI_MODE);
  const [gaScriptPreference, setGaScriptPreference] = useState<"orthography_only" | "orthography_with_transliteration">(DEFAULT_GA_SCRIPT_PREFERENCE);
  const [items, setItems] = useState(resolvedPrefill.itemCount ?? 5);
  const [autoItemsEnabled, setAutoItemsEnabled] = useState(resolvedPrefill.itemCount === null);
  const initialCustomTopic = resolvedPrefill.topic?.trim() || (prefillWords ? `Focus practice on: ${prefillWords}` : "");
  const [topicChoice, setTopicChoice] = useState<string>(initialCustomTopic ? CUSTOM_TOPIC_VALUE : "");
  const [customTopic, setCustomTopic] = useState(initialCustomTopic);
  const [activityType, setActivityType] = useState(resolvedPrefill.activityType ?? "");
  const [masteryOutcome, setMasteryOutcome] = useState(resolvedPrefill.masteryOutcome ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [generationMeta, setGenerationMeta] = useState<{
    model?: string;
    prompt?: string;
    estimatedCostPence?: number;
    estimatedTokens?: number;
    validation?: ValidationMeta;
    fallback?: GeneratorFallbackInfo;
    providerUsed?: "openai" | "local_fallback";
    fallbackReason?: string | null;
    validationReason?: string | null;
    generationMetadata?: GenerationApiMetadata;
    debug?: GenerationDebug;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [automationDebugPayload, setAutomationDebugPayload] = useState<string | null>(null);
  const [automationLoading, setAutomationLoading] = useState<"autofill" | "weaknesses" | "library-gaps" | null>(null);
  const [automationDurationMs, setAutomationDurationMs] = useState<number | null>(null);
  const [automationRetryMode, setAutomationRetryMode] = useState<"autofill" | "weaknesses" | "library-gaps" | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(
    prefillBlockingWarnings.length
      ? `Student target requires review before generation: ${prefillBlockingWarnings.join(" ")}`
      : hasTargetPrefill
      ? missingEnglishStrandSkill
        ? "Some fields were auto-filled from the student target, but no matching English strand skill exists for this year group. Please review before generating."
        : "Some fields were auto-filled from the student target. Please review before generating."
      : prefillWords
        ? "Follow-up practice prefilled from assignment weak areas."
        : null
  );
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [weakAreaKeyStageFilter, setWeakAreaKeyStageFilter] = useState("");
  const [weakAreaYearGroupFilter, setWeakAreaYearGroupFilter] = useState("");
  const [weakAreaSubjectFilter, setWeakAreaSubjectFilter] = useState<"manual" | "all">("manual");
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [assetUploadBusy, setAssetUploadBusy] = useState<"image" | "audio" | null>(null);
  const [visualAssetActionId, setVisualAssetActionId] = useState<string | null>(null);
  const [visualBatchBusy, setVisualBatchBusy] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState<string | null>(resolvedPrefill.studentId?.trim() || null);
  const [generationPhase, setGenerationPhase] = useState<"idle" | "generating" | "repairing-response" | "validating-content" | "retrying-parse">("idle");
  const [generationDiagnostics, setGenerationDiagnostics] = useState<{
    rawResponse: string;
    parseStage: string;
    statusCode: number;
    contentType: string;
    reason?: string;
    model?: string;
    provider?: string;
    requestTuple?: {
      yearGroup?: string;
      keyStage?: string;
      subject?: string;
      strand?: string | null;
      skillFocus?: string;
      difficulty?: number;
      itemCount?: number;
    };
  } | null>(null);
  const [generationHeartbeat, setGenerationHeartbeat] = useState<string | null>(null);
  const generateRequestIdRef = useRef(0);
  const regenerateRequestIdRef = useRef(0);
  const heartbeatTimerRef = useRef<number | null>(null);
  const weakAreaActionsRef = useRef<HTMLDivElement | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const [previewContext, setPreviewContext] = useState<GenerationContext | null>(null);
  const [loadedWeakAreaId, setLoadedWeakAreaId] = useState<string | null>(resolvedPrefill.weakAreaId?.trim() || null);
  const [weakAreaFormSynced, setWeakAreaFormSynced] = useState(false);

  const topicSuggestions = useMemo(() => topicSuggestionsForSelection({
    yearGroup,
    subject,
    skillFocus,
  }), [yearGroup, subject, skillFocus]);
  const recommendedItemCount = useMemo(() => recommendItemCount({
    yearGroup,
    keyStage,
    difficulty,
    subject,
  }), [yearGroup, keyStage, difficulty, subject]);
  const effectiveItemCount = autoItemsEnabled ? recommendedItemCount : items;
  const effectiveTopicChoice = topicChoice === CUSTOM_TOPIC_VALUE
    ? CUSTOM_TOPIC_VALUE
    : topicSuggestions.includes(topicChoice)
      ? topicChoice
      : topicSuggestions[0] ?? "";
  const selectedTopicTheme = (effectiveTopicChoice === CUSTOM_TOPIC_VALUE ? customTopic : effectiveTopicChoice).trim();
  const curriculumPathway = curriculumPathwayForYearGroup(yearGroup);
  const shouldTagExamBoard = shouldApplyExamBoardTag({
    yearGroup,
    keyStage,
    curriculumPathway,
    subject,
  });
  const examBoardRecommendation: ExamBoardRecommendation = useMemo(() => resolveExamBoardRecommendation({
    subject,
    yearGroup,
    keyStage,
    skillFocus,
    countryRegion,
    curriculumFramework,
    schoolDefaults: {
      preferredGcseBoardsBySubject: schoolPreferredGcseBoard ? { [subject]: schoolPreferredGcseBoard } : undefined,
      autoSelectEnabled: autoSelectExamBoard,
      manualOverrideAllowed: allowManualExamBoardOverride,
      defaultCountryRegion: countryRegion,
      defaultCurriculumFramework: curriculumFramework,
    },
  }), [
    subject,
    yearGroup,
    keyStage,
    skillFocus,
    countryRegion,
    curriculumFramework,
    schoolPreferredGcseBoard,
    autoSelectExamBoard,
    allowManualExamBoardOverride,
  ]);
  const resolvedExamBoardSelection = useMemo(() => resolveExamBoardSelection({
    manualExamBoard: examBoard,
    recommendation: examBoardRecommendation,
    manualOverrideAllowed: allowManualExamBoardOverride,
  }), [examBoard, examBoardRecommendation, allowManualExamBoardOverride]);
  const effectiveExamBoardForRequest = shouldTagExamBoard
    ? (autoSelectExamBoard ? (resolvedExamBoardSelection.examBoard ?? examBoard) : examBoard)
    : "";

  const canGenerate = Boolean(
    subject
    && keyStage
    && yearGroup
    && skillFocus.trim()
    && selectedTopicTheme
    && (!requiresEnglishStrand || Boolean(englishStrand))
    && (!shouldTagExamBoard || Boolean(effectiveExamBoardForRequest))
    && prefillBlockingWarnings.length === 0
  );

  const automationDurationLabel = automationDurationMs === null
    ? null
    : `${(automationDurationMs / 1000).toFixed(1)}s`;

  const previewTitle = preview?.topic?.trim() || selectedTopicTheme;

  const phonicsMismatchDetected = (generationMeta?.validation?.errors ?? []).some((value) =>
    value.includes("phonics_stage")
  );

  const generatedItemsList = (preview?.items ?? []) as GeneratedPreviewItem[];
  const hasPreviewUnavailable = generatedItemsList.some((item) => String(item.prompt ?? "").includes("preview unavailable"));
  const saveState = evaluateAiGeneratorSaveState({
    itemCount: generatedItemsList.length,
    hasPreviewUnavailable,
    safetyStatus: preview?.safetyStatus,
    apiValid: generationMeta?.validation?.valid,
  });
  const approvedCount = generatedItemsList.filter((item) => item.status === "approved").length;
  const effectiveGenerationContext = previewContext ?? {
    subject,
    keyStage,
    yearGroup: yearGroup as YearGroup,
    studentYearGroup: resolvedPrefill.studentYearGroup,
    studentKeyStage: resolvedPrefill.studentKeyStage,
    targetLearningYearGroup: yearGroup as YearGroup,
    targetLearningKeyStage: keyStage,
    subjectLevel: resolvedPrefill.subjectLevel,
    strandLevel: resolvedPrefill.strandLevel,
    levelSource,
    adminOverrideReason,
    curriculumPathway,
    curriculumFramework,
    countryRegion,
    examBoard: shouldTagExamBoard ? effectiveExamBoardForRequest || undefined : undefined,
    examBoardSource: resolvedExamBoardSelection.examBoardSource,
    examBoardConfidence: resolvedExamBoardSelection.examBoardConfidence,
    examBoardReason: resolvedExamBoardSelection.examBoardReason,
    englishStrand: englishStrand || undefined,
    skillFocus,
    ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
    difficulty,
    topic: selectedTopicTheme,
    activityType,
    masteryOutcome,
    aiMode,
    gaScriptPreference,
    targetStudentId,
    source: prefillSource,
    weakAreaId: loadedWeakAreaId,
  };
  const blackBoxDifficultyWarnings = (() => {
    if (!generatedItemsList.length) return [];
    const result = runContentBlackBoxTest({
      subject: effectiveGenerationContext.subject,
      strand: effectiveGenerationContext.englishStrand ?? null,
      keyStage: effectiveGenerationContext.keyStage,
      yearGroup: effectiveGenerationContext.yearGroup,
      level: effectiveGenerationContext.difficulty,
      difficulty: effectiveGenerationContext.difficulty,
      topic: effectiveGenerationContext.topic,
      skillFocus: effectiveGenerationContext.skillFocus,
      items: generatedItemsList,
    });
    return result.itemResults
      .filter((item) => item.declaredLevel - item.estimatedLevel >= 2)
      .map((item) => ({
        index: item.index,
        declaredLevel: item.declaredLevel,
        estimatedLevel: item.estimatedLevel,
      }));
  })();
  const previewMissingFields = findAiGeneratorPreviewMissingFields(preview, effectiveGenerationContext.subject);
  const saveBlocked = saveState.blocked || previewMissingFields.length > 0;
  const saveBlockMessage = formatAiGeneratorSaveBlockedMessage({
    reason: previewMissingFields.length ? "preview-invalid" : saveState.reason,
    missingFields: previewMissingFields,
  });
  const selectedGenerationTypeForContext = GENERATION_CONTENT_TYPE_BY_SUBJECT[effectiveGenerationContext.subject];

  const weakAreasWithMatch = weakAreas.map((area) => {
    const areaDerivedKeyStage = area.keyStage ?? keyStageForYearGroup(area.yearGroup ?? "Year 1");
    const subjectMatches = subjectFamily(area.subject) === subjectFamily(subject);
    const keyStageMatches = areaDerivedKeyStage === keyStage;
    const yearGroupMatches = area.yearGroup ? area.yearGroup === yearGroup : true;
    return {
      area,
      subjectMatches,
      contextMatches: subjectMatches && keyStageMatches && yearGroupMatches,
    };
  });
  const visibleWeakAreas = weakAreaSubjectFilter === "all"
    ? weakAreasWithMatch
    : weakAreasWithMatch.filter((entry) => entry.contextMatches);
  const hiddenWeakAreaCount = Math.max(weakAreas.length - visibleWeakAreas.length, 0);
  const launchedWithStudentInterventionContext = Boolean(
    hasTargetPrefill
    || prefillSource === "weak-area"
    || resolvedPrefill.studentId?.trim()
    || resolvedPrefill.weakAreaId?.trim()
  );
  const isStudentInterventionMode = Boolean(targetStudentId || loadedWeakAreaId || launchedWithStudentInterventionContext);
  const showDeveloperDetails = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";
  const previewBadge = generationMeta?.validation?.repaired
      ? { label: "Auto-Repaired", className: "bg-amber-500/15 text-amber-200" }
      : { label: "Valid", className: "bg-emerald-500/15 text-emerald-200" };
  const generationSourceLabel = generationDisplayLabel(generationMeta?.generationMetadata);
  const aiModeHelperText = AI_MODE_OPTIONS.find((option) => option.value === aiMode)?.helper ?? AI_MODE_OPTIONS[0].helper;
  const isGaSubject = subject === "ga-language" || subject === "gcse-ga";
  const providerStatusBadge = generationMeta?.generationMetadata
    ? generationMeta.generationMetadata.openAiSucceeded
      ? { label: "Provider: OpenAI healthy", className: "bg-emerald-500/15 text-emerald-200" }
      : generationMeta.generationMetadata.openAiAttempted
        ? { label: "Provider: OpenAI failed", className: "bg-rose-500/15 text-rose-200" }
        : { label: "Provider: local fallback", className: "bg-amber-500/15 text-amber-200" }
    : null;

  const clearWeakAreaLink = () => {
    setLoadedWeakAreaId(null);
    setWeakAreaFormSynced(false);
  };

  const scrollToWeakAreaActions = () => {
    window.setTimeout(() => {
      weakAreaActionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      weakAreaActionsRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const scrollToPreviewPanel = () => {
    window.setTimeout(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  function reviewDetectedWeakAreas() {
    if (!weakAreas.length) {
      setAutomationMessage("Run Detect Weak Areas first.");
      return;
    }
    if (weakAreaSubjectFilter !== "all" && hiddenWeakAreaCount > 0) {
      setWeakAreaSubjectFilter("all");
      setAutomationMessage("Showing all detected weak areas. Choose Generate Weak-Area Support on a detected weak-area card.");
    } else {
      setAutomationMessage("Choose Generate Weak-Area Support on a detected weak-area card.");
    }
    scrollToWeakAreaActions();
  }

  const clearGenerationHeartbeatTimer = () => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const stopGenerationHeartbeat = (resetLabel = true) => {
    clearGenerationHeartbeatTimer();
    if (resetLabel) {
      setGenerationHeartbeat(null);
    }
  };

  const startGenerationHeartbeat = (label = "Generating content") => {
    stopGenerationHeartbeat();
    let elapsedSeconds = 0;
    setGenerationHeartbeat(`${label}...`);
    heartbeatTimerRef.current = window.setInterval(() => {
      elapsedSeconds += 3;
      setGenerationHeartbeat(`${label}... ${elapsedSeconds}s elapsed`);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      clearGenerationHeartbeatTimer();
    };
  }, []);

  const effectiveVisualAllowedSubjects = useMemo(() => {
    const allowedSubjectsForYear = getAvailableSubjects(yearGroup);
    const filtered = visualAllowedSubjects.filter((entry) => allowedSubjectsForYear.includes(entry as Subject));
    if (!subject) return filtered;
    return Array.from(new Set([...filtered, subject]));
  }, [yearGroup, subject, visualAllowedSubjects]);

  const prefillContractContext = {
    trigger: resolvedPrefill.trigger,
    studentId: targetStudentId,
    weakAreaId: loadedWeakAreaId,
    assumptions: prefillAssumptions,
    blockingWarnings: prefillBlockingWarnings,
    fieldSources: prefillFieldSources,
    resolvedValues: {
      yearGroup,
      keyStage,
      studentYearGroup: resolvedPrefill.studentYearGroup,
      studentKeyStage: resolvedPrefill.studentKeyStage,
      targetLearningYearGroup: yearGroup,
      targetLearningKeyStage: keyStage,
      subjectLevel: resolvedPrefill.subjectLevel,
      strandLevel: resolvedPrefill.strandLevel,
      levelSource,
      adminOverrideReason,
      ageGroup,
      subject,
      englishStrand: englishStrand || null,
      skillFocus,
      topic: selectedTopicTheme,
      activityType,
      masteryOutcome,
      curriculumPathway,
      countryRegion,
      curriculumFramework,
      examBoard: effectiveExamBoardForRequest || null,
      examBoardSource: resolvedExamBoardSelection.examBoardSource,
      difficulty,
      itemCount: effectiveItemCount,
      aiMode,
      gaScriptPreference,
      visualSettings: {
        enabled: visualGenerationEnabled,
        mode: visualGenerationMode,
        maxPerLesson: maxVisualsPerLesson,
        allowedSubjects: effectiveVisualAllowedSubjects,
        requireApproval: requireVisualApproval,
      },
    },
  };

  function formatRepairMessage(error: string) {
    const [type, word] = error.split(":");
    if (type === "duplicate") return `Removed duplicate: ${word}`;
    if (type === "invalid_silent_e") return `Removed invalid word: ${word}`;
    if (type.startsWith("phonics_stage")) return `Removed out-of-stage phonics word: ${word}`;
    if (type === "incomplete") return `Removed incomplete item: ${word}`;
    return error;
  }

  async function generatePreview(retryCount = 0, contextOverride?: GenerationContext) {
    if (loading && retryCount === 0) return;
    const requestId = ++generateRequestIdRef.current;
    const context: GenerationContext = contextOverride ?? {
      subject,
      keyStage,
      yearGroup: yearGroup as YearGroup,
      curriculumPathway,
      curriculumFramework,
      countryRegion,
      examBoard: shouldTagExamBoard ? effectiveExamBoardForRequest || undefined : undefined,
      examBoardSource: resolvedExamBoardSelection.examBoardSource,
      examBoardConfidence: resolvedExamBoardSelection.examBoardConfidence,
      examBoardReason: resolvedExamBoardSelection.examBoardReason,
      englishStrand: englishStrand || undefined,
      skillFocus,
      ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
      difficulty,
      topic: selectedTopicTheme,
      activityType,
      masteryOutcome,
      aiMode,
      gaScriptPreference,
      targetStudentId,
      source: prefillSource,
      weakAreaId: loadedWeakAreaId,
    };

    if (!context.subject || !context.keyStage || !context.yearGroup || !context.skillFocus.trim()) {
      setError("Subject, key stage, year group and skill focus are required.");
      return;
    }
    if (!context.topic) {
      setError("Topic/theme is required before generating content.");
      return;
    }
    if (isEnglishParentSubject(context.subject) && !context.englishStrand) {
      setError("Please choose an English strand before generating content.");
      return;
    }
    const mappedPathSubject = resolvePathValidationSubject(context.subject, context.englishStrand ?? null);
    const pathValidation = isValidCurriculumPath({
      yearGroup: context.yearGroup,
      subject: mappedPathSubject,
      skillFocus: context.skillFocus,
      topic: context.topic,
    });
    if (!pathValidation.ok) {
      setError(pathValidation.reason);
      return;
    }
    if (effectiveItemCount < 1 || effectiveItemCount > 10) {
      setError("Number of preview items must be between 1 and 10.");
      return;
    }
    const maxDifficulty = 5;
    if (difficulty < 1 || difficulty > maxDifficulty) {
      setError(`Difficulty must be between 1 and ${maxDifficulty}.`);
      return;
    }
    setLoading(true);
    setGenerationPhase("generating");
    setError(null);
    setMessage(null);
    setSavedContentId(null);
    setPreview(null);
    setGenerationMeta(null);
    setPreviewContext(null);
    setGenerationDiagnostics(null);
    startGenerationHeartbeat(retryCount > 0 ? "Retrying AI generation" : "Generating content");
    try {
      console.info("[admin-ai-generator] preview request", {
        subject: context.subject,
        scienceDiscipline: deriveScienceDiscipline(context.subject, context.skillFocus),
        keyStage: context.keyStage,
        yearGroup: context.yearGroup,
        skillFocus: context.skillFocus,
        topic: context.topic,
        generationType: GENERATION_CONTENT_TYPE_BY_SUBJECT[context.subject],
        difficulty: context.difficulty,
        numberOfItems: effectiveItemCount,
      });
      const response = await fetchWithAdminSessionRetry("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: context.subject,
          subjectArea: GENERATION_CONTENT_TYPE_BY_SUBJECT[context.subject] === "science" ? "science" : "general",
          scienceDiscipline: deriveScienceDiscipline(context.subject, context.skillFocus),
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          studentYearGroup: context.studentYearGroup,
          studentKeyStage: context.studentKeyStage,
          targetLearningYearGroup: context.targetLearningYearGroup ?? context.yearGroup,
          targetLearningKeyStage: context.targetLearningKeyStage ?? context.keyStage,
          subjectLevel: context.subjectLevel,
          strandLevel: context.strandLevel,
          levelSource: context.levelSource,
          adminOverrideReason: context.adminOverrideReason,
          curriculumPathway: context.curriculumPathway,
          curriculumFramework: context.curriculumFramework,
          countryRegion: context.countryRegion,
          examBoard: context.examBoard,
          examBoardSource: context.examBoardSource,
          examBoardConfidence: context.examBoardConfidence,
          examBoardReason: context.examBoardReason,
          autoSelectExamBoard,
          manualExamBoardOverrideAllowed: allowManualExamBoardOverride,
          schoolExamBoardSettings: {
            preferredGcseBoardsBySubject: schoolPreferredGcseBoard ? { [context.subject]: schoolPreferredGcseBoard } : undefined,
            defaultCountryRegion: countryRegion,
            defaultCurriculumFramework: curriculumFramework,
            autoSelectEnabled: autoSelectExamBoard,
            manualOverrideAllowed: allowManualExamBoardOverride,
          },
          englishStrand: context.englishStrand,
          skillFocus: context.skillFocus,
          ageGroup: context.ageGroup,
          difficulty: context.difficulty,
          studentId: context.targetStudentId ?? undefined,
          numberOfItems: effectiveItemCount,
          topic: context.topic,
          activityType: context.activityType,
          masteryOutcome: context.masteryOutcome,
          aiMode: context.aiMode,
          gaScriptPreference: context.gaScriptPreference,
          aiVisualGenerationEnabled: visualGenerationEnabled,
          visualGenerationMode,
          maxVisualsPerLesson,
          visualAllowedSubjects: effectiveVisualAllowedSubjects,
          requireVisualApproval,
          prefillContract: prefillContractContext,
        }),
      }, AI_REQUEST_TIMEOUT_MS);
      setGenerationPhase("repairing-response");
      const parsed = await parseApiResponse<Record<string, unknown>>(response);
      setGenerationDiagnostics({
        rawResponse: parsed.diagnostics.rawResponse,
        parseStage: parsed.diagnostics.parseStage,
        statusCode: parsed.diagnostics.status,
        contentType: parsed.diagnostics.contentType,
        reason: parsed.diagnostics.status >= 500 ? "provider_unavailable" : undefined,
        model: typeof parsed.payload?.model === "string" ? parsed.payload.model : undefined,
        provider: "openai",
      });
      console.info("[admin-ai-generator] preview response", {
        status: response.status,
        parseStage: parsed.diagnostics.parseStage,
        contentType: parsed.diagnostics.contentType,
      });

      if (!parsed.ok || !parsed.payload) {
        if (retryCount === 0) {
          setGenerationPhase("retrying-parse");
          startGenerationHeartbeat("Retrying after parse issue");
          await generatePreview(1, context);
          return;
        }
        setGenerationDiagnostics((current) => current ? {
          ...current,
          reason: parsed.diagnostics.status === 401
            ? "unauthorized"
            : parsed.message?.toLowerCase().includes("html")
              ? "provider_unavailable"
              : "validation_failure",
        } : current);
        setError(
          parsed.diagnostics.status === 401
            ? "Your admin session has expired. Please sign in again and retry."
            : (parsed.message ?? "The AI returned an invalid response. Please try again."),
        );
        return;
      }

      const payload = parsed.payload as {
        success?: boolean;
        errorCode?: string;
        diagnosticOutcome?: string;
        requestTuple?: {
          yearGroup?: string;
          keyStage?: string;
          subject?: string;
          strand?: string | null;
          skillFocus?: string;
          difficulty?: number;
          itemCount?: number;
        };
        message?: string;
        error?: string;
        details?: unknown;
        content?: Partial<GeneratedPreview> & { items?: unknown[]; title?: string };
        model?: string;
        prompt?: string;
        estimatedCostPence?: number;
        estimatedTokens?: number;
        providerUsed?: "openai" | "local_fallback";
        fallbackReason?: string | null;
        validationReason?: string | null;
        keySource?: "database" | "environment" | "none";
        aiMode?: AiGenerationMode;
        generationMetadata?: GenerationApiMetadata;
        generationDebug?: GenerationDebug;
        meta?: ValidationMeta;
        fallback?: GeneratorFallbackInfo;
      };

      setGenerationPhase("validating-content");
      if (!response.ok || payload.success === false) {
        const errorMsg = formatGeneratorFailureMessage(payload);
        const diagnosticOutcome = normalizeDiagnosticOutcome(payload.diagnosticOutcome);
        console.warn("[admin-ai-generator] preview failed", {
          status: response.status,
          errorCode: payload.errorCode ?? "generation_error",
          diagnosticOutcome: diagnosticOutcome ?? null,
          requestTuple: payload.requestTuple ?? null,
          details: payload.details,
        });
        setGenerationDiagnostics((current) => current ? {
          ...current,
          reason: diagnosticOutcome ?? (payload.errorCode === "model_error" ? "provider_unavailable" : "validation_failure"),
          requestTuple: payload.requestTuple,
        } : current);
        setGenerationMeta({
          model: payload.model,
          validation: payload.meta,
          fallback: payload.fallback,
          providerUsed: payload.providerUsed,
          fallbackReason: payload.fallbackReason,
          validationReason: payload.validationReason,
          generationMetadata: payload.generationMetadata,
          debug: payload.generationDebug,
        });
        setError(errorMsg);
      } else {
        if (payload.meta?.valid === false) {
          console.warn("[admin-ai-generator] preview validation failed", payload.meta?.errors ?? []);
          setGenerationDiagnostics((current) => current ? { ...current, reason: "validation_failure" } : current);
          setError(payload.validationReason ?? payload.meta?.errors?.[0] ?? "Generated content failed validation. Regenerate with a different topic or skill focus.");
          return;
        }
        const content = payload.content;
        const incomingItems = Array.isArray(payload.content?.items)
          ? (payload.content.items as GeneratedPreviewItem[])
          : [];
        setPreview({
          ...(content ?? {}),
          subject: context.subject,
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          curriculumFramework: typeof content?.curriculumFramework === "string" ? content.curriculumFramework : context.curriculumFramework,
          countryRegion: typeof content?.countryRegion === "string" ? content.countryRegion : context.countryRegion,
          examBoard: typeof content?.examBoard === "string" ? content.examBoard : context.examBoard,
          examBoardSource: content?.examBoardSource ?? context.examBoardSource,
          examBoardConfidence: typeof content?.examBoardConfidence === "number" ? content.examBoardConfidence : context.examBoardConfidence,
          examBoardReason: typeof content?.examBoardReason === "string" ? content.examBoardReason : context.examBoardReason,
          skillFocus: context.skillFocus,
          difficulty: context.difficulty,
          status: "draft",
          safetyStatus: content?.safetyStatus ?? "passed",
          qualityScore: typeof content?.qualityScore === "number" ? content.qualityScore : null,
          qualityStatus: content?.qualityStatus === "scored" ? "scored" : "pending_review",
          voiceScript: content?.voiceScript ?? "",
          imagePrompt: content?.imagePrompt ?? "",
          topic: context.topic,
          title: `${formatSubjectLabel(context.subject)} - ${context.topic}`,
          items: applyDefaultItemStatuses(incomingItems),
          visualAssets: Array.isArray(content?.visualAssets) ? (content.visualAssets as VisualAsset[]) : [],
        });
        setGenerationMeta({
          model: payload.model,
          prompt: payload.prompt,
          estimatedCostPence: payload.estimatedCostPence,
          estimatedTokens: payload.estimatedTokens,
          validation: payload.meta,
          fallback: payload.fallback,
          providerUsed: payload.providerUsed,
          fallbackReason: payload.fallbackReason,
          validationReason: payload.validationReason,
          generationMetadata: payload.generationMetadata,
          debug: payload.generationDebug,
        });
        if (payload.fallback?.used || payload.generationMetadata?.usedFallback) {
          setGenerationDiagnostics((current) => current ? { ...current, reason: "fallback_used" } : current);
        }
        setPreviewContext(context);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unable to reach AI generator";
      const timeout = errorMsg.startsWith("request_timeout_");
      const aborted = errorMsg === "request_aborted";
      setGenerationDiagnostics((current) => ({
        rawResponse: current?.rawResponse ?? "",
        parseStage: current?.parseStage ?? "empty",
        statusCode: current?.statusCode ?? 0,
        contentType: current?.contentType ?? "",
        model: current?.model,
        provider: current?.provider,
        reason: timeout ? "timeout" : aborted ? "aborted_request" : "provider_unavailable",
      }));
      setError(timeout
        ? "AI generation timed out while waiting for the provider. Please retry."
        : aborted
          ? "AI generation was cancelled before completion. Please retry."
          : `Network or server error: ${errorMsg}`);
    } finally {
      if (requestId === generateRequestIdRef.current) {
        stopGenerationHeartbeat();
        setLoading(false);
        setGenerationPhase("idle");
      }
    }
  }

  async function saveGeneratedContent() {
    if (!preview || !approvedCount || saveBlocked) {
      setError(saveBlockMessage);
      return;
    }
    const context = previewContext ?? {
      subject,
      keyStage,
      yearGroup: yearGroup as YearGroup,
      studentYearGroup: resolvedPrefill.studentYearGroup,
      studentKeyStage: resolvedPrefill.studentKeyStage,
      targetLearningYearGroup: yearGroup as YearGroup,
      targetLearningKeyStage: keyStage,
      subjectLevel: resolvedPrefill.subjectLevel,
      strandLevel: resolvedPrefill.strandLevel,
      levelSource,
      adminOverrideReason,
      curriculumPathway,
      curriculumFramework,
      countryRegion,
      examBoard: shouldTagExamBoard ? effectiveExamBoardForRequest || undefined : undefined,
      examBoardSource: resolvedExamBoardSelection.examBoardSource,
      examBoardConfidence: resolvedExamBoardSelection.examBoardConfidence,
      examBoardReason: resolvedExamBoardSelection.examBoardReason,
      englishStrand: englishStrand || undefined,
      skillFocus,
      ageGroup: ageGroup as (typeof AGE_GROUPS)[number],
      difficulty,
      topic: selectedTopicTheme,
      activityType,
      masteryOutcome,
      targetStudentId,
      source: prefillSource,
      weakAreaId: loadedWeakAreaId,
    };

    const generationTypeForContext = GENERATION_CONTENT_TYPE_BY_SUBJECT[context.subject];
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      console.info("[admin-ai-generator] save request", {
        subject: context.subject,
        generationType: generationTypeForContext,
        approvedCount,
        yearGroup: context.yearGroup,
        skillFocus: context.skillFocus,
      });
      const response = await fetch("/api/admin/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: context.subject,
          generationType: generationTypeForContext,
          ageGroup: context.ageGroup,
          keyStage: context.keyStage,
          yearGroup: context.yearGroup,
          studentYearGroup: context.studentYearGroup,
          studentKeyStage: context.studentKeyStage,
          targetLearningYearGroup: context.targetLearningYearGroup ?? context.yearGroup,
          targetLearningKeyStage: context.targetLearningKeyStage ?? context.keyStage,
          subjectLevel: context.subjectLevel,
          strandLevel: context.strandLevel,
          levelSource: context.levelSource,
          adminOverrideReason: context.adminOverrideReason,
          curriculumPathway: context.curriculumPathway,
          curriculumFramework: context.curriculumFramework,
          countryRegion: context.countryRegion,
          examBoard: context.examBoard,
          examBoardSource: context.examBoardSource,
          examBoardConfidence: context.examBoardConfidence,
          examBoardReason: context.examBoardReason,
          englishStrand: context.englishStrand,
          skillFocus: context.skillFocus,
          difficulty: context.difficulty,
          topic: context.topic,
          activityType: context.activityType,
          masteryOutcome: context.masteryOutcome,
          itemSchema: generationTypeForContext,
          items: {
            ...preview,
            items: (preview.items as GeneratedPreviewItem[]).filter((item) => item.status === "approved"),
          },
          status: "review",
          model: generationMeta?.model,
          prompt: generationMeta?.prompt,
          estimatedCostPence: generationMeta?.estimatedCostPence,
          generationSource: context.source,
          weakAreaId: context.weakAreaId,
          visualSettings: {
            enabled: visualGenerationEnabled,
            mode: visualGenerationMode,
            maxPerLesson: maxVisualsPerLesson,
            allowedSubjects: effectiveVisualAllowedSubjects,
            requireApproval: requireVisualApproval,
          },
          prefillContract: prefillContractContext,
        }),
      });
      const payload = await response.json() as {
        error?: string;
        duplicate?: boolean;
        message?: string;
        warnings?: unknown[];
        item?: { id?: string };
        diagnosticOutcome?: string;
        requestTuple?: {
          yearGroup?: string;
          keyStage?: string;
          subject?: string;
          strand?: string | null;
          skillFocus?: string;
          difficulty?: number;
          itemCount?: number;
        };
      };
      if (!response.ok) {
        const diagnosticOutcome = normalizeDiagnosticOutcome(payload.diagnosticOutcome) ?? "save_blocked";
        console.warn("[admin-ai-generator] save blocked", {
          error: payload.error ?? "Save failed.",
          diagnosticOutcome,
          requestTuple: payload.requestTuple ?? null,
        });
        setGenerationDiagnostics((current) => current ? {
          ...current,
          reason: diagnosticOutcome,
          requestTuple: payload.requestTuple,
        } : {
          rawResponse: "",
          parseStage: "json",
          statusCode: response.status,
          contentType: "application/json",
          reason: diagnosticOutcome,
          requestTuple: payload.requestTuple,
        });
        setError(payload.error ?? "Save failed.");
      } else {
        const warnings = Array.isArray(payload.warnings)
          ? payload.warnings.filter((entry: unknown): entry is string => typeof entry === "string")
          : [];
        const duplicate = payload.duplicate === true;
        if (duplicate) {
          const diagnosticOutcome = normalizeDiagnosticOutcome(payload.diagnosticOutcome) ?? "save_blocked";
          setGenerationDiagnostics((current) => current ? {
            ...current,
            reason: diagnosticOutcome,
            requestTuple: payload.requestTuple,
          } : {
            rawResponse: "",
            parseStage: "json",
            statusCode: response.status,
            contentType: "application/json",
            reason: diagnosticOutcome,
            requestTuple: payload.requestTuple,
          });
        }
        setMessage(
          duplicate
            ? (warnings.length
              ? `Duplicate lesson blocked. Reused existing content from library. Warning: ${warnings.join(" ")}`
              : "Duplicate lesson blocked. Reused existing content from library.")
            : (warnings.length
              ? `Saved to Content Library. Warning: ${warnings.join(" ")}`
              : "Saved to Content Library")
        );
        setSavedContentId(payload.item?.id ?? null);
        if (context.targetStudentId && payload.item?.id) {
          const assignResponse = await fetch("/api/admin/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: context.targetStudentId, contentId: payload.item.id }),
          });
          const assignPayload = await assignResponse.json().catch(() => ({} as { error?: string }));
          if (assignResponse.ok) {
            setMessage("Saved to Content Library and assigned to student");
          } else {
            setMessage(assignPayload.error ?? "Saved to Content Library, but assignment failed.");
          }
        }
      }
    } catch {
      setError("Unable to save to Content Library.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadGeneratedAsset(file: File | null, kind: "image" | "audio") {
    if (!file || !preview) return;
    setAssetUploadBusy(kind);
    setError(null);
    try {
      const folder = kind === "audio" ? "audio" : "admin";
      const uploaded = await uploadMediaFile(file, folder);
      if (kind === "audio") {
        setPreview((current) => current ? { ...current, voiceScript: `${current.voiceScript}\nAudio asset: ${uploaded.publicUrl}`.trim() } : current);
      } else {
        setPreview((current) => current ? { ...current, imagePrompt: `${current.imagePrompt}\nImage asset: ${uploaded.publicUrl}`.trim() } : current);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Asset upload failed.");
    } finally {
      setAssetUploadBusy(null);
    }
  }

  function updatePreviewItem(index: number, patch: Partial<GeneratedPreviewItem>) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      };
    });
  }

  function replacePreviewItem(index: number, nextItem: GeneratedPreviewItem) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) => itemIndex === index ? nextItem : item),
      };
    });
  }

  function updatePreviewItemJson(index: number, value: string) {
    try {
      const parsed = JSON.parse(value) as GeneratedPreviewItem;
      updatePreviewItem(index, parsed);
      setError(null);
    } catch {
      setError("Item JSON is not valid yet. Fix it before saving.");
    }
  }

  function markPreviewItem(index: number, status: "approved" | "rejected") {
    updatePreviewItem(index, { status });
  }

  function extractVisualActionMessage(payload: Record<string, unknown> | null, fallback = "Visual asset action failed.") {
    if (!payload) return fallback;
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
    const asset = payload.asset as { error?: unknown } | undefined;
    if (typeof asset?.error === "string" && asset.error.trim()) return asset.error;
    return fallback;
  }

  async function requestVisualAssetAction(asset: VisualAsset, action: "generate" | "regenerate" | "remove") {
    const response = await fetchWithAdminSessionRetry("/api/admin/ai/visual-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        asset,
        imageModel: (process.env.NEXT_PUBLIC_OPENAI_IMAGE_MODEL ?? "").trim() || undefined,
        maxVisuals: 1,
      }),
    }, AI_REQUEST_TIMEOUT_MS);

    const parsed = await parseApiResponse<Record<string, unknown>>(response);
    const payload = parsed.payload;
    const updatedAsset = payload?.asset as VisualAsset | undefined;

    if (!parsed.ok || !payload || !response.ok) {
      return {
        ok: false,
        asset: updatedAsset,
        message: extractVisualActionMessage(payload, parsed.message ?? "Visual asset action failed."),
      };
    }

    if (!updatedAsset) {
      return {
        ok: false,
        asset: undefined,
        message: "Visual asset action returned no asset payload.",
      };
    }

    if (updatedAsset.status === "failed") {
      return {
        ok: false,
        asset: updatedAsset,
        message: updatedAsset.error ?? "Visual asset generation failed.",
      };
    }

    return { ok: true, asset: updatedAsset, message: null as string | null };
  }

  function updateSingleVisualAsset(assetId: string, updatedAsset: VisualAsset) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        visualAssets: (current.visualAssets ?? []).map((entry) => (entry.id === assetId ? updatedAsset : entry)),
      };
    });
  }

  async function applyVisualAssetAction(assetId: string, action: "generate" | "regenerate" | "remove") {
    if (!preview) return;
    const asset = (preview.visualAssets ?? []).find((entry) => entry.id === assetId);
    if (!asset) return;

    setVisualAssetActionId(assetId);
    setError(null);
    try {
      const result = await requestVisualAssetAction(asset, action);
      if (result.asset) {
        updateSingleVisualAsset(assetId, result.asset);
      }
      if (!result.ok) {
        setError(result.message ?? "Visual asset action failed.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Visual asset action failed.");
    } finally {
      setVisualAssetActionId(null);
    }
  }

  async function generateAllVisualAssetsNow() {
    if (!preview?.visualAssets?.length) return;

    const targetAssets = preview.visualAssets.filter((asset) => asset.status !== "removed");
    if (!targetAssets.length) return;

    setVisualBatchBusy(true);
    setError(null);
    let updatedCount = 0;
    let failedCount = 0;
    let firstFailure: string | null = null;

    try {
      for (const asset of targetAssets) {
        setVisualAssetActionId(asset.id);
        const action: "generate" | "regenerate" = asset.status === "generated" ? "regenerate" : "generate";
        try {
          const result = await requestVisualAssetAction(asset, action);
          if (result.asset) {
            updateSingleVisualAsset(asset.id, result.asset);
          }
          if (result.ok) {
            updatedCount += 1;
          } else {
            failedCount += 1;
            if (!firstFailure) {
              firstFailure = `${asset.title}: ${result.message ?? "Visual asset action failed."}`;
            }
          }
        } catch (actionError) {
          failedCount += 1;
          if (!firstFailure) {
            firstFailure = `${asset.title}: ${actionError instanceof Error ? actionError.message : "Visual asset action failed."}`;
          }
        }
      }

      if (updatedCount > 0) {
        setMessage(
          failedCount > 0
            ? `Visual generation completed with partial success (${updatedCount} updated, ${failedCount} failed).`
            : `Visual generation completed (${updatedCount} updated).`
        );
      }
      if (failedCount > 0 && firstFailure) {
        setError(firstFailure);
      }
    } finally {
      setVisualAssetActionId(null);
      setVisualBatchBusy(false);
    }
  }

  async function regenerateItem(index: number) {
    if (loading) return;
    const requestId = ++regenerateRequestIdRef.current;
    const regenerationNonce = ++regenerateRequestIdRef.current;
    setLoading(true);
    setError(null);
    startGenerationHeartbeat("Regenerating item");
    try {
      const response = await fetchWithAdminSessionRetry("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          keyStage,
          yearGroup,
          curriculumPathway,
          curriculumFramework,
          countryRegion,
          examBoard: shouldTagExamBoard ? effectiveExamBoardForRequest || undefined : undefined,
          examBoardSource: resolvedExamBoardSelection.examBoardSource,
          examBoardConfidence: resolvedExamBoardSelection.examBoardConfidence,
          examBoardReason: resolvedExamBoardSelection.examBoardReason,
          autoSelectExamBoard,
          manualExamBoardOverrideAllowed: allowManualExamBoardOverride,
          schoolExamBoardSettings: {
            preferredGcseBoardsBySubject: schoolPreferredGcseBoard ? { [subject]: schoolPreferredGcseBoard } : undefined,
            defaultCountryRegion: countryRegion,
            defaultCurriculumFramework: curriculumFramework,
            autoSelectEnabled: autoSelectExamBoard,
            manualOverrideAllowed: allowManualExamBoardOverride,
          },
          englishStrand: englishStrand || undefined,
          skillFocus,
          ageGroup,
          difficulty,
          numberOfItems: Math.max(3, Math.min(5, preview?.items.length ?? 3)),
          topic: selectedTopicTheme || skillFocus,
          activityType,
          masteryOutcome,
          aiMode,
          gaScriptPreference,
          aiVisualGenerationEnabled: visualGenerationEnabled,
          visualGenerationMode,
          maxVisualsPerLesson,
          visualAllowedSubjects: effectiveVisualAllowedSubjects,
          requireVisualApproval,
          regenerationNonce,
          avoidPrompts: (preview?.items ?? [])
            .filter((_, itemIndex) => itemIndex !== index)
            .map((item) => String(item.question ?? item.prompt ?? item.sentence ?? item.targetVocabulary ?? ""))
            .filter(Boolean)
            .slice(0, 8),
        }),
      }, AI_REQUEST_TIMEOUT_MS);
      const parsed = await parseApiResponse<Record<string, unknown>>(response);
      if (!parsed.ok || !parsed.payload) {
        setGenerationDiagnostics((current) => ({
          rawResponse: current?.rawResponse ?? parsed.diagnostics.rawResponse,
          parseStage: parsed.diagnostics.parseStage,
          statusCode: parsed.diagnostics.status,
          contentType: parsed.diagnostics.contentType,
          model: current?.model,
          provider: current?.provider ?? "openai",
          reason: parsed.diagnostics.status >= 500 ? "provider_unavailable" : "validation_failure",
        }));
        setError(parsed.message ?? "Regeneration failed due to malformed AI output.");
        return;
      }
      const payload = parsed.payload as {
        success?: boolean;
        error?: string;
        diagnosticOutcome?: string;
        requestTuple?: {
          yearGroup?: string;
          keyStage?: string;
          subject?: string;
          strand?: string | null;
          skillFocus?: string;
          difficulty?: number;
          itemCount?: number;
        };
        content?: { items?: unknown[] };
        meta?: { valid?: boolean };
      };
      if (!response.ok || payload.success === false) {
        const diagnosticOutcome = normalizeDiagnosticOutcome(payload.diagnosticOutcome);
        setGenerationDiagnostics((current) => current ? {
          ...current,
          reason: diagnosticOutcome ?? "validation_failure",
          requestTuple: payload.requestTuple,
        } : current);
        setError(payload.error ?? "Regeneration failed.");
        return;
      }
      const replacementCandidates = (payload.content?.items ?? []) as GeneratedPreviewItem[];
      const existingKeys = new Set((preview?.items ?? [])
        .filter((_, itemIndex) => itemIndex !== index)
        .flatMap(previewItemDuplicateKeys));
      const replacement = replacementCandidates.find((candidate) => {
        const candidateKeys = previewItemDuplicateKeys(candidate);
        return candidateKeys.length > 0 && candidateKeys.every((candidateKey) => !existingKeys.has(candidateKey));
      });
      if (replacement) {
        replacePreviewItem(index, {
          ...replacement,
          status: resolvePreviewItemStatus(replacement),
        });
        return;
      }
      if (replacementCandidates.length) {
        setError("OpenAI only returned replacement items that matched existing preview items. Try regenerating again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      const timeout = message.startsWith("request_timeout_");
      const aborted = message === "request_aborted";
      setGenerationDiagnostics((current) => ({
        rawResponse: current?.rawResponse ?? "",
        parseStage: current?.parseStage ?? "empty",
        statusCode: current?.statusCode ?? 0,
        contentType: current?.contentType ?? "",
        model: current?.model,
        provider: current?.provider,
        reason: timeout ? "timeout" : aborted ? "aborted_request" : "provider_unavailable",
      }));
      setError(timeout
        ? "Item regeneration timed out while waiting for the provider."
        : aborted
          ? "Item regeneration was cancelled before completion."
          : "Unable to regenerate item.");
    } finally {
      if (requestId === regenerateRequestIdRef.current) {
        stopGenerationHeartbeat();
        setLoading(false);
      }
    }
  }

  async function runAutomation(mode: "autofill" | "weaknesses" | "library-gaps") {
    const startedAt = Date.now();
    setAutomationLoading(mode);
    setAutomationRetryMode(null);
    setAutomationDurationMs(null);
    setAutomationStatus({
      title: mode === "weaknesses"
        ? "Running weak area detection..."
        : mode === "library-gaps"
          ? "Checking starter library gaps..."
          : "Running starter library backfill...",
      lines: ["Please wait while processing."],
      ok: true,
    });
    setAutomationDebugPayload(null);
    try {
      if (mode === "weaknesses") {
        const detectResponse = await fetchWithTimeout("/api/admin/weak-areas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyStage: weakAreaKeyStageFilter || undefined,
            yearGroup: weakAreaYearGroupFilter || undefined,
          }),
        });
        const detectPayload = await detectResponse.json() as { error?: string; weakAreas?: unknown[] };
        if (!detectResponse.ok) {
          setAutomationRetryMode(mode);
          setAutomationStatus({
            title: "Weak area scan failed",
            lines: [detectPayload.error ?? "Could not detect weak areas. Try again."],
            ok: false,
          });
          return;
        }

        const weaknessParams = new URLSearchParams();
        if (weakAreaKeyStageFilter) weaknessParams.set("keyStage", weakAreaKeyStageFilter);
        if (weakAreaYearGroupFilter) weaknessParams.set("yearGroup", weakAreaYearGroupFilter);
        const weakAreasUrl = `/api/admin/weak-areas${weaknessParams.toString() ? `?${weaknessParams.toString()}` : ""}`;
        const listResponse = await fetchWithTimeout(weakAreasUrl, { method: "GET" });
        const listPayload = await listResponse.json() as { error?: string; weakAreas?: WeakArea[] };
        if (!listResponse.ok) {
          setAutomationRetryMode(mode);
          setAutomationStatus({
            title: "Weak area listing failed",
            lines: [listPayload.error ?? "Unable to fetch weak area list."],
            ok: false,
          });
          return;
        }

        const detectedCount = Array.isArray(detectPayload.weakAreas) ? detectPayload.weakAreas.length : 0;
        const currentWeakAreas = listPayload.weakAreas ?? [];
        setWeakAreas(currentWeakAreas);
        setAutomationStatus({
          title: "Weak area detection complete",
          lines: currentWeakAreas.length
            ? [
                `${currentWeakAreas.length} active weak areas currently tracked.`,
                `${detectedCount} weak area signals detected in latest scan.`,
              ]
            : ["No weak areas detected."],
          ok: true,
        });
        setAutomationDebugPayload(JSON.stringify({ detectPayload, listPayload }, null, 2));
        return;
      }

      const response = await fetchWithTimeout("/api/admin/ai/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json() as {
        error?: string;
        created?: Array<{ type: string; id: string; reused: boolean; previousCount?: number; minimumExpectedCount?: number }>;
        gaps?: LibraryGapReport[];
        summary?: { totalTypes: number; missingTypes: number; totalMissingCount: number };
      };
      if (!response.ok) {
        setAutomationRetryMode(mode);
        setAutomationStatus({
          title: "Library automation failed",
          lines: [payload.error ?? "Automation failed."],
          ok: false,
        });
        return;
      }

      if (mode === "library-gaps") {
        const gaps = payload.gaps ?? [];
        const missing = gaps.filter((gap) => gap.missingCount > 0);
        setAutomationStatus({
          title: "Starter library gap check complete",
          lines: gaps.length
            ? [
                `${payload.summary?.totalMissingCount ?? missing.reduce((sum, gap) => sum + gap.missingCount, 0)} starter items missing across ${payload.summary?.missingTypes ?? missing.length} content types.`,
                ...gaps.map((gap) => `${formatSubjectLabel(gap.type)}: ${gap.currentCount}/${gap.minimumExpectedCount} available, ${gap.missingCount} missing.`),
                "No content was generated. Use Auto-fill Starter Library if you want to backfill starter content.",
              ]
            : ["No starter library content types were checked."],
          ok: true,
        });
        setAutomationDebugPayload(JSON.stringify(payload, null, 2));
        return;
      }

      const created = payload.created ?? [];
      const reusedCount = created.filter((entry) => entry.reused).length;
      const freshCount = created.length - reusedCount;
      const subjectLabels = Array.from(new Set(created.map((entry) => formatSubjectLabel(entry.type))));
      const starterCounts = (payload.gaps ?? []).map((gap) => `${formatSubjectLabel(gap.type)}: ${gap.currentCount}/${gap.minimumExpectedCount}`);
      setAutomationStatus({
        title: "Starter library check complete",
        lines: freshCount > 0
          ? [
              `${freshCount} starter content sets generated.`,
              `${reusedCount} existing content sets reused.`,
              subjectLabels.length ? `${subjectLabels.join(", ")} starter library refreshed.` : "Starter library refreshed.",
              ...starterCounts,
            ]
          : [
              "Starter library already meets the minimum content target.",
              "No new starter content was needed.",
              "Use Detect Library Gaps to review starter coverage.",
              ...starterCounts,
            ],
        ok: true,
      });
      setAutomationDebugPayload(JSON.stringify(payload, null, 2));
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "AbortError";
      setAutomationRetryMode(mode);
      setAutomationStatus({
        title: timeout ? "Automation timed out" : "Automation failed",
        lines: [timeout ? "Request timed out. Please retry." : "Unexpected error while running automation."],
        ok: false,
      });
    } finally {
      setAutomationLoading(null);
      setAutomationDurationMs(Date.now() - startedAt);
    }
  }

  function weakAreaToGenerationContext(area: WeakArea): GenerationContext {
    const subjectLower = area.subject.toLowerCase();
    const normalizedWeakSubject = normalizeCurriculumSubject(area.subject);
    const skillLower = area.skillFocus.toLowerCase();
    const inferredYearGroup = area.yearGroup ?? (skillLower.includes("algebra") ? "Year 10" : "Year 4");
    const derivedKeyStage = (area.keyStage ?? keyStageForYearGroup(inferredYearGroup)) as typeof KEY_STAGES[number];
    const derivedYearGroup = normalizeYearForKeyStage(derivedKeyStage, inferredYearGroup);
    const availableForYear = getAvailableSubjects(derivedYearGroup);

    const preferredSubjects: Subject[] =
      normalizedWeakSubject === "maths" || normalizedWeakSubject === "gcse-maths" || normalizedWeakSubject === "times-tables"
        ? (["gcse-maths", "maths", "times-tables"] as Subject[])
        : normalizedWeakSubject === "science" || normalizedWeakSubject === "gcse-science" || subjectLower.includes("science")
          ? (["gcse-science", "science"] as Subject[])
          : normalizedWeakSubject === "reading" || normalizedWeakSubject === "english-language" || normalizedWeakSubject === "english-literature" || normalizedWeakSubject === "gcse-english" || subjectLower.includes("reading")
            ? (["reading", "english-language", "grammar"] as Subject[])
            : (["spelling", "writing", "grammar"] as Subject[]);

    let mappedSubject = preferredSubjects.find((candidate) => availableForYear.includes(candidate));
    if (!mappedSubject) {
      mappedSubject = availableForYear[0];
    }
    if (!mappedSubject) {
      mappedSubject = "spelling";
    }

    const skills = getAvailableSkills(mappedSubject, derivedYearGroup);
    const skillExact = skills.find((skill) => skill.toLowerCase() === skillLower);
    const skillLoose = skills.find((skill) => skill.toLowerCase().includes(skillLower) || skillLower.includes(skill.toLowerCase()));
    const mappedSkill = skillExact ?? skillLoose ?? skills[0] ?? area.skillFocus;
    const mappedTopics = topicSuggestionsForSelection({
      yearGroup: derivedYearGroup,
      subject: mappedSubject,
      skillFocus: mappedSkill,
    });

    const curriculum = curriculumPathwayForYearGroup(derivedYearGroup);
    const needExamBoard = shouldApplyExamBoardTag({
      yearGroup: derivedYearGroup,
      keyStage: derivedKeyStage,
      curriculumPathway: curriculum,
      subject: mappedSubject,
    });
    const recommendedExamBoard = needExamBoard ? EXAM_BOARDS.find((value) => value.toUpperCase() === "AQA") ?? EXAM_BOARDS[0] ?? "" : "";
    const baselineDifficulty = Math.max(1, Math.min(5, area.currentDifficulty || 2));
    const recommendedDifficulty = Math.max(1, baselineDifficulty - 1);
    const firstMappedTopic = mappedTopics[0];
    const subjectDisplayLabel = mappedSubject.startsWith("gcse-")
      ? `GCSE ${formatSubjectLabel(mappedSubject.slice(5))}`
      : formatSubjectLabel(mappedSubject);
    const recommendedTopic =
      firstMappedTopic && !/^\s*.+\s+practice\s*$/i.test(firstMappedTopic)
        ? firstMappedTopic
        : `${subjectDisplayLabel} ${toTitleCaseWords(mappedSkill)} Practice`;

    return {
      subject: mappedSubject,
      keyStage: derivedKeyStage,
      yearGroup: derivedYearGroup,
      curriculumPathway: curriculum,
      examBoard: needExamBoard ? recommendedExamBoard : undefined,
      skillFocus: mappedSkill,
      ageGroup: ageGroupForYearGroup(derivedYearGroup),
      difficulty: recommendedDifficulty,
      topic: recommendedTopic,
      aiMode,
      targetStudentId: area.studentId,
      source: "weak-area",
      weakAreaId: area.id,
    };
  }

  function applyWeakArea(area: WeakArea) {
    const context = weakAreaToGenerationContext(area);
    setSubject(context.subject);
    setKeyStage(context.keyStage);
    setYearGroup(context.yearGroup);
    setAgeGroup(context.ageGroup);
    setSkillFocus(context.skillFocus);
    setDifficulty(context.difficulty);
    setExamBoard(context.examBoard ?? "");
    setTopicChoice(context.topic);
    setCustomTopic("");
    setTargetStudentId(area.studentId);
    setLoadedWeakAreaId(area.id);
    setWeakAreaFormSynced(true);
    setSavedContentId(null);
    setAutomationMessage(`Loaded ${area.student.name}'s weak area into the manual generator.`);
  }

  async function generateInterventionFromWeakArea(area: WeakArea) {
    const context = weakAreaToGenerationContext(area);
    setTargetStudentId(area.studentId);
    setLoadedWeakAreaId(area.id);
    setWeakAreaFormSynced(false);
    setAutomationMessage(`Generating direct intervention from detected weak-area analytics for ${area.student.name}.`);
    console.info("[admin-ai-generator] weak-area support context", {
      areaId: area.id,
      areaSubject: area.subject,
      areaSkillFocus: area.skillFocus,
      areaYearGroup: area.yearGroup,
      areaKeyStage: area.keyStage,
      mappedSubject: context.subject,
      mappedSkillFocus: context.skillFocus,
      mappedTopic: context.topic,
      mappedYearGroup: context.yearGroup,
      mappedKeyStage: context.keyStage,
      source: context.source,
      weakAreaId: context.weakAreaId,
    });
    scrollToPreviewPanel();
    await generatePreview(0, context);
    scrollToPreviewPanel();
  }

  return (
    <div className="relative z-0 grid items-start gap-6 xl:grid-cols-[32rem_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-24 xl:z-20 xl:max-h-[calc(100vh-96px)] xl:overflow-y-auto">
      <AdminSectionCard title="Manual Curriculum Generator" eyebrow="Manual AI generator">
        <div className="space-y-4 pb-6">
          {hasTargetPrefill ? (
            <p className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100">
              Some fields were auto-filled from the student target. Please review before generating.
            </p>
          ) : null}
          {prefillBlockingWarnings.length ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-xs text-rose-100">
              <p className="font-bold">Review required before generation</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {prefillBlockingWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {prefillAssumptions.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
              <p className="font-bold">Prefill assumptions</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {prefillAssumptions.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {Object.keys(prefillFieldSources).length ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-3 text-xs text-slate-300">
              <p className="font-bold text-slate-100">Prefill source panel</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(Object.entries(prefillFieldSources) as Array<[string, string]>).map(([field, source]) => (
                  <p key={`${field}-${source}`}><span className="text-slate-400">{field}</span>: {source}</p>
                ))}
              </div>
            </div>
          ) : null}
          {launchedFromStudentTarget ? (
            <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-3 text-xs text-indigo-100">
              <p className="font-bold">Student context</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p><span className="text-indigo-200/80">Student year group:</span> {resolvedPrefill.studentYearGroup ?? "Unknown"}</p>
                <p><span className="text-indigo-200/80">Student key stage:</span> {resolvedPrefill.studentKeyStage ?? "Unknown"}</p>
                <p><span className="text-indigo-200/80">Generated lesson level:</span> {yearGroup}</p>
                <p><span className="text-indigo-200/80">Level source:</span> {levelSource.replace(/_/g, " ")}</p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              {launchedFromStudentTarget ? "Generated lesson level" : "Year group"}
              <select
                value={yearGroup}
                onChange={(event) => {
                  clearWeakAreaLink();
                  const nextYear = event.target.value;
                  setYearGroup(nextYear);
                  setKeyStage(keyStageForYearGroup(nextYear));
                  setAgeGroup(ageGroupForYearGroup(nextYear));
                  if (hasTargetPrefill) {
                    setLevelSource("admin_override");
                    setAdminOverrideReason((current) => current || "Admin changed generated lesson level in AI Generator.");
                  }
                  if (!shouldApplyExamBoardTag({
                    yearGroup: nextYear,
                    keyStage: keyStageForYearGroup(nextYear),
                    curriculumPathway: curriculumPathwayForYearGroup(nextYear),
                    subject,
                  })) {
                    setExamBoard("");
                  }
                  setTopicChoice("");
                  setCustomTopic("");

                  // Update subject if current is no longer available
                  const nextAvailable = getAvailableSubjects(nextYear);
                  if (!nextAvailable.includes(subject)) {
                    setSubject(nextAvailable[0]);
                    const nextSkills = getAvailableSkills(nextAvailable[0], nextYear);
                    setSkillFocus(nextSkills[0] ?? "");
                    if (!isEnglishParentSubject(nextAvailable[0])) {
                      setEnglishStrand("");
                    }
                  } else {
                    // Update skill focus if current is no longer available
                    if (isEnglishParentSubject(subject) && englishStrand) {
                      setSkillFocus(deriveSkillFocusFromEnglishStrand(englishStrand, nextYear, subject));
                    } else {
                      const nextSkills = getAvailableSkills(subject, nextYear);
                      if (!nextSkills.includes(skillFocus)) {
                        setSkillFocus(nextSkills[0] ?? "");
                      }
                    }
                  }
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                {YEAR_GROUPS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Key stage
              <input
                value={keyStage}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Subject
            <select
              value={subject}
              onChange={(event) => {
                clearWeakAreaLink();
                const nextSubject = event.target.value as Subject;
                setSubject(nextSubject);
                if (isEnglishParentSubject(nextSubject)) {
                  const defaultStrand: EnglishStrand = "reading";
                  setEnglishStrand(defaultStrand);
                  setSkillFocus(deriveSkillFocusFromEnglishStrand(defaultStrand, yearGroup, nextSubject));
                } else {
                  setEnglishStrand("");
                  const nextSkills = getAvailableSkills(nextSubject, yearGroup);
                  setSkillFocus(nextSkills[0] ?? "");
                }
                setTopicChoice("");
                setCustomTopic("");
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              {GCSE_SUBJECT_GROUPS.map((group) => {
                const options = group.subjects.filter((candidate) => availableSubjects.includes(candidate));
                if (!options.length) return null;
                return (
                  <optgroup key={group.label} label={group.label}>
                    {options.map((s) => (
                      <option key={s} value={s}>{formatSubjectLabel(s)}</option>
                    ))}
                  </optgroup>
                );
              })}
              {availableSubjects.filter((s) => !GCSE_SUBJECT_GROUPS.some((group) => group.subjects.includes(s))).length ? (
                <optgroup label="Other">
                  {availableSubjects.filter((s) => !GCSE_SUBJECT_GROUPS.some((group) => group.subjects.includes(s))).map((s) => (
                    <option key={s} value={s}>{formatSubjectLabel(s)}</option>
                  ))}
                </optgroup>
              ) : null}
              {!availableSubjects.includes(subject) ? (
                <option value={subject}>{formatSubjectLabel(subject)}</option>
              ) : null}
            </select>
          </label>

          {requiresEnglishStrand ? (
            <label className="block text-sm font-bold text-slate-300">
              English strand (required)
              <select
                value={englishStrand}
                onChange={(event) => {
                  clearWeakAreaLink();
                  const nextStrand = event.target.value as EnglishStrand | "";
                  setEnglishStrand(nextStrand);
                  setSkillFocus(deriveSkillFocusFromEnglishStrand(nextStrand, yearGroup, subject));
                  setTopicChoice("");
                  setCustomTopic("");
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                <option value="">Select an English strand</option>
                {ENGLISH_STRAND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-sm font-bold text-slate-300">
            Skill focus
            <select
              value={skillFocus}
              onChange={(event) => {
                clearWeakAreaLink();
                const nextSkill = event.target.value;
                setSkillFocus(nextSkill);
                setTopicChoice("");
                setCustomTopic("");
              }}
              className="mt-2 max-h-72 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              <option value="">Select a skill focus</option>
              {availableSkills.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Curriculum pathway
              <input
                value={curriculumPathway.toUpperCase()}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Country / region
              <select
                value={countryRegion}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setCountryRegion(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                <option value="UK">UK</option>
                <option value="Ghana">Ghana</option>
                <option value="Nigeria">Nigeria</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Curriculum framework
              <input
                value={curriculumFramework}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setCurriculumFramework(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              School preferred GCSE board (optional)
              <select
                value={schoolPreferredGcseBoard}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setSchoolPreferredGcseBoard(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                <option value="">No school default</option>
                {EXAM_BOARDS.map((board) => (
                  <option key={board} value={board}>{board}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-200">
              <span>Auto-select exam board</span>
              <input
                type="checkbox"
                checked={autoSelectExamBoard}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setAutoSelectExamBoard(event.target.checked);
                }}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <label className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>Allow manual override</span>
              <input
                type="checkbox"
                checked={allowManualExamBoardOverride}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setAllowManualExamBoardOverride(event.target.checked);
                }}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <p className="mt-2 text-xs text-cyan-200">
              Recommended: {examBoardRecommendation.recommendedExamBoard ?? "Not required"} • Confidence {Math.round(examBoardRecommendation.confidence * 100)}%
            </p>
            <p className="mt-1 text-xs text-slate-400">{examBoardRecommendation.reason}</p>
            {examBoardRecommendation.alternatives.length > 1 ? (
              <p className="mt-1 text-xs text-slate-500">Alternatives: {examBoardRecommendation.alternatives.join(", ")}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Exam board {shouldTagExamBoard ? "(required)" : "(not needed)"}
              <select
                value={effectiveExamBoardForRequest || ""}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setExamBoard(event.target.value);
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
                disabled={!shouldTagExamBoard || (autoSelectExamBoard && !allowManualExamBoardOverride)}
              >
                <option value="">{shouldTagExamBoard ? "Select exam board" : "Not required"}</option>
                {(examBoardRecommendation.alternatives.length ? examBoardRecommendation.alternatives : EXAM_BOARDS).map((board) => (
                  <option key={board} value={board}>{board}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Exam board source
              <input
                readOnly
                value={resolvedExamBoardSelection.examBoardSource}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </label>
          </div>
          {shouldTagExamBoard && !effectiveExamBoardForRequest ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{GCSE_EXAM_BOARD_WARNING}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Age group
              <input
                value={ageGroup}
                readOnly
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Difficulty: {difficulty} / 5
              <input
                type="range"
                min={1}
                max={5}
                value={difficulty}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setDifficulty(Number(event.target.value));
                }}
                className="mt-2 w-full accent-indigo-500"
              />
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Number of items
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <span>Auto item count</span>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoItemsEnabled}
                  onChange={(event) => setAutoItemsEnabled(event.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
                <span className="text-cyan-200">Recommended: {recommendedItemCount}</span>
              </label>
            </div>
            <input
              type="number"
              min={1}
              max={10}
              value={effectiveItemCount}
              disabled={autoItemsEnabled}
              onChange={(event) => {
                clearWeakAreaLink();
                setItems(Math.max(1, Math.min(10, Number(event.target.value))));
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
            />
            <p className="mt-1 text-xs text-slate-400">
              {autoItemsEnabled
                ? "Auto mode optimizes item count by year group and difficulty for higher reliability."
                : "Manual mode lets you choose exactly how many items to generate."}
            </p>
          </label>

          <label className="block text-sm font-bold text-slate-300">
            AI mode
            <select
              value={aiMode}
              onChange={(event) => {
                clearWeakAreaLink();
                setAiMode(event.target.value as AiGenerationMode);
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              {AI_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs font-medium text-slate-400">{aiModeHelperText}</p>
          </label>

          {isGaSubject ? (
            <label className="block text-sm font-bold text-slate-300">
              Ga script preference
              <select
                value={gaScriptPreference}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setGaScriptPreference(event.target.value as "orthography_only" | "orthography_with_transliteration");
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
              >
                <option value="orthography_with_transliteration">Orthography + transliteration help</option>
                <option value="orthography_only">Orthography only</option>
              </select>
              <p className="mt-2 text-xs font-medium text-slate-400">
                Choose learner support level for Ga outputs.
              </p>
            </label>
          ) : null}

          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Visual Generation Settings</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm font-semibold text-slate-200">
                <span>Enable AI visuals</span>
                <input
                  type="checkbox"
                  checked={visualGenerationEnabled}
                  onChange={(event) => setVisualGenerationEnabled(event.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm font-semibold text-slate-200">
                <span>Require admin approval</span>
                <input
                  type="checkbox"
                  checked={requireVisualApproval}
                  onChange={(event) => setRequireVisualApproval(event.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
              </label>
              <label className="block text-sm font-bold text-slate-300">
                Default mode
                <select
                  value={visualGenerationMode}
                  onChange={(event) => setVisualGenerationMode(event.target.value as "none" | "planned_only" | "generate_now")}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="none">No visuals</option>
                  <option value="planned_only">Planned visuals only</option>
                  <option value="generate_now">Generate visuals now</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-300">
                Max visuals per lesson
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={maxVisualsPerLesson}
                  onChange={(event) => setMaxVisualsPerLesson(Math.max(0, Math.min(6, Number(event.target.value) || 0)))}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </label>
            </div>
            <label className="mt-3 block text-sm font-bold text-slate-300">
              Allowed subjects for visuals
              <select
                multiple
                value={effectiveVisualAllowedSubjects}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setVisualAllowedSubjects(values);
                }}
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {availableSubjects.map((option) => (
                  <option key={option} value={option}>{formatSubjectLabel(option)}</option>
                ))}
              </select>
            </label>
            {visualGenerationEnabled && visualGenerationMode === "generate_now" ? (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Estimated cost warning: enabling image generation can incur extra provider and storage costs.
              </p>
            ) : null}
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Topic / theme
            <select
              value={effectiveTopicChoice}
              onChange={(event) => {
                clearWeakAreaLink();
                setTopicChoice(event.target.value);
                if (event.target.value !== CUSTOM_TOPIC_VALUE) {
                  setCustomTopic("");
                }
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
            >
              {topicSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion}>{suggestion}</option>
              ))}
              <option value={CUSTOM_TOPIC_VALUE}>Custom topic</option>
            </select>
            {effectiveTopicChoice === CUSTOM_TOPIC_VALUE ? (
              <input
                value={customTopic}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setCustomTopic(event.target.value);
                }}
                placeholder="Type a custom topic/theme"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white placeholder:text-slate-600"
              />
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Activity type
              <input
                value={activityType}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setActivityType(event.target.value);
                }}
                placeholder="e.g. sentence correction"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white placeholder:text-slate-600"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Mastery outcome
              <input
                value={masteryOutcome}
                onChange={(event) => {
                  clearWeakAreaLink();
                  setMasteryOutcome(event.target.value);
                }}
                placeholder="e.g. apply apostrophes accurately"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white placeholder:text-slate-600"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => void generatePreview()} disabled={loading || !canGenerate} className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400 disabled:opacity-50">
              {loading ? "Generating with AI..." : "Generate Preview"}
            </button>
            <button onClick={saveGeneratedContent} disabled={saving || saveBlocked || !approvedCount || prefillBlockingWarnings.length > 0} className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-white hover:bg-emerald-400 disabled:opacity-50">
              {saving ? "Saving..." : saveBlocked ? "Fix required before save" : "Save to Content Library"}
            </button>
          </div>
          {(preview || generationMeta) && (saveBlocked || !approvedCount) ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {approvedCount > 0 ? saveBlockMessage : "Generate a valid preview before saving."}
            </p>
          ) : null}
          {requiresEnglishStrand && !englishStrand ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              Please choose an English strand before generating content.
            </p>
          ) : null}
          {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
          {loading ? (
            <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm text-indigo-100">
              {generationHeartbeat ? generationHeartbeat : generationPhase === "retrying-parse" ? "Retrying parse..."
                : generationPhase === "repairing-response" ? "Repairing response..."
                  : generationPhase === "validating-content" ? "Validating content..."
                    : "Generating content..."}
            </p>
          ) : null}
          {(generatedItemsList.length > 0 || generationMeta || error) ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-400">
              <p className="font-bold text-slate-300 mb-2">Diagnostic Info:</p>
              <ul className="space-y-1">
                <li><strong>Source:</strong> {generationContextSourceLabel(effectiveGenerationContext.source)}</li>
                <li><strong>AI Mode:</strong> {effectiveGenerationContext.aiMode}</li>
                <li><strong>Year Group:</strong> {effectiveGenerationContext.yearGroup}</li>
                <li><strong>Subject:</strong> {formatSubjectLabel(effectiveGenerationContext.subject)}</li>
                {effectiveGenerationContext.englishStrand ? <li><strong>English Strand:</strong> {effectiveGenerationContext.englishStrand}</li> : null}
                <li><strong>Skill Focus:</strong> {effectiveGenerationContext.skillFocus || "(none)"}</li>
                <li><strong>Topic/Theme:</strong> {effectiveGenerationContext.topic || "(none)"}</li>
                {effectiveGenerationContext.activityType ? <li><strong>Activity Type:</strong> {effectiveGenerationContext.activityType}</li> : null}
                {effectiveGenerationContext.masteryOutcome ? <li><strong>Mastery Outcome:</strong> {effectiveGenerationContext.masteryOutcome}</li> : null}
                <li><strong>Generation Type:</strong> {selectedGenerationTypeForContext || "(unknown)"}</li>
                {generationMeta?.providerUsed ? <li><strong>Provider Used:</strong> {generationMeta.providerUsed === "openai" ? "openai" : "local_fallback"}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>Generation Source:</strong> {generationMeta.generationMetadata.generationSource}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>Key Source:</strong> {generationMeta.generationMetadata.keySource}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>OpenAI attempted:</strong> {generationMeta.generationMetadata.openAiAttempted ? "Yes" : "No"}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>OpenAI succeeded:</strong> {generationMeta.generationMetadata.openAiSucceeded ? "Yes" : "No"}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>Fallback used:</strong> {generationMeta.generationMetadata.usedFallback ? "Yes" : "No"}</li> : null}
                {generationMeta?.generationMetadata ? <li><strong>Fallback reason:</strong> {generationMeta.generationMetadata.fallbackReason ?? "None"}</li> : null}
                <li><strong>Difficulty:</strong> {effectiveGenerationContext.difficulty}/5</li>
                <li><strong>Items Requested:</strong> {effectiveItemCount}{autoItemsEnabled ? " (auto)" : ""}</li>
                {generationMeta?.model ? <li><strong>Model:</strong> {generationMeta.model}</li> : null}
                {generationMeta?.fallback?.used ? <li><strong>Fallback:</strong> {generationMeta.fallback.reasonCode}</li> : null}
                {generationMeta?.fallbackReason ? <li><strong>Legacy fallback reason:</strong> {generationMeta.fallbackReason}</li> : null}
                {generationMeta?.validationReason ? <li><strong>Validation Reason:</strong> {generationMeta.validationReason}</li> : null}
                {generationMeta?.debug ? (
                  <>
                    <li><strong>Provider Attempted:</strong> {generationMeta.debug.providerAttempted ? "Yes" : "No"}</li>
                    <li><strong>OpenAI Key Found (server):</strong> {generationMeta.debug.openAiKeyFoundServerSide ? "Yes" : "No"}</li>
                    <li><strong>Mapping Status:</strong> {generationMeta.debug.mappingStatus}</li>
                    <li><strong>Subject Route:</strong> {generationMeta.debug.subjectRoute}</li>
                    <li><strong>Fallback Template:</strong> {generationMeta.debug.fallbackTemplate ?? "(none)"}</li>
                    {generationMeta.debug.scienceDiscipline ? <li><strong>Science Discipline:</strong> {generationMeta.debug.scienceDiscipline}</li> : null}
                    {generationMeta.debug.subjectContainment ? <li><strong>Subject Containment:</strong> {generationMeta.debug.subjectContainment}</li> : null}
                    {typeof generationMeta.debug.contaminatedItemsRepaired === "number" ? <li><strong>Contaminated Items Repaired:</strong> {generationMeta.debug.contaminatedItemsRepaired}</li> : null}
                    {typeof generationMeta.debug.contaminatedItemsRejected === "number" ? <li><strong>Contaminated Items Rejected:</strong> {generationMeta.debug.contaminatedItemsRejected}</li> : null}
                  </>
                ) : null}
                {generationMeta?.validation ? (
                  <>
                    <li><strong>API Valid:</strong> {generationMeta.validation.valid ? "✓" : "✗"}</li>
                    <li><strong>Repaired:</strong> {generationMeta.validation.repaired ? "Yes" : "No"}</li>
                    <li><strong>AI generated:</strong> {generationMeta.validation.aiGenerated === false ? "No" : "Yes"}</li>
                    <li><strong>Regenerated after validation:</strong> {generationMeta.validation.regeneratedAfterValidation ? "Yes" : "No"}</li>
                    <li><strong>Validation fallback used:</strong> {generationMeta.validation.fallbackUsed ? "Yes" : "No"}</li>
                    <li><strong>Year level match:</strong> {generationMeta.validation.yearLevelMatch === false ? "No" : "Yes"}</li>
                    <li><strong>Subject match:</strong> {generationMeta.validation.subjectMatch === false ? "No" : "Yes"}</li>
                    <li><strong>Skill/topic match:</strong> {generationMeta.validation.skillTopicMatch === false ? "No" : "Yes"}</li>
                    <li><strong>Difficulty match:</strong> {generationMeta.validation.difficultyMatch === false ? "No" : "Yes"}</li>
                    {generationMeta.validation.scienceDiscipline ? <li><strong>Science Discipline:</strong> {generationMeta.validation.scienceDiscipline}</li> : null}
                    {generationMeta.validation.subjectContainment ? <li><strong>Subject Containment:</strong> {generationMeta.validation.subjectContainment}</li> : null}
                    {typeof generationMeta.validation.contaminatedItemsRepaired === "number" ? <li><strong>Contaminated Items Repaired:</strong> {generationMeta.validation.contaminatedItemsRepaired}</li> : null}
                    {typeof generationMeta.validation.contaminatedItemsRejected === "number" ? <li><strong>Contaminated Items Rejected:</strong> {generationMeta.validation.contaminatedItemsRejected}</li> : null}
                    {generationMeta.validation.validationDiagnostics ? <li><strong>Validation Rejections:</strong> {(generationMeta.validation.validationDiagnostics.rejectionReasons ?? []).slice(0, 6).join(", ") || "none"}</li> : null}
                    {generationMeta.validation.validationDiagnostics ? <li><strong>Rejected Keywords:</strong> {(generationMeta.validation.validationDiagnostics.rejectedKeywords ?? []).join(", ") || "none"}</li> : null}
                    {generationMeta.validation.validationDiagnostics ? <li><strong>Subject Drift:</strong> {(generationMeta.validation.validationDiagnostics.detectedSubjectDrift ?? []).join(", ") || "none"}</li> : null}
                    {generationMeta.validation.rawOpenAiResponse ? <li><strong>OpenAI Response Meta:</strong> {JSON.stringify({ model: generationMeta.validation.rawOpenAiResponse.model, finishReason: generationMeta.validation.rawOpenAiResponse.finishReason, usage: generationMeta.validation.rawOpenAiResponse.usage, contentLength: generationMeta.validation.rawOpenAiResponse.contentLength })}</li> : null}
                    {generationMeta.validation.metadataDebug ? (
                      <>
                        <li><strong>Requested Metadata:</strong> {JSON.stringify(generationMeta.validation.metadataDebug.requestedMetadata)}</li>
                        <li><strong>Generated Metadata:</strong> {JSON.stringify(generationMeta.validation.metadataDebug.generatedMetadata ?? {})}</li>
                        <li><strong>Normalized Metadata:</strong> {JSON.stringify(generationMeta.validation.metadataDebug.normalizedMetadata ?? {})}</li>
                      </>
                    ) : null}
                  </>
                ) : null}
              </ul>
            </div>
          ) : null}
          {showDeveloperDetails && generationDiagnostics ? (
            <details className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-300">
              <summary className="cursor-pointer font-bold uppercase tracking-[0.16em] text-slate-200">Developer Diagnostics</summary>
              <ul className="mt-2 space-y-1">
                <li>Parse stage failed: {generationDiagnostics.parseStage}</li>
                <li>Backend status code: {generationDiagnostics.statusCode}</li>
                <li>Content-Type: {generationDiagnostics.contentType || "(none)"}</li>
                <li>Diagnostic reason: {generationDiagnostics.reason || "none"}</li>
                <li>Provider/model: {generationDiagnostics.provider || "openai"}/{generationDiagnostics.model || generationMeta?.model || "unknown"}</li>
                {generationDiagnostics.requestTuple ? <li>Request tuple: {JSON.stringify(generationDiagnostics.requestTuple)}</li> : null}
              </ul>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs">{generationDiagnostics.rawResponse}</pre>
            </details>
          ) : null}
          {message ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              <p>{message}</p>
              <Link href="/admin/content-library" className="mt-3 inline-flex rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white">
                View in Content Library
              </Link>
              {savedContentId && targetStudentId ? <p className="mt-2 text-xs text-emerald-100">Assigned content {savedContentId} to targeted learner.</p> : null}
            </div>
          ) : null}
        </div>
      </AdminSectionCard>
      </div>

      <div className="space-y-6 pb-24 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto xl:pr-1">
      <AdminSectionCard title={isStudentInterventionMode ? "AI Intervention Engine" : "Content Library Tools"} eyebrow={isStudentInterventionMode ? "Student intervention mode" : "General content mode"}>
        {isStudentInterventionMode ? (
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <select
              value={weakAreaKeyStageFilter}
              aria-label="Filter weak areas by key stage"
              onChange={(event) => {
                const nextStage = event.target.value;
                setWeakAreaKeyStageFilter(nextStage);
                if (!nextStage) {
                  setWeakAreaYearGroupFilter("");
                  return;
                }
                const options = yearGroupsForKeyStage(nextStage);
                setWeakAreaYearGroupFilter((current) => options.includes(current as (typeof YEAR_GROUPS)[number]) ? current : "");
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
              title="Filter weak areas by key stage"
            >
              <option value="">All key stages</option>
              {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
            <select
              value={weakAreaYearGroupFilter}
              aria-label="Filter weak areas by year group"
              onChange={(event) => {
                const nextYear = event.target.value;
                setWeakAreaYearGroupFilter(nextYear);
                if (nextYear) {
                  setWeakAreaKeyStageFilter(keyStageForYearGroup(nextYear));
                }
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
              title="Filter weak areas by year group"
            >
              <option value="">All year groups</option>
              {(weakAreaKeyStageFilter ? yearGroupsForKeyStage(weakAreaKeyStageFilter) : [...YEAR_GROUPS]).map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
            <select
              value={weakAreaSubjectFilter}
              aria-label="Filter weak areas by subject scope"
              onChange={(event) => setWeakAreaSubjectFilter(event.target.value as "manual" | "all")}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
              title="Filter weak areas by subject scope"
            >
              <option value="manual">Match manual form subject/year/key stage</option>
              <option value="all">All subjects</option>
            </select>
          </div>
        ) : (
          <p className="mb-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-300">
            Student weak-area interventions are available from a student profile or intervention dashboard.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void runAutomation("autofill")}
            disabled={automationLoading !== null}
            className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white disabled:opacity-60"
          >
            {automationLoading === "autofill" ? "Running..." : "Auto-fill Starter Library"}
          </button>
          {isStudentInterventionMode ? (
            <button
              onClick={() => void runAutomation("weaknesses")}
              disabled={automationLoading !== null}
              className="rounded-xl border border-slate-700 px-4 py-3 font-black text-slate-200 disabled:opacity-60"
            >
              {automationLoading === "weaknesses" ? "Scanning..." : "Detect Weak Areas"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runAutomation("library-gaps")}
              disabled={automationLoading !== null}
              className="rounded-xl border border-blue-500/60 px-4 py-3 text-sm font-black text-blue-200 disabled:opacity-60"
            >
              {automationLoading === "library-gaps" ? "Checking..." : "Detect Library Gaps"}
            </button>
          )}
          <Link href="/admin/content-library" className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-black text-slate-200">View Content Library</Link>
          {isStudentInterventionMode ? (
            <button
              type="button"
              onClick={reviewDetectedWeakAreas}
              disabled={automationLoading !== null || !weakAreas.length}
              className="rounded-xl border border-blue-500/60 px-4 py-3 text-sm font-black text-blue-200 disabled:opacity-60"
              title={weakAreas.length ? "Review detected weak-area cards" : "Run Detect Weak Areas first."}
            >
              Review / Generate Weak-Area Support
            </button>
          ) : null}
        </div>
        {isStudentInterventionMode && !weakAreas.length ? (
          <p className="mt-3 text-xs font-semibold text-slate-400">Run Detect Weak Areas first.</p>
        ) : null}
        {isStudentInterventionMode && weakAreas.length ? (
          <div className="mt-4 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">
            <p className="font-black">{weakAreas.length} weak areas tracked.</p>
            <p className="mt-1">{visibleWeakAreas.length} visible with current filter.</p>
            {hiddenWeakAreaCount > 0 ? (
              <p className="mt-1 text-cyan-50">Switch to All subjects to review all detected weak areas.</p>
            ) : null}
          </div>
        ) : null}
        {automationLoading ? <p className="mt-3 text-xs text-slate-400">Processing automation request...</p> : null}
        {automationMessage ? <p className="mt-4 text-sm text-slate-400">{automationMessage}</p> : null}
        {automationStatus ? (
          <div className={`mt-4 rounded-2xl border p-4 ${automationStatus.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"}`}>
            <p className={`text-sm font-black ${automationStatus.ok ? "text-emerald-100" : "text-rose-100"}`}>{automationStatus.title}</p>
            {automationDurationLabel ? <p className="mt-1 text-xs text-slate-300">Duration: {automationDurationLabel}</p> : null}
            <div className="mt-2 space-y-1 text-sm text-slate-200">
              {automationStatus.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {!automationStatus.ok && automationRetryMode ? (
              <button
                type="button"
                onClick={() => void runAutomation(automationRetryMode)}
                className="mt-3 rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-slate-100"
              >
                Retry
              </button>
            ) : null}
            {showDeveloperDetails && automationDebugPayload ? (
              <details className="mt-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Developer Details</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-300">{automationDebugPayload}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        {isStudentInterventionMode && weakAreas.length ? (
          <div ref={weakAreaActionsRef} tabIndex={-1} className="mt-4 scroll-mt-24 outline-none">
            <div className="mb-3">
              <p className="text-sm font-black text-white">Detected Weak-Area Actions</p>
              <p className="mt-1 text-xs text-slate-400">
                Use these cards to generate targeted support. Each generation updates the preview only; save it after review.
              </p>
            </div>
            {visibleWeakAreas.length ? (
              <div className="space-y-3">
                {visibleWeakAreas.slice(0, 8).map(({ area, contextMatches }, index) => (
                  <div key={`${area.id}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">Detected Weak Area</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">Student: {area.student.name}</p>
                        <p className="text-xs text-slate-300">Subject: {formatSubjectLabel(area.subject)}</p>
                        <p className="text-xs text-slate-300">Weak topic: {formatFriendlyTopic(area.skillFocus)}</p>
                        <p className="text-xs text-slate-300">Accuracy: {area.accuracy}%</p>
                        <p className="mt-2 text-xs text-cyan-200">{toTitleCaseWords(formatSubjectLabel(area.subject))} · {toTitleCaseWords(formatFriendlyTopic(area.skillFocus))} Intervention</p>
                        <p className="text-xs text-cyan-200">{area.accuracy}% accuracy detected</p>
                        <p className="text-xs text-cyan-200">Targeted support recommended</p>
                        <p className="mt-2 text-xs text-amber-200">This intervention is based on detected weak-area data, not the manual form above.</p>
                        {!contextMatches ? (
                          <p className="mt-2 text-xs text-rose-300">Weak-area context does not match the current manual form. Interventions here will still use the weak-area subject.</p>
                        ) : null}
                        {loadedWeakAreaId === area.id ? (
                          <p className={`mt-2 text-xs ${weakAreaFormSynced ? "text-emerald-300" : "text-slate-400"}`}>
                            {weakAreaFormSynced
                              ? "Loaded into manual generator."
                              : "Previously loaded into manual generator. Manual form has changed since load."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => applyWeakArea(area)}
                        className="rounded-xl border border-indigo-400/70 px-3 py-2 text-xs font-black text-indigo-100"
                      >
                        Load into generator
                      </button>
                      <button
                        onClick={() => void generateInterventionFromWeakArea(area)}
                        className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white"
                      >
                        Generate Weak-Area Support
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
                No weak-area cards match the current manual form context. Switch intervention filter to &quot;All subjects&quot; to review every weak area.
              </p>
            )}
          </div>
        ) : null}
      </AdminSectionCard>

      <div ref={previewPanelRef} className="scroll-mt-24">
      <AdminSectionCard title="Generated Preview" eyebrow="Review">
        {preview ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Title</p>
                <p className="mt-2 font-bold text-white">{preview.title}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Topic</p>
                <p className="mt-2 font-bold text-white">{previewTitle || "Mapped topic required"}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Quality</p>
                {typeof preview.qualityScore === "number" && preview.qualityStatus === "scored" ? (
                  <p className="mt-2 text-2xl font-black text-emerald-300">{preview.qualityScore}%</p>
                ) : (
                  <>
                    <p className="mt-2 text-lg font-black text-amber-200">Pending review</p>
                    <p className="mt-1 text-xs text-slate-400">Not scored yet</p>
                  </>
                )}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Safety</p>
                <p className="mt-2 font-bold text-emerald-300">{preview.safetyStatus}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Approved</p>
                <p className="mt-2 text-2xl font-black text-white">{approvedCount}/{preview.items.length}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${previewBadge.className}`}>
                {previewBadge.label}
              </span>
              {providerStatusBadge ? (
                <span className={`rounded-full px-3 py-1 text-xs font-black ${providerStatusBadge.className}`}>
                  {providerStatusBadge.label}
                </span>
              ) : null}
              {generationSourceLabel ? (
                <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-black text-cyan-200">
                  {generationSourceLabel}
                </span>
              ) : null}
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-200">
                Source: {generationContextSourceLabel(effectiveGenerationContext.source)}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-black text-slate-200">
                Subject: {formatSubjectLabel(effectiveGenerationContext.subject)}
              </span>
              {generationMeta?.validation?.repaired ? (
                <span className="text-sm text-slate-400">
                  Auto-repaired before preview ({generationMeta.validation.fixesApplied.length || generationMeta.validation.errors.length} item fixes).
                </span>
              ) : null}
            </div>

            {blackBoxDifficultyWarnings.length ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-bold">Black Box difficulty warning</p>
                <div className="mt-2 space-y-1 text-xs sm:text-sm">
                  {blackBoxDifficultyWarnings.slice(0, 3).map((warning) => (
                    <p key={`${warning.index}-${warning.estimatedLevel}`}>
                      Question {warning.index + 1}: Black Box estimated this as Level {warning.estimatedLevel}. Regenerate or apply recommendation before saving.
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Auto voice script</span>
                <textarea
                  value={preview.voiceScript}
                  onChange={(event) => setPreview((current) => current ? { ...current, voiceScript: event.target.value } : current)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
                />
                <input
                  type="file"
                  accept="audio/*"
                  disabled={assetUploadBusy !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void uploadGeneratedAsset(file, "audio");
                    event.currentTarget.value = "";
                  }}
                  className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:font-bold file:text-white"
                />
              </label>
              <label className="block rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Image prompt</span>
                <textarea
                  value={preview.imagePrompt}
                  onChange={(event) => setPreview((current) => current ? { ...current, imagePrompt: event.target.value } : current)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
                />
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={assetUploadBusy !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void uploadGeneratedAsset(file, "image");
                    event.currentTarget.value = "";
                  }}
                  className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:font-bold file:text-white"
                />
              </label>
            </div>

            {phonicsMismatchDetected ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
                <p className="font-bold">Phonics-stage mismatch detected.</p>
                <p className="mt-1 text-xs text-rose-100/90">Some generated words exceeded the selected phonics stage and were automatically rejected/regenerated.</p>
              </div>
            ) : null}

            {generationMeta?.generationMetadata?.generationSource === "openai" || generationMeta?.generationMetadata?.generationSource === "repair" ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <p className="font-bold">Generated by OpenAI.</p>
              </div>
            ) : null}

            {generationMeta?.generationMetadata?.generationSource === "fallback" ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-bold">Generated using fallback{generationMeta.generationMetadata.fallbackReason ? `: ${generationMeta.generationMetadata.fallbackReason}.` : "."}</p>
                <p className="mt-1 text-xs text-amber-100/90">{generationMeta.fallback?.message ?? "Fallback mode was used for this preview."}</p>
              </div>
            ) : null}

            <div className={`rounded-2xl border p-3 text-sm ${generationMeta?.validation?.repaired ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
              {generationMeta?.validation?.repaired ? (
                <>
                  <p className="font-bold">Auto-repair applied before preview.</p>
                  <div className="mt-2 space-y-1 text-xs sm:text-sm">
                    {(generationMeta.validation.fixesApplied.length ? generationMeta.validation.fixesApplied : generationMeta.validation.errors.map(formatRepairMessage)).map((item, index) => (
                      <p key={`${item}-${index}`}>- {item}</p>
                    ))}
                    {generationMeta.validation.cached ? <p>- Loaded from cache</p> : null}
                    <p className="pt-1 font-semibold">Final set: {generationMeta.validation.finalCount} valid {effectiveGenerationContext.skillFocus} items</p>
                  </div>
                </>
              ) : (
                <p className="font-bold">{formatAiGeneratorValidationSuccessMessage(effectiveGenerationContext.subject, effectiveGenerationContext.skillFocus)}</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Planned Visual Assets</p>
              <p className="mt-1 text-xs text-slate-500">Visuals are optional. Failed visuals do not block lesson save.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void generateAllVisualAssetsNow()}
                  disabled={visualBatchBusy || !preview.visualAssets?.length}
                  className="rounded-lg border border-cyan-500/50 px-3 py-1.5 text-xs font-black text-cyan-100 disabled:opacity-60"
                >
                  {visualBatchBusy ? "Generating visuals..." : "Generate / Regenerate visuals now"}
                </button>
              </div>
              {preview.visualAssets?.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {preview.visualAssets.map((asset) => (
                    <article key={asset.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      {asset.imageUrl ? (
                        <Image src={asset.imageUrl} alt={asset.altText} width={640} height={320} className="mb-2 h-40 w-full rounded-lg border border-slate-800 object-cover" unoptimized />
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-white">{asset.title}</p>
                        <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[10px] font-black uppercase text-cyan-200">{asset.type}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-300"><span className="font-semibold text-slate-200">Alt text:</span> {asset.altText}</p>
                      <p className="mt-1 text-xs text-slate-400"><span className="font-semibold text-slate-200">Prompt:</span> {asset.prompt}</p>
                      <p className="mt-2 text-[11px] text-amber-200">Status: {asset.status}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Provider: {asset.provider ?? "pending"}</p>
                      {asset.error ? <p className="mt-1 text-[11px] text-rose-300">Error: {asset.error}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={visualAssetActionId === asset.id}
                          onClick={() => void applyVisualAssetAction(asset.id, "generate")}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-200 disabled:opacity-60"
                        >
                          {visualAssetActionId === asset.id ? "Working..." : "Generate image"}
                        </button>
                        <button
                          type="button"
                          disabled={visualAssetActionId === asset.id}
                          onClick={() => void applyVisualAssetAction(asset.id, "regenerate")}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-200 disabled:opacity-60"
                        >
                          Regenerate
                        </button>
                        <button
                          type="button"
                          disabled={visualAssetActionId === asset.id}
                          onClick={() => void applyVisualAssetAction(asset.id, "remove")}
                          className="rounded-lg border border-rose-500/50 px-2 py-1 text-[11px] font-black text-rose-200 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No visual assets planned for this preview.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {preview.items.map((item, index) => (
                <article key={`${String(item.id ?? "item")}-${index}`} className={`relative z-10 flex min-h-0 flex-col rounded-2xl border p-3 ${item.status === "rejected" ? "border-rose-500/40 bg-rose-950/30 opacity-70" : item.status === "approved" ? "border-emerald-500/35 bg-emerald-950/20" : "border-amber-500/30 bg-amber-950/20"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {effectiveGenerationContext.subject === "spelling" ? `${String((item as SpellingPreviewItem).emoji ?? "🔤")} ${String((item as SpellingPreviewItem).word ?? item.prompt ?? "")}` : String(item.prompt ?? item.question ?? item.title ?? `Item ${index + 1}`)}
                    </h3>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-blue-200">Item {index + 1}</span>
                  </div>
                  <p className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.status === "approved" ? "bg-emerald-500/20 text-emerald-200" : item.status === "rejected" ? "bg-rose-500/20 text-rose-200" : "bg-amber-500/20 text-amber-200"}`}>
                    {item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending"}
                  </p>
                  {typeof item.phonicsStage === "string" ? (
                    <p className="mt-1 inline-flex w-fit rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                      {String(item.phonicsStage)}
                    </p>
                  ) : null}
                  {Boolean(item.visualRequired) ? (
                    <p className="mt-1 inline-flex w-fit rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100">
                      Visual required: {String(item.visualType ?? "diagram")}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-3 text-xs text-slate-300">{String(item.hint ?? item.explanation ?? "Review this item before saving.")}</p>
                  <p className="mt-1 line-clamp-3 text-xs text-slate-400">{String(item.sentence ?? item.sentenceContext ?? item.passage ?? "")}</p>
                  {typeof item.spellingPattern === "string" && item.spellingPattern ? (
                    <p className="mt-1 text-[11px] text-cyan-200">Pattern: {String(item.spellingPattern)}</p>
                  ) : null}
                  {typeof item.whyItMatchesSkill === "string" && item.whyItMatchesSkill ? (
                    <p className="mt-1 text-[11px] text-slate-300">Why this matches: {String(item.whyItMatchesSkill)}</p>
                  ) : null}
                  {typeof item.validationLevel === "string" ? (
                    <p className="mt-1 text-[11px] text-amber-200">Validation level: {String(item.validationLevel)}</p>
                  ) : null}
                  {typeof item.visualPrompt === "string" && item.visualPrompt ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-violet-200">Visual prompt: {String(item.visualPrompt)}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => markPreviewItem(index, "approved")} className={`min-w-24 flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black text-white ${item.status === "approved" ? "bg-emerald-400 ring-2 ring-emerald-200" : "bg-emerald-500 hover:bg-emerald-400"}`}>Approve</button>
                    <button type="button" onClick={() => markPreviewItem(index, "rejected")} className={`min-w-24 flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black text-white ${item.status === "rejected" ? "bg-rose-400 ring-2 ring-rose-200" : "bg-rose-500 hover:bg-rose-400"}`}>Reject</button>
                    <button type="button" onClick={() => void regenerateItem(index)} className="min-w-24 flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] font-black text-slate-200">Regenerate</button>
                  </div>
                  <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                    <summary className="cursor-pointer text-xs font-bold text-slate-300">Preview details</summary>
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-300">
                      {typeof item.answer !== "undefined" ? <p><span className="font-semibold text-slate-200">Answer:</span> {String(item.answer)}</p> : null}
                      {Array.isArray(item.options) && item.options.length ? <p><span className="font-semibold text-slate-200">Options:</span> {item.options.map((option) => String(option)).join(", ")}</p> : null}
                      {typeof item.explanation === "string" && item.explanation ? <p><span className="font-semibold text-slate-200">Explanation:</span> {item.explanation}</p> : null}
                      {typeof item.hint === "string" && item.hint ? <p><span className="font-semibold text-slate-200">Hint:</span> {item.hint}</p> : null}
                      {typeof item.visualType === "string" && item.visualType ? <p><span className="font-semibold text-slate-200">Visual type:</span> {item.visualType}</p> : null}
                      {typeof item.visualPrompt === "string" && item.visualPrompt ? <p><span className="font-semibold text-slate-200">Visual prompt:</span> {item.visualPrompt}</p> : null}
                      {typeof item.visualAltText === "string" && item.visualAltText ? <p><span className="font-semibold text-slate-200">Visual alt text:</span> {item.visualAltText}</p> : null}
                    </div>
                  </details>
                  {showDeveloperDetails ? (
                    <details className="mt-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-slate-300">Developer Details</summary>
                      <textarea
                        value={JSON.stringify(item, null, 2)}
                        onChange={(event) => updatePreviewItemJson(index, event.target.value)}
                        className="mt-2 min-h-28 w-full rounded-xl border border-slate-800 bg-slate-900 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-300 outline-none"
                      />
                    </details>
                  ) : null}
                </article>
              ))}
            </div>

            {showDeveloperDetails && generationMeta ? (
              <details className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Developer Details</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-300">
                  {JSON.stringify(generationMeta, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-8 text-center text-sm text-slate-400">
            Spelling words, maths questions, reading passages, comprehension questions and prompts will appear here.
          </div>
        )}
      </AdminSectionCard>
      </div>
      </div>
    </div>
  );
}
