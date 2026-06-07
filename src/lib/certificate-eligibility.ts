import { ENGLISH_STRANDS } from "@/lib/subject-selection";
import type { PlacementBand } from "@/lib/placement-lesson-selector";
import type { ProgressionStatus, SubjectProgressionRecommendation } from "@/lib/subject-level-progression";
import {
  canonicalCompletionPercentage,
  summarizeCanonicalCompletionFromStatuses,
} from "@/lib/canonical-completion-accessor";

export type CertificateType =
  | "term_completion"
  | "end_of_term_exam"
  | "subject_achievement"
  | "english_achievement"
  | "mastery_certificate";

export type CertificateEligibilityStatus =
  | "locked"
  | "pending_lessons"
  | "pending_quizzes"
  | "pending_catch_up"
  | "pending_exam"
  | "pending_review"
  | "eligible"
  | "issued"
  | "not_yet_awarded";

export type CertificateAction =
  | "continue_lessons"
  | "complete_quizzes"
  | "complete_catch_up"
  | "take_end_of_term_exam"
  | "request_parent_admin_review"
  | "issue_certificate"
  | "keep_learning";

export type CertificateExamStatus = "pending_exam" | "completed" | "not_required";
export type CertificatePassStatus = "pass" | "fail" | "not_checked";

export type CertificateSubjectBreakdown = {
  scopedSubject: string;
  subject: string;
  strand: string | null;
  placementLevel: number;
  progressionStatus: ProgressionStatus | "unknown";
  ready: boolean;
  reason: string;
};

export type CertificateEligibilityResult = {
  certificateType: CertificateType;
  term: string;
  status: CertificateEligibilityStatus;
  eligible: boolean;
  readinessScore: number;
  completionPercentage: number;
  examStatus: CertificateExamStatus;
  passStatus: CertificatePassStatus;
  subjectBreakdown: CertificateSubjectBreakdown[];
  blockers: string[];
  nextBestAction: string;
  action: CertificateAction;
  evidenceSummary: {
    placementCompleted: boolean;
    selectedSubjects: number;
    requiredScopeCount: number;
    scopesWithAssignments: number;
    completedAssignments: number;
    totalAssignments: number;
    quizAttemptCount: number;
    activeWeakAreas: number;
    secureProgressionCount: number;
    examAttempts: number;
    passedExamAttempts: number;
  };
  suggestedCertificateTitle: string;
};

export type CertificateEligibilityEngineOutput = {
  term: string;
  code?: "placement_required" | "not_enough_evidence";
  message: string;
  certificates: CertificateEligibilityResult[];
  summary: {
    primaryCertificateType: CertificateType;
    status: CertificateEligibilityStatus;
    readinessPercentage: number;
    friendlyLabel: "Keep learning" | "Almost ready" | "Catch-up needed" | "Exam needed" | "Ready for certificate";
    mainBlocker: string | null;
    nextBestAction: string;
  };
};

type PlacementLevel = {
  accuracy: number;
  level: PlacementBand;
};

type AssignmentEvidence = {
  status: string;
  contentType: string;
  topic: string | null;
  skillFocus: string | null;
  metadataJson?: string | null;
};

type AttemptEvidence = {
  subject: string;
  skillFocus: string | null;
  correct: boolean;
};

type WeakAreaEvidence = {
  subject: string;
  skillFocus: string;
  status: string;
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
};

type CertificateEligibilityInput = {
  studentId: string;
  yearGroup?: string | null;
  keyStage?: string | null;
  term: string;
  selectedSubjects: string[];
  placementLevels: Record<string, PlacementLevel>;
  progressionRecommendations: SubjectProgressionRecommendation[];
  assignments: AssignmentEvidence[];
  attempts: AttemptEvidence[];
  weakAreas: WeakAreaEvidence[];
  studentSkills: StudentSkillEvidence[];
  progressRecords: ProgressRecordEvidence[];
  existingIssuedCertificates?: CertificateType[];
};

type ParsedScope = {
  scopedSubject: string;
  parentSubject: string;
  strand: string | null;
};

const ENGLISH_STRAND_SET: Set<string> = new Set(ENGLISH_STRANDS);
const STRONG_PROGRESSION = new Set<ProgressionStatus>(["secure", "ready_to_advance", "advanced"]);

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function parseScopedSubject(rawKey: string): ParsedScope {
  const raw = normalize(rawKey);
  if (raw.includes(":")) {
    const [parent, strandRaw] = raw.split(":", 2);
    const strand = normalize(strandRaw);
    if (parent === "english" && ENGLISH_STRAND_SET.has(strand)) {
      return { scopedSubject: `english:${strand}`, parentSubject: "english", strand };
    }
    return { scopedSubject: raw, parentSubject: parent, strand: strand || null };
  }

  if (ENGLISH_STRAND_SET.has(raw)) {
    return { scopedSubject: `english:${raw}`, parentSubject: "english", strand: raw };
  }

  return { scopedSubject: raw, parentSubject: raw, strand: null };
}

