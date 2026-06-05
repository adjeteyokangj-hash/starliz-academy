import { keyStageForYearGroup, normalizeYearGroup, yearGroupToOrdinal } from "@/lib/curriculum";

export type LearningLevelEvidence = {
  targetLearningYearGroup: string | null;
  targetLearningKeyStage: string | null;
  subjectLevel: number | null;
  strandLevel: number | null;
  levelSource: "qlf" | "progression" | "mastery" | "weak_area" | "learning_level" | "metadata" | "fallback";
};

type PlacementLevel = { accuracy: number; level: "below" | "secure" | "advanced" };

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function yearGroupFromLearningLevel(level: number | string | null | undefined): string | null {
  const matched = String(level ?? "").match(/\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.max(0, Math.min(11, Math.round(parsed)));
  if (rounded === 0) return "Reception";
  return `Year ${rounded}`;
}

export function learningLevelFromPlacementBand(level: PlacementLevel["level"] | null | undefined, accuracy?: number | null): number | null {
  if (level === "advanced") return 4;
  if (level === "secure") return 3;
  if (level === "below") return typeof accuracy === "number" && Math.round(accuracy) < 30 ? 1 : 2;
  return null;
}

export function parseTargetLearningEvidenceFromMetadata(metadata: Record<string, unknown> | null | undefined): LearningLevelEvidence | null {
  if (!metadata) return null;
  const year = typeof metadata.targetLearningYearGroup === "string"
    ? metadata.targetLearningYearGroup
    : typeof metadata.learningYearGroup === "string"
      ? metadata.learningYearGroup
      : typeof metadata.yearGroup === "string"
        ? metadata.yearGroup
        : null;
  const normalizedYear = normalizeYearGroup(year);
  const subjectLevel = typeof metadata.subjectLevel === "number"
    ? metadata.subjectLevel
    : typeof metadata.learningLevel === "number"
      ? metadata.learningLevel
      : null;
  const strandLevel = typeof metadata.strandLevel === "number" ? metadata.strandLevel : null;
  const levelYear = normalizedYear ?? yearGroupFromLearningLevel(strandLevel ?? subjectLevel);
  if (!levelYear && !subjectLevel && !strandLevel) return null;
  return {
    targetLearningYearGroup: levelYear,
    targetLearningKeyStage: levelYear ? keyStageForYearGroup(levelYear) : null,
    subjectLevel,
    strandLevel,
    levelSource: "metadata",
  };
}

export function findPlacementEvidence(input: {
  placementLevels: Record<string, PlacementLevel>;
  subject?: string | null;
  contentType?: string | null;
  strand?: string | null;
}): LearningLevelEvidence | null {
  const subject = normalizeToken(input.subject);
  const contentType = normalizeToken(input.contentType);
  const strand = normalizeToken(input.strand);
  const candidates = [
    subject && strand ? `${subject}:${strand}` : "",
    contentType && strand ? `${contentType}:${strand}` : "",
    strand,
    subject,
    contentType,
    subject === "english-language" && strand ? `english:${strand}` : "",
    contentType === "english-language" && strand ? `english:${strand}` : "",
  ].filter(Boolean);

  for (const key of candidates) {
    const placement = input.placementLevels[key];
    if (!placement) continue;
    const level = learningLevelFromPlacementBand(placement.level, placement.accuracy);
    const targetLearningYearGroup = yearGroupFromLearningLevel(level);
    return {
      targetLearningYearGroup,
      targetLearningKeyStage: targetLearningYearGroup ? keyStageForYearGroup(targetLearningYearGroup) : null,
      subjectLevel: level,
      strandLevel: strand ? level : null,
      levelSource: "qlf",
    };
  }

  return null;
}

export function isLowerOrSameYear(contentYearGroup: string | null | undefined, studentYearGroup: string | null | undefined): boolean {
  const contentOrdinal = yearGroupToOrdinal(normalizeYearGroup(contentYearGroup));
  const studentOrdinal = yearGroupToOrdinal(normalizeYearGroup(studentYearGroup));
  return contentOrdinal !== null && studentOrdinal !== null && contentOrdinal <= studentOrdinal;
}

export function isHigherYear(contentYearGroup: string | null | undefined, studentYearGroup: string | null | undefined): boolean {
  const contentOrdinal = yearGroupToOrdinal(normalizeYearGroup(contentYearGroup));
  const studentOrdinal = yearGroupToOrdinal(normalizeYearGroup(studentYearGroup));
  return contentOrdinal !== null && studentOrdinal !== null && contentOrdinal > studentOrdinal;
}

export function supportedContentYearGroups(input: {
  studentYearGroup: string | null | undefined;
  placementLevels?: Record<string, PlacementLevel>;
  learningLevel?: string | number | null;
}): string[] {
  const years = new Set<string>();
  const studentYear = normalizeYearGroup(input.studentYearGroup);
  if (studentYear) years.add(studentYear);

  const placementLevels = input.placementLevels ?? {};
  for (const placement of Object.values(placementLevels)) {
    const level = learningLevelFromPlacementBand(placement.level, placement.accuracy);
    const year = normalizeYearGroup(yearGroupFromLearningLevel(level));
    if (year && (!studentYear || isLowerOrSameYear(year, studentYear))) years.add(year);
  }

  const learningYear = normalizeYearGroup(yearGroupFromLearningLevel(input.learningLevel));
  if (learningYear && (!studentYear || isLowerOrSameYear(learningYear, studentYear))) years.add(learningYear);

  return Array.from(years);
}
