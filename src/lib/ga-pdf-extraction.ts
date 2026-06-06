import { normalizeGaCategory } from "@/lib/ga-word-categories";

export type GaExtractionCandidateStatus =
  | "Needs Extraction"
  | "Needs Page Confirmation"
  | "Needs Spelling Check"
  | "Ready For Review"
  | "Ready For Import"
  | "Imported"
  | "Rejected";

export type GaExtractionCandidate = {
  pageNumber: number | null;
  englishWord: string;
  gaWord: string;
  suggestedCategory: string;
  suggestedWordType: string;
  suggestedLevel: string;
  suggestedReviewStatus: string;
  suggestedAudioStatus: string;
  quizReady: boolean;
  storyReady: boolean;
  status: GaExtractionCandidateStatus;
  confidence: number;
  notes: string;
};

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["dog", "cat", "lion", "leopard", "rabbit", "frog", "mouse", "goat", "sheep", "pig", "bird", "duck"], category: "Animals" },
  { keywords: ["mouth", "lip", "leg", "toe", "knee", "stomach", "face", "eye", "skin", "nose", "shoulder", "brain"], category: "Body" },
  { keywords: ["grandmother", "grandchild", "grandson", "granddaughter", "mother", "father", "parent", "spouse", "child", "son", "daughter"], category: "Family" },
  { keywords: ["friend", "boy", "girl", "teacher", "doctor", "receptionist", "engineer", "manager", "lawyer"], category: "People" },
  { keywords: ["run", "read", "sing", "dance", "buy", "finish", "pull", "break", "say", "bathe", "rest"], category: "Actions" },
  { keywords: ["who", "that", "you", "he", "she", "her", "them", "their", "they", "or"], category: "Grammar" },
  { keywords: ["water", "fruit", "banana", "orange", "bread", "apple", "breakfast", "cheese", "soup", "rice"], category: "Food" },
];

export function suggestGaCategory(englishWord: string): string {
  const normalized = String(englishWord ?? "").trim().toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      return normalizeGaCategory(entry.category);
    }
  }
  return "Objects";
}

export function suggestGaWordType(englishWord: string): string {
  const normalized = String(englishWord ?? "").trim().toLowerCase();
  if (["who", "that", "you", "he", "she", "her", "them", "their", "they"].includes(normalized)) return "pronoun";
  if (["yes", "no", "hello", "good afternoon"].includes(normalized)) return "expression";
  if (["run", "read", "sing", "dance", "buy", "finish", "pull", "break", "say", "bathe", "rest"].includes(normalized)) return "verb";
  return "noun";
}

export function normalizeExtractionCandidate(candidate: Partial<GaExtractionCandidate>): GaExtractionCandidate {
  const englishWord = String(candidate.englishWord ?? "").trim();
  const gaWord = String(candidate.gaWord ?? "").trim();
  const category = normalizeGaCategory(candidate.suggestedCategory ?? suggestGaCategory(englishWord));
  const wordType = String(candidate.suggestedWordType ?? suggestGaWordType(englishWord)).trim() || "noun";

  return {
    pageNumber: candidate.pageNumber ?? null,
    englishWord,
    gaWord,
    suggestedCategory: category,
    suggestedWordType: wordType,
    suggestedLevel: String(candidate.suggestedLevel ?? "Foundation"),
    suggestedReviewStatus: String(candidate.suggestedReviewStatus ?? "Reviewed"),
    suggestedAudioStatus: String(candidate.suggestedAudioStatus ?? "Not Started"),
    quizReady: candidate.quizReady ?? true,
    storyReady: candidate.storyReady ?? true,
    status: candidate.status ?? "Ready For Review",
    confidence: candidate.confidence ?? 0.6,
    notes: String(candidate.notes ?? "Extracted candidate pending admin review."),
  };
}
