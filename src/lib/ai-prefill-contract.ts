import type { AiGenerationMode } from "@/lib/admin-ai-generation-meta";
import {
  AGE_GROUPS,
  KEY_STAGES,
  YEAR_GROUPS,
  curriculumPathwayForYearGroup,
  keyStageForYearGroup,
  ageGroupForYearGroup,
  normalizeYearGroup,
  type Subject,
  type YearGroup,
} from "@/lib/curriculum";

export type PrefillTrigger = "manual" | "student-target";

export type PrefillSource =
  | "student"
  | "prediction"
  | "school"
  | "country-profile"
  | "curriculum"
  | "placement"
  | "weak-area"
  | "heartbeat"
  | "recommendation"
  | "academic-intelligence"
  | "policy"
  | "legacy-query"
  | "manual"
  | "fallback";

export type PrefillConfidence = "high" | "medium" | "low";

export type PrefillFieldName =
  | "yearGroup"
  | "keyStage"
  | "ageGroup"
  | "subject"
  | "englishStrand"
  | "skillFocus"
  | "topic"
  | "activityType"
  | "masteryOutcome"
  | "curriculumPathway"
  | "countryRegion"
  | "curriculumFramework"
  | "schoolPreferredGcseBoard"
  | "examBoard"
  | "examBoardSource"
  | "difficulty"
  | "itemCount"
  | "aiMode"
  | "visualGenerationEnabled"
  | "visualGenerationMode"
  | "maxVisualsPerLesson"
  | "visualAllowedSubjects"
  | "requireVisualApproval";

export type ResolvedPrefillField<T> = {
  value: T;
  source: PrefillSource;
  confidence: PrefillConfidence;
  fallbackApplied?: boolean;
  note?: string;
};

export type UniversalAiPrefillContract = {
  version: 1;
  trigger: PrefillTrigger;
  studentId?: string | null;
  weakAreaId?: string | null;
  reason?: string | null;
  signal?: string | null;
  fields: Partial<Record<PrefillFieldName, ResolvedPrefillField<unknown>>>;
  warnings?: string[];
  blockingIssues?: string[];
};

export type LegacyAiGeneratorPrefill = {
  studentId: string | null;
  subject: string | null;
  skill: string | null;
  englishStrand: string | null;
  strand: string | null;
  topic: string | null;
  activityType: string | null;
  masteryOutcome: string | null;
  source: string | null;
  weakAreaId: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  difficulty: number | null;
  itemCount: number | null;
};

export type UniversalPrefillResolverInput = {
  contract: UniversalAiPrefillContract | null;
  legacy: LegacyAiGeneratorPrefill;
  availableSubjectsForYear: (year: YearGroup) => readonly Subject[];
  normalizeSubject: (value: string | null | undefined) => Subject | null;
  isEnglishParentSubject: (value: Subject) => boolean;
  normalizeEnglishStrand: (value: string | null) => string | null;
  deriveSkillFromEnglishStrand: (strand: string | "", year: YearGroup, subject: Subject) => string;
  availableSkillsForSubjectAndYear: (subject: Subject, year: YearGroup) => readonly string[];
};

export type UniversalPrefillResolvedValues = {
  trigger: PrefillTrigger;
  studentId: string | null;
  weakAreaId: string | null;
  reason: string | null;
  signal: string | null;
  yearGroup: YearGroup | null;
  keyStage: (typeof KEY_STAGES)[number] | null;
  ageGroup: (typeof AGE_GROUPS)[number] | null;
  subject: Subject | null;
  englishStrand: string;
  skillFocus: string;
  topic: string;
  activityType: string;
  masteryOutcome: string;
  curriculumPathway: string | null;
  countryRegion: string;
  curriculumFramework: string;
  schoolPreferredGcseBoard: string;
  examBoard: string;
  examBoardSource: "auto" | "manual" | "school_default";
  difficulty: number;
  itemCount: number | null;
  aiMode: AiGenerationMode;
  visualGenerationEnabled: boolean;
  visualGenerationMode: "none" | "planned_only" | "generate_now";
  maxVisualsPerLesson: number;
  visualAllowedSubjects: string[];
  requireVisualApproval: boolean;
};

