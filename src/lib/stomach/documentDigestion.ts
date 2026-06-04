import type {
  IngestionRecommendedAction,
  IngestionSignal,
  IngestionSignalStatus,
} from "@/lib/stomach/ingestionTypes";

export type DocumentDigestInput = {
  documentId: string;
  studentId?: string | null;
  sourceLabel?: string;
  title?: string;
  content?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type DocumentDigestionResult = {
  source: "document_ingestion";
  status: IngestionSignalStatus;
  warnings: string[];
  signals: IngestionSignal[];
  digestedAt: string;
};

const KEYWORD_RULES: Array<{
  pattern: RegExp;
  evidenceType: IngestionSignal["evidenceType"];
  status: IngestionSignalStatus;
  confidence: number;
  summary: string;
  recommendedNextAction: IngestionRecommendedAction;
  warningCode?: string;
}> = [
  {
    pattern: /struggle|difficulty|behind|needs\s+help|not\s+secure/i,
    evidenceType: "weak_area_signal",
    status: "warning",
    confidence: 72,
    summary: "Document indicates unresolved learning struggle evidence.",
    recommendedNextAction: "review_signal",
    warningCode: "document_learning_struggle",
  },
  {
    pattern: /improved|secure|mastered|confident|excellent progress/i,
    evidenceType: "skill_snapshot",
    status: "ready",
    confidence: 74,
    summary: "Document indicates positive skill progression evidence.",
    recommendedNextAction: "sync_to_brain",
  },
  {
    pattern: /homework|submission|late|missing/i,
    evidenceType: "homework_signal",
    status: "warning",
    confidence: 67,
    summary: "Document references homework or submission compliance evidence.",
    recommendedNextAction: "monitor",
    warningCode: "document_homework_risk",
  },
  {
    pattern: /assessment|quiz|test|score/i,
    evidenceType: "attempt_outcome",
    status: "ready",
    confidence: 70,
    summary: "Document references assessment or test performance evidence.",
    recommendedNextAction: "sync_to_brain",
  },
  {
    pattern: /coach|tutor|support session|intervention/i,
    evidenceType: "coach_support_signal",
    status: "informational",
    confidence: 64,
    summary: "Document references coach or tutor support activity.",
    recommendedNextAction: "monitor",
  },
];

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function makeSignal(input: {
  document: DocumentDigestInput;
  evidenceType: IngestionSignal["evidenceType"];
  status: IngestionSignalStatus;
  confidence: number;
  summary: string;
  recommendedNextAction: IngestionRecommendedAction;
  warningCodes?: string[];
}): IngestionSignal {
  return {
    id: `doc-${input.document.documentId}-${input.evidenceType}`,
    studentId: input.document.studentId ?? null,
    source: "document_ingestion",
    evidenceType: input.evidenceType,
    status: input.status,
    confidence: clampConfidence(input.confidence),
    warningCodes: input.warningCodes ?? [],
    summary: input.summary,
    recommendedNextAction: input.recommendedNextAction,
    observedAt: input.document.createdAt ?? null,
    metadata: {
      documentId: input.document.documentId,
      title: input.document.title ?? null,
      sourceLabel: input.document.sourceLabel ?? null,
      ...input.document.metadata,
    },
  };
}

export function digestDocument(input: DocumentDigestInput): DocumentDigestionResult {
  const digestedAt = new Date().toISOString();
  const content = (input.content ?? "").trim();

  if (!content) {
    return {
      source: "document_ingestion",
      status: "informational",
      warnings: ["empty_document"],
      digestedAt,
      signals: [
        makeSignal({
          document: input,
          evidenceType: "document_note",
          status: "informational",
          confidence: 0,
          summary: "No readable document content was provided. Ingestion remained safe and non-blocking.",
          recommendedNextAction: "ingest_more_evidence",
          warningCodes: ["empty_document"],
        }),
      ],
    };
  }

  const signals: IngestionSignal[] = [];
  const warnings = new Set<string>();

  for (const rule of KEYWORD_RULES) {
    if (!rule.pattern.test(content)) continue;
    if (rule.warningCode) warnings.add(rule.warningCode);
    signals.push(
      makeSignal({
        document: input,
        evidenceType: rule.evidenceType,
        status: rule.status,
        confidence: rule.confidence,
        summary: rule.summary,
        recommendedNextAction: rule.recommendedNextAction,
        warningCodes: rule.warningCode ? [rule.warningCode] : [],
      }),
    );
  }

  if (signals.length === 0) {
    signals.push(
      makeSignal({
        document: input,
        evidenceType: "document_note",
        status: "informational",
        confidence: 48,
        summary: "Document digested successfully but no high-signal evidence patterns were detected.",
        recommendedNextAction: "monitor",
      }),
    );
  }

  const status: IngestionSignalStatus = signals.some((signal) => signal.status === "warning")
    ? "warning"
    : signals.some((signal) => signal.status === "ready")
      ? "ready"
      : "informational";

  return {
    source: "document_ingestion",
    status,
    warnings: Array.from(warnings),
    signals,
    digestedAt,
  };
}
