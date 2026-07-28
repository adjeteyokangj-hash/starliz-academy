import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { evaluateStudentAssignmentAccess, type SchoolLicenceBlockedReason } from "@/lib/schools/licensing";
import {
  ageGroupForYearGroup,
  deriveAgeRangeFromCurriculumTags,
  keyStageForYearGroup,
  mapSubjectToLegacyContentType,
  normalizeKeyStage,
  parseYearGroupRange,
  normalizeSubject as normalizeCurriculumSubject,
  normalizeYearGroup,
  parseAgeGroupRange,
  yearGroupToOrdinal,
  shouldApplyExamBoardTag,
} from "@/lib/curriculum";
import { readStudentCurriculumProfile } from "@/lib/student-curriculum-profile";
import { extractLearningDnaFromProfileJson } from "@/lib/learning_dna";
import { invalidateAcademicIntelligenceSnapshot } from "@/lib/academic-intelligence/snapshot";
import { parseQuickLevelFinderSession } from "@/lib/quick-level-finder";
import { validateSpellingContentContract } from "@/lib/content-governance";
import {
  findPlacementEvidence,
  isLowerOrSameYear,
  parseTargetLearningEvidenceFromMetadata,
  yearGroupFromLearningLevel,
} from "@/lib/curriculum-level-targets";
import { analyzeContentSessionSlots, getIncompleteSlotsReason } from "@/lib/session-slot-validation";
import { isPlayableSubjectContentTypeCompatible } from "@/lib/schools/playable-lesson-type";

export class SchoolLicenceAccessError extends Error {
  reason: SchoolLicenceBlockedReason;
  schoolId?: string;
  schoolName?: string;

  constructor(input: {
    reason: SchoolLicenceBlockedReason;
    schoolId?: string;
    schoolName?: string;
  }) {
    super("School licence does not allow assignments for this student.");
    this.name = "SchoolLicenceAccessError";
    this.reason = input.reason;
    this.schoolId = input.schoolId;
    this.schoolName = input.schoolName;
  }
}

export class AssignmentSafetyError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AssignmentSafetyError";
    this.details = details;
  }
}

export class DuplicateAssignmentError extends Error {
  assignmentId: string;

  constructor(assignmentId: string) {
    super("This content is already assigned to this student.");
    this.name = "DuplicateAssignmentError";
    this.assignmentId = assignmentId;
  }
}

type AssignmentSafetyMeta = {
  subject: string;
  yearGroup: string | null;
  keyStage: string | null;
  curriculumPathway: string | null;
  examBoard: string | null;
  ageGroup: string | null;
  topic: string | null;
  skillFocus: string | null;
  status: string;
  schoolId: string | null;
  warningReason?: string | null;
  warningFlags?: string[];
  exposureClassification?: ExposureClassification;
  exposureRisk?: "none" | "low" | "medium" | "high";
  exposureSeenQuestionCount?: number;
  exposureTotalQuestionCount?: number;
  exposureSeenQuestionIds?: string[];
};

type AssignmentRecommendation = {
  level: "recommended" | "eligible_manual";
  reason: string;
  matchedWeakAreas: string[];
};

export type ExposureClassification =
  | "first_exposure"
  | "revision"
  | "catch_up"
  | "mastery_check"
  | "spaced_repetition"
  | "exam_practice";

export type QuestionExposureIntelligence = {
  classification: ExposureClassification;
  risk: "none" | "low" | "medium" | "high";
  seenQuestionCount: number;
  totalQuestionCount: number;
  seenQuestionIds: string[];
  warningReason: string | null;
  warningFlags: string[];
};

