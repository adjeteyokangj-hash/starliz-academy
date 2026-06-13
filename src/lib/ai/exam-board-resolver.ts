import {
  EXAM_BOARDS,
  keyStageForYearGroup,
  normalizeExamBoard,
  normalizeKeyStage,
  normalizeSubject,
  normalizeYearGroup,
  type ExamBoard,
  type Subject,
} from "@/lib/curriculum";

export type ExamBoardSource = "auto" | "manual" | "school_default";

export type ExamBoardResolverInput = {
  subject: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  skillFocus?: string | null;
  countryRegion?: string | null;
  curriculumFramework?: string | null;
  schoolDefaults?: {
    defaultCountryRegion?: string | null;
    defaultCurriculumFramework?: string | null;
    preferredGcseBoardsBySubject?: Record<string, string | null | undefined>;
    preferredSchoolExamBoard?: string | null;
    autoSelectEnabled?: boolean;
    manualOverrideAllowed?: boolean;
  };
};

export type ExamBoardRecommendation = {
  recommendedExamBoard: string | null;
  confidence: number;
  reason: string;
  alternatives: string[];
  curriculumFramework: string;
  countryRegion: string;
  keyStage: string;
  yearGroup: string;
  subject: string;
  skillFocus: string;
  source: Exclude<ExamBoardSource, "manual">;
};

export type ExamBoardSelection = {
  examBoard: string | null;
  examBoardSource: ExamBoardSource;
  curriculumFramework: string;
  examBoardConfidence: number;
  examBoardReason: string;
};

function normalizeCountryRegion(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "UK";
  if (normalized === "uk" || normalized === "united kingdom" || normalized === "england" || normalized === "gb") return "UK";
  if (normalized === "ghana") return "Ghana";
  if (normalized === "nigeria") return "Nigeria";
  return value?.trim() || "UK";
}

function normalizeFramework(value: string | null | undefined, countryRegion: string): string {
  const normalized = String(value ?? "").trim();
  if (normalized) return normalized;
  if (countryRegion === "Ghana") return "GES / NaCCA";
  if (countryRegion === "Nigeria") return "NERDC";
  return "National Curriculum England";
}

function pickGcseAlternatives(subject: Subject | null): ExamBoard[] {
  if (!subject) return ["AQA", "Edexcel", "OCR"];
  if (subject === "gcse-french" || subject === "gcse-german" || subject === "gcse-spanish" || subject === "gcse-italian" || subject === "gcse-mandarin" || subject === "gcse-arabic" || subject === "gcse-ga" || subject === "gcse-urdu" || subject === "gcse-polish") {
    return ["AQA", "Edexcel", "WJEC / Eduqas"];
  }
  if (subject === "gcse-english" || subject === "gcse-english-language" || subject === "gcse-english-literature") {
    return ["AQA", "Edexcel", "OCR"];
  }
  if (subject === "gcse-maths") {
    return ["Edexcel", "AQA", "OCR"];
  }
  if (subject === "gcse-science" || subject === "gcse-combined-science" || subject === "gcse-biology" || subject === "gcse-chemistry" || subject === "gcse-physics") {
    return ["AQA", "Edexcel", "OCR"];
  }
  return ["AQA", "Edexcel", "OCR"];
}

function isGcseContext(input: { subject: Subject | null; keyStage: string; yearGroup: string }): boolean {
  if (input.subject?.startsWith("gcse-")) return true;
  if (input.keyStage === "KS4") return true;
  return input.yearGroup === "Year 10" || input.yearGroup === "Year 11";
}

function preferredBySubject(preferred: Record<string, string | null | undefined> | undefined, subject: Subject | null): ExamBoard | null {
  if (!preferred || !subject) return null;
  const direct = normalizeExamBoard(preferred[subject] ?? null);
  if (direct) return direct;

  const family = subject.includes("english")
    ? "english"
    : subject.includes("science") || subject === "gcse-biology" || subject === "gcse-chemistry" || subject === "gcse-physics"
      ? "science"
      : subject.includes("math")
        ? "maths"
        : subject.includes("french") || subject.includes("german") || subject.includes("spanish") || subject.includes("italian") || subject.includes("mandarin") || subject.includes("arabic") || subject.includes("urdu") || subject.includes("polish")
          ? "languages"
          : "general";

  return normalizeExamBoard(preferred[family] ?? null);
}

