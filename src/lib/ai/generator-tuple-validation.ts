import {
  normalizeKeyStage,
  normalizeSubject,
  normalizeYearGroup,
  yearGroupsForKeyStage,
  type Subject,
} from "@/lib/curriculum";

export const DIAGNOSTIC_OUTCOME_CODES = [
  "provider_unavailable",
  "invalid_generated_content",
  "difficulty_mismatch",
  "subject_contamination",
  "policy_mismatch",
  "save_blocked",
] as const;

export type DiagnosticOutcomeCode = (typeof DIAGNOSTIC_OUTCOME_CODES)[number];

export type GenerationRequestTuple = {
  yearGroup: string;
  keyStage: string;
  subject: string;
  strand: string | null;
  skillFocus: string;
  difficulty: number;
  itemCount: number;
};

function normalizeTupleText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTupleWords(value: string): string[] {
  return normalizeTupleText(value)
    .split(" ")
    .filter((word) => word.length >= 3);
}

function skillFocusAligned(requested: string, candidate: string): boolean {
  const requestedNorm = normalizeTupleText(requested);
  const candidateNorm = normalizeTupleText(candidate);
  if (!requestedNorm || !candidateNorm) return false;
  if (requestedNorm === candidateNorm) return true;
  if (requestedNorm.includes(candidateNorm) || candidateNorm.includes(requestedNorm)) return true;
  const requestedWords = splitTupleWords(requestedNorm);
  if (requestedWords.length === 0) return false;
  return requestedWords.some((word) => candidateNorm.includes(word));
}

export function isKnownDiagnosticOutcome(value: unknown): value is DiagnosticOutcomeCode {
  return typeof value === "string" && DIAGNOSTIC_OUTCOME_CODES.includes(value as DiagnosticOutcomeCode);
}

export function classifyGenerationDiagnosticOutcome(input: {
  errorCode?: string;
  status?: number;
  message?: string;
  reason?: string;
  details?: unknown;
}): DiagnosticOutcomeCode {
  const errorCode = String(input.errorCode ?? "").toLowerCase();
  const reason = String(input.reason ?? "").toLowerCase();
  const message = String(input.message ?? "").toLowerCase();
  const detailsText = input.details && typeof input.details === "object"
    ? JSON.stringify(input.details).toLowerCase()
    : String(input.details ?? "").toLowerCase();
  const combined = `${errorCode} ${reason} ${message} ${detailsText}`;

  if (input.status && input.status >= 500) return "provider_unavailable";
  if (errorCode === "model_error" || errorCode === "missing_openai_key" || combined.includes("openai") || combined.includes("provider")) {
    return "provider_unavailable";
  }
  if (combined.includes("difficulty") || combined.includes("too easy") || combined.includes("too hard")) {
    return "difficulty_mismatch";
  }
  if (combined.includes("contamination") || combined.includes("subject drift") || combined.includes("subject containment")) {
    return "subject_contamination";
  }
  if (combined.includes("unsupported") || combined.includes("policy") || combined.includes("mapping") || combined.includes("exam board")) {
    return "policy_mismatch";
  }
  return "invalid_generated_content";
}

function collectGeneratedTupleSignals(content: unknown): {
  yearGroups: Set<string>;
  keyStages: Set<string>;
  subjects: Set<string>;
  strands: Set<string>;
  skillFocuses: Set<string>;
} {
  const yearGroups = new Set<string>();
  const keyStages = new Set<string>();
  const subjects = new Set<string>();
  const strands = new Set<string>();
  const skillFocuses = new Set<string>();

  const rows = Array.isArray(content)
    ? content
    : content && typeof content === "object" && Array.isArray((content as Record<string, unknown>).items)
      ? (content as Record<string, unknown>).items as unknown[]
      : content && typeof content === "object"
        ? [content]
        : [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const subjectRaw = record.subject ?? record.subjectArea ?? record.type ?? record.contentType;
    const subjectNormalized = typeof subjectRaw === "string"
      ? (normalizeSubject(subjectRaw) ?? normalizeTupleText(subjectRaw))
      : "";
    const yearGroup = normalizeTupleText(record.yearGroup);
    const keyStage = normalizeTupleText(record.keyStage);
    const strand = normalizeTupleText(record.strand ?? record.module ?? record.englishStrand);
    const skillFocus = normalizeTupleText(record.skillFocus);

    if (yearGroup) yearGroups.add(yearGroup);
    if (keyStage) keyStages.add(keyStage);
    if (subjectNormalized) subjects.add(subjectNormalized);
    if (strand) strands.add(strand);
    if (skillFocus) skillFocuses.add(skillFocus);
  }

  return { yearGroups, keyStages, subjects, strands, skillFocuses };
}