function parseContentMetadata(raw: string | null | undefined): {
  subject: string | null;
  curriculumPathway: string | null;
  examBoard: string | null;
  ageGroup: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  topic: string | null;
  skillFocus: string | null;
  schoolId: string | null;
  strand: string | null;
  targetLearningYearGroup: string | null;
  targetLearningKeyStage: string | null;
  subjectLevel: number | null;
  strandLevel: number | null;
} {
  if (!raw) return { subject: null, curriculumPathway: null, examBoard: null, ageGroup: null, yearGroup: null, keyStage: null, topic: null, skillFocus: null, schoolId: null, strand: null, targetLearningYearGroup: null, targetLearningKeyStage: null, subjectLevel: null, strandLevel: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      curriculumPathway: typeof parsed.curriculumPathway === "string" ? parsed.curriculumPathway : null,
      examBoard: typeof parsed.examBoard === "string" ? parsed.examBoard : null,
      ageGroup: typeof parsed.ageGroup === "string" ? parsed.ageGroup : null,
      yearGroup: typeof parsed.yearGroup === "string" ? parsed.yearGroup : null,
      keyStage: typeof parsed.keyStage === "string" ? parsed.keyStage : null,
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
      skillFocus: typeof parsed.skillFocus === "string" ? parsed.skillFocus : null,
      schoolId: typeof parsed.schoolId === "string" ? parsed.schoolId : null,
      strand: typeof parsed.strand === "string" ? parsed.strand : typeof parsed.englishStrand === "string" ? parsed.englishStrand : null,
      targetLearningYearGroup: typeof parsed.targetLearningYearGroup === "string" ? parsed.targetLearningYearGroup : null,
      targetLearningKeyStage: typeof parsed.targetLearningKeyStage === "string" ? parsed.targetLearningKeyStage : null,
      subjectLevel: typeof parsed.subjectLevel === "number" ? parsed.subjectLevel : null,
      strandLevel: typeof parsed.strandLevel === "number" ? parsed.strandLevel : null,
    };
  } catch {
    return { subject: null, curriculumPathway: null, examBoard: null, ageGroup: null, yearGroup: null, keyStage: null, topic: null, skillFocus: null, schoolId: null, strand: null, targetLearningYearGroup: null, targetLearningKeyStage: null, subjectLevel: null, strandLevel: null };
  }
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isValidContentJson(contentJson: string): boolean {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    return Array.isArray(parsed) || (parsed !== null && typeof parsed === "object");
  } catch {
    return false;
  }
}

function extractQuestionIdsFromContent(contentJson: string): string[] {
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const ids = rows
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

function classifyExposureIntent(input: {
  seenCount: number;
  totalCount: number;
  contentSubject: string;
  contentType: string | null;
  topic: string | null;
  skillFocus: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  lowerLevelRemediation: boolean;
}): ExposureClassification {
  if (input.seenCount <= 0) return "first_exposure";

  const text = normalizeText([
    input.contentSubject,
    input.contentType,
    input.topic,
    input.skillFocus,
    input.yearGroup,
    input.keyStage,
  ].filter(Boolean).join(" "));

  if (input.lowerLevelRemediation || /\b(catch[-\s]?up|recovery|intervention|remediation)\b/.test(text)) {
    return "catch_up";
  }
  if (/\b(mastery|checkpoint|check)\b/.test(text)) return "mastery_check";
  if (/\b(spaced|retrieval|recall)\b/.test(text)) return "spaced_repetition";
  if (/\b(gcse|exam|paper|mock|aqa|edexcel|ocr|sats|11[-\s]?plus)\b/.test(text)) return "exam_practice";
  return "revision";
}

function exposureRiskFor(seenCount: number, totalCount: number): "none" | "low" | "medium" | "high" {
  if (seenCount <= 0 || totalCount <= 0) return "none";
  const ratio = seenCount / totalCount;
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.35) return "medium";
  return "low";
}

export function buildQuestionExposureIntelligence(input: {
  seenIds: string[];
  totalQuestionCount: number;
  contentSubject: string;
  contentType: string | null;
  topic: string | null;
  skillFocus: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  lowerLevelRemediation: boolean;
}): QuestionExposureIntelligence {
  const classification = classifyExposureIntent({
    seenCount: input.seenIds.length,
    totalCount: input.totalQuestionCount,
    contentSubject: input.contentSubject,
    contentType: input.contentType,
    topic: input.topic,
    skillFocus: input.skillFocus,
    yearGroup: input.yearGroup,
    keyStage: input.keyStage,
    lowerLevelRemediation: input.lowerLevelRemediation,
  });
  const risk = exposureRiskFor(input.seenIds.length, input.totalQuestionCount);
  const warningFlags = input.seenIds.length > 0
    ? [
      "question_history_exposure",
      `exposure_${classification}`,
      `exposure_risk_${risk}`,
    ]
    : [];

  if (input.seenIds.length === 0) {
    return {
      classification,
      risk,
      seenQuestionCount: 0,
      totalQuestionCount: input.totalQuestionCount,
      seenQuestionIds: [],
      warningReason: null,
      warningFlags,
    };
  }

  const preview = input.seenIds.slice(0, 5).join(", ");
  const suffix = input.seenIds.length > 5 ? ", ..." : "";
  return {
    classification,
    risk,
    seenQuestionCount: input.seenIds.length,
    totalQuestionCount: input.totalQuestionCount,
    seenQuestionIds: input.seenIds.slice(0, 20),
    warningReason: `Exposure warning: ${input.seenIds.length}/${input.totalQuestionCount} question${input.totalQuestionCount === 1 ? "" : "s"} previously seen (${preview}${suffix}). Intent classified as ${classification}; assignment remains allowed.`,
    warningFlags,
  };
}

