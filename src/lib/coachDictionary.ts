import {
  getDictionaryWordByContext,
  listActiveDictionaryWordsByNormalizedWords,
  normalizeDictionaryWord,
  recordCoachDictionaryLookup,
  type DictionaryWordRecord,
} from "@/lib/dictionary";
import { decodeDictionaryWordRelationships, type DictionaryWordRelationships } from "@/lib/dictionary_relationships";

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
  relationshipLinks: CoachWordRelationshipLink[];
  recoveryPlan: CoachWordRecoveryPlan;
};

type CoachRelationshipType =
  | "prerequisite"
  | "easier"
  | "harder"
  | "related"
  | "related_math"
  | "phonics_family"
  | "spelling_family"
  | "curriculum_topic"
  | "intervention_path";

type CoachRelationshipStrength = "critical" | "strong" | "medium" | "weak" | "temporary" | "structured";

type CoachWordRelationshipLink = {
  word: string;
  type: CoachRelationshipType;
  strength: CoachRelationshipStrength;
  confidence: number;
  source: "manual" | "ai" | "curriculum";
};

type CoachRecoveryComplexity = "low" | "medium" | "high";

type CoachWordRecoveryPlan = {
  targetWord: string | null;
  prerequisites: string[];
  revisionOrder: string[];
  shortestRecoveryPath: string[];
  missingConcepts: string[];
  estimatedComplexity: CoachRecoveryComplexity;
  estimatedInterventionMinutes: number;
  visualSupportHint: string;
  interventionLessonFocus: string[];
};

function uniqueWords(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, 6);
}

function uniqueUncapped(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim()).filter(Boolean))];
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

function buildRelationshipLinks(relationships: DictionaryWordRelationships): CoachWordRelationshipLink[] {
  const links: CoachWordRelationshipLink[] = [];

  const push = (
    words: string[],
    type: CoachRelationshipType,
    strength: CoachRelationshipStrength,
    confidence: number,
    source: "manual" | "ai" | "curriculum" = "manual",
  ) => {
    for (const word of uniqueUncapped(words)) {
      links.push({ word, type, strength, confidence, source });
    }
  };

  push(relationships.prerequisiteWords, "prerequisite", "critical", 0.95);
  push(relationships.easierWords, "easier", "strong", 0.9);
  push(relationships.harderWords, "harder", "medium", 0.8);
  push(relationships.relatedWords, "related", "weak", 0.75);
  push(relationships.relatedMathConcepts, "related_math", "strong", 0.9, "curriculum");
  push(relationships.phonicsFamilies, "phonics_family", "structured", 0.88, "curriculum");
  push(relationships.spellingFamilies, "spelling_family", "structured", 0.88, "curriculum");
  push(relationships.curriculumTopics, "curriculum_topic", "structured", 0.9, "curriculum");
  push(relationships.interventionPaths, "intervention_path", "temporary", 0.82);

  return links.slice(0, 24);
}

function estimateComplexity(prerequisiteCount: number, shortestPathLength: number): CoachRecoveryComplexity {
  const weighted = prerequisiteCount + Math.max(0, shortestPathLength - 1);
  if (weighted <= 3) return "low";
  if (weighted <= 7) return "medium";
  return "high";
}

function estimatedDurationMinutes(complexity: CoachRecoveryComplexity): number {
  if (complexity === "low") return 10;
  if (complexity === "medium") return 18;
  return 28;
}

