import { ENGLISH_STRANDS } from "@/lib/subject-selection";
import type { CertificateEligibilityEngineOutput, CertificateType } from "@/lib/certificate-eligibility";
import type { SubjectProgressionRecommendation } from "@/lib/subject-level-progression";

export type StudentAwardType =
  | "student_of_term"
  | "student_of_year"
  | "best_student_year_group"
  | "starliz_advancement_award"
  | "fastest_advancing_year_group"
  | "most_improved_year_group"
  | "subject_star_year_group"
  | "english_star"
  | "maths_star"
  | "reading_champion"
  | "spelling_champion"
  | "consistency_award"
  | "resilience_award";

export type StudentAwardScope = "platform" | "year_group" | "subject" | "subject_strand" | "term" | "academic_year";

export type StudentAwardStatus = "pending_review";

type PlacementLevel = {
  accuracy: number;
  level: "below" | "secure" | "advanced";
};

type AssignmentEvidence = {
  status: string;
  contentType: string;
  topic: string | null;
  skillFocus: string | null;
  metadataJson?: string | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type AttemptEvidence = {
  subject: string;
  skillFocus: string | null;
  correct: boolean;
  responseTimeMs?: number;
  hintsUsed?: number;
  createdAt?: string | Date | null;
};

type WeakAreaEvidence = {
  subject: string;
  skillFocus: string;
  status: string;
  accuracy?: number;
  attemptsCount?: number;
};

type StudentSkillEvidence = {
  skill: string;
  status: string;
  accuracy: number;
  attempts: number;
};

type ProgressRecordEvidence = {
  activityType: string;
  activityName: string;
  score: number | null;
  accuracy: number | null;
  completed: boolean;
  createdAt?: string | Date | null;
};

export type StudentAwardEvidenceInput = {
  studentId: string;
  studentName?: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  term: string;
  academicYear: string;
  selectedSubjects: string[];
  placementLevels: Record<string, PlacementLevel>;
  progressionRecommendations: SubjectProgressionRecommendation[];
  certificateEligibility?: CertificateEligibilityEngineOutput | null;
  certificateIssuedState?: CertificateType[];
  assignments: AssignmentEvidence[];
  attempts: AttemptEvidence[];
  weakAreas: WeakAreaEvidence[];
  studentSkills: StudentSkillEvidence[];
  progressRecords: ProgressRecordEvidence[];
};

export type StudentAwardNomination = {
  awardType: StudentAwardType;
  awardScope: StudentAwardScope;
  studentId: string;
  studentName: string;
  yearGroup: string | null;
  term: string;
  academicYear: string;
  subject: string | null;
  strand: string | null;
  score: number;
  rank: number | null;
  status: StudentAwardStatus;
  eligibleForNomination: boolean;
  evidenceSummary: {
    evidenceVolume: number;
    baselineAccuracy: number;
    currentAccuracy: number;
    improvementPoints: number;
    assessmentScore: number;
    assignmentCompletionScore: number;
    attemptQualityScore: number;
    masteryAndAdvancementScore: number;
    levelAdvancementScore: number;
    catchUpAndResilienceScore: number;
    consistencyScore: number;
    activeWeakAreas: number;
    resolvedWeakAreas: number;
    fastLowQualityAttemptRatio: number;
  };
  reasons: string[];
  blockers: string[];
  safeguards: string[];
  suggestedCertificateTitle: string;
  suggestedAwardMessage: string;
};

type ScoreComponents = {
  evidenceVolume: number;
  baselineAccuracy: number;
  currentAccuracy: number;
  improvementPoints: number;
  assessmentScore: number;
  assignmentCompletionScore: number;
  attemptQualityScore: number;
  masteryAndAdvancementScore: number;
  levelAdvancementScore: number;
  catchUpAndResilienceScore: number;
  consistencyScore: number;
  activeWeakAreas: number;
  resolvedWeakAreas: number;
  fastLowQualityAttemptRatio: number;
};

type ParsedScope = {
  parentSubject: string;
  strand: string | null;
};

const ENGLISH_STRAND_SET = new Set<string>(ENGLISH_STRANDS);
const STRONG_PROGRESSION = new Set<SubjectProgressionRecommendation["status"]>(["secure", "ready_to_advance", "advanced"]);

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function parseScopedSubject(raw: string): ParsedScope {
  const normalized = normalize(raw);
  if (!normalized) return { parentSubject: "", strand: null };

  if (normalized.includes(":")) {
    const [parentRaw, strandRaw] = normalized.split(":", 2);
    const parent = normalize(parentRaw);
    const strand = normalize(strandRaw);
    if (parent === "english" && ENGLISH_STRAND_SET.has(strand)) {
      return { parentSubject: "english", strand };
    }
    return { parentSubject: parent, strand: strand || null };
  }

  if (ENGLISH_STRAND_SET.has(normalized)) {
    return { parentSubject: "english", strand: normalized };
  }

  return { parentSubject: normalized, strand: null };
}

function scopeMatches(input: { parentSubject: string; strand: string | null }, values: Array<string | null | undefined>): boolean {
  const texts = values.map((value) => normalize(value)).filter(Boolean);
  if (!texts.length) return false;

  if (input.parentSubject === "english") {
    if (input.strand) {
      for (const text of texts) {
        if (text.includes(`english:${input.strand}`)) return true;
        if (text.includes(input.strand)) return true;
        if (input.strand === "reading" && (text.includes("reading") || text.includes("comprehension"))) return true;
        if (input.strand === "spelling" && text.includes("spell")) return true;
      }
      return false;
    }
    return texts.some((text) => text.includes("english"));
  }

  if (input.parentSubject === "maths") {
    return texts.some((text) => text.includes("math") || text.includes("arithmetic") || text.includes("number"));
  }

  return texts.some((text) => text.includes(input.parentSubject));
}

function scoreFromPlacement(levels: Record<string, PlacementLevel>): number {
  const rows = Object.values(levels);
  if (!rows.length) return 0;
  return clamp(average(rows.map((row) => clamp(row.accuracy))));
}

function selectAssessmentScores(progressRecords: ProgressRecordEvidence[]): number[] {
  return progressRecords
    .filter((row) => {
      const text = `${normalize(row.activityType)} ${normalize(row.activityName)}`;
      return /exam|assessment|quiz|checkpoint|test/.test(text);
    })
    .map((row) => {
      if (typeof row.score === "number") return clamp(row.score);
      if (typeof row.accuracy === "number") return clamp(row.accuracy);
      return null;
    })
    .filter((value): value is number => value !== null);
}

function detectAttemptQuality(attempts: AttemptEvidence[]): { score: number; fastLowQualityRatio: number; accuracy: number } {
  if (!attempts.length) return { score: 0, fastLowQualityRatio: 0, accuracy: 0 };

  const correctCount = attempts.filter((row) => row.correct).length;
  const accuracy = clamp((correctCount / attempts.length) * 100);

  let lowQualityCount = 0;
  let highQualityCount = 0;
  for (const row of attempts) {
    const responseTime = typeof row.responseTimeMs === "number" ? row.responseTimeMs : 0;
    const hintsUsed = typeof row.hintsUsed === "number" ? row.hintsUsed : 0;
    const suspiciousSpeed = responseTime > 0 && responseTime < 1200;
    const hintHeavy = hintsUsed >= 3;
    if ((!row.correct && suspiciousSpeed) || (!row.correct && hintHeavy)) {
      lowQualityCount += 1;
    }
    if (row.correct && responseTime >= 1500 && hintsUsed <= 2) {
      highQualityCount += 1;
    }
  }

  const fastLowQualityRatio = attempts.length ? lowQualityCount / attempts.length : 0;
  const qualityRatio = attempts.length ? highQualityCount / attempts.length : 0;
  const score = clamp((accuracy * 0.6) + (qualityRatio * 100 * 0.4) - (fastLowQualityRatio * 40));

  return {
    score,
    fastLowQualityRatio,
    accuracy,
  };
}

function computeConsistencyScore(input: {
  attempts: AttemptEvidence[];
  progressRecords: ProgressRecordEvidence[];
}): number {
  const days = new Set<string>();
  for (const attempt of input.attempts) {
    const date = asDate(attempt.createdAt);
    if (date) days.add(date.toISOString().slice(0, 10));
  }
  for (const row of input.progressRecords) {
    const date = asDate(row.createdAt);
    if (date) days.add(date.toISOString().slice(0, 10));
  }

  if (!days.size) return 0;
  return clamp((days.size / 14) * 100);
}

function computeMasteryAndAdvancement(input: {
  progressionRecommendations: SubjectProgressionRecommendation[];
  studentSkills: StudentSkillEvidence[];
}): { masteryAndAdvancementScore: number; levelAdvancementScore: number } {
  const progression = input.progressionRecommendations;
  const strongCount = progression.filter((row) => STRONG_PROGRESSION.has(row.status)).length;
  const progressionStrength = progression.length ? (strongCount / progression.length) * 100 : 0;

  const levelGains = progression
    .map((row) => Math.max(0, row.recommendedLevel - row.currentLevel))
    .filter((value) => value > 0);
  const levelAdvancementScore = clamp(average(levelGains) * 35);

  const mastered = input.studentSkills.filter((row) => normalize(row.status) === "mastered").length;
  const improving = input.studentSkills.filter((row) => normalize(row.status) === "improving").length;
  const skillSignal = input.studentSkills.length
    ? ((mastered + (improving * 0.5)) / input.studentSkills.length) * 100
    : 0;

  return {
    masteryAndAdvancementScore: clamp((progressionStrength * 0.6) + (skillSignal * 0.4)),
    levelAdvancementScore,
  };
}

function buildEvidenceSummary(input: StudentAwardEvidenceInput): ScoreComponents {
  const totalAssignments = input.assignments.length;
  const completedAssignments = input.assignments.filter((row) => normalize(row.status) === "completed").length;
  const assignmentCompletionScore = totalAssignments ? clamp((completedAssignments / totalAssignments) * 100) : 0;

  const attemptQuality = detectAttemptQuality(input.attempts);
  const assessmentScores = selectAssessmentScores(input.progressRecords);
  const assessmentScore = clamp(average(assessmentScores));
  const baselineAccuracy = scoreFromPlacement(input.placementLevels);

  const skillAccuracy = clamp(average(input.studentSkills.filter((row) => row.attempts > 0).map((row) => row.accuracy)));
  const currentAccuracy = clamp((assessmentScore * 0.4) + (attemptQuality.accuracy * 0.4) + (skillAccuracy * 0.2));
  const improvementPoints = clamp((currentAccuracy - baselineAccuracy) * 2.5);

  const activeWeakAreas = input.weakAreas.filter((row) => normalize(row.status) === "active").length;
  const resolvedWeakAreas = input.weakAreas.filter((row) => normalize(row.status) !== "active").length;
  const catchUpAndResilienceScore = clamp((resolvedWeakAreas * 20) - (activeWeakAreas * 10) + (assignmentCompletionScore * 0.4));

  const consistencyScore = computeConsistencyScore({
    attempts: input.attempts,
    progressRecords: input.progressRecords,
  });

  const advancement = computeMasteryAndAdvancement({
    progressionRecommendations: input.progressionRecommendations,
    studentSkills: input.studentSkills,
  });

  const evidenceVolume =
    input.assignments.length
    + input.attempts.length
    + input.progressRecords.length
    + input.studentSkills.filter((row) => row.attempts > 0).length
    + input.progressionRecommendations.length;

  return {
    evidenceVolume,
    baselineAccuracy,
    currentAccuracy,
    improvementPoints,
    assessmentScore,
    assignmentCompletionScore,
    attemptQualityScore: attemptQuality.score,
    masteryAndAdvancementScore: advancement.masteryAndAdvancementScore,
    levelAdvancementScore: advancement.levelAdvancementScore,
    catchUpAndResilienceScore,
    consistencyScore,
    activeWeakAreas,
    resolvedWeakAreas,
    fastLowQualityAttemptRatio: Number(attemptQuality.fastLowQualityRatio.toFixed(3)),
  };
}

function weightedScore(weights: Array<[number, number]>): number {
  return clamp(weights.reduce((sum, [value, weight]) => sum + (value * weight), 0));
}

function defaultSafeguards(): string[] {
  return [
    "Award requires admin review before issuing.",
    "Nominations are evidence-backed and do not auto-issue certificates.",
    "Fast-clicking and low-quality attempt patterns reduce eligibility.",
  ];
}

function awardLabel(awardType: StudentAwardType): string {
  if (awardType === "student_of_term") return "StarLiz Academy Student of the Term";
  if (awardType === "student_of_year") return "StarLiz Academy Student of the Year";
  if (awardType === "best_student_year_group") return "Best Student - Year Group";
  if (awardType === "starliz_advancement_award") return "StarLiz Advancement Award";
  if (awardType === "fastest_advancing_year_group") return "Fastest Advancing Student - Year Group";
  if (awardType === "most_improved_year_group") return "Most Improved Student - Year Group";
  if (awardType === "subject_star_year_group") return "Subject Star - Year Group";
  if (awardType === "english_star") return "English Star";
  if (awardType === "maths_star") return "Maths Star";
  if (awardType === "reading_champion") return "Reading Champion";
  if (awardType === "spelling_champion") return "Spelling Champion";
  if (awardType === "consistency_award") return "Consistency Award";
  return "Resilience Award";
}

function bestStudentScore(components: ScoreComponents): number {
  return weightedScore([
    [components.assessmentScore, 0.25],
    [components.assignmentCompletionScore, 0.20],
    [components.attemptQualityScore, 0.15],
    [components.improvementPoints, 0.15],
    [components.masteryAndAdvancementScore, 0.15],
    [components.catchUpAndResilienceScore, 0.05],
    [components.consistencyScore, 0.05],
  ]);
}

function advancementScore(components: ScoreComponents): number {
  const assessmentImprovement = clamp((components.assessmentScore - components.baselineAccuracy) * 2);
  return weightedScore([
    [components.improvementPoints, 0.25],
    [components.masteryAndAdvancementScore, 0.25],
    [components.levelAdvancementScore, 0.20],
    [assessmentImprovement, 0.15],
    [components.catchUpAndResilienceScore, 0.05],
    [components.consistencyScore, 0.05],
    [components.attemptQualityScore, 0.05],
  ]);
}

function hasEnoughEvidence(components: ScoreComponents): boolean {
  return components.evidenceVolume >= 8;
}

function blockersForAward(input: {
  awardType: StudentAwardType;
  components: ScoreComponents;
}): string[] {
  const blockers: string[] = [];

  if (!hasEnoughEvidence(input.components)) {
    blockers.push("Not enough evidence for nomination.");
  }

  if (input.components.fastLowQualityAttemptRatio >= 0.45 && input.components.attemptQualityScore < 45) {
    blockers.push("Low-quality fast attempt pattern detected.");
  }

  const isResilienceLike = input.awardType === "resilience_award" || input.awardType === "most_improved_year_group" || input.awardType === "starliz_advancement_award";

  if (!isResilienceLike && input.components.activeWeakAreas > 0) {
    blockers.push("Active critical weak areas must be resolved for this award type.");
  }

  if (
    (input.awardType === "student_of_term" || input.awardType === "student_of_year" || input.awardType === "best_student_year_group")
    && input.components.assessmentScore >= 85
    && input.components.assignmentCompletionScore < 55
    && input.components.masteryAndAdvancementScore < 55
    && input.components.improvementPoints < 10
  ) {
    blockers.push("High score alone is insufficient without broad learning evidence.");
  }

  return blockers;
}

function reasonsForAward(input: {
  awardType: StudentAwardType;
  score: number;
  components: ScoreComponents;
  subject: string | null;
  strand: string | null;
}): string[] {
  const reasons: string[] = [];
  if (input.components.improvementPoints >= 20) {
    reasons.push(`Strong improvement from baseline (${input.components.improvementPoints} points).`);
  }
  if (input.components.levelAdvancementScore >= 45) {
    reasons.push("Evidence of level advancement and progression growth.");
  }
  if (input.components.assignmentCompletionScore >= 70) {
    reasons.push("High assignment completion consistency.");
  }
  if (input.components.catchUpAndResilienceScore >= 55) {
    reasons.push("Weak-area recovery and catch-up evidence present.");
  }
  if (input.components.consistencyScore >= 50) {
    reasons.push("Consistent engagement across multiple learning days.");
  }
  if (input.subject === "English" && input.strand) {
    reasons.push(`${titleCase(input.strand)} evidence is evaluated under English strands.`);
  }
  if (!reasons.length) {
    reasons.push(`Balanced evidence score computed at ${input.score}.`);
  }
  return reasons;
}

function buildNomination(input: {
  student: StudentAwardEvidenceInput;
  awardType: StudentAwardType;
  awardScope: StudentAwardScope;
  score: number;
  components: ScoreComponents;
  subject?: string | null;
  strand?: string | null;
}): StudentAwardNomination {
  const blockers = blockersForAward({ awardType: input.awardType, components: input.components });
  const eligibleForNomination = blockers.length === 0;
  const subject = input.subject ?? null;
  const strand = input.strand ?? null;
  const titleScope = input.student.yearGroup ? ` - ${input.student.yearGroup}` : "";

  return {
    awardType: input.awardType,
    awardScope: input.awardScope,
    studentId: input.student.studentId,
    studentName: input.student.studentName ?? "Learner",
    yearGroup: input.student.yearGroup ?? null,
    term: input.student.term,
    academicYear: input.student.academicYear,
    subject,
    strand,
    score: clamp(input.score),
    rank: null,
    status: "pending_review",
    eligibleForNomination,
    evidenceSummary: input.components,
    reasons: reasonsForAward({
      awardType: input.awardType,
      score: clamp(input.score),
      components: input.components,
      subject,
      strand,
    }),
    blockers,
    safeguards: defaultSafeguards(),
    suggestedCertificateTitle: `${awardLabel(input.awardType)}${titleScope}`,
    suggestedAwardMessage: `${awardLabel(input.awardType)} nomination prepared for review.`,
  };
}

function subjectNominationScore(base: ScoreComponents): number {
  return weightedScore([
    [base.assessmentScore, 0.2],
    [base.assignmentCompletionScore, 0.2],
    [base.attemptQualityScore, 0.2],
    [base.masteryAndAdvancementScore, 0.2],
    [base.consistencyScore, 0.2],
  ]);
}

function scopedEvidence(input: StudentAwardEvidenceInput, scope: { parentSubject: string; strand: string | null }): StudentAwardEvidenceInput {
  const attempts = input.attempts.filter((row) => scopeMatches(scope, [row.subject, row.skillFocus]));
  const assignments = input.assignments.filter((row) => scopeMatches(scope, [row.contentType, row.topic, row.skillFocus]));
  const weakAreas = input.weakAreas.filter((row) => scopeMatches(scope, [row.subject, row.skillFocus]));
  const studentSkills = input.studentSkills.filter((row) => scopeMatches(scope, [row.skill]));
  const progressRecords = input.progressRecords.filter((row) => scopeMatches(scope, [row.activityType, row.activityName]));
  const progressionRecommendations = input.progressionRecommendations.filter((row) => scopeMatches(scope, [row.subject, row.strand, row.scopedSubject]));

  const placementLevels = Object.fromEntries(
    Object.entries(input.placementLevels).filter(([key]) => {
      const parsed = parseScopedSubject(key);
      if (scope.parentSubject !== parsed.parentSubject) return false;
      if (!scope.strand) return true;
      return parsed.strand === scope.strand;
    }),
  );

  return {
    ...input,
    attempts,
    assignments,
    weakAreas,
    studentSkills,
    progressRecords,
    progressionRecommendations,
    placementLevels,
  };
}

export function buildStudentAwardNominations(input: StudentAwardEvidenceInput): StudentAwardNomination[] {
  const components = buildEvidenceSummary(input);

  const nominations: StudentAwardNomination[] = [];
  const bestScore = bestStudentScore(components);
  const advanceScore = advancementScore(components);

  nominations.push(buildNomination({ student: input, awardType: "student_of_term", awardScope: "term", score: bestScore, components }));
  nominations.push(buildNomination({ student: input, awardType: "student_of_year", awardScope: "academic_year", score: bestScore, components }));
  nominations.push(buildNomination({ student: input, awardType: "best_student_year_group", awardScope: "year_group", score: bestScore, components }));
  nominations.push(buildNomination({ student: input, awardType: "starliz_advancement_award", awardScope: "term", score: advanceScore, components }));
  nominations.push(buildNomination({ student: input, awardType: "fastest_advancing_year_group", awardScope: "year_group", score: weightedScore([[components.levelAdvancementScore, 0.5], [components.improvementPoints, 0.3], [components.consistencyScore, 0.2]]), components }));
  nominations.push(buildNomination({ student: input, awardType: "most_improved_year_group", awardScope: "year_group", score: weightedScore([[components.improvementPoints, 0.5], [components.catchUpAndResilienceScore, 0.2], [components.assignmentCompletionScore, 0.2], [components.consistencyScore, 0.1]]), components }));
  nominations.push(buildNomination({ student: input, awardType: "consistency_award", awardScope: "term", score: weightedScore([[components.consistencyScore, 0.6], [components.assignmentCompletionScore, 0.2], [components.attemptQualityScore, 0.2]]), components }));
  nominations.push(buildNomination({ student: input, awardType: "resilience_award", awardScope: "term", score: weightedScore([[components.catchUpAndResilienceScore, 0.35], [components.improvementPoints, 0.25], [components.consistencyScore, 0.2], [components.assignmentCompletionScore, 0.2]]), components }));

  const hasMaths = input.selectedSubjects.map(normalize).includes("maths") || Object.keys(input.placementLevels).some((key) => parseScopedSubject(key).parentSubject === "maths");
  if (hasMaths) {
    const mathsScoped = scopedEvidence(input, { parentSubject: "maths", strand: null });
    const mathsComponents = buildEvidenceSummary(mathsScoped);
    nominations.push(buildNomination({
      student: input,
      awardType: "maths_star",
      awardScope: "subject",
      subject: "Maths",
      score: subjectNominationScore(mathsComponents),
      components: mathsComponents,
    }));
  }

  const hasEnglish = input.selectedSubjects.map(normalize).includes("english") || Object.keys(input.placementLevels).some((key) => parseScopedSubject(key).parentSubject === "english");
  if (hasEnglish) {
    const englishScoped = scopedEvidence(input, { parentSubject: "english", strand: null });
    const englishComponents = buildEvidenceSummary(englishScoped);
    nominations.push(buildNomination({
      student: input,
      awardType: "english_star",
      awardScope: "subject",
      subject: "English",
      score: subjectNominationScore(englishComponents),
      components: englishComponents,
    }));

    for (const strand of ["reading", "spelling"] as const) {
      const strandScoped = scopedEvidence(input, { parentSubject: "english", strand });
      const strandComponents = buildEvidenceSummary(strandScoped);
      nominations.push(buildNomination({
        student: input,
        awardType: strand === "reading" ? "reading_champion" : "spelling_champion",
        awardScope: "subject_strand",
        subject: "English",
        strand,
        score: subjectNominationScore(strandComponents),
        components: strandComponents,
      }));
    }

    nominations.push(buildNomination({
      student: input,
      awardType: "subject_star_year_group",
      awardScope: "subject",
      subject: "English",
      score: subjectNominationScore(englishComponents),
      components: englishComponents,
    }));
  }

  return nominations;
}

function nominationGroupKey(nomination: StudentAwardNomination): string {
  return [
    nomination.awardType,
    nomination.awardScope,
    nomination.term,
    nomination.academicYear,
    nomination.yearGroup ?? "all",
    nomination.subject ?? "any",
    nomination.strand ?? "any",
  ].join("|");
}

export function rankAwardNominations(nominations: StudentAwardNomination[]): StudentAwardNomination[] {
  const grouped = new Map<string, StudentAwardNomination[]>();
  for (const nomination of nominations) {
    const key = nominationGroupKey(nomination);
    const rows = grouped.get(key) ?? [];
    rows.push({ ...nomination, rank: null });
    grouped.set(key, rows);
  }

  const ranked: StudentAwardNomination[] = [];
  for (const rows of grouped.values()) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    let nextRank = 1;
    for (const row of sorted) {
      if (row.eligibleForNomination) {
        row.rank = nextRank;
        nextRank += 1;
      }
      ranked.push(row);
    }
  }

  return ranked;
}

export function buildAwardNominationsForCohort(input: {
  students: StudentAwardEvidenceInput[];
  scopeFilter?: StudentAwardScope;
  yearGroup?: string | null;
}): {
  code?: "not_enough_evidence";
  nominations: StudentAwardNomination[];
  summary: {
    totalStudents: number;
    nominationsCount: number;
    eligibleCount: number;
  };
} {
  const all = input.students.flatMap((student) => buildStudentAwardNominations(student));
  const ranked = rankAwardNominations(all)
    .filter((row) => !input.scopeFilter || row.awardScope === input.scopeFilter)
    .filter((row) => !input.yearGroup || normalize(row.yearGroup) === normalize(input.yearGroup));

  const eligibleCount = ranked.filter((row) => row.eligibleForNomination).length;
  const code = eligibleCount === 0 ? "not_enough_evidence" : undefined;

  return {
    code,
    nominations: ranked,
    summary: {
      totalStudents: input.students.length,
      nominationsCount: ranked.length,
      eligibleCount,
    },
  };
}