function applyExposureWarning(input: {
  meta: AssignmentSafetyMeta;
  seenIds: string[];
  totalQuestionCount: number;
  classification: ExposureClassification;
  risk: "none" | "low" | "medium" | "high";
}) {
  input.meta.exposureClassification = input.classification;
  input.meta.exposureRisk = input.risk;
  input.meta.exposureSeenQuestionCount = input.seenIds.length;
  input.meta.exposureTotalQuestionCount = input.totalQuestionCount;
  input.meta.exposureSeenQuestionIds = input.seenIds.slice(0, 20);

  if (input.seenIds.length === 0) return;

  const preview = input.seenIds.slice(0, 5).join(", ");
  const suffix = input.seenIds.length > 5 ? ", ..." : "";
  const exposureReason = `Exposure warning: ${input.seenIds.length}/${input.totalQuestionCount} question${input.totalQuestionCount === 1 ? "" : "s"} previously seen (${preview}${suffix}). Intent classified as ${input.classification}; assignment remains allowed.`;
  input.meta.warningReason = input.meta.warningReason
    ? `${input.meta.warningReason} ${exposureReason}`
    : exposureReason;
  input.meta.warningFlags = Array.from(new Set([
    ...(input.meta.warningFlags ?? []),
    "question_history_exposure",
    `exposure_${input.classification}`,
    `exposure_risk_${input.risk}`,
  ]));
}

function deriveLearningDnaWeakSignals(aiLearningProfileJson: string | null | undefined): string[] {
  const snapshot = extractLearningDnaFromProfileJson(aiLearningProfileJson);
  if (!snapshot) return [];

  const fromMistakes = Object.entries(snapshot.recurringMistakes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key]) => key.split(":")[1] ?? "")
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const fromSubjectState = Object.entries(snapshot.subjectStates)
    .filter(([, state]) => state.attempts >= 4 && state.accuracy < 70)
    .map(([subject]) => normalizeText(subject));

  return Array.from(new Set([...fromMistakes, ...fromSubjectState])).slice(0, 10);
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
  aliases: string[] = [],
): { accuracy: number; level: "below" | "secure" | "advanced" } | null {
  if (!levels) return null;
  const keys = [
    normalizeText(subject),
    normalizeText(subject).replace(/-/g, " "),
    normalizeText(subject).replace(/\s+/g, "-"),
    ...aliases.map((alias) => normalizeText(alias)),
  ];
  for (const key of keys) {
    if (key && levels[key]) return levels[key];
  }
  return null;
}

export function placementSupportsAssignment(input: {
  contentSubject: string;
  contentPathway: string | null;
  contentKeyStage: string | null;
  contentYearGroup: string | null;
  contentLevel: number | null;
  contentType: string | null;
  contentStrand: string | null;
  studentPathway: string | null;
  studentKeyStage: string | null;
  studentYearGroup: string | null;
  studentLearningLevel: string | null;
  placementLevels: Record<string, { accuracy: number; level: "below" | "secure" | "advanced" }>;
}): boolean {
  const pathwayMatches = !input.contentPathway
    || !input.studentPathway
    || normalizeText(input.contentPathway) === normalizeText(input.studentPathway);
  const keyStageMatches = !input.contentKeyStage
    || !input.studentKeyStage
    || normalizeText(input.contentKeyStage) === normalizeText(input.studentKeyStage);
  const placementEvidence = findPlacementEvidence({
    placementLevels: input.placementLevels,
    subject: input.contentSubject,
    contentType: input.contentType,
    strand: input.contentStrand,
  });
  const placementBySubject = placementEntryForSubject(input.placementLevels, input.contentSubject, [
    input.contentType ?? "",
    input.contentStrand ?? "",
    input.contentStrand ? `english:${input.contentStrand}` : "",
    input.contentStrand ? `english-language:${input.contentStrand}` : "",
  ]);
  const learningLevel = parseLearningLevel(input.studentLearningLevel);
  const evidenceYearGroup = placementEvidence?.targetLearningYearGroup ?? yearGroupFromLearningLevel(learningLevel);
  const supportedLowerLevel = isLowerOrSameYear(input.contentYearGroup, input.studentYearGroup)
    && Boolean(evidenceYearGroup)
    && isLowerOrSameYear(input.contentYearGroup, evidenceYearGroup);
  if (!pathwayMatches && !supportedLowerLevel) return false;
  if (!keyStageMatches && !supportedLowerLevel) return false;

  if (placementBySubject) {
    if (placementBySubject.level === "below") return input.contentLevel === null || input.contentLevel <= 2;
    if (placementBySubject.level === "secure") return input.contentLevel === null || input.contentLevel <= 4;
    return true;
  }

  if (learningLevel !== null && input.contentLevel !== null) {
    return learningLevel >= input.contentLevel - 1;
  }

  if (supportedLowerLevel) return true;

  return false;
}

