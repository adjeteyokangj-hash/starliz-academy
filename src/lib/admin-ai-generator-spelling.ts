export type AdminAiGeneratorErrorCode =
  | "missing_openai_key"
  | "invalid_payload"
  | "model_error"
  | "invalid_generated_content"
  | "generation_error";

export type AdminAiGeneratorFailure = {
  errorCode: AdminAiGeneratorErrorCode;
  message: string;
  details: Record<string, unknown>;
  status: number;
};

type GeneratorFailureContext = {
  subject?: string;
  yearGroup?: string;
  skillFocus?: string;
  generationType?: string;
};

export type SpellingSkillFocusKind = "prefixes" | "suffixes" | "homophones" | "compound" | "phonics" | "general";

type DeterministicSpellingFallbackInput = {
  keyStage?: string;
  yearGroup: string;
  skillFocus: string;
  topic: string;
  count: number;
  difficulty: number;
  variantSeed?: number;
};

type FallbackSeedRow = {
  word: string;
  hint: string;
  sentenceContext: string;
  categoryHint: string;
  syllables: string;
  spellingPattern?: string;
  whyItMatchesSkill?: string;
  homophoneGroup?: string[];
  firstWord?: string;
  secondWord?: string;
};

const PREFIXES = ["re", "mis", "dis", "pre", "sub", "inter", "super", "anti", "auto", "un"];
const SUFFIXES = ["ly", "ness", "ment", "ation", "ous", "ful", "less", "able", "ible"];
const EARLY_READER_WORDS = new Set(["line", "shine", "time", "cake", "book", "dog", "cat", "sun", "run"]);
const COMPOUND_PARTS = new Set([
  "earth", "quake", "thunder", "storm", "goal", "keeper", "water", "proof", "time", "table", "play", "ground", "home", "work", "country", "side", "news", "paper", "light", "house", "after", "noon", "bed", "room", "sun", "shine", "snow", "week", "end", "rail", "way", "super", "market",
]);

const PREFIX_FALLBACK_ROWS: FallbackSeedRow[] = [
  { word: "misbehave", hint: "Identify the prefix and explain how it changes the root word.", sentenceContext: "The class agreed not to misbehave during the assembly.", categoryHint: "prefixes: mis-", syllables: "3", spellingPattern: "mis-", whyItMatchesSkill: "Uses the prefix mis- to show a negative or incorrect action." },
  { word: "disappear", hint: "Focus on the prefix and root before spelling the full word.", sentenceContext: "The rabbit seemed to disappear behind the hedge.", categoryHint: "prefixes: dis-", syllables: "3", spellingPattern: "dis-", whyItMatchesSkill: "Uses dis- to show reversal or absence." },
  { word: "preview", hint: "Use the prefix to infer timing and meaning before spelling.", sentenceContext: "We watched a preview of the class play before the final rehearsal.", categoryHint: "prefixes: pre-", syllables: "2", spellingPattern: "pre-", whyItMatchesSkill: "Uses pre- to show something that happens before." },
  { word: "submarine", hint: "Check the prefix and base word separately before joining them.", sentenceContext: "The submarine travelled quietly below the water.", categoryHint: "prefixes: sub-", syllables: "3", spellingPattern: "sub-", whyItMatchesSkill: "Uses sub- to mean under or below." },
  { word: "interact", hint: "Say the word in syllables and mark the prefix first.", sentenceContext: "Students interact in groups to solve the challenge.", categoryHint: "prefixes: inter-", syllables: "3", spellingPattern: "inter-", whyItMatchesSkill: "Uses inter- to show between people or groups." },
  { word: "antisocial", hint: "Remember that anti- usually signals against or opposite to.", sentenceContext: "Ignoring everyone all day can seem antisocial.", categoryHint: "prefixes: anti-", syllables: "4", spellingPattern: "anti-", whyItMatchesSkill: "Uses anti- to mean against." },
  { word: "automatic", hint: "Break into chunks: auto + mat + ic.", sentenceContext: "The doors were automatic and opened as we walked up.", categoryHint: "prefixes: auto-", syllables: "4", spellingPattern: "auto-", whyItMatchesSkill: "Uses auto- to show self-operating or self-driven." },
  { word: "supermarket", hint: "Identify the prefix before spelling the full word.", sentenceContext: "We visited the supermarket after school.", categoryHint: "prefixes: super-", syllables: "4", spellingPattern: "super-", whyItMatchesSkill: "Uses super- to show above or beyond normal." },
];

