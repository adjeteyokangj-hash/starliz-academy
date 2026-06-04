import { retentionPolicyFor } from "@/lib/anus/retentionPolicies";

export type DocumentGenerationDraftType =
  | "certificate_draft"
  | "progress_report_draft"
  | "parent_report_draft"
  | "admin_report_draft";

export type DocumentGenerationSource = "brain" | "stomach" | "heartbeat" | "anus";

export type DocumentGenerationEvidenceSignal = {
  source: DocumentGenerationSource;
  status: "ready" | "warning" | "informational" | "missing";
  summary: string;
  confidence: number;
};

export type DocumentGenerationInput = {
  studentId: string;
  draftType: DocumentGenerationDraftType;
  brain?: {
    generatedAt?: string | null;
    readiness?: string | null;
    riskLevel?: string | null;
  } | null;
  stomach?: {
    totalSignals?: number | null;
    warningCount?: number | null;
    averageConfidence?: number | null;
  } | null;
  heartbeat?: {
    action?: string | null;
    urgency?: string | null;
    riskLevel?: string | null;
  } | null;
  anus?: {
    legalHoldActive?: boolean | null;
    recordType?: Parameters<typeof retentionPolicyFor>[0] | null;
  } | null;
};

export type DocumentGenerationPlan = {
  studentId: string;
  draftType: DocumentGenerationDraftType;
  boundary: "draft_only";
  allowAutoPublish: false;
  allowAutoSend: false;
  requiresAdminReview: true;
  requiresFinalApproval: true;
  evidenceSignals: DocumentGenerationEvidenceSignal[];
  warnings: string[];
  recommendedNextAction: "prepare_draft" | "review_before_draft" | "block_draft_for_lifecycle_review";
  generatedAt: string;
};

export type DocumentGenerationHealthCounts = {
  activeStudents: number;
  issuedCertificates: number;
  recentReportsGenerated: number;
  pendingDraftReviews: number;
  blockedByLifecycle: number;
};

export type DocumentGenerationHealth = {
  status: "healthy" | "warning" | "informational";
  score: number;
  warnings: string[];
  summary: string;
  boundary: "draft_only";
  generatedAt: string;
};

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function mapDocumentGenerationEvidence(input: DocumentGenerationInput): DocumentGenerationEvidenceSignal[] {
  const signals: DocumentGenerationEvidenceSignal[] = [];

  if (input.brain) {
    const risk = String(input.brain.riskLevel ?? "").toLowerCase();
    signals.push({
      source: "brain",
      status: risk === "critical" ? "warning" : input.brain.generatedAt ? "ready" : "informational",
      summary: input.brain.generatedAt
        ? `Brain context available (${input.brain.readiness ?? "readiness unknown"}).`
        : "Brain context missing generation timestamp.",
      confidence: clampConfidence(risk === "critical" ? 45 : 72),
    });
  } else {
    signals.push({ source: "brain", status: "missing", summary: "Brain context was not provided.", confidence: 0 });
  }

  if (input.stomach) {
    const warnings = Number(input.stomach.warningCount ?? 0);
    const avg = Number(input.stomach.averageConfidence ?? 0);
    signals.push({
      source: "stomach",
      status: warnings > 0 ? "warning" : "ready",
      summary: `Stomach ingestion signals: ${input.stomach.totalSignals ?? 0} total, ${warnings} warning(s).`,
      confidence: clampConfidence(avg || (warnings > 0 ? 56 : 74)),
    });
  } else {
    signals.push({ source: "stomach", status: "informational", summary: "No Stomach ingestion summary was provided.", confidence: 40 });
  }

  if (input.heartbeat) {
    const risk = String(input.heartbeat.riskLevel ?? "").toLowerCase();
    signals.push({
      source: "heartbeat",
      status: risk === "critical" || risk === "high" ? "warning" : "ready",
      summary: `HEART BEAT action: ${input.heartbeat.action ?? "unknown"} (${input.heartbeat.urgency ?? "normal"}).`,
      confidence: clampConfidence(risk === "critical" ? 42 : risk === "high" ? 56 : 76),
    });
  } else {
    signals.push({ source: "heartbeat", status: "informational", summary: "HEART BEAT context was not supplied.", confidence: 38 });
  }

  if (input.anus) {
    const held = Boolean(input.anus.legalHoldActive);
    const recordType = input.anus.recordType ?? "audit_records";
    const retention = retentionPolicyFor(recordType);
    signals.push({
      source: "anus",
      status: held ? "warning" : "ready",
      summary: held
        ? `Lifecycle legal hold is active for ${recordType}; draft requires lifecycle review.`
        : `Lifecycle policy for ${recordType}: ${retention.category} (${retention.retentionDays ?? "permanent"}).`,
      confidence: clampConfidence(held ? 48 : 80),
    });
  } else {
    signals.push({ source: "anus", status: "informational", summary: "Lifecycle context was not supplied.", confidence: 45 });
  }

  return signals;
}

export function planDocumentGenerationJob(input: DocumentGenerationInput): DocumentGenerationPlan {
  const evidenceSignals = mapDocumentGenerationEvidence(input);
  const warnings = evidenceSignals
    .filter((signal) => signal.status === "warning" || signal.status === "missing")
    .map((signal) => `${signal.source}:${signal.status}`);

  const blockedByLifecycle = evidenceSignals.some(
    (signal) => signal.source === "anus" && signal.summary.toLowerCase().includes("legal hold"),
  );

  const recommendedNextAction = blockedByLifecycle
    ? "block_draft_for_lifecycle_review"
    : warnings.length > 0
      ? "review_before_draft"
      : "prepare_draft";

  return {
    studentId: input.studentId,
    draftType: input.draftType,
    boundary: "draft_only",
    allowAutoPublish: false,
    allowAutoSend: false,
    requiresAdminReview: true,
    requiresFinalApproval: true,
    evidenceSignals,
    warnings,
    recommendedNextAction,
    generatedAt: new Date().toISOString(),
  };
}

export function buildDocumentGenerationHealth(counts: DocumentGenerationHealthCounts): DocumentGenerationHealth {
  if (counts.activeStudents === 0) {
    return {
      status: "informational",
      score: 100,
      warnings: [],
      summary: "No active students found. Document generation is safely idle in draft-only mode.",
      boundary: "draft_only",
      generatedAt: new Date().toISOString(),
    };
  }

  const warnings: string[] = [];
  if (counts.pendingDraftReviews > Math.max(5, Math.floor(counts.activeStudents * 0.2))) warnings.push("draft_review_backlog_high");
  if (counts.blockedByLifecycle > 0) warnings.push("lifecycle_blocked_drafts_present");

  const score = Math.max(0, Math.min(100, 100 - (warnings.length * 15)));
  const status: DocumentGenerationHealth["status"] = warnings.length === 0 ? "healthy" : "warning";

  return {
    status,
    score,
    warnings,
    summary: warnings.length === 0
      ? "Draft-only document generation is healthy and ready for reviewed exports."
      : `Draft generation has ${warnings.length} warning(s): ${warnings.join(", ")}.`,
    boundary: "draft_only",
    generatedAt: new Date().toISOString(),
  };
}