export function assignmentMismatchWarningFlags(input: {
  yearMismatch: boolean;
  keyStageMismatch: boolean;
  placementSupported: boolean;
  lowerLevelRemediation: boolean;
  adminOverride: boolean;
}): string[] {
  const flags: string[] = [];
  if (input.yearMismatch) flags.push("year_mismatch");
  if (input.lowerLevelRemediation) flags.push("lower_level_remediation");
  if (input.adminOverride && input.yearMismatch && !input.placementSupported) flags.push("admin_year_override");
  if (input.adminOverride && input.keyStageMismatch && !input.lowerLevelRemediation) flags.push("admin_ks_override");
  return Array.from(new Set(flags));
}

export async function getAssignmentSafetyAndRecommendation(input: {
  studentId: string;
  contentId: string;
  adminOverride?: boolean;
  overrideReason?: string;
}): Promise<
  | {
    safe: true;
    meta: AssignmentSafetyMeta;
    recommendation: AssignmentRecommendation;
  }
  | {
    safe: false;
    reason: string;
    meta: AssignmentSafetyMeta;
  }
> {
  const [student, content] = await Promise.all([
    prisma.childProfile.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        name: true,
        age: true,
        yearGroup: true,
        weakAreas: {
          where: { status: "active" },
          select: { skillFocus: true },
        },
        schoolLinks: {
          where: { status: "active" },
          select: { schoolId: true },
        },
        studentProfile: { select: { keyStageLevel: true, subjectFocus: true, aiLearningProfileJson: true, learningLevel: true } },
      },
    }),
    prisma.aIContentCache.findUnique({
      where: { id: input.contentId },
      select: {
        id: true,
        status: true,
        contentJson: true,
        topic: true,
        skillFocus: true,
        level: true,
        keyStage: true,
        yearGroup: true,
        contentType: true,
        metadataJson: true,
      },
    }),
  ]);

  if (!student || !content) {
    return {
      safe: false,
      reason: "Student or content not found.",
      meta: {
        subject: "unknown",
        yearGroup: null,
        keyStage: null,
        curriculumPathway: null,
        examBoard: null,
        ageGroup: null,
        topic: null,
        skillFocus: null,
        status: content?.status ?? "unknown",
        schoolId: null,
      },
    };
  }

  const parsedMeta = parseContentMetadata(content.metadataJson);
  const parsedMetaObject = (() => {
    try {
      return content.metadataJson ? JSON.parse(content.metadataJson) as Record<string, unknown> : {};
    } catch {
      return {};
    }
  })();
  const targetLearningEvidence = parseTargetLearningEvidenceFromMetadata(parsedMetaObject);
  const contentSubject = normalizeCurriculumSubject(parsedMeta.subject) ?? "unknown";
  const contentYearGroup = content.yearGroup ?? parsedMeta.targetLearningYearGroup ?? targetLearningEvidence?.targetLearningYearGroup ?? parsedMeta.yearGroup ?? null;
  const contentYearRange = parseYearGroupRange(contentYearGroup)
    ?? parseYearGroupRange(parsedMeta.keyStage)
    ?? parseYearGroupRange(parsedMeta.ageGroup)
    ?? parseYearGroupRange(parsedMeta.curriculumPathway);
  const normalizedContentYearGroup = normalizeYearGroup(contentYearGroup) ?? contentYearRange?.min ?? null;
  const rawContentKeyStage = content.keyStage ?? parsedMeta.targetLearningKeyStage ?? targetLearningEvidence?.targetLearningKeyStage ?? parsedMeta.keyStage ?? null;
  const normalizedContentKeyStage = normalizeKeyStage(rawContentKeyStage) ?? (normalizedContentYearGroup ? keyStageForYearGroup(normalizedContentYearGroup) : null);
  const contentPathway = parsedMeta.curriculumPathway ?? null;
  const contentExamBoard = parsedMeta.examBoard ?? null;
  const contentAgeGroup = parsedMeta.ageGroup ?? contentYearGroup ?? rawContentKeyStage ?? (normalizedContentYearGroup ? ageGroupForYearGroup(normalizedContentYearGroup) : null);
  const studentYearGroup = normalizeYearGroup(student.yearGroup);
  const studentKeyStage = normalizeKeyStage(student.studentProfile?.keyStageLevel) ?? (studentYearGroup ? keyStageForYearGroup(studentYearGroup) : null);
  const studentCurriculum = readStudentCurriculumProfile({
    yearGroup: studentYearGroup,
    keyStageLevel: studentKeyStage,
    aiLearningProfileJson: student.studentProfile?.aiLearningProfileJson ?? null,
  });
  const quickLevelFinder = parseQuickLevelFinderSession(student.studentProfile?.aiLearningProfileJson ?? null);
  const placementLevels = quickLevelFinder?.levels ?? {};
  const studentSchoolIds = student.schoolLinks.map((link) => link.schoolId);
  const meta: AssignmentSafetyMeta = {
    subject: contentSubject,
    yearGroup: normalizedContentYearGroup,
    keyStage: normalizedContentKeyStage,
    curriculumPathway: contentPathway,
    examBoard: contentExamBoard,
    ageGroup: contentAgeGroup,
    topic: parsedMeta.topic ?? content.topic ?? null,
    skillFocus: parsedMeta.skillFocus ?? content.skillFocus ?? null,
    status: content.status,
    schoolId: parsedMeta.schoolId,
    warningReason: null,
    warningFlags: [],
  };
  const contentLegacyType = mapSubjectToLegacyContentType(content.contentType);

  if (contentSubject !== "unknown") {
    const inferredLegacyType = mapSubjectToLegacyContentType(contentSubject);
    if (inferredLegacyType && contentLegacyType && inferredLegacyType !== contentLegacyType) {
      // Allow curriculum English (english-language) with playable English strands (reading, etc.)
      // via the shared Daytime/Short Learning playable-type contract.
      if (!isPlayableSubjectContentTypeCompatible(contentSubject, content.contentType)) {
        return {
          safe: false,
          reason: `Content subject/type mismatch detected (${contentSubject} vs ${content.contentType}).`,
          meta,
        };
      }
    }
  }

  if (!["reviewed", "published"].includes(content.status)) {
    return {
      safe: false,
      reason: "Only Reviewed or Published content can be assigned. Use the Review action first.",
      meta,
    };
  }

  if (!isValidContentJson(content.contentJson)) {
    return { safe: false, reason: "Content is not valid JSON and cannot be assigned.", meta };
  }

  const slotValidation = analyzeContentSessionSlots({
    contentJson: content.contentJson,
    contentType: content.contentType,
    metadataJson: content.metadataJson,
    subject: parsedMeta.subject,
  });

  if (!slotValidation.isSessionComplete) {
    return {
      safe: false,
      reason: getIncompleteSlotsReason(slotValidation.missingSlots),
      meta,
    };
  }

  const contentQuestionIds = extractQuestionIdsFromContent(content.contentJson);
  const seenQuestionIds = contentQuestionIds.length > 0
    ? (await prisma.questionHistory.findMany({
      where: {
        childId: student.id,
        questionId: { in: contentQuestionIds },
      },
      select: {
        questionId: true,
      },
    })).map((entry) => entry.questionId)
    : [];

  if (contentLegacyType === "spelling") {
    let parsedContent: unknown = [];
    try {
      parsedContent = JSON.parse(content.contentJson);
    } catch {
      parsedContent = [];
    }
    const spellingContract = validateSpellingContentContract(parsedContent);
    if (!spellingContract.ok) {
      return {
        safe: false,
        reason: spellingContract.reason ?? "Invalid spelling content cannot be assigned.",
        meta,
      };
    }
  }

  if (meta.schoolId && studentSchoolIds.length > 0 && !studentSchoolIds.includes(meta.schoolId)) {
    return {
      safe: false,
      reason: "Student and content belong to different schools and cannot be assigned.",
      meta,
    };
  }

  if (meta.schoolId && studentSchoolIds.length === 0) {
    return {
      safe: false,
      reason: "Student has no active school context for this school-scoped content.",
      meta,
    };
  }

  const placementSupported = placementSupportsAssignment({
    contentSubject,
    contentPathway,
    contentKeyStage: normalizedContentKeyStage,
    contentYearGroup: normalizedContentYearGroup,
    contentLevel: Number.isFinite(content.level) ? content.level : null,
    contentType: content.contentType,
    contentStrand: parsedMeta.strand,
    studentPathway: studentCurriculum.curriculumPathway,
    studentKeyStage,
    studentYearGroup,
    studentLearningLevel: student.studentProfile?.learningLevel ?? null,
    placementLevels,
  });
  const placementWarning = "Placement pathway supports assignment; DOB/year mismatch flagged for review.";
  const lowerLevelRemediation = placementSupported && isLowerOrSameYear(normalizedContentYearGroup, studentYearGroup) && normalizedContentYearGroup !== studentYearGroup;
  const yearMismatch = Boolean(normalizedContentYearGroup && studentYearGroup && normalizedContentYearGroup !== studentYearGroup);
  const keyStageMismatch = Boolean(normalizedContentKeyStage && studentKeyStage && normalizedContentKeyStage !== studentKeyStage);
  const mismatchFlags = () => assignmentMismatchWarningFlags({
    yearMismatch,
    keyStageMismatch,
    placementSupported,
    lowerLevelRemediation,
    adminOverride: input.adminOverride ?? false,
  });
  const studentYearOrdinal = yearGroupToOrdinal(studentYearGroup);
  if (contentYearRange && studentYearOrdinal !== null && (studentYearOrdinal < contentYearRange.minOrdinal || studentYearOrdinal > contentYearRange.maxOrdinal)) {
    if (!placementSupported) {
        if (!input.adminOverride) {
          return {
            safe: false,
            reason: `This content is for ${contentYearRange.min}${contentYearRange.min !== contentYearRange.max ? `-${contentYearRange.max}` : ""} / ${normalizedContentKeyStage ?? "unknown key stage"} and cannot be assigned to this student.`,
            meta,
          };
        }
        meta.warningReason = input.overrideReason ?? "Admin manual assignment after Level Finder review";
        meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), "admin_year_override"]));
    }
    meta.warningReason = placementWarning;
    meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), ...mismatchFlags()]));
  }

  if (!contentYearRange && normalizedContentYearGroup && studentYearGroup && normalizedContentYearGroup !== studentYearGroup) {
    if (!placementSupported) {
        if (!input.adminOverride) {
          return {
            safe: false,
            reason: `This content is for ${normalizedContentYearGroup} / ${normalizedContentKeyStage ?? "unknown key stage"} and cannot be assigned to this student.`,
            meta,
          };
        }
        meta.warningReason = input.overrideReason ?? "Admin manual assignment after Level Finder review";
        meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), "admin_year_override"]));
    }
    meta.warningReason = placementWarning;
    meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), ...mismatchFlags()]));
  }

  if (keyStageMismatch) {
    if (!input.adminOverride && !lowerLevelRemediation) {
      return {
        safe: false,
        reason: `This content is for ${normalizedContentYearGroup ?? "specific year"} / ${normalizedContentKeyStage} and cannot be assigned to this student.`,
        meta,
      };
    }
    meta.warningReason = lowerLevelRemediation
      ? placementWarning
      : input.overrideReason ?? "Admin manual assignment after Level Finder review";
    meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), ...mismatchFlags()]));
  }

  const shouldCheckExamBoard = shouldApplyExamBoardTag({
    yearGroup: normalizedContentYearGroup,
    keyStage: normalizedContentKeyStage,
    curriculumPathway: contentPathway,
    subject: contentSubject,
  });
  if (shouldCheckExamBoard && contentExamBoard && studentCurriculum.examBoard && contentExamBoard !== studentCurriculum.examBoard) {
    return {
      safe: false,
      reason: `This GCSE content is tagged for ${contentExamBoard} and cannot be assigned to a ${studentCurriculum.examBoard} learner profile.`,
      meta,
    };
  }

  const strictAgeRange = parseAgeGroupRange(contentAgeGroup) ?? deriveAgeRangeFromCurriculumTags(contentAgeGroup);
  if (strictAgeRange && typeof student.age === "number" && (student.age < strictAgeRange.min || student.age > strictAgeRange.max)) {
    const distance = student.age < strictAgeRange.min
      ? strictAgeRange.min - student.age
      : student.age - strictAgeRange.max;
    if (!placementSupported || distance > 2) {
        if (!input.adminOverride) {
          return { safe: false, reason: `This content is designed for age group ${contentAgeGroup}.`, meta };
        }
        meta.warningReason = input.overrideReason ?? "Admin manual assignment after Level Finder review";
        meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), "admin_age_override"]));
    }
    meta.warningReason = placementWarning;
    meta.warningFlags = Array.from(new Set([...(meta.warningFlags ?? []), "dob_age_mismatch"]));
  }

  applyExposureWarning({
    meta,
    seenIds: seenQuestionIds,
    totalQuestionCount: contentQuestionIds.length,
    classification: classifyExposureIntent({
      seenCount: seenQuestionIds.length,
      totalCount: contentQuestionIds.length,
      contentSubject,
      contentType: content.contentType,
      topic: meta.topic,
      skillFocus: meta.skillFocus,
      yearGroup: normalizedContentYearGroup,
      keyStage: normalizedContentKeyStage,
      lowerLevelRemediation,
    }),
    risk: exposureRiskFor(seenQuestionIds.length, contentQuestionIds.length),
  });

  const studentSubjectFocus = normalizeText(student.studentProfile?.subjectFocus);
  const learningDnaSignals = deriveLearningDnaWeakSignals(student.studentProfile?.aiLearningProfileJson ?? null);
  const contentSkillFocus = normalizeText(meta.skillFocus);
  const contentTopic = normalizeText(meta.topic);
  const matchedWeakAreas = student.weakAreas
    .map((area) => normalizeText(area.skillFocus))
    .filter((skill) => {
      if (!skill) return false;
      const hasNeedle = Boolean(contentSkillFocus) || Boolean(contentTopic);
      if (!hasNeedle) return false;
      return contentSkillFocus.includes(skill)
        || contentTopic.includes(skill)
        || (Boolean(contentSkillFocus) && skill.includes(contentSkillFocus));
    });

  if (matchedWeakAreas.length > 0) {
    return {
      safe: true,
      meta,
      recommendation: {
        level: "recommended",
        reason: meta.warningReason
          ? `Recommended match: this content supports the student's weak area. ${meta.warningReason}`
          : "Recommended match: this content supports the student's weak area.",
        matchedWeakAreas,
      },
    };
  }

  if (studentSubjectFocus && contentSubject !== "unknown" && (studentSubjectFocus.includes(contentSubject) || contentSubject.includes(studentSubjectFocus))) {
    return {
      safe: true,
      meta,
      recommendation: {
        level: "recommended",
        reason: meta.warningReason
          ? `Recommended match: this content aligns with the student's subject focus. ${meta.warningReason}`
          : "Recommended match: this content aligns with the student's subject focus.",
        matchedWeakAreas: [],
      },
    };
  }

  const dnaMatchedSignals = learningDnaSignals.filter((signal) => {
    if (!signal) return false;
    if (!contentSkillFocus && !contentTopic && !contentSubject) return false;
    return contentSkillFocus.includes(signal)
      || contentTopic.includes(signal)
      || contentSubject.includes(signal)
      || signal.includes(contentSkillFocus)
      || signal.includes(contentTopic);
  });

  if (dnaMatchedSignals.length > 0) {
    return {
      safe: true,
      meta,
      recommendation: {
        level: "recommended",
        reason: meta.warningReason
          ? `Recommended by Learning DNA: this content targets predicted support needs. ${meta.warningReason}`
          : "Recommended by Learning DNA: this content targets predicted support needs.",
        matchedWeakAreas: dnaMatchedSignals,
      },
    };
  }

  return {
    safe: true,
    meta,
    recommendation: {
      level: "eligible_manual",
      reason: meta.warningReason
        ? `Eligible manual assignment: no matching weak area detected. ${meta.warningReason}`
        : "Eligible manual assignment: no matching weak area detected.",
      matchedWeakAreas: [],
    },
  };
}

