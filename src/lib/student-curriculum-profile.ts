import {
  curriculumPathwayForYearGroup,
  keyStageForYearGroup,
  normalizeCurriculumPathway,
  normalizeExamBoard,
  shouldApplyExamBoardTag,
  type CurriculumPathway,
  type ExamBoard,
} from "@/lib/curriculum";

export type StudentCurriculumProfile = {
  keyStage: string | null;
  curriculumPathway: CurriculumPathway;
  examBoard: ExamBoard | null;
  gcseSubjects: string[];
  targetGrades: Record<string, string>;
};

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed profile JSON and return defaults.
  }
  return {};
}

function parseTargetGrades(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [subject, grade] of Object.entries(value)) {
    if (typeof subject === "string" && typeof grade === "string" && subject.trim() && grade.trim()) {
      out[subject.trim()] = grade.trim();
    }
  }
  return out;
}

function parseGcseSubjects(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

export function readStudentCurriculumProfile(input: {
  yearGroup?: string | null;
  keyStageLevel?: string | null;
  aiLearningProfileJson?: string | null;
}): StudentCurriculumProfile {
  const parsed = parseJsonObject(input.aiLearningProfileJson);
  const yearPathway = curriculumPathwayForYearGroup(input.yearGroup);
  const storedPathway = normalizeCurriculumPathway(typeof parsed.curriculumPathway === "string" ? parsed.curriculumPathway : null);
  const curriculumPathway = storedPathway ?? yearPathway;
  const keyStage = input.keyStageLevel ?? (input.yearGroup ? keyStageForYearGroup(input.yearGroup) : null);
  const examBoardRaw = typeof parsed.examBoard === "string" ? parsed.examBoard : null;
  const examBoard = shouldApplyExamBoardTag({
    yearGroup: input.yearGroup,
    keyStage,
    curriculumPathway,
  })
    ? normalizeExamBoard(examBoardRaw)
    : null;

  return {
    keyStage,
    curriculumPathway,
    examBoard,
    gcseSubjects: parseGcseSubjects(parsed.gcseSubjects),
    targetGrades: parseTargetGrades(parsed.targetGrades),
  };
}

export function mergeStudentCurriculumProfileJson(input: {
  existingJson?: string | null;
  yearGroup?: string | null;
  keyStage?: string | null;
  curriculumPathway?: string | null;
  examBoard?: string | null;
  gcseSubjects?: string[] | null;
  targetGrades?: Record<string, string> | null;
}): string {
  const base = parseJsonObject(input.existingJson);
  const pathway = normalizeCurriculumPathway(input.curriculumPathway) ?? curriculumPathwayForYearGroup(input.yearGroup);
  const shouldTagExamBoard = shouldApplyExamBoardTag({
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    curriculumPathway: pathway,
  });

  const merged = {
    ...base,
    curriculumPathway: pathway,
    examBoard: shouldTagExamBoard ? normalizeExamBoard(input.examBoard) : null,
    gcseSubjects: Array.isArray(input.gcseSubjects)
      ? input.gcseSubjects.map((entry) => entry.trim()).filter(Boolean)
      : parseGcseSubjects(base.gcseSubjects),
    targetGrades: input.targetGrades ?? parseTargetGrades(base.targetGrades),
  };

  return JSON.stringify(merged);
}
