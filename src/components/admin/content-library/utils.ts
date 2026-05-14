import { ageGroupForYearGroup, keyStageForYearGroup } from "@/lib/curriculum";
import type { ContentItem, ContentMeta, ContentSummary, StudentAssignmentCandidate, StudentOption } from "./types";

export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
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
  const subject = normalizeText(subjectRaw) || "unknown";
  const keyStage = item.keyStage ?? (typeof metadata.keyStage === "string" ? metadata.keyStage : null);
  const yearGroup = item.yearGroup ?? (typeof metadata.yearGroup === "string" ? metadata.yearGroup : null);
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
    ageGroup,
    topic: typeof metadata.topic === "string" ? metadata.topic : item.topic || null,
    skillFocus: typeof metadata.skillFocus === "string" ? metadata.skillFocus : item.skillFocus || null,
    schoolId: typeof metadata.schoolId === "string" ? metadata.schoolId : null,
  };
}

function parseAgeGroupRange(ageGroup: string | null | undefined): { min: number; max: number } | null {
  if (!ageGroup) return null;
  const match = ageGroup.match(/(\d{1,2})\s*[\u2013\-]\s*(\d{1,2})/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

export function evaluateAssignmentCandidate(item: ContentItem, student: StudentOption, localDuplicates: Set<string>): StudentAssignmentCandidate {
  const summary = getContentJsonSummary(item.contentJson);
  const meta = getContentMeta(item);
  const studentYear = student.yearGroup ?? null;
  const studentKeyStage = student.keyStageLevel || (studentYear ? keyStageForYearGroup(studentYear) : null);
  const strictAgeRange = parseAgeGroupRange(meta.ageGroup);
  const studentSchoolIds = student.schoolIds ?? [];

  if (localDuplicates.has(student.id)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Duplicate assignment",
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
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (!summary.valid) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Invalid JSON",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.yearGroup && studentYear && meta.yearGroup !== studentYear) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Year mismatch",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.keyStage && studentKeyStage && meta.keyStage !== studentKeyStage) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Key stage mismatch",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (strictAgeRange && typeof student.age === "number" && (student.age < strictAgeRange.min || student.age > strictAgeRange.max)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "Age mismatch",
      recommendationLevel: "eligible_manual",
      recommendationReason: "Blocked by hard safety checks.",
      matchedWeakAreas: [],
      recommendationScore: 0,
    };
  }
  if (meta.schoolId && studentSchoolIds.length > 0 && !studentSchoolIds.includes(meta.schoolId)) {
    return {
      student,
      hardEligible: false,
      hardBlockReason: "School mismatch",
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

  return {
    student,
    hardEligible: true,
    hardBlockReason: null,
    recommendationLevel,
    recommendationReason,
    matchedWeakAreas,
    recommendationScore,
  };
}
