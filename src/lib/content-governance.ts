type ContentMetadata = {
  generationType?: string | null;
  itemSchema?: string | null;
  subject?: string | null;
  legacyType?: string | null;
  source?: string | null;
  skillFocus?: string | null;
  yearGroup?: string | null;
  keyStage?: string | null;
};

export type ContentGovernanceSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ContentGovernanceAssignment = {
  assignmentId: string;
  studentId: string;
  studentName: string | null;
  assignmentStatus?: string;
  assignmentCreatedAt?: string;
};

export type ContentGovernanceRecord = {
  id: string;
  contentType: string;
  createdAt: string;
  createdBy: string;
  topic: string;
  level: number;
  metadataJson?: string | null;
  contentJson?: string | null;
  assignments?: ContentGovernanceAssignment[];
};

export type ContentGovernanceClassification = {
  contentId: string;
  contentType: string;
  createdAt: string;
  createdBy: string;
  topic: string;
  level: number;
  severity: ContentGovernanceSeverity;
  reasonCodes: string[];
  reasons: string[];
  metadata: Required<Pick<ContentMetadata, "generationType" | "itemSchema" | "subject" | "legacyType" | "source" | "skillFocus" | "yearGroup" | "keyStage">>;
  itemCount: number;
  assignments: ContentGovernanceAssignment[];
};

export type ContentGovernanceReport = {
  scannedCount: number;
  contaminatedCount: number;
  severityCounts: Record<ContentGovernanceSeverity, number>;
  contentIdsBySeverity: Record<ContentGovernanceSeverity, string[]>;
  assignmentIdsBySeverity: Record<ContentGovernanceSeverity, string[]>;
  studentsBySeverity: Record<ContentGovernanceSeverity, Array<{ studentId: string; studentName: string | null }>>;
  activeAssignmentsPointingToContaminatedContent: number;
  classifications: ContentGovernanceClassification[];
  generatorRoutes: Array<{
    signature: string;
    severity: ContentGovernanceSeverity;
    contentIds: string[];
  }>;
};

const NON_SPELLING_TYPES = new Set([
  "grammar",
  "punctuation",
  "writing",
  "reading",
  "math",
  "maths",
  "science",
  "languages",
  "english-language",
  "english-literature",
  "vocabulary",
  "exam-practice",
]);

const WRITING_PROMPT_PATTERNS = [
  "write a story",
  "write a short story",
  "create a story",
  "develop the plot",
  "story writing",
  "narrative",
  "compose a story",
  "tell a story",
];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function toRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (value && typeof value === "object") {
    return [value as Record<string, unknown>];
  }
  return [];
}

/** Daytime stage packs store spelling rows under items/questions; legacy packs may be a bare array. */
function spellingItemRecords(content: unknown): Record<string, unknown>[] {
  if (Array.isArray(content)) return toRecords(content);
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const row = content as Record<string, unknown>;
    if (Array.isArray(row.items) && row.items.length) return toRecords(row.items);
    if (Array.isArray(row.questions) && row.questions.length) return toRecords(row.questions);
    return [row];
  }
  return [];
}

