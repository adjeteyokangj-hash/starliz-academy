import {
  ageGroupForYearGroup,
  deriveAgeRangeFromCurriculumTags,
  keyStageForYearGroup,
  mapSubjectToLegacyContentType,
  normalizeKeyStage,
  normalizeSubject,
  parseYearGroupRange,
  normalizeYearGroup,
  parseAgeGroupRange,
  yearGroupToOrdinal,
  shouldApplyExamBoardTag,
} from "@/lib/curriculum";
import type { ContentItem, ContentMeta, ContentSummary, StudentAssignmentCandidate, StudentOption } from "./types";

export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseLearningLevel(value: string | null | undefined): number | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const matched = normalized.match(/\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function placementEntryForSubject(
  levels: Record<string, { accuracy: number; level: "below" | "secure" | "advanced" }> | undefined,
  subject: string,
): { accuracy: number; level: "below" | "secure" | "advanced" } | null {
  if (!levels) return null;
  const keys = [
    normalizeText(subject),
    normalizeText(subject).replace(/-/g, " "),
    normalizeText(subject).replace(/\s+/g, "-"),
  ];
  for (const key of keys) {
    if (key && levels[key]) return levels[key];
  }
  return null;
}

function placementSupportsAssignment(input: {
  contentSubject: string;
  contentPathway: string | null;
  contentKeyStage: string | null;
  contentLevel: number | null;
  studentPathway: string | null | undefined;
  studentKeyStage: string | null;
  studentLearningLevel: string | null | undefined;
  placementLevels: Record<string, { accuracy: number; level: "below" | "secure" | "advanced" }> | undefined;
}): boolean {
  const pathwayMatches = !input.contentPathway
    || !input.studentPathway
    || normalizeText(input.contentPathway) === normalizeText(input.studentPathway);
  const keyStageMatches = !input.contentKeyStage
    || !input.studentKeyStage
    || normalizeText(input.contentKeyStage) === normalizeText(input.studentKeyStage);
  if (!pathwayMatches || !keyStageMatches) return false;

  const placementBySubject = placementEntryForSubject(input.placementLevels, input.contentSubject);
  const learningLevel = parseLearningLevel(input.studentLearningLevel);

  if (placementBySubject) {
    if (placementBySubject.level === "below") return input.contentLevel === null || input.contentLevel <= 2;
    if (placementBySubject.level === "secure") return input.contentLevel === null || input.contentLevel <= 4;
    return true;
  }

  if (learningLevel !== null && input.contentLevel !== null) {
    return learningLevel >= input.contentLevel - 1;
  }

  return false;
}

export function getContentJsonSummary(contentJson: string): ContentSummary {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (Array.isArray(parsed)) {
      const first = parsed[0] as Record<string, unknown> | undefined;
      return {
        valid: true,
        itemCount: parsed.length,
        preview: first ? JSON.stringify(first) : "[]",
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        valid: true,
        itemCount: 1,
        preview: JSON.stringify(parsed),
      };
    }
    return { valid: false, itemCount: 0, preview: "Invalid JSON shape" };
  } catch {
    return { valid: false, itemCount: 0, preview: "Invalid JSON" };
  }
}