function deriveScopes(selectedSubjects: string[], placementKeys: string[]): ParsedScope[] {
  const out: ParsedScope[] = [];
  const seen = new Set<string>();

  const placementByParent = new Map<string, ParsedScope[]>();
  for (const key of placementKeys) {
    const parsed = parseScopedSubject(key);
    const rows = placementByParent.get(parsed.parentSubject) ?? [];
    rows.push(parsed);
    placementByParent.set(parsed.parentSubject, rows);
  }

  for (const selected of selectedSubjects.map((value) => normalize(value)).filter(Boolean)) {
    if (selected === "english") {
      const scoped = placementByParent.get("english") ?? [];
      const byStrand = new Map(scoped.map((row) => [row.strand ?? "", row]));
      for (const strand of ENGLISH_STRANDS) {
        const scope = byStrand.get(strand) ?? { scopedSubject: `english:${strand}`, parentSubject: "english", strand };
        if (!seen.has(scope.scopedSubject)) {
          seen.add(scope.scopedSubject);
          out.push(scope);
        }
      }
      continue;
    }

    const scope = parseScopedSubject(selected);
    if (!seen.has(scope.scopedSubject)) {
      seen.add(scope.scopedSubject);
      out.push(scope);
    }
  }

  for (const key of placementKeys) {
    const scope = parseScopedSubject(key);
    if (!seen.has(scope.scopedSubject)) {
      seen.add(scope.scopedSubject);
      out.push(scope);
    }
  }

  return out;
}

function levelFromPlacement(level: PlacementLevel | undefined): number {
  if (!level) return 1;
  if (level.level === "advanced") return 4;
  if (level.level === "secure") return 3;
  if (Math.round(level.accuracy) < 30) return 1;
  return 2;
}

function matchesScope(scope: ParsedScope, value: string | null | undefined): boolean {
  const text = normalize(value);
  if (!text) return false;

  if (scope.parentSubject === "english") {
    if (!scope.strand) return text.includes("english") || text.includes("reading") || text.includes("spelling");
    if (text.includes(scope.strand) || text.includes(scope.strand.replace("-", " "))) return true;
    if (scope.strand === "reading" && (text.includes("reading") || text.includes("comprehension"))) return true;
    if (scope.strand === "spelling" && text.includes("spell")) return true;
    if (scope.strand === "grammar" && (text.includes("grammar") || text.includes("punctuation"))) return true;
    if (scope.strand === "speaking-listening" && (text.includes("speaking") || text.includes("listening") || text.includes("oracy"))) return true;
    return false;
  }

  if (scope.parentSubject === "maths") return text.includes("math");
  return text.includes(scope.parentSubject);
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed JSON.
  }
  return {};
}

