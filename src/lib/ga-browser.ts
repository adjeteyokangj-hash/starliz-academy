import { GA_APPROVED_CATEGORIES } from "@/lib/ga-word-categories";

/** Browser-safe Ga values. Client pages must import these from here so the
 * admin UI does not pull the Prisma client or node:fs into a browser chunk. */

export const GA_WORD_TYPES = ["noun", "verb", "adjective", "pronoun", "expression", "conjunction", "determiner"] as const;
export const GA_CATEGORIES = GA_APPROVED_CATEGORIES;
export const GA_LEVELS = ["Foundation", "Beginner 1", "Beginner 2", "Intermediate"] as const;
export const GA_REVIEW_STATUSES = ["Pending", "Reviewed", "Approved", "Rejected"] as const;
export const GA_AUDIO_STATUSES = ["Not Started", "Draft", "Needs Review", "Approved"] as const;
export const GA_BULK_IMPORT_HEADERS = [
  "englishWord",
  "gaWord",
  "wordType",
  "category",
  "level",
  "sourcePage",
  "reviewStatus",
  "audioStatus",
  "quizReady",
  "storyReady",
  "notes",
  "sourceId",
  "sourceName",
] as const;
export const GA_BULK_IMPORT_TEMPLATE = "englishWord,gaWord,wordType,category,level,sourcePage,reviewStatus,audioStatus,quizReady,storyReady,notes,sourceName";
export const GA_LESSON_STATUSES = ["Draft", "Published", "Archived"] as const;
export type GaBulkImportDuplicateStrategy = "skip" | "update";
export const BEGINNER_PACK_1_LESSONS = [
  { title: "Hello, Yes, No", slug: "beginner-pack-1-hello-yes-no", category: "Greetings", level: "Foundation", objective: "Recognise and practise hello, yes, and no.", lessonOrder: 1 },
  { title: "Today, Tomorrow, Yesterday", slug: "beginner-pack-1-today-tomorrow-yesterday", category: "Time", level: "Beginner 1", objective: "Recognise basic time words.", lessonOrder: 2 },
  { title: "Numbers 0-6", slug: "beginner-pack-1-numbers-0-6", category: "Numbers", level: "Beginner 1", objective: "Practise numbers zero to six.", lessonOrder: 3 },
  { title: "Family 1", slug: "beginner-pack-1-family-1", category: "Family", level: "Beginner 1", objective: "Learn first family words.", lessonOrder: 4 },
  { title: "Animals 1", slug: "beginner-pack-1-animals-1", category: "Animals", level: "Beginner 1", objective: "Learn first animal words.", lessonOrder: 5 },
  { title: "Food 1", slug: "beginner-pack-1-food-1", category: "Food", level: "Beginner 1", objective: "Learn first food words.", lessonOrder: 6 },
  { title: "Body Parts 1", slug: "beginner-pack-1-body-parts-1", category: "Body", level: "Beginner 1", objective: "Learn first body-part words.", lessonOrder: 7 },
  { title: "Review Quiz", slug: "beginner-pack-1-review-quiz", category: "Grammar", level: "Beginner 1", objective: "Review Beginner Pack 1 words.", lessonOrder: 8 },
] as const;

const ENGLISH_NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};
const ENGLISH_NUMBER_DIGIT_TO_WORD: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
};

export function formatGaEnglishDisplayWord(
  word: { englishWord: string; category?: string | null },
  mode: "source" | "digit" | "letters" = "source",
) {
  const englishWord = String(word.englishWord ?? "").trim();
  const category = String(word.category ?? "").trim();
  if (category !== "Numbers") return englishWord;
  const normalizedWord = englishWord.toLowerCase();
  const asDigit = ENGLISH_NUMBER_WORD_TO_DIGIT[normalizedWord];
  const asWord = ENGLISH_NUMBER_DIGIT_TO_WORD[englishWord];
  if (mode === "digit") return asDigit ?? englishWord;
  if (mode === "letters") return asWord ?? englishWord;
  return englishWord;
}
