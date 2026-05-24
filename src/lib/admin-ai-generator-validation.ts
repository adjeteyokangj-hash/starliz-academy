import { type Subject } from "@/lib/curriculum";

export type AiGeneratorSaveValidationInput = {
  itemCount: number;
  hasPreviewUnavailable: boolean;
  safetyStatus?: string | null;
  apiValid?: boolean | null;
};

type AiGeneratorPreviewLike = {
  title?: unknown;
  subject?: unknown;
  keyStage?: unknown;
  yearGroup?: unknown;
  skillFocus?: unknown;
  difficulty?: unknown;
  topic?: unknown;
  items?: unknown;
};

export type AiGeneratorSaveBlockReason =
  | "empty"
  | "preview-unavailable"
  | "safety"
  | "api-invalid"
  | "preview-invalid"
  | null;

export function evaluateAiGeneratorSaveState(input: AiGeneratorSaveValidationInput): {
  blocked: boolean;
  reason: AiGeneratorSaveBlockReason;
} {
  if (input.itemCount <= 0) return { blocked: true, reason: "empty" };
  if (input.hasPreviewUnavailable) return { blocked: true, reason: "preview-unavailable" };
  if (input.safetyStatus && input.safetyStatus !== "passed") return { blocked: true, reason: "safety" };
  if (input.apiValid === false) return { blocked: true, reason: "api-invalid" };
  return { blocked: false, reason: null };
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function hasDifficultyValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}

export function findAiGeneratorPreviewMissingFields(preview: AiGeneratorPreviewLike | null | undefined, subject?: Subject | string): string[] {
  if (!preview) return [];

  const missing: string[] = [];
  if (!hasText(preview.title)) missing.push("title");
  if (!hasText(preview.subject)) missing.push("subject");
  if (!hasText(preview.keyStage)) missing.push("keyStage");
  if (!hasText(preview.yearGroup)) missing.push("yearGroup");
  if (!hasText(preview.skillFocus)) missing.push("skillFocus");
  if (!hasDifficultyValue(preview.difficulty)) missing.push("difficulty");
  if (!hasText(preview.topic)) missing.push("topic");

  const items = Array.isArray(preview.items) ? preview.items : [];
  if (!items.length) {
    missing.push("items");
    return missing;
  }

  const normalizedSubject = String(subject ?? preview.subject ?? "").trim().toLowerCase();
  if (normalizedSubject === "spelling" || normalizedSubject === "phonics") {
    items.forEach((item, index) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      if (!hasText(row.word ?? row.prompt)) missing.push(`items[${index + 1}].word`);
      if (!hasText(row.hint)) missing.push(`items[${index + 1}].hint`);
      if (!hasText(row.sentenceContext ?? row.sentence)) missing.push(`items[${index + 1}].sentenceContext`);
    });
  }

  return Array.from(new Set(missing));
}

export function formatAiGeneratorSaveBlockedMessage(input: {
  reason: AiGeneratorSaveBlockReason;
  missingFields?: string[];
}) {
  const missingFields = input.missingFields?.filter(Boolean) ?? [];
  if (missingFields.length) {
    const preview = missingFields.slice(0, 3).join(", ");
    const remainder = missingFields.length > 3 ? ` (+${missingFields.length - 3} more)` : "";
    return `Generate a valid preview before saving. Missing: ${preview}${remainder}.`;
  }
  if (input.reason === "preview-unavailable") return "Generate a valid preview before saving. One or more preview items are unavailable.";
  if (input.reason === "safety") return "Save is blocked because the preview did not pass safety checks.";
  if (input.reason === "api-invalid") return "Generated preview failed validation. Fix the invalid fields or regenerate.";
  return "Generate a valid preview before saving.";
}

function formatSubjectLabel(value: string): string {
  return value
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.toLowerCase() === "gcse" ? "GCSE" : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isReadingComprehensionSkill(skillFocus: string | null | undefined): boolean {
  const normalized = String(skillFocus ?? "").trim().toLowerCase();
  return normalized === "reading comprehension" || normalized.includes("reading comprehension");
}

export function formatAiGeneratorValidationSuccessMessage(subject: Subject, skillFocus?: string): string {
  if (isReadingComprehensionSkill(skillFocus)) return "Final reading comprehension set is valid.";
  if (subject === "spelling" || subject === "phonics") {
    return "Final set is valid. No duplicates or invalid skill words detected.";
  }
  if (subject.startsWith("gcse-") && ["Vocabulary", "Grammar", "Translation", "Speaking practice", "Listening comprehension", "Writing practice", "Role play", "Photo card", "Sentence building", "Verb conjugation", "Tenses"].includes(skillFocus ?? "")) {
    return `Final ${formatSubjectLabel(subject)} ${String(skillFocus).toLowerCase()} set is valid.`;
  }
  return `Final ${formatSubjectLabel(subject).toLowerCase()} set is valid.`;
}