export function resolveExamBoardRecommendation(input: ExamBoardResolverInput): ExamBoardRecommendation {
  const subject = normalizeSubject(input.subject);
  const yearGroup = normalizeYearGroup(input.yearGroup) ?? "Year 1";
  const keyStage = normalizeKeyStage(input.keyStage) ?? keyStageForYearGroup(yearGroup);
  const skillFocus = String(input.skillFocus ?? "").trim();

  const schoolCountry = normalizeCountryRegion(input.schoolDefaults?.defaultCountryRegion ?? null);
  const requestCountry = normalizeCountryRegion(input.countryRegion ?? null);
  const countryRegion = requestCountry || schoolCountry;

  const schoolFramework = normalizeFramework(input.schoolDefaults?.defaultCurriculumFramework ?? null, countryRegion);
  const curriculumFramework = normalizeFramework(input.curriculumFramework ?? null, countryRegion) || schoolFramework;

  if (countryRegion === "Ghana") {
    return {
      recommendedExamBoard: "WAEC",
      confidence: 0.55,
      reason: "Ghana support is in placeholder mode: defaulting to WAEC-compatible guidance with GES / NaCCA framing.",
      alternatives: ["GES", "NaCCA", "WAEC"],
      curriculumFramework,
      countryRegion,
      keyStage,
      yearGroup,
      subject: input.subject,
      skillFocus,
      source: "auto",
    };
  }

  if (countryRegion === "Nigeria") {
    return {
      recommendedExamBoard: "WAEC",
      confidence: 0.55,
      reason: "Nigeria support is in placeholder mode: defaulting to WAEC-compatible guidance with NERDC framing.",
      alternatives: ["NERDC", "WAEC", "NECO", "JAMB"],
      curriculumFramework,
      countryRegion,
      keyStage,
      yearGroup,
      subject: input.subject,
      skillFocus,
      source: "auto",
    };
  }

  if (!isGcseContext({ subject, keyStage, yearGroup })) {
    return {
      recommendedExamBoard: "National Curriculum England",
      confidence: 0.92,
      reason: "KS1-KS3/EYFS defaults to National Curriculum England for UK delivery.",
      alternatives: ["National Curriculum England"],
      curriculumFramework: "National Curriculum England",
      countryRegion,
      keyStage,
      yearGroup,
      subject: input.subject,
      skillFocus,
      source: "auto",
    };
  }

  const preferredBoard = preferredBySubject(input.schoolDefaults?.preferredGcseBoardsBySubject, subject)
    ?? normalizeExamBoard(input.schoolDefaults?.preferredSchoolExamBoard ?? null);

  const alternatives = pickGcseAlternatives(subject);

  if (preferredBoard) {
    const withPreferred = [preferredBoard, ...alternatives.filter((board) => board !== preferredBoard)];
    return {
      recommendedExamBoard: preferredBoard,
      confidence: 0.95,
      reason: "Using school preferred GCSE exam board settings.",
      alternatives: withPreferred,
      curriculumFramework,
      countryRegion,
      keyStage,
      yearGroup,
      subject: input.subject,
      skillFocus,
      source: "school_default",
    };
  }

  return {
    recommendedExamBoard: alternatives[0],
    confidence: 0.8,
    reason: "GCSE context detected. Recommended board selected from subject-specific UK defaults.",
    alternatives,
    curriculumFramework,
    countryRegion,
    keyStage,
    yearGroup,
    subject: input.subject,
    skillFocus,
    source: "auto",
  };
}

export function resolveExamBoardSelection(input: {
  manualExamBoard?: string | null;
  recommendation: ExamBoardRecommendation;
  manualOverrideAllowed?: boolean;
}): ExamBoardSelection {
  const manualBoard = normalizeExamBoard(input.manualExamBoard ?? null);
  const allowManual = input.manualOverrideAllowed ?? true;

  if (manualBoard && allowManual) {
    return {
      examBoard: manualBoard,
      examBoardSource: "manual",
      curriculumFramework: input.recommendation.curriculumFramework,
      examBoardConfidence: 1,
      examBoardReason: "Manual override selected by admin.",
    };
  }

  const recommended = normalizeExamBoard(input.recommendation.recommendedExamBoard);
  return {
    examBoard: recommended,
    examBoardSource: input.recommendation.source,
    curriculumFramework: input.recommendation.curriculumFramework,
    examBoardConfidence: input.recommendation.confidence,
    examBoardReason: input.recommendation.reason,
  };
}

export function normalizeAllowedExamBoards(values: unknown): ExamBoard[] {
  if (!Array.isArray(values)) return [...EXAM_BOARDS];
  const mapped = values
    .map((value) => normalizeExamBoard(typeof value === "string" ? value : null))
    .filter((value): value is ExamBoard => Boolean(value));
  return mapped.length ? mapped : [...EXAM_BOARDS];
}
