import type { AcademicSourceData, HeartbeatDecision } from "@/lib/academic-intelligence/types";

export type LanguageReadinessStatus =
  | "foundation_readiness_pending"
  | "stay_foundation"
  | "ready_to_move_up"
  | "move_down_for_support"
  | "needs_support_review"
  | "not_applicable";

export type LanguageReadinessBrain = {
  status: LanguageReadinessStatus;
  recommendation: string;
  evidenceCount: number;
  languageSubjects: string[];
  averageAccuracy: number | null;
  speechEvidenceCount: number;
  supportSignals: string[];
  autoLevelChangeApplied: false;
};

const LANGUAGE_SUBJECTS = new Set([
  "french",
  "spanish",
  "german",
  "mandarin",
  "ga",
  "irish",
  "welsh",
  "gcse-french",
  "gcse-spanish",
  "gcse-german",
  "gcse-mandarin",
]);

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isLanguageSignal(subject: string | null | undefined, skill?: string | null, topic?: string | null): boolean {
  const normalizedSubject = normalize(subject);
  if (LANGUAGE_SUBJECTS.has(normalizedSubject)) return true;
  const text = `${normalizedSubject} ${normalize(skill)} ${normalize(topic)}`;
  return text.includes("pronunciation") || text.includes("speaking") || text.includes("listening") || text.includes("language");
}

export function buildLanguageReadinessBrain(input: {
  source: AcademicSourceData;
  heartbeatDecision?: HeartbeatDecision | null;
}): LanguageReadinessBrain {
  const assignments = input.source.assignments.filter((row) => isLanguageSignal(row.subject, row.skill, row.topic));
  const attempts = input.source.attempts.filter((row) => isLanguageSignal(row.subject, row.skill, row.topic));
  const progress = input.source.progressRecords.filter((row) => isLanguageSignal(row.subject, row.skill, row.topic));
  const weakAreas = input.source.weakAreas.filter((row) => isLanguageSignal(row.subject, row.skill, row.topic));
  const skills = input.source.studentSkills.filter((row) => isLanguageSignal(row.skill, row.skill));
  const languageSubjects = Array.from(new Set([
    ...assignments.map((row) => normalize(row.subject)),
    ...attempts.map((row) => normalize(row.subject)),
    ...progress.map((row) => normalize(row.subject)),
  ].filter(Boolean))).sort();

  const evidenceCount = assignments.length + attempts.length + progress.length + skills.length;
  const scoredAttempts = attempts
    .map((row) => typeof row.score === "number" ? row.score : row.correct ? 100 : 0)
    .filter((score) => Number.isFinite(score));
  const scoredProgress = progress
    .map((row) => typeof row.accuracy === "number" ? row.accuracy : typeof row.score === "number" ? row.score : null)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const scores = [...scoredAttempts, ...scoredProgress];
  const averageAccuracy = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const speechEvidenceCount = attempts.filter((row) => {
    const text = `${normalize(row.subject)} ${normalize(row.skill)} ${normalize(row.topic)} ${normalize(row.questionText)}`;
    return text.includes("speech") || text.includes("speak") || text.includes("pronunciation") || text.includes("listening");
  }).length;

  const supportSignals = [
    ...weakAreas.slice(0, 4).map((row) => row.skill ?? row.topic ?? row.subject),
    ...(input.heartbeatDecision?.riskLevel === "high" || input.heartbeatDecision?.riskLevel === "critical"
      ? ["heartbeat_support_risk"]
      : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (!languageSubjects.length && evidenceCount === 0) {
    return {
      status: "not_applicable",
      recommendation: "No language-learning evidence is available yet.",
      evidenceCount,
      languageSubjects,
      averageAccuracy,
      speechEvidenceCount,
      supportSignals,
      autoLevelChangeApplied: false,
    };
  }

  if (evidenceCount < 3) {
    return {
      status: "foundation_readiness_pending",
      recommendation: "Start from foundation/basic language work and observe performance over a few sessions.",
      evidenceCount,
      languageSubjects,
      averageAccuracy,
      speechEvidenceCount,
      supportSignals,
      autoLevelChangeApplied: false,
    };
  }

  const status: LanguageReadinessStatus = supportSignals.length >= 2 || (averageAccuracy !== null && averageAccuracy < 45)
    ? "needs_support_review"
    : averageAccuracy !== null && averageAccuracy >= 82 && evidenceCount >= 5
      ? "ready_to_move_up"
      : averageAccuracy !== null && averageAccuracy < 55
        ? "stay_foundation"
        : "stay_foundation";

  const recommendation = status === "ready_to_move_up"
    ? "Evidence suggests the learner may be ready for a cautious move up after review."
    : status === "needs_support_review"
      ? "Keep language work at foundation/basic level and review support needs."
      : "Continue foundation/basic language work until more secure evidence is available.";

  return {
    status,
    recommendation,
    evidenceCount,
    languageSubjects,
    averageAccuracy,
    speechEvidenceCount,
    supportSignals,
    autoLevelChangeApplied: false,
  };
}
