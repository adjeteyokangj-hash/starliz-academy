import { encodeUniversalPrefillContract, type UniversalAiPrefillContract } from "@/lib/ai-prefill-contract";

export type AiGeneratorHandoffParams = {
  studentId?: string | null;
  subject?: string | null;
  skill?: string | null;
  strand?: string | null;
  englishStrand?: string | null;
  topic?: string | null;
  activityType?: string | null;
  masteryOutcome?: string | null;
  source?: string | null;
  weakAreaId?: string | null;
  yearGroup?: string | null;
  keyStage?: string | null;
  difficulty?: number | string | null;
  itemCount?: number | string | null;
  prefillContract?: UniversalAiPrefillContract | string | null;
};

const AI_GENERATOR_PATH = "/admin/ai-generator";
const ENGLISH_STRANDS = new Set(["phonics", "spelling", "reading", "grammar", "punctuation", "writing", "vocabulary"]);

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function cleanPositiveNumber(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? String(numberValue) : null;
}

function normalizeToken(value: string | null | undefined): string | null {
  const cleaned = cleanText(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || null;
}

export function buildAiGeneratorUrl(params: AiGeneratorHandoffParams): string {
  const query = new URLSearchParams();
  if (params.prefillContract) {
    const serialized = typeof params.prefillContract === "string"
      ? params.prefillContract
      : encodeUniversalPrefillContract(params.prefillContract);
    if (serialized.trim()) {
      query.set("prefillContract", serialized.trim());
    }
  }
  const normalizedSubject = normalizeToken(params.subject);
  const normalizedStrand = normalizeToken(params.englishStrand) ?? normalizeToken(params.strand);
  const subjectIsEnglishStrand = Boolean(normalizedSubject && ENGLISH_STRANDS.has(normalizedSubject));
  const strandIsEnglishStrand = Boolean(normalizedStrand && ENGLISH_STRANDS.has(normalizedStrand));
  const subjectIsEnglishParent = normalizedSubject === "english" || normalizedSubject === "english-language";
  const englishStrand = strandIsEnglishStrand
    ? normalizedStrand
    : subjectIsEnglishStrand
      ? normalizedSubject
      : null;

  if (englishStrand && (subjectIsEnglishStrand || subjectIsEnglishParent)) {
    query.set("subject", "english-language");
    query.set("strand", englishStrand);
    query.set("englishStrand", englishStrand);
  }

  const textFields: Array<keyof AiGeneratorHandoffParams> = [
    "studentId",
    "subject",
    "skill",
    "strand",
    "englishStrand",
    "topic",
    "activityType",
    "masteryOutcome",
    "source",
    "weakAreaId",
    "yearGroup",
    "keyStage",
  ];

  for (const field of textFields) {
    if (query.has(field)) continue;
    const value = cleanText(params[field] as string | null | undefined);
    if (value) query.set(field, value);
  }

  const difficulty = cleanPositiveNumber(params.difficulty);
  if (difficulty) query.set("difficulty", difficulty);

  const itemCount = cleanPositiveNumber(params.itemCount);
  if (itemCount) query.set("itemCount", itemCount);

  const queryString = query.toString();
  return queryString ? `${AI_GENERATOR_PATH}?${queryString}` : AI_GENERATOR_PATH;
}