async function buildRecoveryPlan(entry: DictionaryWordRecord | null, input: CoachWordHelpInput): Promise<CoachWordRecoveryPlan> {
  const targetWord = entry?.word ?? input.word?.trim() ?? null;
  if (!entry) {
    return {
      targetWord,
      prerequisites: [],
      revisionOrder: targetWord ? [targetWord] : [],
      shortestRecoveryPath: targetWord ? [targetWord] : [],
      missingConcepts: [],
      estimatedComplexity: "low",
      estimatedInterventionMinutes: 10,
      visualSupportHint: targetWord ? `Use a concrete visual example to introduce ${targetWord}.` : "Use a concrete visual example first.",
      interventionLessonFocus: targetWord ? [targetWord] : [],
    };
  }

  const targetNormalized = normalizeDictionaryWord(entry.word);
  const targetRelationships = decodeDictionaryWordRelationships(entry.relatedWords);
  const labelByNormalized = new Map<string, string>([[targetNormalized, entry.word]]);
  const prerequisiteMap = new Map<string, string[]>();
  prerequisiteMap.set(targetNormalized, targetRelationships.prerequisiteWords.map(normalizeDictionaryWord).filter(Boolean));

  const initialQueue = [...prerequisiteMap.get(targetNormalized) ?? []];
  const visited = new Set<string>([targetNormalized]);
  const foundNodes = new Set<string>([targetNormalized]);
  const lookupDepthLimit = 3;

  let frontier = initialQueue;
  for (let depth = 0; depth < lookupDepthLimit && frontier.length > 0; depth += 1) {
    const batch = [...new Set(frontier.filter((word) => !visited.has(word)))];
    if (!batch.length) break;

    batch.forEach((word) => visited.add(word));
    const records = await listActiveDictionaryWordsByNormalizedWords({
      normalizedWords: batch,
      subject: entry.subject,
      keyStage: entry.keyStage,
      yearGroup: entry.yearGroup,
    });

    const nextFrontier: string[] = [];
    const foundInBatch = new Set(records.map((record) => record.normalizedWord));

    for (const record of records) {
      foundNodes.add(record.normalizedWord);
      labelByNormalized.set(record.normalizedWord, record.word);
      const relationships = decodeDictionaryWordRelationships(record.relatedWords);
      const prereqs = uniqueUncapped(relationships.prerequisiteWords.map(normalizeDictionaryWord).filter(Boolean));
      prerequisiteMap.set(record.normalizedWord, prereqs);
      nextFrontier.push(...prereqs);
    }

    for (const missing of batch) {
      if (foundInBatch.has(missing)) continue;
      prerequisiteMap.set(missing, []);
      labelByNormalized.set(missing, missing);
    }

    frontier = nextFrontier;
  }

  const orderedNormalized: string[] = [];
  const orderingVisited = new Set<string>();

  const orderDfs = (node: string, stack: Set<string>) => {
    if (orderingVisited.has(node) || stack.has(node)) return;
    stack.add(node);
    for (const dep of prerequisiteMap.get(node) ?? []) {
      orderDfs(dep, stack);
    }
    stack.delete(node);
    orderingVisited.add(node);
    orderedNormalized.push(node);
  };

  orderDfs(targetNormalized, new Set<string>());
  const revisionOrder = uniqueUncapped(orderedNormalized.map((node) => labelByNormalized.get(node) ?? node));
  const prerequisites = revisionOrder.filter((word) => normalizeDictionaryWord(word) !== targetNormalized);

  const queue: string[][] = [[targetNormalized]];
  const seenPathEndings = new Set<string>([targetNormalized]);
  let shortestPathNormalized = [targetNormalized];

  while (queue.length > 0) {
    const path = queue.shift() ?? [];
    const current = path[path.length - 1];
    const deps = prerequisiteMap.get(current) ?? [];
    if (!deps.length) {
      shortestPathNormalized = [...path].reverse();
      break;
    }
    for (const dep of deps) {
      if (path.includes(dep)) continue;
      if (!seenPathEndings.has(dep)) {
        seenPathEndings.add(dep);
        queue.push([...path, dep]);
      }
    }
  }

  const shortestRecoveryPath = uniqueUncapped(shortestPathNormalized.map((node) => labelByNormalized.get(node) ?? node));
  const missingConcepts = uniqueUncapped(
    [...prerequisiteMap.values()].flat().filter((node) => !foundNodes.has(node)).map((node) => labelByNormalized.get(node) ?? node),
  );

  const complexity = estimateComplexity(prerequisites.length, shortestRecoveryPath.length);
  const visualSupportHint = `Use a concrete visual for ${entry.word} before abstract language, then revisit each prerequisite in order.`;
  const interventionLessonFocus = uniqueUncapped([...prerequisites.slice(0, 4), entry.word]);

  return {
    targetWord,
    prerequisites,
    revisionOrder,
    shortestRecoveryPath,
    missingConcepts,
    estimatedComplexity: complexity,
    estimatedInterventionMinutes: estimatedDurationMinutes(complexity),
    visualSupportHint,
    interventionLessonFocus,
  };
}

function defaultRecoveryPlan(word: string | null): CoachWordRecoveryPlan {
  return {
    targetWord: word,
    prerequisites: [],
    revisionOrder: word ? [word] : [],
    shortestRecoveryPath: word ? [word] : [],
    missingConcepts: [],
    estimatedComplexity: "low",
    estimatedInterventionMinutes: 10,
    visualSupportHint: word ? `Use a concrete visual example to introduce ${word}.` : "Use a concrete visual example first.",
    interventionLessonFocus: word ? [word] : [],
  };
}

async function mapEntry(entry: DictionaryWordRecord | null, input: CoachWordHelpInput, hintLevel: number): Promise<CoachWordHelpResponse> {
  const relationships = entry ? decodeDictionaryWordRelationships(entry.relatedWords) : decodeDictionaryWordRelationships([]);
  const relatedWords = entry
    ? uniqueWords([
      ...relationships.relatedWords,
      ...relationships.easierWords,
      ...relationships.harderWords,
      ...relationships.prerequisiteWords,
      ...relationships.relatedMathConcepts,
      ...entry.synonyms,
      ...entry.antonyms,
    ])
    : [];
  const relationshipLinks = buildRelationshipLinks(relationships);
  const recoveryPlan = entry ? await buildRecoveryPlan(entry, input) : defaultRecoveryPlan(input.word?.trim() || null);

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
    relationshipLinks,
    recoveryPlan,
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