const SUFFIX_FALLBACK_ROWS: FallbackSeedRow[] = [
  { word: "carefully", hint: "Spot the base word and the suffix before writing.", sentenceContext: "Please read the instructions carefully before you begin.", categoryHint: "suffixes: -ly", syllables: "3", spellingPattern: "-ly", whyItMatchesSkill: "Adds -ly to describe how an action is done." },
  { word: "happiness", hint: "Check the root and suffix meaning in context.", sentenceContext: "Her happiness showed when she solved the puzzle.", categoryHint: "suffixes: -ness", syllables: "3", spellingPattern: "-ness", whyItMatchesSkill: "Adds -ness to create a noun from an adjective." },
  { word: "enjoyment", hint: "Notice how the suffix changes the word class.", sentenceContext: "Reading for enjoyment helps build vocabulary.", categoryHint: "suffixes: -ment", syllables: "3", spellingPattern: "-ment", whyItMatchesSkill: "Adds -ment to form a noun." },
  { word: "preparation", hint: "Use syllables to avoid missing letters in longer words.", sentenceContext: "Good preparation made the presentation easy.", categoryHint: "suffixes: -ation", syllables: "4", spellingPattern: "-ation", whyItMatchesSkill: "Adds -ation to create a formal noun form." },
  { word: "poisonous", hint: "Remember that -ous often creates adjectives.", sentenceContext: "The label warned that the berries were poisonous.", categoryHint: "suffixes: -ous", syllables: "3", spellingPattern: "-ous", whyItMatchesSkill: "Uses -ous to form descriptive adjectives." },
  { word: "thoughtful", hint: "Identify the base word then add the suffix carefully.", sentenceContext: "It was thoughtful to share your notes with the group.", categoryHint: "suffixes: -ful", syllables: "2", spellingPattern: "-ful", whyItMatchesSkill: "Uses -ful to show full of a quality." },
  { word: "hopeless", hint: "Check the ending and pronunciation before final spelling.", sentenceContext: "The puzzle looked hopeless until we found a clue.", categoryHint: "suffixes: -less", syllables: "2", spellingPattern: "-less", whyItMatchesSkill: "Uses -less to mean without." },
  { word: "believable", hint: "Look at the base word and suffix connection.", sentenceContext: "Her explanation was believable because she gave evidence.", categoryHint: "suffixes: -able", syllables: "4", spellingPattern: "-able", whyItMatchesSkill: "Uses -able to mean capable of." },
];

const HOMOPHONE_FALLBACK_ROWS: FallbackSeedRow[] = [
  { word: "their", hint: "Choose the correct homophone based on meaning in the sentence.", sentenceContext: "Their team won the match after extra time.", categoryHint: "homophones", syllables: "1", spellingPattern: "their / there / they're", whyItMatchesSkill: "Contrasts possessive, location and contraction forms.", homophoneGroup: ["their", "there", "they're"] },
  { word: "you're", hint: "Check if the sentence means 'you are' before choosing.", sentenceContext: "You're expected to bring your reading book tomorrow.", categoryHint: "homophones", syllables: "1", spellingPattern: "your / you're", whyItMatchesSkill: "Distinguishes possession from contraction.", homophoneGroup: ["your", "you're"] },
  { word: "whether", hint: "Use context clues to pick the correct homophone.", sentenceContext: "We discussed whether the trip should be postponed.", categoryHint: "homophones", syllables: "2", spellingPattern: "weather / whether", whyItMatchesSkill: "Contrasts condition wording with climate wording.", homophoneGroup: ["weather", "whether"] },
  { word: "allowed", hint: "Check meaning before spelling the word form.", sentenceContext: "Only Year 4 pupils are allowed in this area.", categoryHint: "homophones", syllables: "2", spellingPattern: "aloud / allowed", whyItMatchesSkill: "Shows difference between volume and permission.", homophoneGroup: ["aloud", "allowed"] },
];