export async function assignContentToStudent(input: {
  studentId: string;
  contentId: string;
  actorUserId?: string;
  reason?: string;
  forceResend?: boolean;
  adminOverride?: boolean;
  overrideReason?: string;
}) {
  const safety = await getAssignmentSafetyAndRecommendation({
    studentId: input.studentId,
    contentId: input.contentId,
    adminOverride: input.adminOverride,
    overrideReason: input.overrideReason,
  });
  if (!safety.safe) {
    throw new AssignmentSafetyError(safety.reason, { safety: safety.meta });
  }

  const schoolAccess = await evaluateStudentAssignmentAccess(input.studentId);
  if (!schoolAccess.allowed) {
    throw new SchoolLicenceAccessError({
      reason: schoolAccess.reason ?? "LICENCE_EXPIRED",
      schoolId: schoolAccess.schoolId,
      schoolName: schoolAccess.schoolName,
    });
  }

  const existing = await prisma.assignment.findUnique({
    where: { studentId_contentId: { studentId: input.studentId, contentId: input.contentId } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "archived" && existing.status !== "completed" && !input.forceResend) {
    throw new DuplicateAssignmentError(existing.id);
  }

  const assignment = await prisma.assignment.upsert({
    where: { studentId_contentId: { studentId: input.studentId, contentId: input.contentId } },
    create: {
      studentId: input.studentId,
      contentId: input.contentId,
      status: "assigned",
    },
    update: {
      status: "assigned",
      updatedAt: new Date(),
    },
  });

  await prisma.aIContentCache.update({
    where: { id: input.contentId },
    data: {
      usedCount: {
        increment: 1,
      },
    },
  });

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "assignment.created",
    entityType: "assignment",
    entityId: assignment.id,
    metadata: {
      studentId: input.studentId,
      contentId: input.contentId,
      reason: input.reason,
      overrideReason: input.adminOverride ? (input.overrideReason ?? "Admin manual assignment after Level Finder review") : null,
      adminOverride: input.adminOverride ?? false,
      matchedYearGroup: safety.meta.yearGroup,
      matchedKeyStage: safety.meta.keyStage,
      contentStatus: safety.meta.status,
      contentSubject: safety.meta.subject,
      topic: safety.meta.topic,
      skillFocus: safety.meta.skillFocus,
      assignmentSafety: "hard_pass",
      assignmentRecommendation: safety.recommendation.level,
      recommendationReason: safety.recommendation.reason,
      matchedWeakAreas: safety.recommendation.matchedWeakAreas,
      assignmentWarning: safety.meta.warningReason ?? null,
      assignmentWarningFlags: safety.meta.warningFlags ?? [],
      exposureClassification: safety.meta.exposureClassification ?? "first_exposure",
      exposureRisk: safety.meta.exposureRisk ?? "none",
      exposureSeenQuestionCount: safety.meta.exposureSeenQuestionCount ?? 0,
      exposureTotalQuestionCount: safety.meta.exposureTotalQuestionCount ?? 0,
      exposureSeenQuestionIds: safety.meta.exposureSeenQuestionIds ?? [],
    },
  });

  await invalidateAcademicIntelligenceSnapshot({
    studentId: input.studentId,
    reason: "admin_assignment_update",
  }).catch(() => undefined);

  return {
    ...assignment,
    assignmentWarning: safety.meta.warningReason ?? null,
    assignmentWarningFlags: safety.meta.warningFlags ?? [],
    exposureClassification: safety.meta.exposureClassification ?? "first_exposure",
    exposureRisk: safety.meta.exposureRisk ?? "none",
    exposureSeenQuestionCount: safety.meta.exposureSeenQuestionCount ?? 0,
    exposureTotalQuestionCount: safety.meta.exposureTotalQuestionCount ?? 0,
  };
}

export function taskHrefForContentType(contentType: string, assignmentId?: string) {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === "ga") {
    const params = new URLSearchParams();
    if (assignmentId) params.set("assignmentId", assignmentId);
    const query = params.toString();
    return query ? `/ga-learning-hub?${query}` : "/ga-learning-hub";
  }
  const readingTypes = new Set(["reading", "english-language", "english-literature", "gcse-english", "vocabulary"]);
  const lessonTypes = new Set(["lesson", "ai_daily", "daily", "science", "gcse-science", "writing", "grammar", "punctuation"]);
  const mathTypes = new Set(["math", "maths", "times-tables", "gcse-maths", "11-plus-practice", "sats-practice"]);
  const path = lessonTypes.has(normalized)
    ? "/games/lesson"
    : mathTypes.has(normalized)
      ? "/games/math"
      : readingTypes.has(normalized)
        ? "/games/reading"
        : "/games/spelling";
  const params = new URLSearchParams();
  if (assignmentId) params.set("assignmentId", assignmentId);
  if (normalized.includes("literature") || normalized.includes("gcse-english")) params.set("mode", "literature");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
