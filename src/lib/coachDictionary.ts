import { getDictionaryWordByContext, normalizeDictionaryWord, recordCoachDictionaryLookup, type DictionaryWordRecord } from "@/lib/dictionary";

export type CoachWordHelpInput = {
  word?: string | null;
  subject?: string | null;
  keyStage?: string | null;
  yearGroup?: string | null;
  topic?: string | null;
  activityType?: string | null;
  currentPrompt?: string | null;
  childAttempt?: string | null;
  supportLevel?: number | null;
};

export type CoachWordHelpResponse = {
  word: string | null;
  definitionChild: string;
  exampleSentence: string | null;
  phonicsPattern: string | null;
  syllables: string | null;
  pronunciationHint: string | null;
  coachMessage: string;
  hintLevel: number;
  relatedWords: string[];
  shouldReadAloud: boolean;
  definitionParent: string | null;
  subject: string | null;
  keyStage: string | null;
  yearGroup: string | null;
  active: boolean;
  found: boolean;
};

function uniqueWords(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, 6);
}

function pickDefinition(word: DictionaryWordRecord | null): string {
  return word?.definitionChild?.trim() || "";
}

function buildMessage(entry: DictionaryWordRecord | null, input: CoachWordHelpInput, hintLevel: number): string {
  if (!entry) {
    return "I don’t have this word in my Word Bank yet, but I can still help you understand it.";
  }

  const definition = pickDefinition(entry);
  const activity = input.activityType ? ` for ${input.activityType}` : "";
  if (hintLevel <= 1) return `Let’s look at this word together${activity}. ${definition}`.trim();
  if (hintLevel === 2) return `Here is a clue: ${definition}`.trim();
  if (hintLevel === 3 && entry.exampleSentence) return `Here is an example: ${entry.exampleSentence}`.trim();
  if (hintLevel === 4 && entry.pronunciationHint) return `Sound it out like this: ${entry.pronunciationHint}`.trim();
  return `Now try it again with this in mind: ${definition}`.trim();
}

function toHintLevel(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 1;
  return Math.min(5, Math.max(1, Math.floor(value ?? 1)));
}

function mapEntry(entry: DictionaryWordRecord | null, input: CoachWordHelpInput, hintLevel: number): CoachWordHelpResponse {
  const relatedWords = entry ? uniqueWords([...entry.relatedWords, ...entry.synonyms, ...entry.antonyms]) : [];
  return {
    word: entry?.word ?? (input.word?.trim() || null),
    definitionChild: entry?.definitionChild?.trim() || "I can help you with this word.",
    exampleSentence: entry?.exampleSentence?.trim() ?? null,
    phonicsPattern: entry?.phonicsPattern?.trim() ?? null,
    syllables: entry?.syllables?.trim() ?? null,
    pronunciationHint: entry?.pronunciationHint?.trim() ?? null,
    coachMessage: buildMessage(entry, input, hintLevel),
    hintLevel,
    relatedWords,
    shouldReadAloud: Boolean(entry),
    definitionParent: entry?.definitionParent?.trim() ?? null,
    subject: entry?.subject ?? input.subject ?? null,
    keyStage: entry?.keyStage ?? input.keyStage ?? null,
    yearGroup: entry?.yearGroup ?? input.yearGroup ?? null,
    active: entry?.active ?? false,
    found: Boolean(entry),
  };
}

export async function buildCoachWordHelpResponse(input: CoachWordHelpInput): Promise<CoachWordHelpResponse> {
  const word = input.word?.trim() ?? "";
  const hintLevel = toHintLevel(input.supportLevel);
  if (!word) {
    return mapEntry(null, input, hintLevel);
  }

  const entry = await getDictionaryWordByContext({
    word,
    subject: input.subject,
    keyStage: input.keyStage,
    yearGroup: input.yearGroup,
    topic: input.topic,
    active: true,
  });

  await recordCoachDictionaryLookup({
    word,
    normalizedWord: normalizeDictionaryWord(word),
    subject: input.subject ?? null,
    keyStage: input.keyStage ?? null,
    yearGroup: input.yearGroup ?? null,
    found: Boolean(entry?.active),
    dictionaryWordId: entry?.id ?? null,
  });

  return mapEntry(entry, input, hintLevel);
}
