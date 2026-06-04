import { digestDocument, type DocumentDigestInput } from "@/lib/stomach/documentDigestion";
import { extractEvidenceSignals, type PlatformEvidenceInput } from "@/lib/stomach/evidenceExtraction";
import type {
  IngestionHealthMetrics,
  IngestionMonitoringCounts,
  IngestionRecommendedAction,
  IngestionSignal,
  IngestionSignalStatus,
  StomachIngestionOutput,
} from "@/lib/stomach/ingestionTypes";

export type StomachIngestionInput = {
  platformEvidence?: PlatformEvidenceInput[];
  documents?: DocumentDigestInput[];
};

function averageConfidence(signals: IngestionSignal[]): number {
  if (signals.length === 0) return 0;
  const total = signals.reduce((sum, signal) => sum + signal.confidence, 0);
  return Math.round(total / signals.length);
}

function statusCounts(signals: IngestionSignal[]): Record<IngestionSignalStatus, number> {
  return signals.reduce<Record<IngestionSignalStatus, number>>(
    (acc, signal) => {
      acc[signal.status] += 1;
      return acc;
    },
    { ready: 0, warning: 0, informational: 0, missing: 0 },
  );
}

function uniqueWarnings(signals: IngestionSignal[]): string[] {
  const set = new Set<string>();
  for (const signal of signals) {
    for (const warning of signal.warningCodes) {
      if (warning) set.add(warning);
    }
  }
  return Array.from(set);
}

export function runStomachIngestion(input: StomachIngestionInput): StomachIngestionOutput {
  const generatedAt = new Date().toISOString();
  const platformSignals = extractEvidenceSignals(input.platformEvidence ?? []);
  const documentResults = (input.documents ?? []).map((doc) => digestDocument(doc));
  const documentSignals = documentResults.flatMap((result) => result.signals);
  const signals = [...platformSignals, ...documentSignals];

  return {
    decisionBoundary: "digest_only",
    signals,
    summary: {
      totalSignals: signals.length,
      byStatus: statusCounts(signals),
      averageConfidence: averageConfidence(signals),
      warnings: uniqueWarnings(signals),
      generatedAt,
    },
  };
}

export function buildIngestionHealthMetrics(counts: IngestionMonitoringCounts): IngestionHealthMetrics {
  const generatedAt = new Date().toISOString();
  const profileCoveragePercent = counts.totalStudents > 0
    ? Math.round((counts.studentsWithProfiles / counts.totalStudents) * 100)
    : 100;
  const activeEvidenceCoveragePercent = counts.totalStudents > 0
    ? Math.round((counts.studentsWithRecentAttempts / counts.totalStudents) * 100)
    : 100;

  if (counts.totalStudents === 0) {
    return {
      status: "informational",
      score: 100,
      profileCoveragePercent,
      activeEvidenceCoveragePercent,
      warnings: [],
      recommendedNextAction: "ingest_more_evidence",
      summary: "No active students are currently onboarded. Ingestion remains safely idle without false alarms.",
      generatedAt,
    };
  }

  const warnings: string[] = [];
  if (profileCoveragePercent < 70) warnings.push("onboarding_profile_coverage_low");
  if (activeEvidenceCoveragePercent < 35) warnings.push("recent_evidence_coverage_low");
  if (counts.queuedIngestionJobs > Math.max(5, Math.floor(counts.totalStudents * 0.2))) warnings.push("ingestion_backlog_high");
  if (counts.activeWeakAreas > counts.totalStudents) warnings.push("weak_area_pressure_high");

  const base = 100;
  const penalty = warnings.length * 12;
  const score = Math.max(0, Math.min(100, base - penalty));
  const status = warnings.length === 0 ? "healthy" : "warning";
  const recommendedNextAction: IngestionRecommendedAction = warnings.length === 0 ? "sync_to_brain" : "review_signal";

  const summary = warnings.length === 0
    ? "Ingestion and onboarding signals are healthy and ready for downstream Brain/HEART BEAT consumption."
    : `Ingestion has ${warnings.length} warning signal(s) and should be reviewed before high-trust downstream usage.`;

  return {
    status,
    score,
    profileCoveragePercent,
    activeEvidenceCoveragePercent,
    warnings,
    recommendedNextAction,
    summary,
    generatedAt,
  };
}