export type UniversalPrefillResolution = {
  values: UniversalPrefillResolvedValues;
  assumptions: string[];
  blockingWarnings: string[];
  fieldSources: Partial<Record<PrefillFieldName, PrefillSource>>;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function toBoundedInt(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function getFieldValue<T>(
  contract: UniversalAiPrefillContract | null,
  field: PrefillFieldName,
): { value: T | null; source: PrefillSource | null } {
  const row = contract?.fields?.[field] as ResolvedPrefillField<T> | undefined;
  if (!row) return { value: null, source: null };
  return { value: row.value ?? null, source: row.source ?? null };
}

function isTriggerFromStudent(source: string | null): boolean {
  return source === "student-profile" || source === "weak-area";
}

export function adaptLegacyQueryToContract(legacy: LegacyAiGeneratorPrefill): UniversalAiPrefillContract | null {
  const hasAnyLegacyTarget = Boolean(
    legacy.studentId
    || legacy.subject
    || legacy.skill
    || legacy.topic
    || legacy.activityType
    || legacy.masteryOutcome
    || legacy.yearGroup
    || legacy.keyStage
    || legacy.difficulty
    || legacy.itemCount
  );
  if (!hasAnyLegacyTarget) return null;

  const fields: UniversalAiPrefillContract["fields"] = {};
  if (legacy.yearGroup) {
    fields.yearGroup = { value: legacy.yearGroup, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.keyStage) {
    fields.keyStage = { value: legacy.keyStage, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.subject) {
    fields.subject = { value: legacy.subject, source: "legacy-query", confidence: "medium" };
  }
  const englishStrand = legacy.englishStrand ?? legacy.strand;
  if (englishStrand) {
    fields.englishStrand = { value: englishStrand, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.skill) {
    fields.skillFocus = { value: legacy.skill, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.topic) {
    fields.topic = { value: legacy.topic, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.activityType) {
    fields.activityType = { value: legacy.activityType, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.masteryOutcome) {
    fields.masteryOutcome = { value: legacy.masteryOutcome, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.difficulty) {
    fields.difficulty = { value: legacy.difficulty, source: "legacy-query", confidence: "medium" };
  }
  if (legacy.itemCount) {
    fields.itemCount = { value: legacy.itemCount, source: "legacy-query", confidence: "medium" };
  }

  return {
    version: 1,
    trigger: isTriggerFromStudent(legacy.source) ? "student-target" : "manual",
    studentId: legacy.studentId,
    weakAreaId: legacy.weakAreaId,
    signal: legacy.source,
    fields,
    warnings: [],
    blockingIssues: [],
  };
}

function base64UrlEncode(text: string): string {
  const base64 = typeof Buffer !== "undefined"
    ? Buffer.from(text, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(text)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padding = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + padding;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(normalized, "base64").toString("utf8");
  }
  return decodeURIComponent(escape(atob(normalized)));
}

export function encodeUniversalPrefillContract(contract: UniversalAiPrefillContract): string {
  return base64UrlEncode(JSON.stringify(contract));
}

export function decodeUniversalPrefillContract(raw: string | null | undefined): UniversalAiPrefillContract | null {
  const payload = cleanText(raw);
  if (!payload) return null;
  try {
    const decoded = base64UrlDecode(payload);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Partial<UniversalAiPrefillContract>;
    if (row.version !== 1) return null;
    if (row.trigger !== "manual" && row.trigger !== "student-target") return null;
    return {
      version: 1,
      trigger: row.trigger,
      studentId: cleanText(row.studentId),
      weakAreaId: cleanText(row.weakAreaId),
      reason: cleanText(row.reason),
      signal: cleanText(row.signal),
      fields: (row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)) ? row.fields : {},
      warnings: Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === "string") : [],
      blockingIssues: Array.isArray(row.blockingIssues) ? row.blockingIssues.filter((item): item is string => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

export function resolveUniversalPrefill(input: UniversalPrefillResolverInput): UniversalPrefillResolution {
  const assumptions: string[] = [];
  const blockingWarnings: string[] = [];
  const fieldSources: Partial<Record<PrefillFieldName, PrefillSource>> = {};

  const contract = input.contract;
  const legacy = input.legacy;
  const trigger: PrefillTrigger = contract?.trigger ?? (isTriggerFromStudent(legacy.source) ? "student-target" : "manual");

  const contractYear = getFieldValue<string>(contract, "yearGroup");
  const legacyYear = cleanText(legacy.yearGroup);
  const yearGroup = normalizeYearGroup(contractYear.value ?? legacyYear);
  if (contractYear.source) fieldSources.yearGroup = contractYear.source;
  else if (legacyYear) fieldSources.yearGroup = "legacy-query";

  if (!yearGroup && trigger === "student-target") {
    blockingWarnings.push("Student-triggered prefill is missing year group. Review required before generation.");
  }

  let keyStage = cleanText(String(getFieldValue<string>(contract, "keyStage").value ?? "")) as (typeof KEY_STAGES)[number] | "";
  const legacyKeyStage = cleanText(legacy.keyStage);
  if (!keyStage && legacyKeyStage) {
    keyStage = legacyKeyStage as (typeof KEY_STAGES)[number];
    fieldSources.keyStage = "legacy-query";
  }
  if (yearGroup) {
    const canonicalKeyStage = keyStageForYearGroup(yearGroup);
    if (keyStage && keyStage !== canonicalKeyStage) {
      assumptions.push(`Key stage ${keyStage} was corrected to ${canonicalKeyStage} to match ${yearGroup}.`);
      keyStage = canonicalKeyStage;
      fieldSources.keyStage = "curriculum";
    }
    if (!keyStage) {
      keyStage = canonicalKeyStage;
      fieldSources.keyStage = "curriculum";
    }
  }

  const ageGroup = yearGroup ? ageGroupForYearGroup(yearGroup) : null;
  const curriculumPathway = yearGroup ? curriculumPathwayForYearGroup(yearGroup) : null;

  const contractSubject = getFieldValue<string>(contract, "subject");
  const subjectToken = cleanText(contractSubject.value ?? legacy.subject);
  const normalizedSubject = input.normalizeSubject(subjectToken);
  if (contractSubject.source) fieldSources.subject = contractSubject.source;
  else if (legacy.subject) fieldSources.subject = "legacy-query";

  let subject: Subject | null = normalizedSubject;
  if (subject && yearGroup) {
    const allowed = input.availableSubjectsForYear(yearGroup);
    if (!allowed.includes(subject)) {
      const fallbackByFamily = allowed.find((candidate) => {
        const englishFamily = input.isEnglishParentSubject(subject as Subject) && input.isEnglishParentSubject(candidate);
        const scienceFamily = String(subject).includes("science") && String(candidate).includes("science");
        const mathFamily = String(subject).includes("math") && String(candidate).includes("math");
        return englishFamily || scienceFamily || mathFamily;
      }) ?? null;
      if (fallbackByFamily) {
        assumptions.push(`Subject ${subject} not valid for ${yearGroup}; mapped to ${fallbackByFamily}.`);
        subject = fallbackByFamily;
        fieldSources.subject = "fallback";
      } else if (trigger === "student-target") {
        blockingWarnings.push(`Subject ${subject} is invalid for ${yearGroup}. Review required.`);
      }
    }
  }

  const contractStrand = getFieldValue<string>(contract, "englishStrand");
  const normalizedEnglishStrand = input.normalizeEnglishStrand(contractStrand.value ?? legacy.englishStrand ?? legacy.strand);
  if (contractStrand.source) fieldSources.englishStrand = contractStrand.source;
  else if (legacy.englishStrand || legacy.strand) fieldSources.englishStrand = "legacy-query";

  let englishStrand = normalizedEnglishStrand ?? "";
  if (subject && input.isEnglishParentSubject(subject) && !englishStrand) {
    if (trigger === "student-target") {
      blockingWarnings.push("English strand is missing for student-targeted English generation. Review required.");
    } else {
      englishStrand = "reading";
      assumptions.push("English strand defaulted to reading for manual mode.");
      fieldSources.englishStrand = "fallback";
    }
  }

  const contractSkill = getFieldValue<string>(contract, "skillFocus");
  const legacySkill = cleanText(legacy.skill);
  let skillFocus = cleanText(contractSkill.value ?? legacySkill) ?? "";
  if (contractSkill.source) fieldSources.skillFocus = contractSkill.source;
  else if (legacySkill) fieldSources.skillFocus = "legacy-query";

  if (subject && yearGroup) {
    const mappedSubject = input.isEnglishParentSubject(subject) && englishStrand
      ? (input.normalizeSubject(englishStrand) ?? subject)
      : subject;
    const availableSkills = input.availableSkillsForSubjectAndYear(mappedSubject, yearGroup);
    if (!skillFocus || !availableSkills.includes(skillFocus)) {
      if (input.isEnglishParentSubject(subject) && englishStrand) {
        const derived = input.deriveSkillFromEnglishStrand(englishStrand, yearGroup, subject);
        if (derived && availableSkills.includes(derived)) {
          if (!skillFocus) {
            assumptions.push(`Skill focus derived from English strand ${englishStrand}.`);
          } else {
            assumptions.push(`Skill focus ${skillFocus} invalid for ${yearGroup}; mapped from strand ${englishStrand}.`);
          }
          skillFocus = derived;
          fieldSources.skillFocus = "fallback";
        }
      }
      if ((!skillFocus || !availableSkills.includes(skillFocus)) && availableSkills.length > 0) {
        if (trigger === "student-target") {
          blockingWarnings.push("Skill focus is missing or invalid for student-targeted generation. Review required.");
        } else {
          skillFocus = availableSkills[0] ?? "";
          assumptions.push("Skill focus defaulted to first available manual option.");
          fieldSources.skillFocus = "fallback";
        }
      }
    }
  }

  if (subject && input.isEnglishParentSubject(subject) && englishStrand === "grammar" && /phonics/i.test(skillFocus)) {
    blockingWarnings.push("English Grammar target cannot silently fall back to phonics skill focus.");
  }

  const topic = cleanText(String(getFieldValue<string>(contract, "topic").value ?? legacy.topic ?? "")) ?? "";
  if (topic) {
    fieldSources.topic = getFieldValue<string>(contract, "topic").source ?? "legacy-query";
  }

  const activityType = cleanText(String(getFieldValue<string>(contract, "activityType").value ?? legacy.activityType ?? "")) ?? "";
  if (activityType) {
    fieldSources.activityType = getFieldValue<string>(contract, "activityType").source ?? "legacy-query";
  }

  const masteryOutcome = cleanText(String(getFieldValue<string>(contract, "masteryOutcome").value ?? legacy.masteryOutcome ?? "")) ?? "";
  if (masteryOutcome) {
    fieldSources.masteryOutcome = getFieldValue<string>(contract, "masteryOutcome").source ?? "legacy-query";
  }

  const countryRegion = cleanText(String(getFieldValue<string>(contract, "countryRegion").value ?? "")) ?? "UK";
  if (countryRegion === "UK") {
    assumptions.push("Country/region defaulted to UK.");
  }
  fieldSources.countryRegion = getFieldValue<string>(contract, "countryRegion").source ?? "fallback";

  const curriculumFramework = cleanText(String(getFieldValue<string>(contract, "curriculumFramework").value ?? "")) ?? "National Curriculum England";
  if (curriculumFramework === "National Curriculum England") {
    assumptions.push("Curriculum framework defaulted to National Curriculum England.");
  }
  fieldSources.curriculumFramework = getFieldValue<string>(contract, "curriculumFramework").source ?? "fallback";

  const schoolPreferredGcseBoard = cleanText(String(getFieldValue<string>(contract, "schoolPreferredGcseBoard").value ?? "")) ?? "";
  if (schoolPreferredGcseBoard) fieldSources.schoolPreferredGcseBoard = getFieldValue<string>(contract, "schoolPreferredGcseBoard").source ?? "school";

  const examBoard = cleanText(String(getFieldValue<string>(contract, "examBoard").value ?? "")) ?? "";
  if (examBoard) fieldSources.examBoard = getFieldValue<string>(contract, "examBoard").source ?? "recommendation";

  const examBoardSourceRaw = cleanText(String(getFieldValue<string>(contract, "examBoardSource").value ?? ""));
  const examBoardSource: "auto" | "manual" | "school_default" =
    examBoardSourceRaw === "manual" || examBoardSourceRaw === "school_default" ? examBoardSourceRaw : "auto";

  const difficulty = toBoundedInt(getFieldValue<number>(contract, "difficulty").value ?? legacy.difficulty ?? 2, 1, 5) ?? 2;
  if (!getFieldValue<number>(contract, "difficulty").value && !legacy.difficulty) {
    assumptions.push("Difficulty defaulted to 2.");
  }

  const itemCount = toBoundedInt(getFieldValue<number>(contract, "itemCount").value ?? legacy.itemCount, 1, 10);

  const aiModeRaw = cleanText(String(getFieldValue<string>(contract, "aiMode").value ?? ""));
  const aiMode: AiGenerationMode = aiModeRaw === "openai_with_fallback" || aiModeRaw === "fallback_only" ? aiModeRaw : "live_openai_only";

  const visualGenerationEnabled = toBoolean(getFieldValue<boolean>(contract, "visualGenerationEnabled").value) ?? false;
  const visualModeRaw = cleanText(String(getFieldValue<string>(contract, "visualGenerationMode").value ?? ""));
  const visualGenerationMode: "none" | "planned_only" | "generate_now" =
    visualModeRaw === "none" || visualModeRaw === "generate_now" ? visualModeRaw : "planned_only";
  const maxVisualsPerLesson = toBoundedInt(getFieldValue<number>(contract, "maxVisualsPerLesson").value, 0, 6) ?? 2;
  const visualAllowedSubjectsRaw = getFieldValue<unknown[]>(contract, "visualAllowedSubjects").value;
  const visualAllowedSubjects = Array.isArray(visualAllowedSubjectsRaw)
    ? visualAllowedSubjectsRaw.map((value) => cleanText(String(value))).filter((value): value is string => Boolean(value))
    : [];
  const requireVisualApproval = toBoolean(getFieldValue<boolean>(contract, "requireVisualApproval").value) ?? true;

  const values: UniversalPrefillResolvedValues = {
    trigger,
    studentId: cleanText(contract?.studentId ?? legacy.studentId),
    weakAreaId: cleanText(contract?.weakAreaId ?? legacy.weakAreaId),
    reason: cleanText(contract?.reason),
    signal: cleanText(contract?.signal ?? legacy.source),
    yearGroup,
    keyStage: keyStage || null,
    ageGroup,
    subject,
    englishStrand,
    skillFocus,
    topic,
    activityType,
    masteryOutcome,
    curriculumPathway,
    countryRegion,
    curriculumFramework,
    schoolPreferredGcseBoard,
    examBoard,
    examBoardSource,
    difficulty,
    itemCount,
    aiMode,
    visualGenerationEnabled,
    visualGenerationMode,
    maxVisualsPerLesson,
    visualAllowedSubjects,
    requireVisualApproval,
  };

  if (trigger === "manual" && !values.yearGroup) {
    values.yearGroup = "Year 1";
    values.keyStage = keyStageForYearGroup("Year 1");
    values.ageGroup = ageGroupForYearGroup("Year 1");
    values.curriculumPathway = curriculumPathwayForYearGroup("Year 1");
    assumptions.push("Manual mode fallback applied: defaulted to Year 1/KS1.");
    fieldSources.yearGroup = fieldSources.yearGroup ?? "fallback";
  }

  return {
    values,
    assumptions: Array.from(new Set([...(contract?.warnings ?? []), ...assumptions])),
    blockingWarnings: Array.from(new Set([...(contract?.blockingIssues ?? []), ...blockingWarnings])),
    fieldSources,
  };
}

export function buildUniversalPrefillContract(input: {
  trigger: PrefillTrigger;
  studentId?: string | null;
  weakAreaId?: string | null;
  reason?: string | null;
  signal?: string | null;
  fields: UniversalAiPrefillContract["fields"];
  warnings?: string[];
  blockingIssues?: string[];
}): UniversalAiPrefillContract {
  return {
    version: 1,
    trigger: input.trigger,
    studentId: cleanText(input.studentId),
    weakAreaId: cleanText(input.weakAreaId),
    reason: cleanText(input.reason),
    signal: cleanText(input.signal),
    fields: input.fields,
    warnings: input.warnings ?? [],
    blockingIssues: input.blockingIssues ?? [],
  };
}

export function legacyPrefillFromQueryMap(query: Record<string, string | null>): LegacyAiGeneratorPrefill {
  return {
    studentId: cleanText(query.studentId),
    subject: cleanText(query.subject),
    skill: cleanText(query.skill),
    englishStrand: cleanText(query.englishStrand),
    strand: cleanText(query.strand),
    topic: cleanText(query.topic),
    activityType: cleanText(query.activityType),
    masteryOutcome: cleanText(query.masteryOutcome),
    source: cleanText(query.source),
    weakAreaId: cleanText(query.weakAreaId),
    yearGroup: cleanText(query.yearGroup),
    keyStage: cleanText(query.keyStage),
    difficulty: toPositiveInt(query.difficulty),
    itemCount: toPositiveInt(query.itemCount),
  };
}

export function isValidYearGroup(value: string | null | undefined): value is YearGroup {
  return Boolean(value && YEAR_GROUPS.includes(value as YearGroup));
}