export function parseMetadata(item: ContentItem): Record<string, unknown> {
  if (!item.metadataJson) return {};
  try {
    return JSON.parse(item.metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getContentMeta(item: ContentItem): ContentMeta {
  const metadata = parseMetadata(item);
  const title = typeof metadata.title === "string"
    ? metadata.title
    : typeof metadata.name === "string"
      ? metadata.name
      : item.topic || `${item.contentType} practice`;
  const subjectRaw = typeof metadata.subject === "string" ? metadata.subject : item.contentType;
  const subject = normalizeSubject(subjectRaw) ?? "unknown";
  const rawYearGroup = item.yearGroup ?? (typeof metadata.yearGroup === "string" ? metadata.yearGroup : null);
  const yearRange = parseYearGroupRange(rawYearGroup)
    ?? parseYearGroupRange(typeof metadata.keyStage === "string" ? metadata.keyStage : null)
    ?? parseYearGroupRange(typeof metadata.ageGroup === "string" ? metadata.ageGroup : null)
    ?? parseYearGroupRange(typeof metadata.curriculumPathway === "string" ? metadata.curriculumPathway : null);
  const yearGroup = normalizeYearGroup(rawYearGroup) ?? yearRange?.min ?? null;
  const rawKeyStage = item.keyStage ?? (typeof metadata.keyStage === "string" ? metadata.keyStage : null);
  const keyStage = normalizeKeyStage(rawKeyStage) ?? (yearGroup ? keyStageForYearGroup(yearGroup) : null);
  const curriculumPathway = typeof metadata.curriculumPathway === "string" ? metadata.curriculumPathway : null;
  const examBoard = typeof metadata.examBoard === "string" ? metadata.examBoard : null;
  const ageGroup = typeof metadata.ageGroup === "string"
    ? metadata.ageGroup
    : yearGroup
      ? ageGroupForYearGroup(yearGroup)
      : null;

  return {
    title,
    subject,
    keyStage,
    yearGroup,
    curriculumPathway,
    examBoard,
    ageGroup,
    topic: typeof metadata.topic === "string" ? metadata.topic : item.topic || null,
    skillFocus: typeof metadata.skillFocus === "string" ? metadata.skillFocus : item.skillFocus || null,
    schoolId: typeof metadata.schoolId === "string" ? metadata.schoolId : null,
  };
}

export function evaluateAssignmentCandidate(item: ContentItem, student: StudentOption, localDuplicates: Set<string>): StudentAssignmentCandidate {
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const studentYear = normalizeYearGroup(student.yearGroup ?? null);
  const studentKeyStage = normalizeKeyStage(student.keyStageLevel) ?? (studentYear ? keyStageForYearGroup(studentYear) : null);
  const strictAgeRange = parseAgeGroupRange(meta.ageGroup) ?? deriveAgeRangeFromCurriculumTags(meta.ageGroup);
  const placementSupported = placementSupportsAssignment({
    contentSubject: meta.subject,
    contentPathway: meta.curriculumPathway,
    contentKeyStage: meta.keyStage,
    contentLevel: Number.isFinite(item.level) ? item.level : null,
    studentPathway: student.curriculumPathway,
    studentKeyStage,
    studentLearningLevel: student.learningLevel,
    placementLevels: student.placementLevels,
  });
  const studentSchoolIds = student.schoolIds ?? [];
  const overrideWarning = "Placement pathway supports assignment; DOB/year mismatch flagged for review.";
  const shouldCheckExamBoard = shouldApplyExamBoardTag({
    yearGroup: meta.yearGroup,
    keyStage: meta.keyStage,
    curriculumPathway: meta.curriculumPathway,
    subject: meta.subject,
  });

  if (localDuplicates.has(student.id)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Duplicate assignment",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  if (!["reviewed", "published"].includes(item.status)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Draft or unreviewed content",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  if (meta.subject !== "unknown") {
    const inferredLegacyType = mapSubjectToLegacyContentType(meta.subject);
    if (inferredLegacyType && inferredLegacyType !== item.contentType) {
      return {
        student,
        hardEligible: false,
        hardBlockReason: "Subject/type mismatch",
        warningReason: null,
        recommendationLevel: "eligible_manual",
        recommendationReason: "Blocked by hard safety checks.",
        matchedWeakAreas: [],
        recommendationScore: 0,
      };
    }
  }
  if (!summary.valid) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Invalid JSON",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  const contentYearRange = parseYearGroupRange(meta.yearGroup)
    ?? parseYearGroupRange(meta.keyStage)
    ?? parseYearGroupRange(meta.ageGroup)
    ?? parseYearGroupRange(meta.curriculumPathway);
  const studentYearOrdinal = yearGroupToOrdinal(studentYear);
  let warningReason: string | null = null;
  if (contentYearRange && studentYearOrdinal !== null && (studentYearOrdinal < contentYearRange.minOrdinal || studentYearOrdinal > contentYearRange.maxOrdinal)) {
    if (placementSupported) {
      warningReason = overrideWarning;
    } else {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Year mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
    }
  }

  if (!contentYearRange && meta.yearGroup && studentYear && meta.yearGroup !== studentYear) {
    if (placementSupported) {
      warningReason = overrideWarning;
    } else {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Year mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
    }
  }
  if (meta.keyStage && studentKeyStage && meta.keyStage !== studentKeyStage) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Key stage mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (strictAgeRange && typeof student.age === "number" && (student.age < strictAgeRange.min || student.age > strictAgeRange.max)) {
    const distance = student.age < strictAgeRange.min
      ? strictAgeRange.min - student.age
      : student.age - strictAgeRange.max;
    if (placementSupported && distance <= 2) {
      warningReason = overrideWarning;
    } else {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Age mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
    }
  }
  if (meta.schoolId && studentSchoolIds.length > 0 && !studentSchoolIds.includes(meta.schoolId)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "School mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.schoolId && studentSchoolIds.length === 0) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "School mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (shouldCheckExamBoard && meta.examBoard && student.examBoard && meta.examBoard !== student.examBoard) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Exam board mismatch",
      warningReason: null,
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }

  const studentSubjectFocus = normalizeText(student.subjectFocus);
  const metaSubject = normalizeText(meta.subject);
  const skillNeedle = normalizeText(meta.skillFocus);
  const topicNeedle = normalizeText(meta.topic);
  const matchedWeakAreas = (student.weakPatterns ?? []).filter((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    const hasNeedle = Boolean(skillNeedle) || Boolean(topicNeedle);
    return Boolean(normalizedPattern)
      && hasNeedle
      && (skillNeedle.includes(normalizedPattern)
        || topicNeedle.includes(normalizedPattern)
        || (Boolean(skillNeedle) && normalizedPattern.includes(skillNeedle)));
  });

  let recommendationScore = 0;
  if (matchedWeakAreas.length > 0) recommendationScore += matchedWeakAreas.length * 3;
  if (studentSubjectFocus && metaSubject && (studentSubjectFocus.includes(metaSubject) || metaSubject.includes(studentSubjectFocus))) {
    recommendationScore += 1;
  }

  const recommendationLevel = recommendationScore > 0 ? "recommended" : "eligible_manual";
  const recommendationReason = recommendationLevel === "recommended"
    ? "Recommended match: this content supports the student's weak area."
    : "Eligible manual assignment: no matching weak area detected.";
  const combinedRecommendationReason = warningReason
    ? `${recommendationReason} ${warningReason}`
    : recommendationReason;

  return {
    student,
    hardEligible: true,
    hardBlockReason: null,
    warningReason,
    recommendationLevel,
    recommendationReason: combinedRecommendationReason,
    matchedWeakAreas,
    recommendationScore,
  };
}
