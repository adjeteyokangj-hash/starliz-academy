type RelationshipKey =
  | "easierWords"
  | "harderWords"
  | "prerequisiteWords"
  | "relatedMathConcepts"
  | "phonicsFamilies"
  | "spellingFamilies"
  | "curriculumTopics"
  | "interventionPaths";

export type DictionaryWordRelationships = {
  relatedWords: string[];
  easierWords: string[];
  harderWords: string[];
  prerequisiteWords: string[];
  relatedMathConcepts: string[];
  phonicsFamilies: string[];
  spellingFamilies: string[];
  curriculumTopics: string[];
  interventionPaths: string[];
};

const REL_PREFIX = "rel:";

const RELATIONSHIP_PREFIXES: Record<RelationshipKey, string> = {
  easierWords: "easier",
  harderWords: "harder",
  prerequisiteWords: "prereq",
  relatedMathConcepts: "math",
  phonicsFamilies: "phonics",
  spellingFamilies: "spelling",
  curriculumTopics: "curriculum",
  interventionPaths: "intervention",
};

const PREFIX_TO_KEY = new Map<string, RelationshipKey>(
  Object.entries(RELATIONSHIP_PREFIXES).map(([key, prefix]) => [prefix, key as RelationshipKey]),
);

export function emptyDictionaryWordRelationships(): DictionaryWordRelationships {
  return {
    relatedWords: [],
    easierWords: [],
    harderWords: [],
    prerequisiteWords: [],
    relatedMathConcepts: [],
    phonicsFamilies: [],
    spellingFamilies: [],
    curriculumTopics: [],
    interventionPaths: [],
  };
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => cleanText(entry)).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[,\n;]/).map((entry) => cleanText(entry)).filter(Boolean))];
  }
  return [];
}

function encodeEntry(prefix: string, value: string): string {
  return `${REL_PREFIX}${prefix}:${value}`;
}

function decodeEntry(entry: string): { key: RelationshipKey; value: string } | null {
  if (!entry.startsWith(REL_PREFIX)) return null;
  const withoutMarker = entry.slice(REL_PREFIX.length);
  const separator = withoutMarker.indexOf(":");
  if (separator < 1) return null;

  const prefix = withoutMarker.slice(0, separator).trim().toLowerCase();
  const value = withoutMarker.slice(separator + 1).trim();
  if (!value) return null;

  const key = PREFIX_TO_KEY.get(prefix);
  if (!key) return null;

  return { key, value };
}

export function normalizeRelationshipInput(input: Partial<Record<keyof DictionaryWordRelationships, unknown>>): DictionaryWordRelationships {
  return {
    relatedWords: toStringArray(input.relatedWords),
    easierWords: toStringArray(input.easierWords),
    harderWords: toStringArray(input.harderWords),
    prerequisiteWords: toStringArray(input.prerequisiteWords),
    relatedMathConcepts: toStringArray(input.relatedMathConcepts),
    phonicsFamilies: toStringArray(input.phonicsFamilies),
    spellingFamilies: toStringArray(input.spellingFamilies),
    curriculumTopics: toStringArray(input.curriculumTopics),
    interventionPaths: toStringArray(input.interventionPaths),
  };
}

export function encodeDictionaryWordRelationships(input: Partial<Record<keyof DictionaryWordRelationships, unknown>>): string[] {
  const normalized = normalizeRelationshipInput(input);
  const encoded: string[] = [...normalized.relatedWords];

  for (const [key, prefix] of Object.entries(RELATIONSHIP_PREFIXES) as Array<[RelationshipKey, string]>) {
    for (const value of normalized[key]) {
      encoded.push(encodeEntry(prefix, value));
    }
  }

  return [...new Set(encoded)];
}

export function decodeDictionaryWordRelationships(relatedWords: string[] | null | undefined): DictionaryWordRelationships {
  const parsed = emptyDictionaryWordRelationships();
  for (const raw of relatedWords ?? []) {
    const entry = cleanText(raw);
    if (!entry) continue;

    const decoded = decodeEntry(entry);
    if (!decoded) {
      parsed.relatedWords.push(entry);
      continue;
    }

    parsed[decoded.key].push(decoded.value);
  }

  for (const key of Object.keys(parsed) as Array<keyof DictionaryWordRelationships>) {
    parsed[key] = [...new Set(parsed[key])];
  }

  return parsed;
}

export function countDictionaryWordRelationshipLinks(relatedWords: string[] | null | undefined): number {
  const decoded = decodeDictionaryWordRelationships(relatedWords);
  return decoded.relatedWords.length
    + decoded.easierWords.length
    + decoded.harderWords.length
    + decoded.prerequisiteWords.length
    + decoded.relatedMathConcepts.length
    + decoded.phonicsFamilies.length
    + decoded.spellingFamilies.length
    + decoded.curriculumTopics.length
    + decoded.interventionPaths.length;
}