export function validateStrictRequestTuple(input: {
  requestTuple: GenerationRequestTuple;
  rawYearGroup: string;
  rawKeyStage: string;
  sourceSubject: Subject;
  isEnglishParent: boolean;
}): { ok: true } | { ok: false; diagnosticOutcome: DiagnosticOutcomeCode; message: string; details: Record<string, unknown> } {
  const rawYearGroup = String(input.rawYearGroup ?? "").trim();
  const rawKeyStage = String(input.rawKeyStage ?? "").trim();
  if (!rawYearGroup || !rawKeyStage) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: yearGroup and keyStage are required.",
      details: { category: "tuple_preflight", tupleField: "yearGroup|keyStage" },
    };
  }

  const normalizedYear = normalizeYearGroup(rawYearGroup);
  const normalizedKeyStage = normalizeKeyStage(rawKeyStage);
  if (!normalizedYear || !normalizedKeyStage) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: unsupported yearGroup/keyStage combination.",
      details: { category: "tuple_preflight", tupleField: "yearGroup_keyStage", provided: { yearGroup: rawYearGroup, keyStage: rawKeyStage } },
    };
  }

  const allowedYearGroups = yearGroupsForKeyStage(normalizedKeyStage);
  if (!allowedYearGroups.includes(normalizedYear)) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: `Strict tuple validation failed: ${normalizedYear} is not valid for ${normalizedKeyStage}.`,
      details: { category: "tuple_preflight", tupleField: "yearGroup_keyStage", provided: { yearGroup: rawYearGroup, keyStage: rawKeyStage }, allowedYearGroups },
    };
  }

  if (input.requestTuple.subject !== input.sourceSubject) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: subject normalization mismatch.",
      details: { category: "tuple_preflight", tupleField: "subject", provided: input.requestTuple.subject, normalized: input.sourceSubject },
    };
  }

  if (!input.requestTuple.skillFocus.trim()) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: skillFocus is required.",
      details: { category: "tuple_preflight", tupleField: "skillFocus" },
    };
  }

  if (input.isEnglishParent && !input.requestTuple.strand) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: strand is required for English subject generation.",
      details: { category: "tuple_preflight", tupleField: "strand" },
    };
  }

  if (!input.isEnglishParent && input.requestTuple.strand) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Strict tuple validation failed: strand is only allowed for English subject generation.",
      details: { category: "tuple_preflight", tupleField: "strand", provided: input.requestTuple.strand },
    };
  }

  return { ok: true };
}

export function validateGeneratedTupleContainment(input: {
  requestTuple: GenerationRequestTuple;
  content: unknown;
  validation: Record<string, unknown>;
}): { ok: true } | { ok: false; diagnosticOutcome: DiagnosticOutcomeCode; message: string; details: Record<string, unknown> } {
  const signals = collectGeneratedTupleSignals(input.content);
  const expectedSubject = normalizeTupleText(input.requestTuple.subject);
  const expectedYearGroup = normalizeTupleText(input.requestTuple.yearGroup);
  const expectedKeyStage = normalizeTupleText(input.requestTuple.keyStage);
  const expectedStrand = normalizeTupleText(input.requestTuple.strand ?? "");
  const expectedSkillFocus = normalizeTupleText(input.requestTuple.skillFocus);
  const diagnostics = (input.validation.validationDiagnostics ?? {}) as Record<string, unknown>;
  const detectedSubjectDrift = Array.isArray(diagnostics.detectedSubjectDrift)
    ? diagnostics.detectedSubjectDrift.map((entry) => normalizeTupleText(entry)).filter(Boolean)
    : [];

  if (Boolean(diagnostics.contaminationDetected) || detectedSubjectDrift.length > 0) {
    return {
      ok: false,
      diagnosticOutcome: "subject_contamination",
      message: "Post-generation containment failed: subject contamination detected.",
      details: {
        category: "tuple_postflight",
        contaminationType: "subject",
        detectedSubjectDrift,
        rejectionReasons: diagnostics.rejectionReasons,
      },
    };
  }

  if (signals.yearGroups.size > 0 && !signals.yearGroups.has(expectedYearGroup)) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Post-generation containment failed: generated yearGroup drifted from request tuple.",
      details: { category: "tuple_postflight", contaminationType: "yearGroup", expected: input.requestTuple.yearGroup, detected: [...signals.yearGroups] },
    };
  }

  if (signals.keyStages.size > 0 && !signals.keyStages.has(expectedKeyStage)) {
    return {
      ok: false,
      diagnosticOutcome: "policy_mismatch",
      message: "Post-generation containment failed: generated keyStage drifted from request tuple.",
      details: { category: "tuple_postflight", contaminationType: "keyStage", expected: input.requestTuple.keyStage, detected: [...signals.keyStages] },
    };
  }

  if (signals.subjects.size > 0 && !signals.subjects.has(expectedSubject)) {
    return {
      ok: false,
      diagnosticOutcome: "subject_contamination",
      message: "Post-generation containment failed: generated subject drift detected.",
      details: { category: "tuple_postflight", contaminationType: "subject", expected: input.requestTuple.subject, detected: [...signals.subjects] },
    };
  }

  if (expectedStrand) {
    const hasWrongStrand = [...signals.strands].some((strand) => strand !== expectedStrand);
    if (hasWrongStrand) {
      return {
        ok: false,
        diagnosticOutcome: "subject_contamination",
        message: "Post-generation containment failed: strand contamination detected.",
        details: { category: "tuple_postflight", contaminationType: "strand", expected: input.requestTuple.strand, detected: [...signals.strands] },
      };
    }
  }

  if (expectedSkillFocus && signals.skillFocuses.size > 0) {
    const hasAlignedSkillFocus = [...signals.skillFocuses].some((candidate) => skillFocusAligned(expectedSkillFocus, candidate));
    if (!hasAlignedSkillFocus) {
      return {
        ok: false,
        diagnosticOutcome: "subject_contamination",
        message: "Post-generation containment failed: skill-focus contamination detected.",
        details: { category: "tuple_postflight", contaminationType: "skillFocus", expected: input.requestTuple.skillFocus, detected: [...signals.skillFocuses] },
      };
    }
  }

  return { ok: true };
}