const COMPOUND_FALLBACK_ROWS: FallbackSeedRow[] = [
  { word: "earthquake", hint: "Spot the two root words combined together.", sentenceContext: "The report explained how an earthquake is measured.", categoryHint: "compound words", syllables: "2", spellingPattern: "earth + quake", whyItMatchesSkill: "Combines two root words to form one meaning.", firstWord: "earth", secondWord: "quake" },
  { word: "thunderstorm", hint: "Break the word into two smaller words first.", sentenceContext: "A thunderstorm interrupted the football match.", categoryHint: "compound words", syllables: "3", spellingPattern: "thunder + storm", whyItMatchesSkill: "Built from two complete words.", firstWord: "thunder", secondWord: "storm" },
  { word: "waterproof", hint: "Check each part separately before writing.", sentenceContext: "She wore a waterproof coat in the rain.", categoryHint: "compound words", syllables: "3", spellingPattern: "water + proof", whyItMatchesSkill: "Combines two roots to describe function.", firstWord: "water", secondWord: "proof" },
  { word: "goalkeeper", hint: "Split the compound into two meaningful roots.", sentenceContext: "The goalkeeper made a brilliant save in the final minute.", categoryHint: "compound words", syllables: "3", spellingPattern: "goal + keeper", whyItMatchesSkill: "Shows role by combining two root words.", firstWord: "goal", secondWord: "keeper" },
  { word: "countryside", hint: "Use both parts of the compound to infer meaning.", sentenceContext: "We visited the countryside for our geography trip.", categoryHint: "compound words", syllables: "3", spellingPattern: "country + side", whyItMatchesSkill: "Combines roots to form a specific place noun.", firstWord: "country", secondWord: "side" },
];

const GENERAL_SPELLING_ROWS: FallbackSeedRow[] = [
  { word: "comfortable", hint: "Check each syllable to avoid dropping letters.", sentenceContext: "The new reading corner is comfortable and quiet.", categoryHint: "general spelling", syllables: "4", spellingPattern: "multi-syllable", whyItMatchesSkill: "Year 4 challenge word with multiple syllables." },
  { word: "knowledge", hint: "Watch out for the silent letters in this spelling.", sentenceContext: "Science knowledge helps us explain experiments.", categoryHint: "general spelling", syllables: "2", spellingPattern: "silent letters", whyItMatchesSkill: "Includes silent-letter complexity for KS2 challenge." },
  { word: "temperature", hint: "Use syllables to keep all letters in place.", sentenceContext: "The temperature dropped quickly after sunset.", categoryHint: "general spelling", syllables: "4", spellingPattern: "multi-syllable", whyItMatchesSkill: "Longer curriculum word suited to Year 4 challenge." },
  { word: "creature", hint: "Listen for the unstressed ending sound.", sentenceContext: "The rainforest creature moved slowly through the leaves.", categoryHint: "general spelling", syllables: "2", spellingPattern: "word family", whyItMatchesSkill: "Age-appropriate KS2 spelling pattern." },
];