function parseJsonObject(value: string | null | undefined): ContentMetadata {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getContentItems(record: ContentGovernanceRecord): Record<string, unknown>[] {
  if (!record.contentJson) return [];
  try {
    return spellingItemRecords(JSON.parse(record.contentJson) as unknown);
  } catch {
    return [];
  }
}

function itemWord(item: Record<string, unknown>): string {
  return normalizeText(item.word);
}

function itemQuestionType(item: Record<string, unknown>): string {
  return normalizeText(item.questionType);
}

function itemPromptText(item: Record<string, unknown>): string {
  return [item.prompt, item.question, item.sentence, item.sentenceContext, item.hint, item.explanation]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function looksLikeWritingOnlyItem(item: Record<string, unknown>): boolean {
  const promptText = itemPromptText(item);
  return WRITING_PROMPT_PATTERNS.some((pattern) => promptText.includes(pattern));
}

function metadataFlag(metadata: ContentMetadata, key: keyof ContentMetadata): string {
  return normalizeText(metadata[key]);
}

function hasNonSpellingMetadata(metadata: ContentMetadata): boolean {
  return [metadata.generationType, metadata.itemSchema, metadata.subject].some((value) => NON_SPELLING_TYPES.has(normalizeText(value)));
}

function hasWritingMetadata(metadata: ContentMetadata): boolean {
  return [metadata.generationType, metadata.itemSchema, metadata.subject].some((value) => normalizeText(value) === "writing");
}

function hasQuestionTypeSpelling(items: Record<string, unknown>[]): boolean {
  return items.some((item) => itemQuestionType(item) === "spelling");
}

export function validateSpellingContentContract(content: unknown): { ok: boolean; reason?: string; reasonCode?: string } {
  const items = spellingItemRecords(content);
  if (!items.length) {
    return { ok: false, reasonCode: "empty_spelling_content", reason: "Spelling content must include at least one item." };
  }

  for (const item of items) {
    const word = itemWord(item);
    if (!word) {
      if (looksLikeWritingOnlyItem(item)) {
        return {
          ok: false,
          reasonCode: "writing_content_in_spelling",
          reason: "Writing-style content cannot be saved or assigned as spelling content.",
        };
      }

      return {
        ok: false,
        reasonCode: "missing_spelling_word",
        reason: "Spelling content must include a valid word field for every item.",
      };
    }
  }

  return { ok: true };
}

export function classifySpellingContentRecord(record: ContentGovernanceRecord): ContentGovernanceClassification {
  const metadata = parseJsonObject(record.metadataJson);
  const items = getContentItems(record);
  const contentType = normalizeText(record.contentType) || "spelling";
  const missingWordCount = items.filter((item) => !itemWord(item)).length;
  const hasAnyWord = items.some((item) => Boolean(itemWord(item)));
  const hasMissingQuestionType = !hasQuestionTypeSpelling(items);
  const writingMetadata = hasWritingMetadata(metadata);
  const nonSpellingMetadata = hasNonSpellingMetadata(metadata);
  const writingStyleItems = items.filter((item) => !itemWord(item) && looksLikeWritingOnlyItem(item)).length;
  const metadataMismatchOnly = contentType === "spelling"
    && !writingMetadata
    && !nonSpellingMetadata
    && Boolean(metadata.legacyType)
    && metadataFlag(metadata, "legacyType") !== "spelling";

  let severity: ContentGovernanceSeverity = "LOW";
  const reasonCodes: string[] = [];
  const reasons: string[] = [];

  if (writingMetadata || writingStyleItems > 0) {
    severity = "CRITICAL";
    reasonCodes.push("writing_content_in_spelling");
    reasons.push("Writing content is stored inside a spelling wrapper.");
  } else if (nonSpellingMetadata) {
    severity = "HIGH";
    reasonCodes.push("non_spelling_content_in_spelling");
    reasons.push("Non-spelling curriculum content is stored inside a spelling wrapper.");
  } else if (missingWordCount > 0 || hasMissingQuestionType) {
    severity = "MEDIUM";
    if (missingWordCount > 0) {
      reasonCodes.push("missing_spelling_word");
      reasons.push("Spelling items are missing required word fields.");
    }
    if (hasMissingQuestionType) {
      reasonCodes.push("missing_question_type");
      reasons.push("Spelling items are missing a spelling questionType.");
    }
  } else if (metadataMismatchOnly) {
    severity = "LOW";
    reasonCodes.push("metadata_mismatch_only");
    reasons.push("Metadata is mismatched, but the item payload still looks spelling-like.");
  }

  if (!hasAnyWord && severity === "LOW") {
    severity = "MEDIUM";
    reasonCodes.push("missing_spelling_word");
    reasons.push("Spelling items are missing required word fields.");
  }

  return {
    contentId: record.id,
    contentType: record.contentType,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    topic: record.topic,
    level: record.level,
    severity,
    reasonCodes: Array.from(new Set(reasonCodes)),
    reasons: Array.from(new Set(reasons)),
    metadata: {
      generationType: metadata.generationType ?? null,
      itemSchema: metadata.itemSchema ?? null,
      subject: metadata.subject ?? null,
      legacyType: metadata.legacyType ?? null,
      source: metadata.source ?? null,
      skillFocus: metadata.skillFocus ?? null,
      yearGroup: metadata.yearGroup ?? null,
      keyStage: metadata.keyStage ?? null,
    },
    itemCount: items.length,
    assignments: record.assignments ?? [],
  };
}

export function buildSpellingContentGovernanceReport(records: ContentGovernanceRecord[]): ContentGovernanceReport {
  const classifications = records.map(classifySpellingContentRecord);
  const severityCounts: Record<ContentGovernanceSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const contentIdsBySeverity: Record<ContentGovernanceSeverity, string[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const assignmentIdsBySeverity: Record<ContentGovernanceSeverity, string[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const studentsBySeverity: Record<ContentGovernanceSeverity, Array<{ studentId: string; studentName: string | null }>> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  const generatorRouteMap = new Map<string, { signature: string; severity: ContentGovernanceSeverity; contentIds: string[] }>();
  let activeAssignmentsPointingToContaminatedContent = 0;

  for (const classification of classifications) {
    severityCounts[classification.severity] += 1;
    contentIdsBySeverity[classification.severity].push(classification.contentId);

    const assignmentIds = classification.assignments.map((assignment) => assignment.assignmentId);
    assignmentIdsBySeverity[classification.severity].push(...assignmentIds);
    studentsBySeverity[classification.severity].push(
      ...classification.assignments.map((assignment) => ({ studentId: assignment.studentId, studentName: assignment.studentName })),
    );

    if (classification.severity !== "LOW") {
      activeAssignmentsPointingToContaminatedContent += classification.assignments.filter((assignment) => normalizeText(assignment.assignmentStatus ?? "assigned") === "assigned").length;
    }

    const signature = [
      classification.metadata.generationType ?? "",
      classification.metadata.itemSchema ?? "",
      classification.metadata.subject ?? "",
      classification.metadata.legacyType ?? "",
    ].map((value) => normalizeText(value) || "∅").join("|");
    const existing = generatorRouteMap.get(signature);
    if (existing) {
      existing.contentIds.push(classification.contentId);
      if (existing.severity === "LOW" && classification.severity !== "LOW") {
        existing.severity = classification.severity;
      }
    } else {
      generatorRouteMap.set(signature, {
        signature,
        severity: classification.severity,
        contentIds: [classification.contentId],
      });
    }
  }

  const dedupeStudents = (entries: Array<{ studentId: string; studentName: string | null }>) => {
    const seen = new Set<string>();
    return entries.filter((entry) => {
      if (seen.has(entry.studentId)) return false;
      seen.add(entry.studentId);
      return true;
    });
  };

  return {
    scannedCount: records.length,
    contaminatedCount: classifications.filter((classification) => classification.severity !== "LOW").length,
    severityCounts,
    contentIdsBySeverity,
    assignmentIdsBySeverity: {
      CRITICAL: Array.from(new Set(assignmentIdsBySeverity.CRITICAL)),
      HIGH: Array.from(new Set(assignmentIdsBySeverity.HIGH)),
      MEDIUM: Array.from(new Set(assignmentIdsBySeverity.MEDIUM)),
      LOW: Array.from(new Set(assignmentIdsBySeverity.LOW)),
    },
    studentsBySeverity: {
      CRITICAL: dedupeStudents(studentsBySeverity.CRITICAL),
      HIGH: dedupeStudents(studentsBySeverity.HIGH),
      MEDIUM: dedupeStudents(studentsBySeverity.MEDIUM),
      LOW: dedupeStudents(studentsBySeverity.LOW),
    },
    activeAssignmentsPointingToContaminatedContent,
    classifications,
    generatorRoutes: Array.from(generatorRouteMap.values()),
  };
}