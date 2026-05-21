import { type Subject } from "@/lib/curriculum";

export type AiGeneratorSaveValidationInput = {
  itemCount: number;
  hasPreviewUnavailable: boolean;
  safetyStatus?: string | null;
  apiValid?: boolean | null;
};

export function evaluateAiGeneratorSaveState(input: AiGeneratorSaveValidationInput): {
  blocked: boolean;
  reason: "empty" | "preview-unavailable" | "safety" | "api-invalid" | null;
} {
  if (input.itemCount <= 0) return { blocked: true, reason: "empty" };
  if (input.hasPreviewUnavailable) return { blocked: true, reason: "preview-unavailable" };
  if (input.safetyStatus && input.safetyStatus !== "passed") return { blocked: true, reason: "safety" };
  if (input.apiValid === false) return { blocked: true, reason: "api-invalid" };
  return { blocked: false, reason: null };
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
  if (subject === "punctuation") return "Final punctuation set is valid.";
  if (subject === "grammar") return "Final grammar set is valid.";
  if (subject === "reading") return "Final reading set is valid.";
  if (subject === "maths" || subject === "times-tables" || subject === "gcse-maths" || subject === "science" || subject === "gcse-science") {
    return "Final maths set is valid.";
  }
  if (subject === "spelling" || subject === "phonics") {
    return "Final set is valid. No duplicates or invalid skill words detected.";
  }
  if (subject === "writing" || subject === "english-language") return "Final writing set is valid.";
  if (subject.startsWith("gcse-") && ["Vocabulary", "Grammar", "Translation", "Speaking practice", "Listening comprehension", "Writing practice", "Role play", "Photo card", "Sentence building", "Verb conjugation", "Tenses"].includes(skillFocus ?? "")) {
    return `Final ${formatSubjectLabel(subject)} ${String(skillFocus).toLowerCase()} set is valid.`;
  }
  return `Final ${formatSubjectLabel(subject).toLowerCase()} set is valid.`;
}