function percentage(part: number, total: number): number {
  return canonicalCompletionPercentage(part, total);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolveFriendlyLabel(status: CertificateEligibilityStatus): "Keep learning" | "Almost ready" | "Catch-up needed" | "Exam needed" | "Ready for certificate" {
  if (status === "eligible" || status === "issued") return "Ready for certificate";
  if (status === "pending_exam") return "Exam needed";
  if (status === "pending_catch_up") return "Catch-up needed";
  if (status === "pending_review" || status === "pending_lessons" || status === "pending_quizzes") return "Almost ready";
  return "Keep learning";
}

function subjectLabel(scope: ParsedScope): string {
  if (scope.parentSubject === "english") return "English";
  return titleCase(scope.parentSubject);
}

function strandLabel(scope: ParsedScope): string | null {
  if (scope.parentSubject !== "english") return null;
  if (!scope.strand) return null;
  if (scope.strand === "speaking-listening") return "Speaking & Listening";
  return titleCase(scope.strand);
}

function progressionStatusForScope(scope: ParsedScope, progression: SubjectProgressionRecommendation[]): ProgressionStatus | "unknown" {
  const scoped = progression.find((row) => row.scopedSubject === scope.scopedSubject);
  if (scoped) return scoped.status;

  if (scope.parentSubject !== "english") {
    const fallback = progression.find((row) => normalize(row.subject) === scope.parentSubject);
    return fallback?.status ?? "unknown";
  }

  const englishRows = progression.filter((row) => normalize(row.subject) === "english");
  const strandRow = englishRows.find((row) => normalize(row.strand) === normalize(scope.strand));
  return strandRow?.status ?? "unknown";
}

function examEvidence(records: ProgressRecordEvidence[]): { attempts: number; passed: number; average: number } {
  const examRows = records.filter((row) => {
    const text = `${normalize(row.activityType)} ${normalize(row.activityName)}`;
    return /exam|end of term|end-of-term|mock test|term test/.test(text);
  });

  const scores = examRows
    .map((row) => {
      if (typeof row.score === "number") return clamp(row.score);
      if (typeof row.accuracy === "number") return clamp(row.accuracy);
      return null;
    })
    .filter((row): row is number => typeof row === "number");

  const average = scores.length ? clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const passed = scores.filter((score) => score >= 70).length;

  return { attempts: examRows.length, passed, average };
}

function evaluateCertificateType(input: {
  type: CertificateType;
  term: string;
  scopes: ParsedScope[];
  placementLevels: Record<string, PlacementLevel>;
  progressionRecommendations: SubjectProgressionRecommendation[];
  assignments: AssignmentEvidence[];
  attempts: AttemptEvidence[];
  weakAreas: WeakAreaEvidence[];
  studentSkills: StudentSkillEvidence[];
  progressRecords: ProgressRecordEvidence[];
  issued: boolean;
}): CertificateEligibilityResult {
  const requiresExam = input.type === "end_of_term_exam" || input.type === "mastery_certificate" || input.type === "term_completion";
  const passThreshold = input.type === "mastery_certificate" ? 80 : 70;

  const breakdown: CertificateSubjectBreakdown[] = input.scopes.map((scope) => {
    const progressionStatus = progressionStatusForScope(scope, input.progressionRecommendations);
    const placement = input.placementLevels[scope.scopedSubject]
      ?? input.placementLevels[scope.strand ?? ""]
      ?? input.placementLevels[scope.parentSubject];

    const ready = progressionStatus !== "unknown" && STRONG_PROGRESSION.has(progressionStatus);

    return {
      scopedSubject: scope.scopedSubject,
      subject: subjectLabel(scope),
      strand: strandLabel(scope),
      placementLevel: levelFromPlacement(placement),
      progressionStatus,
      ready,
      reason: ready
        ? "Progression evidence is secure for this scope."
        : "Progression evidence is still developing for this scope.",
    };
  });

  const scopeCount = breakdown.length;
  const parentSubjectCount = Math.max(1, new Set(input.scopes.map((scope) => scope.parentSubject)).size);

  const scopesWithAssignments = input.scopes.filter((scope) => {
    return input.assignments.some((assignment) => {
      const meta = parseMetadata(assignment.metadataJson);
      const text = `${normalize(assignment.contentType)} ${normalize(assignment.topic)} ${normalize(assignment.skillFocus)} ${normalize(typeof meta.subject === "string" ? meta.subject : "")} ${normalize(typeof meta.strand === "string" ? meta.strand : "")}`;
      return matchesScope(scope, text);
    });
  }).length;

  const assignmentCompletion = summarizeCanonicalCompletionFromStatuses(input.assignments.map((assignment) => assignment.status));
  const completedAssignments = assignmentCompletion.completed;
  const totalAssignments = assignmentCompletion.total;

  const quizAttemptCount = input.attempts.length;

  const activeWeakAreas = input.weakAreas.filter((row) => normalize(row.status) === "active").length;
  const criticalWeakAreas = input.weakAreas.filter((row) => {
    if (normalize(row.status) !== "active") return false;
    return input.scopes.some((scope) => matchesScope(scope, row.subject) || matchesScope(scope, row.skillFocus));
  }).length;

  const secureProgressionCount = breakdown.filter((row) => row.ready).length;
  const progressionScopeCount = Math.max(1, input.progressionRecommendations.length || breakdown.filter((row) => row.progressionStatus !== "unknown").length);

  const exam = examEvidence(input.progressRecords);

  const completionLessons = percentage(completedAssignments, Math.max(totalAssignments, parentSubjectCount * 2));
  const completionQuizzes = percentage(quizAttemptCount, Math.max(parentSubjectCount * 2, 1));
  const progressionCompletion = percentage(secureProgressionCount, progressionScopeCount);
  const completionPercentage = clamp((completionLessons * 0.35) + (completionQuizzes * 0.25) + (progressionCompletion * 0.4));

  const examStatus: CertificateExamStatus = requiresExam
    ? (exam.attempts > 0 ? "completed" : "pending_exam")
    : "not_required";

  const passStatus: CertificatePassStatus = requiresExam
    ? (exam.attempts === 0 ? "not_checked" : exam.average >= passThreshold ? "pass" : "fail")
    : "not_checked";

  const blockers: string[] = [];
  let status: CertificateEligibilityStatus = "not_yet_awarded";
  let action: CertificateAction = "keep_learning";

  if (input.issued) {
    status = "issued";
    action = "keep_learning";
  } else if (criticalWeakAreas > 0) {
    status = "pending_catch_up";
    action = "complete_catch_up";
    blockers.push("Active catch-up areas remain unresolved.");
  } else if (totalAssignments < Math.max(2, parentSubjectCount) || completionLessons < 65 || scopesWithAssignments < Math.max(1, parentSubjectCount - 1)) {
    status = "pending_lessons";
    action = "continue_lessons";
    blockers.push("Required lesson completion is still below threshold.");
  } else if (completionQuizzes < 60) {
    status = "pending_quizzes";
    action = "complete_quizzes";
    blockers.push("Not enough quiz or attempt evidence yet.");
  } else if (requiresExam && exam.attempts === 0) {
    status = "pending_exam";
    action = "take_end_of_term_exam";
    blockers.push("End-of-term exam evidence is required.");
  } else if (requiresExam && passStatus === "fail") {
    status = "pending_review";
    action = "request_parent_admin_review";
    blockers.push("Exam pass mark has not been met yet.");
  } else if (progressionCompletion < 70) {
    status = "pending_review";
    action = "request_parent_admin_review";
    blockers.push("Progression is not secure for enough subjects or strands.");
  } else {
    status = "eligible";
    action = "issue_certificate";
  }

  const readinessScore = clamp(
    completionPercentage
    - (criticalWeakAreas * 12)
    + (status === "eligible" ? 12 : 0)
    - (status === "pending_exam" ? 10 : 0)
    - (status === "pending_review" ? 8 : 0),
  );

  const nextBestAction = status === "pending_lessons"
    ? "Continue core lessons to complete your term learning plan."
    : status === "pending_quizzes"
      ? "Complete more quizzes to strengthen evidence."
      : status === "pending_catch_up"
        ? "Resolve catch-up tasks before certificate review."
        : status === "pending_exam"
          ? "Take the end-of-term exam to unlock certificate review."
          : status === "pending_review"
            ? "Ask parent/admin to review progression and exam evidence."
            : status === "eligible"
              ? "Ready for certificate review and issue decision."
              : status === "issued"
                ? "Certificate has already been issued. Keep learning for your next goal."
                : "Keep learning and build stronger evidence this term.";

  const titleByType: Record<CertificateType, string> = {
    term_completion: `StarLiz ${input.term} Term Completion Certificate`,
    end_of_term_exam: `StarLiz ${input.term} End-of-Term Exam Certificate`,
    subject_achievement: `StarLiz ${input.term} Subject Achievement Certificate`,
    english_achievement: `StarLiz ${input.term} English Achievement Certificate`,
    mastery_certificate: `StarLiz ${input.term} Mastery Certificate`,
  };

  return {
    certificateType: input.type,
    term: input.term,
    status,
    eligible: status === "eligible" || status === "issued",
    readinessScore,
    completionPercentage,
    examStatus,
    passStatus,
    subjectBreakdown: breakdown,
    blockers,
    nextBestAction,
    action,
    evidenceSummary: {
      placementCompleted: true,
      selectedSubjects: input.scopes.length,
      requiredScopeCount: scopeCount,
      scopesWithAssignments,
      completedAssignments,
      totalAssignments,
      quizAttemptCount,
      activeWeakAreas,
      secureProgressionCount,
      examAttempts: exam.attempts,
      passedExamAttempts: exam.passed,
    },
    suggestedCertificateTitle: titleByType[input.type],
  };
}

export function buildCertificateEligibility(input: CertificateEligibilityInput): CertificateEligibilityEngineOutput {
  const selectedSubjects = input.selectedSubjects.map((value) => normalize(value)).filter(Boolean);

  if (!selectedSubjects.length || Object.keys(input.placementLevels).length === 0) {
    const fallback: CertificateEligibilityResult = {
      certificateType: "term_completion",
      term: input.term,
      status: "locked",
      eligible: false,
      readinessScore: 0,
      completionPercentage: 0,
      examStatus: "pending_exam",
      passStatus: "not_checked",
      subjectBreakdown: [],
      blockers: ["Placement must be completed before certificate eligibility can be evaluated."],
      nextBestAction: "Complete Quick Level Finder and start assigned lessons.",
      action: "continue_lessons",
      evidenceSummary: {
        placementCompleted: false,
        selectedSubjects: selectedSubjects.length,
        requiredScopeCount: 0,
        scopesWithAssignments: 0,
        completedAssignments: 0,
        totalAssignments: 0,
        quizAttemptCount: 0,
        activeWeakAreas: 0,
        secureProgressionCount: 0,
        examAttempts: 0,
        passedExamAttempts: 0,
      },
      suggestedCertificateTitle: `StarLiz ${input.term} Term Completion Certificate`,
    };

    return {
      term: input.term,
      code: "placement_required",
      message: "Placement is required before certificate eligibility can be calculated.",
      certificates: [fallback],
      summary: {
        primaryCertificateType: "term_completion",
        status: fallback.status,
        readinessPercentage: fallback.readinessScore,
        friendlyLabel: "Keep learning",
        mainBlocker: fallback.blockers[0] ?? null,
        nextBestAction: fallback.nextBestAction,
      },
    };
  }

  const scopes = deriveScopes(selectedSubjects, Object.keys(input.placementLevels));

  const evidenceVolume = input.attempts.length
    + input.assignments.length
    + input.progressionRecommendations.filter((row) => row.evidenceSummary.activityCount > 0).length
    + input.studentSkills.filter((row) => row.attempts > 0).length;

  const issuedSet = new Set(input.existingIssuedCertificates ?? []);

  const certificates: CertificateEligibilityResult[] = [
    evaluateCertificateType({
      type: "term_completion",
      term: input.term,
      scopes,
      placementLevels: input.placementLevels,
      progressionRecommendations: input.progressionRecommendations,
      assignments: input.assignments,
      attempts: input.attempts,
      weakAreas: input.weakAreas,
      studentSkills: input.studentSkills,
      progressRecords: input.progressRecords,
      issued: issuedSet.has("term_completion"),
    }),
    evaluateCertificateType({
      type: "end_of_term_exam",
      term: input.term,
      scopes,
      placementLevels: input.placementLevels,
      progressionRecommendations: input.progressionRecommendations,
      assignments: input.assignments,
      attempts: input.attempts,
      weakAreas: input.weakAreas,
      studentSkills: input.studentSkills,
      progressRecords: input.progressRecords,
      issued: issuedSet.has("end_of_term_exam"),
    }),
    evaluateCertificateType({
      type: "subject_achievement",
      term: input.term,
      scopes,
      placementLevels: input.placementLevels,
      progressionRecommendations: input.progressionRecommendations,
      assignments: input.assignments,
      attempts: input.attempts,
      weakAreas: input.weakAreas,
      studentSkills: input.studentSkills,
      progressRecords: input.progressRecords,
      issued: issuedSet.has("subject_achievement"),
    }),
    evaluateCertificateType({
      type: "english_achievement",
      term: input.term,
      scopes: scopes.filter((scope) => scope.parentSubject === "english"),
      placementLevels: input.placementLevels,
      progressionRecommendations: input.progressionRecommendations,
      assignments: input.assignments,
      attempts: input.attempts,
      weakAreas: input.weakAreas,
      studentSkills: input.studentSkills,
      progressRecords: input.progressRecords,
      issued: issuedSet.has("english_achievement"),
    }),
    evaluateCertificateType({
      type: "mastery_certificate",
      term: input.term,
      scopes,
      placementLevels: input.placementLevels,
      progressionRecommendations: input.progressionRecommendations,
      assignments: input.assignments,
      attempts: input.attempts,
      weakAreas: input.weakAreas,
      studentSkills: input.studentSkills,
      progressRecords: input.progressRecords,
      issued: issuedSet.has("mastery_certificate"),
    }),
  ];

  const primary = certificates[0];

  const code = evidenceVolume < 3 ? "not_enough_evidence" : undefined;
  const message = code === "not_enough_evidence"
    ? "Not enough learning evidence yet."
    : primary.status === "eligible"
      ? "Ready for certificate review."
      : "Certificate progress updated.";

  return {
    term: input.term,
    code,
    message,
    certificates,
    summary: {
      primaryCertificateType: primary.certificateType,
      status: primary.status,
      readinessPercentage: primary.readinessScore,
      friendlyLabel: resolveFriendlyLabel(primary.status),
      mainBlocker: primary.blockers[0] ?? null,
      nextBestAction: primary.nextBestAction,
    },
  };
}
