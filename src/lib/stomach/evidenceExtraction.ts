import type {
  IngestionRecommendedAction,
  IngestionSignal,
  IngestionSignalStatus,
} from "@/lib/stomach/ingestionTypes";

export type PlatformEvidenceKind =
  | "attempt"
  | "assignment"
  | "weak_area"
  | "student_skill"
  | "homework"
  | "coach_usage"
  | "profile_snapshot";

export type PlatformEvidenceInput = {
  id: string;
  studentId: string;
  kind: PlatformEvidenceKind;
  observedAt?: string | null;
  score?: number | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
};

type ExtractionRule = {
  source: IngestionSignal["source"];
  evidenceType: IngestionSignal["evidenceType"];
  summary: string;
  warningCode?: string;
  statusResolver: (input: PlatformEvidenceInput) => IngestionSignalStatus;
  confidenceResolver: (input: PlatformEvidenceInput) => number;
  nextActionResolver: (status: IngestionSignalStatus) => IngestionRecommendedAction;
};

const RULES: Record<PlatformEvidenceKind, ExtractionRule> = {
  attempt: {
    source: "platform_attempt",
    evidenceType: "attempt_outcome",
    summary: "Attempt evidence ingested for non-decision diagnostic signal flow.",
    warningCode: "low_attempt_score",
    statusResolver: (input) => {
      if (typeof input.score !== "number") return "informational";
      if (input.score < 45) return "warning";
      return "ready";
    },
    confidenceResolver: (input) => (typeof input.score === "number" ? 55 + (input.score * 0.4) : 44),
    nextActionResolver: (status) => (status === "warning" ? "review_signal" : "sync_to_brain"),
  },
  assignment: {
    source: "platform_assignment",
    evidenceType: "assignment_status",
    summary: "Assignment workflow evidence ingested for orchestration context.",
    statusResolver: (input) => {
      const normalized = String(input.status ?? "").toLowerCase();
      if (!normalized) return "informational";
      if (normalized.includes("overdue") || normalized.includes("blocked")) return "warning";
      return "ready";
    },
    confidenceResolver: () => 63,
    nextActionResolver: (status) => (status === "warning" ? "review_signal" : "monitor"),
  },
  weak_area: {
    source: "platform_weak_area",
    evidenceType: "weak_area_signal",
    summary: "Weak area evidence ingested as a cautionary learning signal.",
    warningCode: "active_weak_area",
    statusResolver: (input) => {
      const normalized = String(input.status ?? "active").toLowerCase();
      return normalized === "active" ? "warning" : "informational";
    },
    confidenceResolver: () => 77,
    nextActionResolver: () => "review_signal",
  },
  student_skill: {
    source: "platform_student_skill",
    evidenceType: "skill_snapshot",
    summary: "Student skill snapshot ingested for readiness context.",
    statusResolver: (input) => {
      if (typeof input.score !== "number") return "informational";
      return input.score >= 70 ? "ready" : "warning";
    },
    confidenceResolver: (input) => (typeof input.score === "number" ? 50 + (input.score * 0.45) : 50),
    nextActionResolver: (status) => (status === "warning" ? "review_signal" : "sync_to_brain"),
  },
  homework: {
    source: "platform_homework",
    evidenceType: "homework_signal",
    summary: "Homework evidence ingested for continuity monitoring.",
    statusResolver: (input) => {
      const normalized = String(input.status ?? "").toLowerCase();
      if (normalized.includes("late") || normalized.includes("missing")) return "warning";
      return normalized ? "ready" : "informational";
    },
    confidenceResolver: () => 65,
    nextActionResolver: (status) => (status === "warning" ? "monitor" : "sync_to_brain"),
  },
  coach_usage: {
    source: "platform_coach_usage",
    evidenceType: "coach_support_signal",
    summary: "Coach usage evidence ingested for support-demand monitoring.",
    statusResolver: () => "informational",
    confidenceResolver: () => 58,
    nextActionResolver: () => "monitor",
  },
  profile_snapshot: {
    source: "profile_snapshot",
    evidenceType: "onboarding_profile",
    summary: "Onboarding profile evidence ingested for baseline availability.",
    statusResolver: (input) => (input.status ? "ready" : "informational"),
    confidenceResolver: () => 62,
    nextActionResolver: () => "sync_to_brain",
  },
};

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function extractEvidenceSignal(input: PlatformEvidenceInput): IngestionSignal {
  const rule = RULES[input.kind];
  const status = rule.statusResolver(input);
  const warningCodes = rule.warningCode && status === "warning" ? [rule.warningCode] : [];

  return {
    id: `ing-${input.kind}-${input.id}`,
    studentId: input.studentId,
    source: rule.source,
    evidenceType: rule.evidenceType,
    status,
    confidence: clampConfidence(rule.confidenceResolver(input)),
    warningCodes,
    summary: rule.summary,
    recommendedNextAction: rule.nextActionResolver(status),
    observedAt: input.observedAt ?? null,
    metadata: {
      platformEvidenceId: input.id,
      rawStatus: input.status ?? null,
      rawScore: input.score ?? null,
      ...input.metadata,
    },
  };
}

export function extractEvidenceSignals(input: PlatformEvidenceInput[]): IngestionSignal[] {
  return input.map((event) => extractEvidenceSignal(event));
}