function parseYearGroupNumber(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeWord(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function compactText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function detectSpellingSkillFocusKind(skillFocus: string | null | undefined): SpellingSkillFocusKind {
  const lower = compactText(skillFocus).toLowerCase();
  if (lower.includes("prefix")) return "prefixes";
  if (lower.includes("suffix")) return "suffixes";
  if (lower.includes("homophone")) return "homophones";
  if (lower.includes("compound")) return "compound";
  if (lower.includes("phonics") || lower.includes("phase") || lower.includes("blend") || lower.includes("segment")) return "phonics";
  return "general";
}

export function getSpellingDifficultyProfile(
  yearGroup: string,
  keyStage: string | null | undefined,
  skillFocus: string,
  difficulty: number,
) {
  const yearNumber = parseYearGroupNumber(yearGroup);
  const safeDifficulty = Math.max(1, Math.min(5, difficulty));
  const skillKind = detectSpellingSkillFocusKind(skillFocus);
  const advancedYear4 = (yearNumber ?? 0) >= 4 && safeDifficulty >= 4;
  const minLength = advancedYear4 && skillKind !== "homophones" ? 7 : safeDifficulty >= 4 ? 6 : safeDifficulty >= 3 ? 5 : 4;
  return {
    yearGroup,
    keyStage: compactText(keyStage) || null,
    skillKind,
    difficulty: safeDifficulty,
    minLength,
    rejectEarlyReaderWords: advancedYear4,
    requireSkillPattern: skillKind === "prefixes" || skillKind === "suffixes" || skillKind === "homophones" || skillKind === "compound",
    expectedLevel: advancedYear4 ? "advanced_year4" : safeDifficulty >= 4 ? "challenging" : safeDifficulty <= 2 ? "accessible" : "secure",
  };
}

function startsWithAllowedPrefix(word: string) {
  return PREFIXES.find((prefix) => word.startsWith(prefix) && word.length > prefix.length + 2) ?? null;
}

function endsWithAllowedSuffix(word: string) {
  return SUFFIXES.find((suffix) => word.endsWith(suffix) && word.length > suffix.length + 2) ?? null;
}

function inferCompoundParts(word: string) {
  for (let i = 3; i <= word.length - 3; i += 1) {
    const left = word.slice(0, i);
    const right = word.slice(i);
    if (COMPOUND_PARTS.has(left) && COMPOUND_PARTS.has(right)) {
      return { left, right };
    }
  }
  return null;
}

export function inferSpellingPattern(word: string, skillFocus: string, item?: Record<string, unknown>) {
  const normalized = normalizeWord(word);
  const skillKind = detectSpellingSkillFocusKind(skillFocus);
  if (skillKind === "prefixes") {
    const prefix = startsWithAllowedPrefix(normalized);
    return prefix ? `${prefix}-` : "none";
  }
  if (skillKind === "suffixes") {
    const suffix = endsWithAllowedSuffix(normalized);
    return suffix ? `-${suffix}` : "none";
  }
  if (skillKind === "homophones") {
    const provided = Array.isArray(item?.homophoneGroup) ? (item?.homophoneGroup as unknown[]) : [];
    const normalizedGroup = provided.map((entry) => normalizeWord(entry)).filter(Boolean);
    if (normalizedGroup.length >= 2) return normalizedGroup.join(" / ");
    if (normalized.includes("/")) return normalized;
    return "none";
  }
  if (skillKind === "compound") {
    const first = normalizeWord(item?.firstWord);
    const second = normalizeWord(item?.secondWord);
    if (first && second) return `${first} + ${second}`;
    const inferred = inferCompoundParts(normalized);
    return inferred ? `${inferred.left} + ${inferred.right}` : "none";
  }
  return "general";
}

export function assessSpellingItemForDifficulty(input: {
  word: string;
  sentenceContext?: string | null;
  skillFocus: string;
  yearGroup: string;
  keyStage?: string | null;
  difficulty: number;
  item?: Record<string, unknown>;
}) {
  const word = normalizeWord(input.word);
  const sentenceContext = compactText(input.sentenceContext ?? "");
  const profile = getSpellingDifficultyProfile(input.yearGroup, input.keyStage, input.skillFocus, input.difficulty);
  const issues: string[] = [];
  const skillKind = profile.skillKind;

  if (!word) issues.push("incomplete");
  if (profile.rejectEarlyReaderWords && EARLY_READER_WORDS.has(word)) issues.push(`too_easy:${word}`);
  if (word.length < profile.minLength && profile.expectedLevel === "advanced_year4" && skillKind !== "homophones") issues.push(`too_short:${word}`);
  if (!sentenceContext || sentenceContext.length < 16) issues.push(`weak_sentence_context:${word}`);

  const pattern = inferSpellingPattern(word, input.skillFocus, input.item);

  if (skillKind === "prefixes" && pattern === "none") issues.push(`skill_mismatch_prefix:${word}`);
  if (skillKind === "suffixes" && pattern === "none") issues.push(`skill_mismatch_suffix:${word}`);
  if (skillKind === "homophones") {
    const group = Array.isArray(input.item?.homophoneGroup) ? (input.item?.homophoneGroup as unknown[]) : [];
    const providedPair = group.map((entry) => normalizeWord(entry)).filter(Boolean);
    const hasMeaning = compactText(String(input.item?.meaning ?? input.item?.definition ?? "")).length > 0;
    if (providedPair.length < 2 && pattern === "none") issues.push(`homophone_pair_missing:${word}`);
    if (!hasMeaning) issues.push(`homophone_meaning_missing:${word}`);
  }
  if (skillKind === "compound") {
    const first = normalizeWord(input.item?.firstWord);
    const second = normalizeWord(input.item?.secondWord);
    const inferred = inferCompoundParts(word);
    if (!(first && second) && !inferred) issues.push(`compound_split_missing:${word}`);
  }

  let validationLevel: "age-appropriate" | "too-easy" | "needs-review" = "age-appropriate";
  if (issues.some((value) => value.startsWith("too_easy") || value.startsWith("too_short"))) validationLevel = "too-easy";
  else if (issues.length > 0) validationLevel = "needs-review";

  const whyItMatchesSkill =
    skillKind === "prefixes" && pattern !== "none" ? `${word} uses the prefix ${pattern}.`
      : skillKind === "suffixes" && pattern !== "none" ? `${word} uses the suffix ${pattern}.`
        : skillKind === "homophones" && pattern !== "none" ? `${word} is part of the homophone set ${pattern}.`
          : skillKind === "compound" && pattern !== "none" ? `${word} is a compound form: ${pattern}.`
            : `Matches ${input.skillFocus || "spelling"} practice for ${input.yearGroup}.`;

  return {
    valid: issues.length === 0,
    issues,
    spellingPattern: pattern,
    whyItMatchesSkill,
    validationLevel,
    profile,
  };
}

function formatSpellingContext(context: GeneratorFailureContext) {
  const yearGroup = compactText(context.yearGroup);
  const skillFocus = compactText(context.skillFocus);
  if (yearGroup && skillFocus) return `${yearGroup} ${skillFocus.toLowerCase()} items`;
  if (skillFocus) return `${skillFocus.toLowerCase()} items`;
  if (yearGroup) return `${yearGroup} spelling items`;
  return "spelling items";
}

function resolveGeneratorLabel(context: GeneratorFailureContext): string {
  const genType = String(context.generationType ?? "").toLowerCase();
  const subject = String(context.subject ?? "").toLowerCase();
  if (genType === "spelling" || genType === "phonics" || subject === "spelling" || subject === "phonics") {
    return "spelling generator";
  }
  if (
    genType === "science"
    || subject.includes("science")
    || subject.includes("biology")
    || subject.includes("chemistry")
    || subject.includes("physics")
  ) {
    return "science content generator";
  }
  if (genType === "maths" || subject.includes("maths") || subject === "times-tables") {
    return "maths content generator";
  }
  if (
    genType === "languages"
    || subject.includes("french")
    || subject.includes("german")
    || subject.includes("spanish")
    || subject.includes("italian")
    || subject.includes("mandarin")
    || subject.includes("arabic")
    || subject.includes("latin")
  ) {
    return "languages content generator";
  }
  if (genType === "reading" || subject.includes("reading") || subject.includes("history") || subject.includes("geography")) {
    return "reading content generator";
  }
  return "content generator";
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickFallbackRows(skillFocus: string, topic: string) {
  const kind = detectSpellingSkillFocusKind(`${skillFocus} ${topic}`);
  if (kind === "prefixes") return PREFIX_FALLBACK_ROWS;
  if (kind === "suffixes") return SUFFIX_FALLBACK_ROWS;
  if (kind === "homophones") return HOMOPHONE_FALLBACK_ROWS;
  if (kind === "compound") return COMPOUND_FALLBACK_ROWS;
  return GENERAL_SPELLING_ROWS;
}

export function buildDeterministicSpellingFallback(input: DeterministicSpellingFallbackInput) {
  const rows = pickFallbackRows(input.skillFocus, input.topic);
  const safeCount = Math.max(1, Math.min(10, input.count));
  const safeSeed = Number.isFinite(Number(input.variantSeed)) ? Math.abs(Math.floor(Number(input.variantSeed))) : 0;
  const offset = rows.length > 0 ? safeSeed % rows.length : 0;
  return Array.from({ length: safeCount }, (_, index) => {
    const row = rows[(index + offset) % rows.length];
    const assessment = assessSpellingItemForDifficulty({
      word: row.word,
      sentenceContext: row.sentenceContext,
      skillFocus: input.skillFocus,
      yearGroup: input.yearGroup,
      keyStage: input.keyStage,
      difficulty: input.difficulty,
      item: row as unknown as Record<string, unknown>,
    });
    return {
      id: `fallback-spelling-${index + 1}-${row.word}`,
      word: row.word,
      hint: row.hint,
      sentenceContext: row.sentenceContext,
      categoryHint: row.categoryHint,
      syllables: row.syllables,
      emoji: "Aa",
      spellingPattern: row.spellingPattern ?? assessment.spellingPattern,
      whyItMatchesSkill: row.whyItMatchesSkill ?? assessment.whyItMatchesSkill,
      validationLevel: assessment.validationLevel,
      homophoneGroup: row.homophoneGroup,
      firstWord: row.firstWord,
      secondWord: row.secondWord,
      yearGroup: input.yearGroup,
      skillFocus: input.skillFocus,
      difficulty: input.difficulty,
    };
  });
}

export function shouldUseDeterministicSpellingFallback(errorCode: AdminAiGeneratorErrorCode) {
  return errorCode === "missing_openai_key" || errorCode === "model_error" || errorCode === "invalid_generated_content";
}

export function normalizeAdminAiGeneratorFailure(
  error: unknown,
  context: GeneratorFailureContext = {},
): AdminAiGeneratorFailure {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const message = error instanceof Error ? error.message : String(error ?? "AI generation failed.");
  const lowered = message.toLowerCase();
  const providerStatus = toNumber(record.providerStatus ?? record.status);
  const providerCode = compactText(typeof record.providerCode === "string" ? record.providerCode : null).toLowerCase();
  const contextLabel = formatSpellingContext(context);

  if (providerStatus === 401 || providerCode === "invalid_api_key" || lowered.includes("invalid_api_key") || lowered.includes("incorrect api key")) {
    return {
      errorCode: "model_error",
      message: "AI generation failed because the configured OpenAI API key was rejected.",
      details: {
        reason: "invalid_openai_key",
        providerStatus,
        providerCode: providerCode || "invalid_api_key",
      },
      status: 502,
    };
  }

  if (lowered.includes("not configured") || lowered.includes("missing openai api key")) {
    return {
      errorCode: "missing_openai_key",
      message: "AI generation failed because the OpenAI API key is missing.",
      details: {
        reason: "missing_openai_key",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 503,
    };
  }

  if (
    lowered.includes("malformed ai output")
    || lowered.includes("non-json")
    || lowered.includes("empty content payload")
    || lowered.includes("failed to parse")
  ) {
    return {
      errorCode: "invalid_generated_content",
      message: "AI returned content in an invalid format. Please try again.",
      details: {
        reason: "invalid_provider_payload",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 502,
    };
  }

  if (
    lowered.includes("unable to generate")
    || lowered.includes("no valid")
    || lowered.includes("validation")
    || lowered.includes("invalid ")
  ) {
    const generatorLabel = resolveGeneratorLabel(context);
    return {
      errorCode: "invalid_generated_content",
      message: `The ${generatorLabel} could not create valid ${contextLabel}.`,
      details: {
        reason: "validation_failed",
        providerStatus,
        providerCode: providerCode || null,
        validationMessage: message,
      },
      status: 422,
    };
  }

  if (
    lowered.includes("openai request failed")
    || lowered.includes("openai returned")
    || (providerStatus !== null && providerStatus >= 500)
    || providerStatus === 429
  ) {
    return {
      errorCode: "model_error",
      message: "AI generation failed because the external AI service rejected the request.",
      details: {
        reason: "provider_request_failed",
        providerStatus,
        providerCode: providerCode || null,
      },
      status: 502,
    };
  }

  return {
    errorCode: "generation_error",
    message: "AI generation failed. Please try again.",
    details: {
      reason: "generation_error",
      providerStatus,
      providerCode: providerCode || null,
    },
    status: 500,
  };
}
